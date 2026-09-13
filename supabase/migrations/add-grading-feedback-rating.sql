-- Lets a student thumbs-up/down the AI's grading feedback on a free_response
-- question, so instructors can spot-check where the LLM grader is off.
-- Run in Supabase SQL Editor (safe to re-run).

alter table public.quiz_responses
  add column if not exists grading_feedback_rating text
    check (grading_feedback_rating in ('up', 'down'));
