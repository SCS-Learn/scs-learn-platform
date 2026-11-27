// IDE tasks: an in-browser code editor graded by a Gradescope-format
// autograder. Stored whole in lesson_blocks.code_task (jsonb) - see
// supabase/migrations/add-code-task-block.sql.
//
// Relative imports only in lib/code-task: the parser and these types are also
// loaded by plain Node (tests, scripts/seed-ide-demo.ts), which has no "@/"
// path alias.

export type CodeTaskLanguage = "python" | "java";

/** Gradescope's four visibility levels. Anything but "visible" is hidden from students here. */
export type TestVisibility = "visible" | "hidden" | "after_due_date" | "after_published";

/** One test case found in an autograder, by static parsing - never by running it. */
export type ParsedTest = {
  /** Stable key: `<file>::<Class>.<method>`. Matches a runner result back to its test. */
  id: string;
  /** Display name: the docstring's first line or @GradedTest name, else the method name made readable. */
  name: string;
  /** Gradescope's @number("1.2"), when given. */
  number: string | null;
  /** Points: @weight / @partial_credit (Python) or max_score (Java). 0 when unweighted. */
  maxScore: number;
  visibility: TestVisibility;
  /** The rest of the docstring, if any. */
  description: string | null;
  file: string;
  className: string;
  methodName: string;
};

export type AutograderFile = { path: string; content: string };

export type ParsedAutograder = {
  format: "gradescope";
  language: CodeTaskLanguage | null;
  /** Every text file in the zip, paths relative to the zip root (setup.sh, run_autograder, tests/...). */
  files: AutograderFile[];
  tests: ParsedTest[];
  totalPoints: number;
  /** Files run_autograder copies out of /autograder/submission - what the student must submit. */
  submissionFiles: string[];
  /** Problems an instructor should know about (missing setup.sh, no tests found, ...). */
  warnings: string[];
};

export type CodeTask = {
  language: CodeTaskLanguage;
  /** File name the student's code is saved as, e.g. "pattern_count.py". */
  entryFile: string;
  starterCode: string;
  /** Instructions shown above the editor (HTML). */
  promptHtml: string;
  autograder: ParsedAutograder | null;
};

/** One test's outcome from a run, keyed back to ParsedTest.id. */
export type TestRunResult = {
  testId: string;
  status: "passed" | "failed" | "error";
  score: number;
  maxScore: number;
  output: string;
};

export type CodeTaskRun = {
  results: TestRunResult[];
  score: number;
  maxScore: number;
  /** Anything that stopped the run itself: a syntax error, an import error, a timeout. */
  runError: string | null;
  /** Output printed while importing the student's file. */
  stdout: string;
};
