-- SCS Learn instructor portal - initial schema + seed data.
-- Run this once in the Supabase Dashboard SQL Editor (SQL Editor > New query > paste > Run).
--
-- Keep this file ASCII-only: pasting via clip.exe (WSL -> Windows clipboard) silently mangles
-- non-ASCII characters (en/em dashes, middle dots) into mojibake once stored - use plain
-- hyphens instead of typographic dashes in any string literal here.
--
-- Auth status: stubbed. There is exactly one "acting" instructor (Phillip Compeau) and no
-- login screen yet. RLS is enabled on every table so the shape is auth-ready, but every
-- policy here is permissive ("using (true)") since there's no session identity to check
-- against yet. This is intentionally wide-open for this stub-auth phase - do not treat as
-- production-safe. Tighten these policies (auth.uid() checks against instructors.auth_user_id)
-- once real login exists.

create extension if not exists pgcrypto;

-- This project has no real user data yet (dev/demo stage only) - re-running this
-- file is meant to reset everything back to a clean seeded state, so drop first.
drop table if exists public.calendar_events cascade;
drop table if exists public.announcements cascade;
drop table if exists public.attachments cascade;
drop table if exists public.lessons cascade;
drop table if exists public.units cascade;
drop table if exists public.courses cascade;
drop table if exists public.instructors cascade;

-- Tables ---------------------------------------------------------------------

create table public.instructors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  initials text not null,
  auth_user_id uuid unique references auth.users (id), -- unused until real auth lands
  created_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  department text not null,
  track text not null,
  instructor_id uuid not null references public.instructors (id) on delete cascade,
  student_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  code text not null,
  title text not null,
  position integer not null,
  source_drive_folder_id text,
  created_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete cascade,
  code text not null,
  title text not null default 'Untitled lesson',
  type text not null default 'lesson' check (type in ('lesson', 'quiz')),
  position integer not null,
  content_html text not null default '',
  is_published boolean not null default false,
  source_drive_file_id text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Wired up in the file-uploads slice; the table exists now so the FK is in place.
-- storage_path is nullable: attachments imported from Google Drive point at a
-- Drive URL directly and have no backing object in the lesson-media bucket.
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  name text not null,
  storage_path text,
  url text,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  instructor_id uuid not null references public.instructors (id),
  message text not null,
  created_at timestamptz not null default now()
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null,
  type text not null check (type in ('live-talk', 'office-hours', 'new-unit', 'cohort-launch')),
  time text not null default '',
  description text not null default '',
  scope text not null check (scope in ('global', 'course')),
  course_id uuid references public.courses (id) on delete cascade,
  host_instructor_id uuid not null references public.instructors (id),
  created_at timestamptz not null default now(),
  constraint calendar_events_scope_course_ck check (
    (scope = 'global' and course_id is null) or
    (scope = 'course' and course_id is not null)
  )
);

-- Row Level Security (stub-auth: wide open, see header note) ----------------

alter table public.instructors enable row level security;
alter table public.courses enable row level security;
alter table public.units enable row level security;
alter table public.lessons enable row level security;
alter table public.attachments enable row level security;
alter table public.announcements enable row level security;
alter table public.calendar_events enable row level security;

create policy "stub_auth_allow_all" on public.instructors for all using (true) with check (true);
create policy "stub_auth_allow_all" on public.courses for all using (true) with check (true);
create policy "stub_auth_allow_all" on public.units for all using (true) with check (true);
create policy "stub_auth_allow_all" on public.lessons for all using (true) with check (true);
create policy "stub_auth_allow_all" on public.attachments for all using (true) with check (true);
create policy "stub_auth_allow_all" on public.announcements for all using (true) with check (true);
create policy "stub_auth_allow_all" on public.calendar_events for all using (true) with check (true);

-- LTI 1.3 + autograding -------------------------------------------------------
-- One row per LMS registration (Canvas, Moodle, etc.) this tool is installed into.
-- issuer + client_id + deployment_id together identify a platform per the LTI spec -
-- a single LMS can host more than one deployment of this tool.
drop table if exists public.lti_submissions cascade;
drop table if exists public.lti_assignments cascade;
drop table if exists public.lti_launches cascade;
drop table if exists public.lti_platforms cascade;

create table public.lti_platforms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  issuer text not null,
  client_id text not null,
  deployment_id text not null,
  auth_login_url text not null,
  auth_token_url text not null,
  jwks_url text not null,
  created_at timestamptz not null default now(),
  unique (issuer, client_id, deployment_id)
);

-- Short-lived state/nonce bookkeeping for the OIDC login -> launch round trip.
-- Rows are consumed (deleted) as soon as the launch validates; expires_at is a
-- backstop for launches that are abandoned mid-flow.
create table public.lti_launches (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.lti_platforms (id) on delete cascade,
  state text unique not null,
  nonce text not null,
  target_link_uri text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);

-- Links one LTI resource link (an assignment placed in the LMS) to a lesson here
-- and to the autograder that owns it. line_item_url is the AGS endpoint on the
-- platform that score passback POSTs to - populated from the launch's AGS claim
-- the first time a given resource link is seen.
create table public.lti_assignments (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.lti_platforms (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete set null,
  resource_link_id text not null,
  line_item_url text,
  max_score numeric not null default 100,
  source text not null default 'cogniterra' check (source in ('cogniterra', 'autograder', 'manual')),
  external_ref text,
  created_at timestamptz not null default now(),
  unique (platform_id, resource_link_id)
);

-- One row per (assignment, student) grading result. lti_user_id is the opaque
-- "sub" claim from the platform - the only stable student identifier LTI gives us.
-- passback_status tracks whether the score has actually been POSTed back to the
-- LMS yet, since grading (autograder finishes) and passback (AGS call succeeds)
-- are two separate steps that can fail independently.
create table public.lti_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.lti_assignments (id) on delete cascade,
  lti_user_id text not null,
  score numeric not null,
  max_score numeric not null,
  raw_payload jsonb,
  passback_status text not null default 'pending' check (passback_status in ('pending', 'sent', 'failed')),
  passback_error text,
  graded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (assignment_id, lti_user_id)
);

alter table public.lti_platforms enable row level security;
alter table public.lti_launches enable row level security;
alter table public.lti_assignments enable row level security;
alter table public.lti_submissions enable row level security;

-- No student/instructor session identity to check against yet (see stub-auth note
-- above) and these tables are only ever touched server-side via the service role
-- from route handlers, never from the browser - stub policy matches the rest.
create policy "stub_auth_allow_all" on public.lti_platforms for all using (true) with check (true);
create policy "stub_auth_allow_all" on public.lti_launches for all using (true) with check (true);
create policy "stub_auth_allow_all" on public.lti_assignments for all using (true) with check (true);
create policy "stub_auth_allow_all" on public.lti_submissions for all using (true) with check (true);

-- Organize-mode lesson composition -------------------------------------------
-- A lesson built by "organize" import doesn't carry AI-elaborated content_html
-- at all - instead it's composed of whole existing assets (a slide file, a
-- lecture video, or a near-verbatim question set) in display order.
-- content_source on lessons tells readers which representation a given lesson
-- actually uses, since both can exist side by side (old atomized lessons keep
-- 'html', organize-mode lessons use 'blocks').
drop table if exists public.questions cascade;
drop table if exists public.question_groups cascade;
drop table if exists public.lesson_blocks cascade;

-- One quiz/assignment file becomes one question_group; its questions are
-- extracted near-verbatim (see questions.prompt_source below), never authored.
create table public.question_groups (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  source_drive_file_id text not null,
  title text not null default 'Untitled assignment',
  position integer not null,
  created_at timestamptz not null default now()
);

-- One row per whole asset (a slide file, a video, or a question group) that
-- composes a lesson, in display order - this is the "subunit is composed of"
-- structure an atomized lessons.content_html page never needed.
create table public.lesson_blocks (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  position integer not null,
  kind text not null check (kind in ('slide_file', 'video', 'question_group', 'course_notes')),
  title text,
  source_drive_file_id text,
  render_mode text check (render_mode in ('pdf_embed', 'slide_card_images', 'slide_rendered_images')),
  -- Deterministically assembled per-slide text+image cards for the
  -- slide_card_images render_mode (see render-pptx-slide-cards.ts) - code
  -- assembly only, never model-authored. Null for every other kind/render_mode;
  -- a pdf_embed block's PDF lives in attachments instead.
  body_html text,
  -- Ordered, durable PNG URLs for the slide_rendered_images render_mode - a
  -- true per-slide render (via a temporary Google Slides conversion, see
  -- render-pptx-slide-images.ts) rather than the text+image card fallback.
  -- Only populated when the instructor has connected Google OAuth; null
  -- otherwise, same as body_html is null outside slide_card_images.
  rendered_image_urls text[],
  video_url text,
  question_group_id uuid references public.question_groups (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint lesson_blocks_kind_payload_ck check (
    (kind = 'slide_file' and render_mode is not null and video_url is null and question_group_id is null) or
    (kind = 'video' and video_url is not null and render_mode is null and question_group_id is null) or
    (kind = 'question_group' and question_group_id is not null and render_mode is null and video_url is null) or
    (kind = 'course_notes' and body_html is not null and render_mode is null and video_url is null and question_group_id is null)
  )
);

-- Near-verbatim question rows. prompt_text/choices/answer_key are always
-- sliced by application code from deterministically-extracted source text -
-- classify-content-units.ts only ever supplies page/slide routing (indices
-- and role labels), never prose, so nothing here is model-authored except the
-- rare llm_transcribed fallback for a scanned page with no text layer, which
-- is flagged via prompt_source/needs_review rather than silently trusted.
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  question_group_id uuid not null references public.question_groups (id) on delete cascade,
  position integer not null,
  prompt_text text not null,
  prompt_source text not null default 'verbatim_extracted'
    check (prompt_source in ('verbatim_extracted', 'llm_transcribed')),
  choices jsonb,
  answer_key text,
  question_type text not null default 'unknown'
    check (question_type in (
      'multiple_choice', 'true_false', 'multiple_select',
      'inline_dropdown', 'matching', 'categorization', 'ordering', 'hottext',
      'choice_grid',
      'short_answer', 'multi_blank', 'cloze', 'keyword_scored',
      'numeric_tolerance', 'matrix_whole', 'matrix_per_cell', 'vector', 'integer',
      'significant_figures', 'number_with_units',
      'slider',
      'symbolic_expression', 'equation_input', 'form_constrained_algebra',
      'antiderivative', 'interval_set_list', 'chemical_formula',
      'free_response', 'unknown'
    )),
  source_slide_or_page_index integer,
  needs_review boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.lessons
  add column content_source text not null default 'html' check (content_source in ('html', 'blocks'));

-- Set only for quiz lessons - which of the two graded-work labels an
-- instructor sees on the lesson (see quizLessonCategory in analyze-drive-file.ts).
-- Null for content lessons and for a quiz lesson imported before this existed.
alter table public.lessons
  add column category text check (category in ('assignment', 'homework'));

alter table public.lessons
  add column quiz_completion_threshold integer not null default 100
    check (quiz_completion_threshold between 0 and 100);

alter table public.attachments
  add column lesson_block_id uuid references public.lesson_blocks (id) on delete cascade,
  add column position integer;

alter table public.lesson_blocks enable row level security;
alter table public.question_groups enable row level security;
alter table public.questions enable row level security;
create policy "stub_auth_allow_all" on public.lesson_blocks for all using (true) with check (true);
create policy "stub_auth_allow_all" on public.question_groups for all using (true) with check (true);
create policy "stub_auth_allow_all" on public.questions for all using (true) with check (true);

-- In-app quiz submission tracking (see supabase/migrations/add-quiz-progress.sql)
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
create policy "stub_auth_allow_all" on public.quiz_submissions for all using (true) with check (true);
create policy "stub_auth_allow_all" on public.quiz_responses for all using (true) with check (true);

-- Per-learner lesson completion (see supabase/migrations/add-lesson-completions.sql)
create table if not exists public.lesson_completions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  platform_user_id text not null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (lesson_id, platform_user_id)
);

alter table public.lesson_completions enable row level security;
create policy "stub_auth_allow_all" on public.lesson_completions for all using (true) with check (true);

create index if not exists lesson_completions_lesson_user_idx
  on public.lesson_completions (lesson_id, platform_user_id);

-- Google OAuth Drive access ---------------------------------------------------
-- Holds the single stub instructor's Google OAuth refresh token, so the app
-- can read whatever Drive folders/files that instructor's own account can
-- already see (no folder-sharing step at all), and use the same grant to
-- render true per-slide images for a real .pptx (see render-pptx-slide-images.ts).
-- Deliberately NOT the permissive "stub_auth_allow_all" policy used above -
-- this is a real third-party secret, not app-owned metadata, so it gets no
-- client-reachable policy at all. Only the service-role client
-- (lib/supabase/admin.ts) can read or write this table.
drop table if exists public.instructor_google_credentials cascade;

create table public.instructor_google_credentials (
  instructor_id uuid primary key references public.instructors (id) on delete cascade,
  refresh_token text not null,
  scope text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.instructor_google_credentials enable row level security;
-- No policy created on purpose: RLS enabled with zero policies denies every
-- client-key request; only the service-role key (which bypasses RLS) can
-- touch this table.

-- Seed data (mirrors today's lib/instructor/mock-data.ts) -------------------

insert into public.instructors (id, name, initials) values
  ('00000000-0000-0000-0000-000000000001', 'Phillip Compeau', 'PC'),
  ('00000000-0000-0000-0000-000000000002', 'Marcus Chen', 'MC');

insert into public.courses (id, code, title, department, track, instructor_id, student_count) values
  ('00000000-0000-0000-0000-000000000101', '02-251', 'Introduction to Bioinformatics', 'Computational Biology', 'Paid track', '00000000-0000-0000-0000-000000000001', 187),
  ('00000000-0000-0000-0000-000000000102', '02-450', 'Computational Genomics', 'Computational Biology', 'Cohort', '00000000-0000-0000-0000-000000000001', 0);

insert into public.units (id, course_id, code, title, position) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'Unit 1', 'Biological sequences', 1),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101', 'Unit 2', 'Pairwise alignment', 2),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000101', 'Unit 3', 'Sequence search', 3),
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000101', 'Unit 4', 'Multiple alignment and phylogeny', 4),
  ('00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000101', 'Unit 6', 'RNA-seq and expression', 5);

insert into public.lessons (id, unit_id, code, title, type, position, content_html) values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', '1.1', 'What a FASTA file really contains', 'lesson', 1, ''),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000201', '1.2', 'Quality scores and trimming', 'lesson', 2, ''),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000201', '1.3', 'Quiz: sequences and formats', 'quiz', 3, ''),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000202', '2.1', 'Needleman-Wunsch by hand', 'lesson', 1, ''),
  ('00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000202', '2.2', 'Local alignment and gaps', 'lesson', 2, ''),
  ('00000000-0000-0000-0000-000000000306', '00000000-0000-0000-0000-000000000202', '2.3', 'Quiz: alignment', 'quiz', 3, ''),
  ('00000000-0000-0000-0000-000000000307', '00000000-0000-0000-0000-000000000203', '3.1', 'Substitution matrices and BLAST', 'lesson', 1, ''),
  ('00000000-0000-0000-0000-000000000308', '00000000-0000-0000-0000-000000000203', '3.2', 'Reading an E-value', 'lesson', 2, ''),
  ('00000000-0000-0000-0000-000000000309', '00000000-0000-0000-0000-000000000203', '3.3', 'Quiz: sequence search', 'quiz', 3, ''),
  ('00000000-0000-0000-0000-000000000310', '00000000-0000-0000-0000-000000000205', '6.1', 'From reads to counts', 'lesson', 1, ''),
  ('00000000-0000-0000-0000-000000000311', '00000000-0000-0000-0000-000000000205', '6.2', 'Normalisation strategies', 'lesson', 2, ''),
  ('00000000-0000-0000-0000-000000000312', '00000000-0000-0000-0000-000000000205', '6.3', 'Differential expression', 'lesson', 3,
    '
  <h3>Counts are not expression</h3>
  <p>A gene with twice the reads is not twice as expressed. Library depth and transcript length both scale raw counts, and biological replicates vary more than sampling alone predicts. Normalise for the first two, then model the third with a dispersion parameter.</p>
  <pre><code>dds &lt;- DESeqDataSetFromMatrix(counts, meta, ~ batch + genotype)
dds &lt;- DESeq(dds)
res &lt;- results(dds, alpha = 0.05)</code></pre>
  <p>Ask them to predict the number of DE genes before running it. The prediction is what makes the result stick.</p>
  <ul>
    <li>TPM makes samples comparable; raw counts never are.</li>
    <li>Poisson describes sampling; replicates need dispersion.</li>
  </ul>
'
  );

insert into public.announcements (course_id, instructor_id, message, created_at) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'The counts matrix for exercise 6.5 is posted. Column names are sample IDs, not conditions.', now() - interval '12 minutes'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000002', 'Quizzes now take unlimited attempts. Keep going until every answer is right.', now() - interval '1 day');

insert into public.calendar_events (date, title, type, time, description, scope, course_id, host_instructor_id) values
  ('2026-07-28', 'Why your DE gene list is mostly noise', 'live-talk', '5:00-6:00pm ET', 'Zoom', 'course', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001'),
  ('2026-07-30', 'Exercise 6.5 help, two TAs', 'office-hours', '3:00-5:00pm ET', 'Discord voice', 'course', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001'),
  ('2026-07-31', 'Unit 7 - Protein structure opens', 'new-unit', '', 'No deadlines. Open it when you are ready.', 'course', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001'),
  ('2026-08-12', 'Platform maintenance window', 'office-hours', '11:00pm-1:00am ET', 'Brief downtime, no action needed', 'global', null, '00000000-0000-0000-0000-000000000001'),
  ('2026-08-17', '02-450 Computational Genomics opens', 'cohort-launch', '', 'Enrollment opens Aug 3 - 12 weeks', 'course', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001'),
  ('2026-09-03', 'Kickoff live talk for 02-450', 'live-talk', '5:00-6:00pm ET', 'Zoom', 'course', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001');
