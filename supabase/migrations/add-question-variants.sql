-- Per-question student-facing variants (paraphrased prompt + shuffled choices).
-- Empty array = no rotation (legacy questions). Length 10 when generated.
alter table public.questions
  add column if not exists variants jsonb not null default '[]'::jsonb;

-- Which quiz version the learner last submitted (0–9 when variants exist).
alter table public.quiz_submissions
  add column if not exists variant_index integer not null default 0;
