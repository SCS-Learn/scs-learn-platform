-- SCS Learn - Autolab integration schema (additive migration).
--
-- Run AFTER supabase/schema.sql and supabase/lti.sql. Safe to re-run.
--
-- Keep this file ASCII-only (same clip.exe caveat as schema.sql).
--
-- WHY THIS EXISTS SEPARATELY FROM lti.sql
-- Autolab is an LTI 1.3 tool, but its LTI implementation does roster sync only:
-- there is no Assignment and Grade Services support, so an Autolab score can
-- never arrive over LTI the way a Cogniterra score does. Autolab grades have to
-- be PULLED from its REST API (GET /api/v1/courses/:course/assessments/
-- :assessment/scores/:email). That is a different direction of travel, a
-- different auth model, and a different failure mode, so it gets its own tables.
--
-- SECURITY NOTE: autolab_credentials holds an OAuth refresh token that is worth
-- as much as an instructor's password. Like lti_tools it has RLS enabled and NO
-- policy, so the browser anon key cannot read it. Service role only.

create extension if not exists pgcrypto;

drop table if exists public.autolab_scores cascade;
drop table if exists public.autolab_links cascade;
drop table if exists public.autolab_credentials cascade;

-- Single-row table holding the platform's Autolab OAuth token pair.
--
-- Doorkeeper (Autolab's OAuth server) ROTATES the refresh token on every
-- refresh: the old one dies the moment a new one is issued. So this cannot live
-- in an env var. If a refresh is attempted twice concurrently, one of the two
-- responses is the live token and the other is already dead, which is why
-- refresh writes here go through a single row and not an append log.
create table public.autolab_credentials (
  id boolean primary key default true check (id),
  -- Base URL of the Autolab instance, e.g. https://autolab.andrew.cmu.edu
  base_url text not null,
  client_id text not null,
  client_secret text not null,
  access_token text,
  refresh_token text,
  access_token_expires_at timestamptz,
  -- Space-separated Autolab scopes this token actually carries. Reading another
  -- user's score needs instructor_all; user_scores only reaches your own.
  scopes text not null default 'user_info user_courses user_scores instructor_all',
  updated_at timestamptz not null default now()
);

-- Attaches an Autolab assessment to a lesson. Parallel to lti_links, but keyed
-- by Autolab's own names rather than by an LTI resource_link_id, because the
-- REST API addresses assessments by name.
create table public.autolab_links (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  -- Autolab course name as it appears in its URLs, e.g. "02-180-f26".
  course_name text not null,
  -- Autolab assessment name as it appears in its URLs, e.g. "hw1".
  assessment_name text not null,
  title text not null default 'Autolab assessment',
  points_possible numeric not null default 100,
  -- Autolab's LTI launch cannot carry a learner into an assessment (see
  -- docs/lti.md), so the learner opens it directly. False means new tab, which
  -- is the reliable default: Autolab sets SameSite cookies and enforces its own
  -- SSO, both of which can break inside a cross-origin iframe.
  embed_in_iframe boolean not null default false,
  created_at timestamptz not null default now(),
  unique (lesson_id)
);

-- Pulled scores. Keyed by email because that is the only learner identifier
-- Autolab's scores endpoint accepts.
create table public.autolab_scores (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.autolab_links (id) on delete cascade,
  -- Stub-auth learner id, matching lti_results.platform_user_id.
  platform_user_id text not null,
  autolab_email text not null,
  score numeric,
  points_possible numeric,
  -- Raw JSON from Autolab, kept because its scores payload is per-problem and
  -- a single total throws away the feedback a learner would want to see.
  raw jsonb,
  -- Set when Autolab answered but has no submission for this learner yet, which
  -- is a normal state and not an error.
  no_submission boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (link_id, platform_user_id)
);

create index autolab_scores_link_idx on public.autolab_scores (link_id);

alter table public.autolab_credentials enable row level security;
alter table public.autolab_links enable row level security;
alter table public.autolab_scores enable row level security;

-- No policy on autolab_credentials on purpose. See the security note above.

create policy "stub_auth_allow_all" on public.autolab_links for all using (true) with check (true);
create policy "stub_auth_allow_all" on public.autolab_scores for all using (true) with check (true);
