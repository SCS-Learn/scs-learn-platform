-- Per-learner lesson completion for the student course view.
-- Run in Supabase SQL Editor after schema.sql (safe to re-run).

create table if not exists public.lesson_completions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  platform_user_id text not null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (lesson_id, platform_user_id)
);

alter table public.lesson_completions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'lesson_completions' and policyname = 'stub_auth_allow_all'
  ) then
    create policy "stub_auth_allow_all" on public.lesson_completions for all using (true) with check (true);
  end if;
end $$;

create index if not exists lesson_completions_lesson_user_idx
  on public.lesson_completions (lesson_id, platform_user_id);
