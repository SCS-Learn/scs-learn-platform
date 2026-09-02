/** Question types the platform can auto-grade in-app. */
export type AutogradableQuestionType =
  | "multiple_choice"
  | "short_answer"
  | "true_false"
  | "multiple_select";

export type QuestionType = AutogradableQuestionType | "free_response" | "unknown";

export const AUTOGRADABLE_QUESTION_TYPES: AutogradableQuestionType[] = [
  "multiple_choice",
  "short_answer",
  "true_false",
  "multiple_select",
];

export function isAutogradableQuestionType(type: string): type is AutogradableQuestionType {
  return (AUTOGRADABLE_QUESTION_TYPES as string[]).includes(type);
}

export type QuizQuestionFields = {
  promptText: string;
  questionType: QuestionType;
  choices: string[] | null;
  answerKey: string | null;
};
