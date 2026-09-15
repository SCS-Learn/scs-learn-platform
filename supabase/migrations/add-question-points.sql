-- Each quiz (question_group) is worth 100 points total, split across its
-- questions. Going forward, lib/google/build-quiz-questions-from-file.ts has
-- the AI assign points per question, weighted toward harder questions, so
-- newly imported quizzes already sum to 100.
--
-- Backfill for quizzes imported before this existed: split 100 evenly across
-- each question_group's existing questions (no difficulty signal to weight
-- by retroactively), remainder going to the earliest questions by position so
-- the total is always exactly 100 even when it doesn't divide evenly.
alter table public.questions
  add column if not exists points integer not null default 0 check (points >= 0);

with ranked as (
  select
    id,
    row_number() over (partition by question_group_id order by position) as rn,
    count(*) over (partition by question_group_id) as n
  from public.questions
)
update public.questions q
set points = (100 / ranked.n) + case when ranked.rn <= (100 % ranked.n) then 1 else 0 end
from ranked
where q.id = ranked.id;
