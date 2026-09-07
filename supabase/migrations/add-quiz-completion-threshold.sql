-- Minimum quiz score (%) required before a learner can mark the lesson complete.
alter table public.lessons
  add column if not exists quiz_completion_threshold integer not null default 100;

alter table public.lessons
  drop constraint if exists lessons_quiz_completion_threshold_check;

alter table public.lessons
  add constraint lessons_quiz_completion_threshold_check
  check (quiz_completion_threshold between 0 and 100);
