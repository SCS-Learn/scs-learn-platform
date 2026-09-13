-- Supports partial-credit, AI-graded "free_response" questions.
-- Run in Supabase SQL Editor after add-quiz-progress.sql (safe to re-run).

-- correct_count now accumulates fractional per-question scores (0..1 each)
-- instead of a pure integer tally, since free_response questions can earn
-- partial credit from the LLM grader.
alter table public.quiz_submissions
  alter column correct_count type numeric using correct_count::numeric,
  alter column correct_count set default 0;

alter table public.quiz_responses
  add column if not exists score_fraction numeric,
  add column if not exists feedback text;
