import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isCorrect, matchesShortAnswer } from "./grading.js";

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
});
