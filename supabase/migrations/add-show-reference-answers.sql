-- Lets an instructor opt a quiz lesson into showing free_response (AI-graded)
-- reference answers to students after they submit. Off by default - students
-- never see the reference answer unless the instructor turns this on for
-- that specific quiz.
-- Run in Supabase SQL Editor (safe to re-run).

alter table public.lessons
  add column if not exists show_reference_answers boolean not null default false;
