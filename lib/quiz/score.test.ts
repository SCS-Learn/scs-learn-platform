import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { countsTowardScore, scoreStoredAttempt, totalScore } from "./score.ts";

const short = (id: string, points: number) => ({
  id,
  questionType: "short_answer" as const,
  answerKey: "yes",
  choices: [],
  promptText: id,
  points,
});

const freeResponse = (id: string, points: number) => ({
  id,
  questionType: "free_response" as const,
  answerKey: "A reference answer.",
  choices: [],
  promptText: id,
  points,
});

describe("totalScore", () => {
  it("weights each question by its points (80/10/10, only the 80 right)", () => {
    // The completion-gate bug: this used to count 1 of 3 correct = 33%.
    const total = totalScore([short("a", 80), short("b", 10), short("c", 10)], { a: 1, b: 0, c: 0 });
    assert.deepEqual(total, { correctCount: 80, gradableCount: 100, scorePercent: 80 });
  });

  it("counts free_response partial credit (a free_response-only quiz can pass)", () => {
    // Used to be 0% because free_response wasn't gradable to the old scorer.
    const total = totalScore([freeResponse("f", 100)], { f: 0.9 });
    assert.equal(total.scorePercent, 90);
  });

  it("mixes rule-graded and free_response questions by points", () => {
    const total = totalScore([short("a", 50), freeResponse("f", 50)], { a: 1, f: 0.5 });
    assert.deepEqual(total, { correctCount: 75, gradableCount: 100, scorePercent: 75 });
  });

  it("gives 0 to a question with no stored fraction (unanswered or added later)", () => {
    const total = totalScore([short("a", 50), short("new", 50)], { a: 1 });
    assert.equal(total.scorePercent, 50);
  });

  it("ignores questions that don't count (no key) and fractions for deleted questions", () => {
    const noKey = { ...short("nokey", 50), answerKey: null };
    const total = totalScore([short("a", 50), noKey], { a: 1, deleted: 1 });
    assert.deepEqual(total, { correctCount: 50, gradableCount: 50, scorePercent: 100 });
  });

  it("uses the current points when an instructor re-weights after the attempt", () => {
    // Same stored fractions; points changed from 80/10/10 to 10/80/10.
    const total = totalScore([short("a", 10), short("b", 80), short("c", 10)], { a: 1, b: 0, c: 0 });
    assert.equal(total.scorePercent, 10);
  });

  it("is 0% when nothing counts", () => {
    assert.equal(totalScore([], {}).scorePercent, 0);
  });
});

describe("countsTowardScore", () => {
  it("counts rule-graded questions with a key and free_response with a reference answer", () => {
    assert.equal(countsTowardScore(short("a", 1)), true);
    assert.equal(countsTowardScore(freeResponse("f", 1)), true);
    assert.equal(countsTowardScore({ ...short("a", 1), answerKey: null }), false);
    assert.equal(countsTowardScore({ ...freeResponse("f", 1), answerKey: "  " }), false);
  });
});

describe("scoreStoredAttempt", () => {
  const attempt = {
    submittedAt: "2026-01-01T00:00:00.000Z",
    responses: { a: "yes", b: "no", c: "no" },
    scores: {
      a: { fraction: 1, feedback: null },
      b: { fraction: 0, feedback: null },
      c: { fraction: 0, feedback: null },
    },
  };

  it("returns null without an attempt", () => {
    assert.equal(scoreStoredAttempt([short("a", 1)], null), null);
  });

  it("totals the stored fractions the same way as at submit time", () => {
    const scored = scoreStoredAttempt([short("a", 80), short("b", 10), short("c", 10)], attempt);
    assert.ok(scored);
    assert.equal(scored.scorePercent, 80);
    assert.equal(scored.submittedAt, attempt.submittedAt);
  });

  it("drops responses and scores for deleted questions and rescales the total", () => {
    const scored = scoreStoredAttempt([short("a", 80), short("c", 10)], attempt);
    assert.ok(scored);
    assert.deepEqual(scored.responses, { a: "yes", c: "no" });
    assert.deepEqual(Object.keys(scored.scores), ["a", "c"]);
    assert.equal(scored.gradableCount, 90);
    assert.equal(scored.scorePercent, 89);
  });

  it("keeps the stored grade even if the answer key changed (no regrading on read)", () => {
    const keyChanged = { ...short("a", 100), answerKey: "something else" };
    const scored = scoreStoredAttempt([keyChanged], {
      ...attempt,
      responses: { a: "yes" },
      scores: { a: { fraction: 1, feedback: null } },
    });
    assert.ok(scored);
    assert.equal(scored.scorePercent, 100);
  });
});
