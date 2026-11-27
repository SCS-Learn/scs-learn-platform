import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  parseGradescopeAutograder,
  parseGradescopeAutograderZip,
  parseJavaTests,
  parsePythonTests,
  submissionFilesFrom,
} from "./parse-gradescope.ts";

const PY_TESTS = `import unittest
from gradescope_utils.autograder_utils.decorators import weight, number, visibility, partial_credit


class TestThing(unittest.TestCase):
    def setUp(self):
        self.x = 1

    @weight(2.5)
    @number("1.1")
    def test_first(self):
        """Adds two numbers
        and checks the sum."""
        self.assertEqual(1 + 1, 2)

    @visibility('hidden')
    @partial_credit(4)
    def test_hidden_partial(self, set_score=None):
        set_score(2)

    def test_unweighted_case(self):
        pass

    def helper(self):
        pass


class NotTests(object):
    def test_outside(self):
        pass
`;

describe("parsePythonTests", () => {
  const tests = parsePythonTests({ path: "tests/test_thing.py", content: PY_TESTS });

  it("finds test methods, including in non-TestCase classes", () => {
    assert.deepEqual(
      tests.map((t) => t.methodName),
      ["test_first", "test_hidden_partial", "test_unweighted_case", "test_outside"]
    );
  });

  it("reads weight, number, visibility and the docstring", () => {
    const first = tests[0]!;
    assert.equal(first.id, "tests/test_thing.py::TestThing.test_first");
    assert.equal(first.maxScore, 2.5);
    assert.equal(first.number, "1.1");
    assert.equal(first.visibility, "visible");
    assert.equal(first.name, "Adds two numbers");
    assert.equal(first.description, "and checks the sum.");
  });

  it("treats partial_credit as the max score and keeps decorator order free", () => {
    const hidden = tests[1]!;
    assert.equal(hidden.maxScore, 4);
    assert.equal(hidden.visibility, "hidden");
    assert.equal(hidden.name, "Hidden partial");
  });

  it("does not leak decorators to the next method", () => {
    assert.equal(tests[2]!.maxScore, 0);
    assert.equal(tests[2]!.visibility, "visible");
  });
});

describe("parseJavaTests", () => {
  it("reads @GradedTest arguments", () => {
    const tests = parseJavaTests({
      path: "src/test/ListTest.java",
      content: `public class ListTest {
  @Test
  @GradedTest(name = "Adds to an empty list", number = "2", max_score = 3.0, visibility = "after_due_date")
  public void testAddEmpty() {}

  @Test @GradedTest(max_score=1)
  public void testRemove() {}
}`,
    });
    assert.equal(tests.length, 2);
    assert.deepEqual(
      { name: tests[0]!.name, number: tests[0]!.number, max: tests[0]!.maxScore, vis: tests[0]!.visibility },
      { name: "Adds to an empty list", number: "2", max: 3, vis: "after_due_date" }
    );
    assert.equal(tests[1]!.name, "Remove");
    assert.equal(tests[1]!.id, "src/test/ListTest.java::ListTest.testRemove");
  });
});

describe("parseGradescopeAutograder", () => {
  it("reports submission files and missing pieces", () => {
    const parsed = parseGradescopeAutograder([
      { path: "run_autograder", content: "cp /autograder/submission/hw1.py /autograder/source/\ncd /autograder/source" },
      { path: "hw1.py", content: "solution" },
      { path: "tests/test_a.py", content: PY_TESTS },
    ]);
    assert.deepEqual(parsed.submissionFiles, ["hw1.py"]);
    assert.equal(parsed.language, "python");
    assert.equal(parsed.totalPoints, 6.5);
    assert.ok(parsed.warnings.some((w) => w.includes("setup.sh")));
    assert.ok(parsed.warnings.some((w) => w.includes("hw1.py")));
  });

  it("warns when no tests are found", () => {
    const parsed = parseGradescopeAutograder([{ path: "setup.sh", content: "" }]);
    assert.equal(parsed.tests.length, 0);
    assert.ok(parsed.warnings.some((w) => w.startsWith("No tests found")));
  });
});

describe("parseGradescopeAutograderZip", () => {
  it("strips a single wrapping folder and skips junk", async () => {
    const zip = new JSZip();
    zip.file("hw1/setup.sh", "pip3 install gradescope-utils\n");
    zip.file("hw1/run_autograder", "cp /autograder/submission/a.py /autograder/source/a.py\n");
    zip.file("hw1/tests/test_a.py", PY_TESTS);
    zip.file("hw1/logo.png", new Uint8Array([137, 80, 78, 71]));
    zip.file("__MACOSX/hw1/._setup.sh", "junk");
    const parsed = await parseGradescopeAutograderZip(await zip.generateAsync({ type: "uint8array" }));
    assert.deepEqual(parsed.files.map((f) => f.path), ["run_autograder", "setup.sh", "tests/test_a.py"]);
    // Only the (expected) note about the fixture's unweighted tests - no missing setup.sh/run_autograder.
    assert.deepEqual(parsed.warnings, ["2 test(s) have no point value (@weight / max_score) and count for 0 points."]);
    assert.equal(parsed.tests.length, 4);
  });
});

describe("submissionFilesFrom", () => {
  it("ignores globs", () => {
    assert.deepEqual(submissionFilesFrom("cp /autograder/submission/*.py /autograder/source/\ncp /autograder/submission/main.go ."), [
      "main.go",
    ]);
  });
});
