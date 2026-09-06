import type { PageUnit } from "@/lib/google/classify-content-units";
import { isValidShortAnswer, normalizeShortAnswer } from "@/lib/quiz/grading";
import type { QuestionType } from "@/lib/instructor/data/questions";

export type SlicedQuestion = {
  position: number;
  promptText: string;
  promptSource: "verbatim_extracted" | "llm_transcribed";
  choices: string[] | null;
  answerKey: string | null;
  questionType: QuestionType;
  sourceSlideOrPageIndex: number | null;
  needsReview: boolean;
};

type PageText = { index: number; texts: string[]; hasTextLayer?: boolean };

const CHOICE_LINE =
  /^[\(\[]?\s*([A-Ea-e])[\)\].:\-\)]\s*(.+)$|^\s*([A-Ea-e])[\.\)]\s+(.+)$/;

function pageText(pageTexts: PageText[], pageIndex: number): string {
  const page = pageTexts.find((p) => p.index === pageIndex);
  if (!page || page.texts.length === 0) return "";
  return page.texts.join("\n").trim();
}

function joinPageTexts(pageTexts: PageText[], indices: number[]): string {
  return indices
    .map((index) => pageText(pageTexts, index))
    .filter((text) => text.length > 0)
    .join("\n\n")
    .trim();
}

/** Pulls multiple-choice option lines out of free-form text. */
export function parseChoicesFromText(text: string): string[] | null {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const choices: string[] = [];

  for (const line of lines) {
    const match = line.match(CHOICE_LINE);
    if (match) {
      choices.push((match[2] ?? match[4] ?? "").trim());
    }
  }

  if (choices.length >= 2) return choices;

  // Bulleted options without letter prefixes
  const bullets = lines.filter((line) => /^[-•*]\s+/.test(line));
  if (bullets.length >= 2) {
    return bullets.map((line) => line.replace(/^[-•*]\s+/, "").trim());
  }

  return null;
}

/** Strips common answer-key prefixes and maps letter keys to full choice text. */
export function normalizeAnswerKey(answerKey: string, choices: string[] | null): string {
  let key = answerKey
    .replace(/^(answer\s*(key)?|solution|correct\s*answer)\s*[:.\-]\s*/i, "")
    .trim();

  if (!choices || choices.length === 0) return key;

  const letterMatch = key.match(/^[\(\[]?\s*([A-Ea-e])\s*[\)\].:\-\s]*$/);
  if (letterMatch) {
    const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < choices.length) return choices[idx]!;
  }

  const normalized = key.toLowerCase();
  const verbatim = choices.find((choice) => choice.trim().toLowerCase() === normalized);
  return verbatim ?? key;
}

function inferQuestionType(
  choices: string[] | null,
  answerKey: string | null,
  promptText: string
): QuestionType {
  if (choices && choices.length >= 2) return "multiple_choice";
  const combined = `${promptText}\n${answerKey ?? ""}`;
  if (/\bfree\s*response\b|\bessay\b|\bexplain\b|\bdescribe\b|\bin\s+(one\s+)?paragraph\b/i.test(combined)) {
    return "free_response";
  }
  if (answerKey && answerKey.length > 120) return "free_response";
  if (answerKey) return "short_answer";
  return "unknown";
}

function stripChoicesFromPrompt(promptText: string, choices: string[] | null): string {
  if (!choices || choices.length === 0) return promptText;
  const lines = promptText.split("\n");
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (CHOICE_LINE.test(trimmed)) return false;
    if (/^[-•*]\s+/.test(trimmed) && choices.some((c) => trimmed.includes(c.slice(0, 20)))) return false;
    return true;
  });
  return filtered.join("\n").trim() || promptText;
}

/**
 * Turns page/slide routing labels into near-verbatim question rows by slicing
 * deterministically extracted source text — never model-authored prose.
 */
export function sliceQuestionsFromUnits(
  pageTexts: PageText[],
  units: PageUnit[]
): SlicedQuestion[] {
  const byGroup = new Map<string, PageUnit[]>();
  for (const unit of units) {
    if (!unit.groupId) continue;
    const list = byGroup.get(unit.groupId) ?? [];
    list.push(unit);
    byGroup.set(unit.groupId, list);
  }

  const questions: SlicedQuestion[] = [];
  let position = 0;

  for (const [, groupUnits] of byGroup) {
    const promptPages = groupUnits.filter((u) => u.role === "prompt").map((u) => u.pageIndex);
    const choicePages = groupUnits.filter((u) => u.role === "choices").map((u) => u.pageIndex);
    const answerPages = groupUnits.filter((u) => u.role === "answer_key").map((u) => u.pageIndex);
    const contentPages = groupUnits.filter((u) => u.role === "content").map((u) => u.pageIndex);

    if (promptPages.length === 0 && contentPages.length === 0) continue;

    const promptIndices = promptPages.length > 0 ? promptPages : contentPages;
    let promptText = joinPageTexts(pageTexts, promptIndices);
    if (!promptText) continue;

    const choicesText = joinPageTexts(pageTexts, choicePages);
    let choices = choicesText ? parseChoicesFromText(choicesText) : null;
    if (!choices) choices = parseChoicesFromText(promptText);

    promptText = stripChoicesFromPrompt(promptText, choices);

    const rawAnswerKey = joinPageTexts(pageTexts, answerPages);
    const rawKey = rawAnswerKey ? normalizeAnswerKey(rawAnswerKey, choices) : null;
    const questionType = inferQuestionType(choices, rawKey, promptText);
    const answerKey =
      rawKey && questionType === "short_answer"
        ? isValidShortAnswer(rawKey)
          ? normalizeShortAnswer(rawKey)
          : null
        : rawKey;

    const sourceIndex = promptIndices[0] ?? null;
    const sourcePage = sourceIndex !== null ? pageTexts.find((p) => p.index === sourceIndex) : null;
    const needsReview =
      sourcePage?.hasTextLayer === false ||
      promptText.length < 8 ||
      (choices !== null && choices.length < 2) ||
      (questionType === "short_answer" && rawKey !== null && answerKey === null);

    position += 1;
    questions.push({
      position,
      promptText,
      promptSource: sourcePage?.hasTextLayer === false ? "llm_transcribed" : "verbatim_extracted",
      choices,
      answerKey,
      questionType,
      sourceSlideOrPageIndex: sourceIndex,
      needsReview,
    });
  }

  return questions;
}
