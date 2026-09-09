"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  createQuestionInGroup,
  deleteQuestion,
  updateQuestion,
  type Question,
} from "@/lib/instructor/data/questions";
import {
  editorStateFromQuestion,
  QuestionEditorFields,
  validateEditorState,
} from "@/components/quiz/QuestionEditorFields";
import type { QuestionView } from "@/lib/instructor/mock-data";

function toQuestionView(question: Question): QuestionView {
  return {
    id: question.id,
    promptText: question.promptText,
    choices: question.choices,
    answerKey: question.answerKey,
    questionType: question.questionType,
    needsReview: question.needsReview,
  };
}

function QuestionEditorCard({
  courseCode,
  question,
  index,
  onSaved,
  onDeleted,
}: {
  courseCode: string;
  question: QuestionView;
  index: number;
  onSaved: (next: QuestionView) => void;
  onDeleted: (questionId: string) => void;
}) {
  const [state, setState] = useState(() => editorStateFromQuestion(question));
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [isPending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    const validationError = validateEditorState(state);
    if (validationError) {
      setError(validationError);
      return;
    }

    startTransition(async () => {
      try {
        const updated = await updateQuestion(courseCode, question.id, {
          promptText: state.promptText.trim(),
          questionType: state.questionType,
          choices: state.choices,
          answerKey: state.answerKey.trim(),
          needsReview: false,
        });
        onSaved(toQuestionView(updated));
        setState(editorStateFromQuestion(updated));
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Could not save question.");
      }
    });
  };

  const remove = () => {
    if (!window.confirm("Delete this question? This cannot be undone.")) return;

    setError(null);
    startTransition(async () => {
      try {
        await deleteQuestion(courseCode, question.id);
        onDeleted(question.id);
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "Could not delete question.");
      }
    });
  };

  return (
    <div className="border border-gray-200 p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-500">Question {index + 1}</p>
        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          className="text-sm text-gray-500 hover:text-red-600 inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          <Trash2 size={16} />
          Delete
        </button>
      </div>

      <QuestionEditorFields
        state={state}
        questionId={question.id}
        onChange={(patch) => setState((prev) => ({ ...prev, ...patch }))}
      />

      <div className="flex items-center gap-4 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="text-base font-bold text-black border border-black px-5 py-2.5 hover:bg-gray-50 disabled:opacity-60 inline-flex items-center gap-2"
        >
          {isPending && <Loader2 size={16} className="animate-spin" />}
          Save question
        </button>
        {savedFlash && <span className="text-sm text-green-700">Saved</span>}
        {question.needsReview && !savedFlash && (
          <span className="text-sm text-amber-700">Needs review</span>
        )}
      </div>
      {error && <p className="text-base text-red-600">{error}</p>}
    </div>
  );
}

export default function InstructorQuizEditor({
  courseCode,
  lessonTitle,
  questionGroupId,
  questions,
  onQuestionSaved,
  onQuestionAdded,
  onQuestionDeleted,
}: {
  courseCode: string;
  lessonTitle: string;
  questionGroupId: string | null;
  questions: QuestionView[];
  onQuestionSaved: (question: QuestionView) => void;
  onQuestionAdded: (question: QuestionView) => void;
  onQuestionDeleted: (questionId: string) => void;
}) {
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, startAddTransition] = useTransition();

  const addQuestion = () => {
    if (!questionGroupId) return;

    setAddError(null);
    startAddTransition(async () => {
      try {
        const created = await createQuestionInGroup(
          courseCode,
          questionGroupId
        );
        onQuestionAdded(toQuestionView(created));
      } catch (error) {
        setAddError(error instanceof Error ? error.message : "Could not add question.");
      }
    });
  };

  const canManageQuestions = Boolean(questionGroupId);

  return (
    <div className="topic-lesson min-h-full flex flex-col">
      <div className="px-8 pt-8 pb-4">
        <h1 className="topic-lesson-title">{lessonTitle}</h1>
      </div>

      <div className="w-full bg-gray-50 border-y border-gray-200 px-8 py-6 text-base text-gray-600 leading-relaxed">
        <p className="font-semibold text-gray-800 mb-3 text-lg">How to edit questions</p>
        <ol className="list-decimal list-inside space-y-2">
          <li>Select the question type that best matches the format.</li>
          <li>Enter the question text — read the placeholder for any special formatting (e.g. blanks).</li>
          <li>Set the options or correct answer in the fields below, then save.</li>
        </ol>
      </div>

      <div className="flex flex-col gap-6 px-8 py-8 pb-12">
        {canManageQuestions && (
          <button
            type="button"
            onClick={addQuestion}
            disabled={isAdding}
            className="self-start text-base font-semibold text-black border border-black px-5 py-2.5 hover:bg-gray-50 disabled:opacity-60 inline-flex items-center gap-2"
          >
            {isAdding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add question
          </button>
        )}
        {addError && <p className="text-base text-red-600">{addError}</p>}

        {questions.length === 0 ? (
          <p className="text-base text-gray-500">
            {canManageQuestions
              ? "No questions yet. Click Add question to create one."
              : "No auto-gradable questions were found in this file. Source attachments remain in the lesson settings panel."}
          </p>
        ) : (
          questions.map((question, index) => (
            <QuestionEditorCard
              key={question.id}
              courseCode={courseCode}
              question={question}
              index={index}
              onSaved={onQuestionSaved}
              onDeleted={onQuestionDeleted}
            />
          ))
        )}
      </div>
    </div>
  );
}
