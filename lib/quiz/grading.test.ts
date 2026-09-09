import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isCorrect, matchesShortAnswer, scoreQuiz, reconcileQuizSubmission } from "./grading.ts";

describe("matchesShortAnswer", () => {
  it("matches plain text case-insensitively", () => {
    assert.equal(matchesShortAnswer("ATGGCC", "atggcc"), true);
    assert.equal(matchesShortAnswer("overlap", "overlapping"), false);
  });

  it("matches alternates with pipe", () => {
    assert.equal(matchesShortAnswer("overlapping", "overlap|overlapping"), true);
  });
});

describe("isCorrect", () => {
  it("grades multiple choice", () => {
    assert.equal(
      isCorrect(
        { questionType: "multiple_choice", answerKey: "B", choices: ["A", "B", "C"], promptText: "" },
        "B"
      ),
      true
    );
  });

  it("grades multiple select", () => {
    assert.equal(
      isCorrect(
        {
          questionType: "multiple_select",
          answerKey: '["A","C"]',
          choices: ["A", "B", "C"],
          promptText: "",
        },
        '["C","A"]'
      ),
      true
    );
  });

  it("grades matching", () => {
    assert.equal(
      isCorrect(
        {
          questionType: "matching",
          answerKey: '{"Term 1":"Def A","Term 2":"Def B"}',
          choices: { left: ["Term 1", "Term 2"], right: ["Def A", "Def B"] },
          promptText: "",
        },
        '{"Term 1":"Def A","Term 2":"Def B"}'
      ),
      true
    );
  });

  it("grades ordering", () => {
    assert.equal(
      isCorrect(
        {
          questionType: "ordering",
          answerKey: '["First","Second","Third"]',
          choices: {
            items: ["First", "Second", "Third"],
            displayOrder: ["Third", "First", "Second"],
          },
          promptText: "",
        },
        '["First","Second","Third"]'
      ),
      true
    );
    assert.equal(
      isCorrect(
        {
          questionType: "ordering",
          answerKey: '["First","Second","Third"]',
          choices: {
            items: ["First", "Second", "Third"],
            displayOrder: ["Third", "First", "Second"],
          },
          promptText: "",
        },
        ""
      ),
      false
    );
  });

  it("grades numeric tolerance", () => {
    assert.equal(
      isCorrect(
        {
          questionType: "numeric_tolerance",
          answerKey: '{"value":3.14,"tolerance":0.01}',
          choices: null,
          promptText: "",
        },
        "3.145"
      ),
      true
    );
  });

  it("grades keyword scored", () => {
    assert.equal(
      isCorrect(
        {
          questionType: "keyword_scored",
          answerKey: '{"keywords":["mitosis","cell"],"minKeywords":1}',
          choices: null,
          promptText: "",
        },
        "Mitosis divides the cell."
      ),
      true
    );
  });

  it("grades vector", () => {
    assert.equal(
      isCorrect(
        {
          questionType: "vector",
          answerKey: '{"vector":[1,2,3]}',
          choices: { dimensions: 3 },
          promptText: "",
        },
        "[1,2,3]"
      ),
      true
    );
  });

  it("grades antiderivative with constant", () => {
    assert.equal(
      isCorrect(
        {
          questionType: "antiderivative",
          answerKey: '{"expression":"x^2 + C","allowConstant":true}',
          choices: null,
          promptText: "",
        },
        "x^2 + 5"
      ),
      true
    );
  });

  it("grades significant figures by rounding", () => {
    assert.equal(
      isCorrect(
        {
          questionType: "significant_figures",
          answerKey: '{"value":3.14,"sigFigs":2}',
          choices: null,
          promptText: "",
        },
        "3.1"
      ),
      true
    );
    assert.equal(
      isCorrect(
        {
          questionType: "significant_figures",
          answerKey: '{"value":3.14,"sigFigs":2}',
          choices: null,
          promptText: "",
        },
        "3.2"
      ),
      false
    );
  });
});

describe("scoreQuiz / reconcileQuizSubmission", () => {
  const questions = [
    {
      id: "q1",
      questionType: "multiple_choice" as const,
      answerKey: "A",
      choices: ["A", "B"],
      promptText: "One",
    },
    {
      id: "q2",
      questionType: "multiple_choice" as const,
      answerKey: "B",
      choices: ["A", "B"],
      promptText: "Two",
    },
    {
      id: "q3",
      questionType: "multiple_choice" as const,
      answerKey: "A",
      choices: ["A", "B"],
      promptText: "Three",
    },
  ];

  it("uses the live question count as the score denominator", () => {
    const scored = scoreQuiz(questions, { q1: "A", q2: "A", q3: "A" });
    assert.equal(scored.correctCount, 2);
    assert.equal(scored.gradableCount, 3);
    assert.equal(scored.scorePercent, 67);
  });

  it("rescores after a question is removed", () => {
    const remaining = questions.filter((q) => q.id !== "q2");
    const reconciled = reconcileQuizSubmission(remaining, {
      submittedAt: "2026-01-01T00:00:00.000Z",
      responses: { q1: "A", q2: "B", q3: "A" },
      correctCount: 3,
      gradableCount: 3,
      scorePercent: 100,
    });
    assert.ok(reconciled);
    assert.equal(reconciled.gradableCount, 2);
    assert.equal(reconciled.correctCount, 2);
    assert.equal(reconciled.scorePercent, 100);
    assert.deepEqual(reconciled.responses, { q1: "A", q3: "A" });
  });
});
