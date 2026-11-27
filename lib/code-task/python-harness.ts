// Python that runs a Gradescope-style unittest autograder against a student's
// file and reports one result per test. Executed inside Pyodide in the
// browser (lib/code-task/pyodide-runner.ts), and by plain CPython in
// scripts/check-ide-demo.ts, so the two can't drift apart.

/**
 * Stand-ins for gradescope_utils (https://github.com/gradescope/gradescope-utils),
 * which isn't installable in Pyodide. Same names and attributes, so test
 * files import them unchanged: `from gradescope_utils.autograder_utils.decorators import weight`.
 */
export const GRADESCOPE_UTILS_SHIM: { path: string; content: string }[] = [
  { path: "gradescope_utils/__init__.py", content: "" },
  { path: "gradescope_utils/autograder_utils/__init__.py", content: "" },
  {
    path: "gradescope_utils/autograder_utils/decorators.py",
    content: `import functools


class _Attr(object):
    attr = None

    def __init__(self, val):
        self.val = val

    def __call__(self, func):
        setattr(func, self.attr, self.val)
        return func


class weight(_Attr):
    attr = "__weight__"


class number(_Attr):
    attr = "__number__"


class visibility(_Attr):
    attr = "__visibility__"


class tags(object):
    def __init__(self, *tags):
        self.tags = list(tags)

    def __call__(self, func):
        func.__tags__ = self.tags
        return func


class hide_errors(_Attr):
    attr = "__hide_errors__"

    def __init__(self, val="Test failed"):
        self.val = val


class leaderboard(object):
    def __init__(self, name, order="desc"):
        self.name = name
        self.order = order

    def __call__(self, func):
        func.__leaderboard_column__ = self.name

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            kwargs["set_leaderboard_value"] = lambda value: None
            return func(*args, **kwargs)

        return wrapper


class partial_credit(object):
    """Test receives set_score(points); the score it sets is what it earns."""

    def __init__(self, weight):
        self.weight = weight

    def __call__(self, func):
        @functools.wraps(func)
        def wrapper(test_self, *args, **kwargs):
            def set_score(score):
                setattr(test_self, "__score__", score)

            kwargs["set_score"] = set_score
            return func(test_self, *args, **kwargs)

        wrapper.__weight__ = self.weight
        wrapper.__partial_credit__ = True
        return wrapper
`,
  },
  {
    path: "gradescope_utils/autograder_utils/json_test_runner.py",
    content: `class JSONTestRunner(object):
    """Placeholder so 'from ... import JSONTestRunner' succeeds; CS Learn runs tests itself."""

    def __init__(self, *args, **kwargs):
        pass

    def run(self, suite):
        raise RuntimeError("JSONTestRunner is not used by CS Learn's in-browser runner.")
`,
  },
];

/**
 * Defines run_task(work_dir, test_files, entry_module) -> JSON string:
 * { stdout, runError, results: [{ testId, status, score, maxScore, output }] }.
 * testId matches ParsedTest.id: "<test file>::<Class>.<method>".
 */
export const PYTHON_HARNESS = String.raw`
import contextlib
import importlib
import importlib.util
import io
import json
import os
import sys
import traceback
import unittest

_OUTPUT_LIMIT = 4000


def _clip(text):
    return text if len(text) <= _OUTPUT_LIMIT else text[:_OUTPUT_LIMIT] + "\n... (output truncated)"


def _short_traceback(err_text, work_dir):
    # Drop frames from the harness and unittest itself; keep the test's and the student's.
    lines = err_text.rstrip().splitlines()
    kept = [l for l in lines if "unittest/" not in l and "<exec>" not in l]
    return "\n".join(kept[-25:])


def _flatten(suite):
    for item in suite:
        if isinstance(item, unittest.TestSuite):
            for test in _flatten(item):
                yield test
        else:
            yield item


def _forget_modules(work_dir):
    for name, module in list(sys.modules.items()):
        path = getattr(module, "__file__", None) or ""
        if path.startswith(work_dir):
            del sys.modules[name]
    importlib.invalidate_caches()


def run_task(work_dir, test_files, entry_module):
    work_dir = os.path.abspath(work_dir)
    os.chdir(work_dir)
    if work_dir not in sys.path:
        sys.path.insert(0, work_dir)
    _forget_modules(work_dir)
    report = {"stdout": "", "runError": None, "results": []}

    # Import the student's file on its own first, so a syntax or import
    # error is reported once, clearly, instead of as every test erroring.
    captured = io.StringIO()
    try:
        with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
            importlib.import_module(entry_module)
    except BaseException:
        report["stdout"] = _clip(captured.getvalue())
        report["runError"] = _short_traceback(traceback.format_exc(), work_dir)
        return json.dumps(report)
    report["stdout"] = _clip(captured.getvalue())

    loader = unittest.TestLoader()
    for rel_path in test_files:
        module_name = "cslearn_tests_" + rel_path[:-3].replace("/", "_").replace("-", "_")
        spec = importlib.util.spec_from_file_location(module_name, os.path.join(work_dir, rel_path))
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        try:
            spec.loader.exec_module(module)
        except BaseException:
            report["runError"] = "Could not load " + rel_path + ":\n" + _short_traceback(traceback.format_exc(), work_dir)
            return json.dumps(report)

        for test in _flatten(loader.loadTestsFromModule(module)):
            method = getattr(test, test._testMethodName)
            max_score = float(getattr(method, "__weight__", 0) or 0)
            result = unittest.TestResult()
            output = io.StringIO()
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
                test.run(result)
            problems = result.failures + result.errors
            hide = getattr(method, "__hide_errors__", None)
            if problems:
                status = "failed" if result.failures else "error"
                detail = hide if hide else _short_traceback(problems[0][1], work_dir)
                score = 0.0
            else:
                status = "passed"
                detail = ""
                score = max_score
            if getattr(method, "__partial_credit__", False) and hasattr(test, "__score__"):
                score = max(0.0, min(max_score, float(getattr(test, "__score__"))))
            printed = output.getvalue()
            text = (printed + ("\n" if printed and detail else "") + detail).strip()
            report["results"].append({
                "testId": rel_path + "::" + type(test).__name__ + "." + test._testMethodName,
                "status": status,
                "score": score,
                "maxScore": max_score,
                "output": _clip(text),
            })
    return json.dumps(report)
`;
