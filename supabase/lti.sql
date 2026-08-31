-- SCS Learn - LTI integration schema (additive migration).
--
-- Run this AFTER supabase/schema.sql in the Supabase Dashboard SQL Editor.
-- Unlike schema.sql this file is additive and safe to re-run: it drops and
-- recreates only the LTI tables, never the course content tables.
--
-- Keep this file ASCII-only (same clip.exe caveat as schema.sql).
--
-- SECURITY NOTE, read before touching the policies below.
-- lti_tools stores LTI 1.1 shared secrets. Every other table in this project
-- carries a permissive "using (true)" stub-auth policy, which means the
-- browser-side anon key can read it. That is acceptable for course content and
-- fatal for shared secrets: anyone who reads a secret can forge a launch and
-- impersonate any learner to Cogniterra. So lti_tools and lti_nonces have RLS
-- enabled and NO policy at all, which denies the anon key entirely. They are
-- reachable only through the service-role client in lib/supabase/service.ts,
-- which never leaves the server. Do not add a permissive policy here.

create extension if not exists pgcrypto;

drop table if exists public.lti_nonces cascade;
drop table if exists public.lti_results cascade;
drop table if exists public.lti_links cascade;
drop table if exists public.lti_tools cascade;

-- A registered external tool. One row per (tool, credential) pair, so
-- Cogniterra course 64 and Cogniterra course 873 can share a launch_url but
-- hold different secrets, which is how Stepik scopes LTI credentials.
create table public.lti_tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Drives the small amount of per-vendor behavior in lib/lti/launch.ts.
  vendor text not null check (vendor in ('cogniterra', 'autolab', 'generic')),
  -- Cogniterra speaks LTI 1.1 only. Autolab speaks LTI 1.3 only, and its 1.3
  -- support is roster sync rather than a graded learner launch (see docs/lti.md),
  -- so nothing in this codebase issues a 1.3 launch yet. The column exists so
  -- registering a 1.3 tool does not require a migration.
  lti_version text not null default '1.1' check (lti_version in ('1.1', '1.3')),
  launch_url text not null,
  consumer_key text not null,
  shared_secret text not null,
  -- Stepik only sends name and email through when the course privacy is public.
  send_learner_identity boolean not null default true,
  created_at timestamptz not null default now(),
  unique (launch_url, consumer_key)
);

-- Attaches a tool to a lesson. A lesson of type 'external' renders this instead
-- of content_html.
create table public.lti_links (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  tool_id uuid not null references public.lti_tools (id) on delete restrict,
  title text not null default 'External activity',
  -- LTI custom parameters, sent as custom_<key>. Cogniterra needs exactly one
  -- of {"course": "64"} or {"lesson": "30299"}.
  custom_params jsonb not null default '{}'::jsonb,
  -- LTI 1.1 outcomes are always a 0.0-1.0 float on the wire. This is what that
  -- float is multiplied by when it lands in lti_results.score.
  points_possible numeric not null default 100,
  created_at timestamptz not null default now(),
  unique (lesson_id)
);

-- One row per (link, learner). Created at launch time so the tool has a
-- lis_result_sourcedid to grade against, then updated by the outcomes endpoint.
create table public.lti_results (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.lti_links (id) on delete cascade,
  -- Auth is stubbed platform-wide, so this holds the stub learner id today and
  -- becomes auth.uid()::text once login lands. Text, not uuid, because LTI
  -- user_id is spec'd as an opaque string.
  platform_user_id text not null,
  -- What we hand the tool as lis_result_sourcedid. Random and unguessable: the
  -- outcomes endpoint authenticates the CALLER by OAuth signature, but this is
  -- what stops a correctly-signed tool from writing a grade for a learner whose
  -- launch it was never given.
  sourcedid uuid not null default gen_random_uuid() unique,
  -- Null until the tool reports something. score is already scaled by
  -- points_possible; score_raw is the 0.0-1.0 value as received.
  score numeric,
  score_raw numeric,
  reported_at timestamptz,
  first_launched_at timestamptz not null default now(),
  last_launched_at timestamptz not null default now(),
  launch_count integer not null default 0,
  unique (link_id, platform_user_id)
);

-- Replay protection for INBOUND outcomes calls. An OAuth 1.0a signature stays
-- valid forever if the nonce is not remembered, so a captured replaceResult
-- could be replayed to overwrite a later, lower grade. Rows older than the
-- timestamp window are dead weight: prune with
--   delete from public.lti_nonces where seen_at < now() - interval '1 day';
create table public.lti_nonces (
  nonce text not null,
  tool_id uuid not null references public.lti_tools (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (tool_id, nonce)
);

create index lti_results_link_idx on public.lti_results (link_id);
create index lti_nonces_seen_at_idx on public.lti_nonces (seen_at);

-- 'external' is the lesson type that renders an LTI embed. The base schema
-- constrains type to lesson/quiz, so the constraint has to be replaced.
alter table public.lessons drop constraint if exists lessons_type_check;
alter table public.lessons
  add constraint lessons_type_check check (type in ('lesson', 'quiz', 'external'));

-- Row Level Security ---------------------------------------------------------

alter table public.lti_tools enable row level security;
alter table public.lti_nonces enable row level security;
alter table public.lti_links enable row level security;
alter table public.lti_results enable row level security;

-- No policy on lti_tools or lti_nonces on purpose. See the security note above.

-- Links and results carry no secrets. lti_results.sourcedid is unguessable but
-- it is still a bearer value, so this permissive policy should be the first one
-- tightened when real auth lands: a learner should only read their own row.
create policy "stub_auth_allow_all" on public.lti_links for all using (true) with check (true);
create policy "stub_auth_allow_all" on public.lti_results for all using (true) with check (true);
