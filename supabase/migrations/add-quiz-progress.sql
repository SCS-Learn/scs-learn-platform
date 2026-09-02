-- Quiz submission tracking for in-app graded assessments.
-- Run in Supabase SQL Editor after schema.sql (safe to re-run).

create table if not exists public.quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  platform_user_id text not null,
  correct_count integer not null default 0,
  gradable_count integer not null default 0,
  score_percent integer not null default 0,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (lesson_id, platform_user_id)
);

create table if not exists public.quiz_responses (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.quiz_submissions (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  response_text text not null default '',
  is_correct boolean,
  created_at timestamptz not null default now(),
  unique (submission_id, question_id)
);

alter table public.quiz_submissions enable row level security;
alter table public.quiz_responses enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'quiz_submissions' and policyname = 'stub_auth_allow_all'
  ) then
    create policy "stub_auth_allow_all" on public.quiz_submissions for all using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'quiz_responses' and policyname = 'stub_auth_allow_all'
  ) then
    create policy "stub_auth_allow_all" on public.quiz_responses for all using (true) with check (true);
  end if;
end $$;

create index if not exists quiz_submissions_lesson_user_idx
  on public.quiz_submissions (lesson_id, platform_user_id);

create index if not exists quiz_responses_submission_idx
  on public.quiz_responses (submission_id);
