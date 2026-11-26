-- Cogniterra / LTI integration: external lesson type + per-course Cogniterra setup.
-- Run after schema.sql and lti.sql (or includes lti table alterations if lti.sql not run).

create extension if not exists pgcrypto;

-- External lesson type (idempotent with lti.sql).
alter table public.lessons drop constraint if exists lessons_type_check;
alter table public.lessons
  add constraint lessons_type_check check (type in ('lesson', 'quiz', 'external'));

-- LTI tables (subset of lti.sql, safe to re-run).
create table if not exists public.lti_tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vendor text not null check (vendor in ('cogniterra', 'autolab', 'generic')),
  lti_version text not null default '1.1' check (lti_version in ('1.1', '1.3')),
  launch_url text not null,
  consumer_key text not null,
  shared_secret text not null,
  send_learner_identity boolean not null default true,
  created_at timestamptz not null default now(),
  unique (launch_url, consumer_key)
);

create table if not exists public.lti_links (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  tool_id uuid not null references public.lti_tools (id) on delete restrict,
  title text not null default 'External activity',
  custom_params jsonb not null default '{}'::jsonb,
  points_possible numeric not null default 100,
  created_at timestamptz not null default now(),
  unique (lesson_id)
);

create table if not exists public.lti_results (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.lti_links (id) on delete cascade,
  platform_user_id text not null,
  sourcedid uuid not null default gen_random_uuid() unique,
  score numeric,
  score_raw numeric,
  reported_at timestamptz,
  first_launched_at timestamptz not null default now(),
  last_launched_at timestamptz not null default now(),
  launch_count integer not null default 0,
  unique (link_id, platform_user_id)
);

create table if not exists public.lti_nonces (
  nonce text not null,
  tool_id uuid not null references public.lti_tools (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (tool_id, nonce)
);

alter table public.lti_tools enable row level security;
alter table public.lti_nonces enable row level security;
alter table public.lti_links enable row level security;
alter table public.lti_results enable row level security;

drop policy if exists "stub_auth_allow_all" on public.lti_links;
drop policy if exists "stub_auth_allow_all" on public.lti_results;
create policy "stub_auth_allow_all" on public.lti_links for all using (true) with check (true);
create policy "stub_auth_allow_all" on public.lti_results for all using (true) with check (true);

-- One Cogniterra connection per SCS Learn course.
create table if not exists public.cogniterra_course_config (
  course_id uuid primary key references public.courses (id) on delete cascade,
  cogniterra_course_id text not null,
  tool_id uuid not null references public.lti_tools (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cogniterra_course_config enable row level security;
drop policy if exists "stub_auth_allow_all" on public.cogniterra_course_config;
create policy "stub_auth_allow_all" on public.cogniterra_course_config for all using (true) with check (true);
