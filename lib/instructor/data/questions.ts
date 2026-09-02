"use server";

import { createClient } from "@/lib/supabase/server";

export type QuestionGroup = {
  id: string;
  lessonId: string;
  sourceDriveFileId: string;
  title: string;
  position: number;
};

export async function addQuestionGroup(
  lessonId: string,
  patch: { sourceDriveFileId: string; title: string; position: number }
): Promise<QuestionGroup> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_groups")
    .insert({
      lesson_id: lessonId,
      source_drive_file_id: patch.sourceDriveFileId,
      title: patch.title,
      position: patch.position,
    })
    .select("id, lesson_id, source_drive_file_id, title, position")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create question group");

  return {
    id: data.id,
    lessonId: data.lesson_id,
    sourceDriveFileId: data.source_drive_file_id,
    title: data.title,
    position: data.position,
  };
}

import type { QuestionType } from "@/lib/quiz/types";

export type { QuestionType } from "@/lib/quiz/types";
export type PromptSource = "verbatim_extracted" | "llm_transcribed";

export type Question = {
  id: string;
  questionGroupId: string;
  position: number;
  promptText: string;
  promptSource: PromptSource;
  choices: string[] | null;
  answerKey: string | null;
  questionType: QuestionType;
  sourceSlideOrPageIndex: number | null;
  needsReview: boolean;
};

export async function addQuestion(
  questionGroupId: string,
  patch: {
    position: number;
    promptText: string;
    promptSource: PromptSource;
    choices?: string[] | null;
    answerKey?: string | null;
    questionType?: QuestionType;
    sourceSlideOrPageIndex?: number | null;
    needsReview?: boolean;
  }
): Promise<Question> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("questions")
    .insert({
      question_group_id: questionGroupId,
      position: patch.position,
      prompt_text: patch.promptText,
      prompt_source: patch.promptSource,
      choices: patch.choices ?? null,
      answer_key: patch.answerKey ?? null,
      question_type: patch.questionType ?? "unknown",
      source_slide_or_page_index: patch.sourceSlideOrPageIndex ?? null,
      needs_review: patch.needsReview ?? false,
    })
    .select(
      "id, question_group_id, position, prompt_text, prompt_source, choices, answer_key, question_type, source_slide_or_page_index, needs_review"
    )
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create question");

  return {
    id: data.id,
    questionGroupId: data.question_group_id,
    position: data.position,
    promptText: data.prompt_text,
    promptSource: data.prompt_source,
    choices: data.choices,
    answerKey: data.answer_key,
    questionType: data.question_type,
    sourceSlideOrPageIndex: data.source_slide_or_page_index,
    needsReview: data.needs_review,
  };
}

export async function getQuestionsForGroup(questionGroupId: string): Promise<Question[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("questions")
    .select(
      "id, question_group_id, position, prompt_text, prompt_source, choices, answer_key, question_type, source_slide_or_page_index, needs_review"
    )
    .eq("question_group_id", questionGroupId)
    .order("position");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    questionGroupId: row.question_group_id,
    position: row.position,
    promptText: row.prompt_text,
    promptSource: row.prompt_source,
    choices: row.choices,
    answerKey: row.answer_key,
    questionType: row.question_type,
    sourceSlideOrPageIndex: row.source_slide_or_page_index,
    needsReview: row.needs_review,
  }));
}
