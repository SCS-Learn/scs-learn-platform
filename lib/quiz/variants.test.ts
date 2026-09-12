import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VARIANT_COUNT,
  applyQuestionVariant,
  applyQuestionVariants,
  clampVariantIndex,
  hasVariantPool,
  nextVariantIndex,
  parseVariants,
  quizVariantPoolSize,
  seededShuffle,
  shuffleAnswerOptions,
  shuffleQuestionOrder,
  variantsToDbJson,
  type QuestionVariant,
} from "./variants.ts";

function makePool(promptBase = "What is 2+2?"): QuestionVariant[] {
  return Array.from({ length: VARIANT_COUNT }, (_, i) => ({
    promptText: i === 0 ? promptBase : `${promptBase} (v${i})`,
    choices: i % 2 === 0 ? ["4", "5", "3"] : ["5", "4", "3"],
    answerKey: "4",
  }));
}

describe("variant index helpers", () => {
  it("wraps with nextVariantIndex", () => {
    assert.equal(nextVariantIndex(0, 10), 1);
    assert.equal(nextVariantIndex(9, 10), 0);
    assert.equal(nextVariantIndex(0, 1), 0);
    assert.equal(nextVariantIndex(3, 0), 0);
  });

  it("clamps negative and oversized indices", () => {
    assert.equal(clampVariantIndex(-1, 10), 9);
    assert.equal(clampVariantIndex(10, 10), 0);
    assert.equal(clampVariantIndex(25, 10), 5);
  });
});

describe("seededShuffle / question order", () => {
  it("is deterministic for the same seed", () => {
    const items = ["a", "b", "c", "d", "e"];
    assert.deepEqual(seededShuffle(items, 42), seededShuffle(items, 42));
  });

  it("avoids identity when requested", () => {
    const items = ["a", "b", "c"];
    const shuffled = seededShuffle(items, 0, true);
    assert.equal(shuffled.length, 3);
    assert.ok(!(shuffled[0] === "a" && shuffled[1] === "b" && shuffled[2] === "c"));
  });

  it("keeps original question order for variant index 0", () => {
    const questions = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];
    assert.deepEqual(
      shuffleQuestionOrder(questions, 0).map((q) => q.id),
      ["q1", "q2", "q3"]
    );
  });

  it("reorders questions for variant index > 0", () => {
    const questions = [{ id: "q1" }, { id: "q2" }, { id: "q3" }, { id: "q4" }];
    const order1 = shuffleQuestionOrder(questions, 1).map((q) => q.id);
    const order2 = shuffleQuestionOrder(questions, 2).map((q) => q.id);
    assert.notDeepEqual(order1, ["q1", "q2", "q3", "q4"]);
    assert.notDeepEqual(order1, order2);
    assert.deepEqual([...order1].sort(), ["q1", "q2", "q3", "q4"]);
  });
});

describe("shuffleAnswerOptions", () => {
  it("shuffles MC options while keeping the same texts", () => {
    const choices = ["Paris", "London", "Berlin", "Madrid"];
    const shuffled = shuffleAnswerOptions("multiple_choice", choices, 99);
    assert.ok(Array.isArray(shuffled));
    assert.deepEqual([...(shuffled as string[])].sort(), [...choices].sort());
    assert.notDeepEqual(shuffled, choices);
  });
});

describe("applyQuestionVariant", () => {
  it("leaves questions without a full pool unchanged", () => {
    const question = {
      id: "q1",
      promptText: "Original",
      choices: ["A", "B"],
      answerKey: "A",
      questionType: "multiple_choice",
      variants: [{ promptText: "Only one", choices: ["A"], answerKey: "A" }],
    };
    assert.equal(hasVariantPool(question.variants), false);
    const applied = applyQuestionVariant(question, 1);
    assert.equal(applied.promptText, "Original");
  });

  it("applies the indexed surface from a full pool", () => {
    const pool = makePool();
    const question = {
      id: "q1",
      promptText: pool[0]!.promptText,
      choices: pool[0]!.choices,
      answerKey: pool[0]!.answerKey,
      questionType: "multiple_choice",
      variants: pool,
    };
    const v3 = applyQuestionVariant(question, 3);
    assert.equal(v3.promptText, pool[3]!.promptText);
    assert.equal(v3.answerKey, "4");
    assert.equal(v3.id, "q1");
    assert.ok(Array.isArray(v3.choices));
    assert.ok((v3.choices as string[]).includes("4"));
  });

  it("applies surfaces and reorders questions for index > 0", () => {
    const poolA = makePool("Q-A");
    const poolB = makePool("Q-B");
    const poolC = makePool("Q-C");
    const questions = [
      {
        id: "q1",
        promptText: poolA[0]!.promptText,
        choices: poolA[0]!.choices,
        answerKey: "4",
        questionType: "multiple_choice",
        variants: poolA,
      },
      {
        id: "q2",
        promptText: poolB[0]!.promptText,
        choices: poolB[0]!.choices,
        answerKey: "4",
        questionType: "multiple_choice",
        variants: poolB,
      },
      {
        id: "q3",
        promptText: poolC[0]!.promptText,
        choices: poolC[0]!.choices,
        answerKey: "4",
        questionType: "multiple_choice",
        variants: poolC,
      },
    ];
    assert.equal(quizVariantPoolSize(questions), VARIANT_COUNT);

    const original = applyQuestionVariants(questions, 0);
    assert.deepEqual(
      original.map((q) => q.id),
      ["q1", "q2", "q3"]
    );

    const active = applyQuestionVariants(questions, 2);
    assert.notDeepEqual(
      active.map((q) => q.id),
      ["q1", "q2", "q3"]
    );
    const q1 = active.find((q) => q.id === "q1")!;
    assert.equal(q1.promptText, poolA[2]!.promptText);
    assert.ok(Array.isArray(q1.choices));
    assert.ok((q1.choices as string[]).includes("4"));
  });
});

describe("parseVariants / variantsToDbJson", () => {
  it("round-trips snake_case db rows", () => {
    const pool = makePool().slice(0, 2);
    const json = variantsToDbJson(pool);
    const parsed = parseVariants(json);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0]!.promptText, pool[0]!.promptText);
    assert.deepEqual(parsed[0]!.choices, pool[0]!.choices);
    assert.equal(parsed[0]!.answerKey, pool[0]!.answerKey);
  });

  it("accepts camelCase variant objects", () => {
    const parsed = parseVariants([
      { promptText: "Hi", choices: ["A"], answerKey: "A" },
    ]);
    assert.equal(parsed[0]!.promptText, "Hi");
  });
});
