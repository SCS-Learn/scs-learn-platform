-- Application schema at bbc5031, for a fresh Supabase database.
-- Supabase provisions auth, storage and API roles before migrations run.
-- See supabase/README.md for legacy adoption and optional local demo data.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Preserve the app's API grants regardless of platform table grant defaults.
alter default privileges in schema public revoke all on tables from anon;

-- Course catalog and instructor accounts

create table public.instructors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  initials text not null,
  auth_user_id uuid unique references auth.users (id),
  created_at timestamptz not null default now(),
  email text unique check (email = lower(email))
);

create table public.admins (
  email text primary key check (email = lower(email)),
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
  created_at timestamptz not null default now(),
  import_lock_started_at timestamptz
);

create table public.course_instructors (
  course_id uuid not null references public.courses (id) on delete cascade,
  instructor_id uuid not null references public.instructors (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id, instructor_id)
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
  type text not null default 'lesson' check (type in ('lesson', 'quiz', 'external')),
  position integer not null,
  content_html text not null default '',
  is_published boolean not null default false,
  source_drive_file_id text,
  -- Off by default - a student never sees a free_response (AI-graded)
  -- reference answer after submitting unless the instructor turns this on
  -- for that specific quiz lesson.
  show_reference_answers boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  content_source text not null default 'html' check (content_source in ('html', 'blocks')),
  category text check (category in ('assignment', 'homework')),
  quiz_completion_threshold integer not null default 80 check (quiz_completion_threshold between 0 and 100)
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

-- Lesson composition, quizzes and completion

create table public.question_groups (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  source_drive_file_id text not null,
  title text not null default 'Untitled assignment',
  position integer not null,
  created_at timestamptz not null default now()
);

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

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  name text not null,
  storage_path text,
  url text,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  lesson_block_id uuid references public.lesson_blocks (id) on delete cascade,
  position integer
);

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
      'antiderivative', 'interval_set_list',
      'free_response', 'unknown'
    )),
  source_slide_or_page_index integer,
  needs_review boolean not null default false,
  -- Student-facing paraphrases; [] = no rotation, length 10 when generated.
  variants jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  points integer not null default 0 check (points >= 0)
);

create table public.quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  platform_user_id text not null,
  -- Accumulates fractional per-question scores (0..1 each) — free_response
  -- questions can earn partial credit from the LLM grader.
  correct_count numeric not null default 0,
  gradable_count integer not null default 0,
  score_percent integer not null default 0,
  variant_index integer not null default 0,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (lesson_id, platform_user_id)
);

create table public.quiz_responses (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.quiz_submissions (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  response_text text not null default '',
  is_correct boolean,
  -- Set for every gradable response (0..1); free_response questions get a
  -- partial-credit fraction and short feedback from the LLM grader instead
  -- of a plain boolean.
  score_fraction numeric,
  feedback text,
  -- Student's thumbs-up/down on the LLM grader's feedback for this response
  -- (free_response only) - lets instructors spot-check grading quality.
  grading_feedback_rating text check (grading_feedback_rating in ('up', 'down')),
  created_at timestamptz not null default now(),
  unique (submission_id, question_id)
);

create table public.lesson_completions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  platform_user_id text not null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (lesson_id, platform_user_id)
);

-- External tools and server-side credentials

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

create table public.lti_launches (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.lti_platforms (id) on delete cascade,
  state text unique not null,
  nonce text not null,
  target_link_uri text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);

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

create table public.lti_results (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.lti_links (id) on delete cascade,
  -- Auth user IDs are stored as text alongside legacy learner identifiers.
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

create table public.lti_nonces (
  nonce text not null,
  tool_id uuid not null references public.lti_tools (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (tool_id, nonce)
);

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

create table public.autolab_scores (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.autolab_links (id) on delete cascade,
  -- Auth user ID or legacy learner identifier.
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

create table public.cogniterra_course_config (
  course_id uuid primary key references public.courses (id) on delete cascade,
  cogniterra_course_id text not null,
  tool_id uuid not null references public.lti_tools (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.instructor_google_credentials (
  instructor_id uuid primary key references public.instructors (id) on delete cascade,
  refresh_token text not null,
  scope text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.instructor_cogniterra_credentials (
  instructor_id uuid primary key references public.instructors (id) on delete cascade,
  refresh_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  -- Which form it came from, e.g. "hero".
  source text not null default 'landing',
  created_at timestamptz not null default now()
);

-- Indexes

create index course_instructors_instructor_idx on public.course_instructors (instructor_id);
create index lesson_completions_lesson_user_idx on public.lesson_completions (lesson_id, platform_user_id);
create index quiz_submissions_lesson_user_idx on public.quiz_submissions (lesson_id, platform_user_id);
create index quiz_responses_submission_idx on public.quiz_responses (submission_id);
create index lti_results_link_idx on public.lti_results (link_id);
create index lti_nonces_seen_at_idx on public.lti_nonces (seen_at);
create index autolab_scores_link_idx on public.autolab_scores (link_id);
create index units_course_position_idx on public.units (course_id, position);
create index lessons_unit_position_idx on public.lessons (unit_id, position);
create index lesson_blocks_lesson_position_idx on public.lesson_blocks (lesson_id, position);
create index questions_group_position_idx on public.questions (question_group_id, position);
create index attachments_lesson_idx on public.attachments (lesson_id);
create index announcements_course_created_idx on public.announcements (course_id, created_at desc);

-- Row-level security and API grants

alter table public.admins enable row level security;
alter table public.announcements enable row level security;
alter table public.attachments enable row level security;
alter table public.autolab_credentials enable row level security;
alter table public.autolab_links enable row level security;
alter table public.autolab_scores enable row level security;
alter table public.calendar_events enable row level security;
alter table public.cogniterra_course_config enable row level security;
alter table public.course_instructors enable row level security;
alter table public.courses enable row level security;
alter table public.email_signups enable row level security;
alter table public.instructor_cogniterra_credentials enable row level security;
alter table public.instructor_google_credentials enable row level security;
alter table public.instructors enable row level security;
alter table public.lesson_blocks enable row level security;
alter table public.lesson_completions enable row level security;
alter table public.lessons enable row level security;
alter table public.lti_assignments enable row level security;
alter table public.lti_launches enable row level security;
alter table public.lti_links enable row level security;
alter table public.lti_nonces enable row level security;
alter table public.lti_platforms enable row level security;
alter table public.lti_results enable row level security;
alter table public.lti_submissions enable row level security;
alter table public.lti_tools enable row level security;
alter table public.question_groups enable row level security;
alter table public.questions enable row level security;
alter table public.quiz_responses enable row level security;
alter table public.quiz_submissions enable row level security;
alter table public.units enable row level security;

revoke all on table
  public.admins,
  public.announcements,
  public.attachments,
  public.autolab_credentials,
  public.autolab_links,
  public.autolab_scores,
  public.calendar_events,
  public.cogniterra_course_config,
  public.course_instructors,
  public.courses,
  public.email_signups,
  public.instructor_cogniterra_credentials,
  public.instructor_google_credentials,
  public.instructors,
  public.lesson_blocks,
  public.lesson_completions,
  public.lessons,
  public.lti_assignments,
  public.lti_launches,
  public.lti_links,
  public.lti_nonces,
  public.lti_platforms,
  public.lti_results,
  public.lti_submissions,
  public.lti_tools,
  public.question_groups,
  public.questions,
  public.quiz_responses,
  public.quiz_submissions,
  public.units
from anon;

grant all on table
  public.admins,
  public.announcements,
  public.attachments,
  public.autolab_credentials,
  public.autolab_links,
  public.autolab_scores,
  public.calendar_events,
  public.cogniterra_course_config,
  public.course_instructors,
  public.courses,
  public.email_signups,
  public.instructor_cogniterra_credentials,
  public.instructor_google_credentials,
  public.instructors,
  public.lesson_blocks,
  public.lesson_completions,
  public.lessons,
  public.lti_assignments,
  public.lti_launches,
  public.lti_links,
  public.lti_nonces,
  public.lti_platforms,
  public.lti_results,
  public.lti_submissions,
  public.lti_tools,
  public.question_groups,
  public.questions,
  public.quiz_responses,
  public.quiz_submissions,
  public.units
to authenticated, service_role;

-- Helpers live in a schema outside the public API. SECURITY DEFINER avoids
-- RLS recursion when looking up course staff. The search path is empty.
create schema if not exists private;
grant usage on schema private to authenticated;

create function private.current_instructor_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.instructors where auth_user_id = (select auth.uid())
$$;

create function private.is_course_staff(p_course_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.courses
                 where id = p_course_id and instructor_id = private.current_instructor_id())
      or exists (select 1 from public.course_instructors
                 where course_id = p_course_id and instructor_id = private.current_instructor_id())
$$;

create function private.unit_course_id(p_unit_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select course_id from public.units where id = p_unit_id
$$;

create function private.lesson_course_id(p_lesson_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.course_id from public.lessons l join public.units u on u.id = l.unit_id
  where l.id = p_lesson_id
$$;

create function private.can_edit_lesson(p_lesson_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_course_staff(private.lesson_course_id(p_lesson_id))
$$;

create function private.can_read_lesson(p_lesson_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_published from public.lessons where id = p_lesson_id), false)
      or private.can_edit_lesson(p_lesson_id)
$$;

create function private.group_lesson_id(p_group_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select lesson_id from public.question_groups where id = p_group_id
$$;

revoke all on function
  private.current_instructor_id(),
  private.is_course_staff(uuid),
  private.unit_course_id(uuid),
  private.lesson_course_id(uuid),
  private.can_edit_lesson(uuid),
  private.can_read_lesson(uuid),
  private.group_lesson_id(uuid)
from public;
grant execute on function
  private.current_instructor_id(),
  private.is_course_staff(uuid),
  private.unit_course_id(uuid),
  private.lesson_course_id(uuid),
  private.can_edit_lesson(uuid),
  private.can_read_lesson(uuid),
  private.group_lesson_id(uuid)
to authenticated;

-- Instructors: signed-in users see names only. Writes: service role only.
revoke all on public.instructors from authenticated;
grant select (id, name, initials) on public.instructors to authenticated;

create policy instructors_read on public.instructors for select to authenticated using (true);

-- courses: browse when signed in; staff edit; owner deletes; only the
--    service role can change instructor_id (ownership).
revoke update on public.courses from authenticated;
grant update (code, title, department, track, student_count, import_lock_started_at)
  on public.courses to authenticated;
create policy courses_read on public.courses for select to authenticated using (true);
create policy courses_insert on public.courses for insert to authenticated
  with check (instructor_id = private.current_instructor_id());
create policy courses_update on public.courses for update to authenticated
  using (private.is_course_staff(id)) with check (private.is_course_staff(id));
create policy courses_delete on public.courses for delete to authenticated
  using (instructor_id = private.current_instructor_id());

-- Course structure: read when signed in (lessons: published, or staff);
--    write when staff of the owning course.
create policy units_read on public.units for select to authenticated using (true);
create policy units_write on public.units for all to authenticated
  using (private.is_course_staff(course_id)) with check (private.is_course_staff(course_id));

create policy lessons_read on public.lessons for select to authenticated
  using (is_published or private.is_course_staff(private.unit_course_id(unit_id)));
create policy lessons_write on public.lessons for all to authenticated
  using (private.is_course_staff(private.unit_course_id(unit_id)))
  with check (private.is_course_staff(private.unit_course_id(unit_id)));

create policy lesson_blocks_read on public.lesson_blocks for select to authenticated
  using (private.can_read_lesson(lesson_id));

create policy question_groups_read on public.question_groups for select to authenticated
  using (private.can_read_lesson(lesson_id));

create policy attachments_read on public.attachments for select to authenticated
  using (private.can_read_lesson(lesson_id));

create policy lti_links_read on public.lti_links for select to authenticated
  using (private.can_read_lesson(lesson_id));

create policy autolab_links_read on public.autolab_links for select to authenticated
  using (private.can_read_lesson(lesson_id));

create policy question_groups_write on public.question_groups for all to authenticated
  using (private.can_edit_lesson(lesson_id)) with check (private.can_edit_lesson(lesson_id));

create policy attachments_write on public.attachments for all to authenticated
  using (private.can_edit_lesson(lesson_id)) with check (private.can_edit_lesson(lesson_id));

-- A question-group block may only show its own lesson's quiz.
create policy lesson_blocks_write on public.lesson_blocks for all to authenticated
  using (private.can_edit_lesson(lesson_id))
  with check (private.can_edit_lesson(lesson_id)
              and (question_group_id is null or private.group_lesson_id(question_group_id) = lesson_id));

-- LTI and Autolab links and the Cogniterra course config point learners (and
-- their names, emails and scores) at external tools. Only the server writes
-- them, with the service role, after its own checks.
revoke all on public.lti_links, public.autolab_links, public.cogniterra_course_config from authenticated;
grant select on public.lti_links, public.autolab_links, public.cogniterra_course_config to authenticated;

create policy questions_write on public.questions for all to authenticated
  using (private.can_edit_lesson(private.group_lesson_id(question_group_id)))
  with check (private.can_edit_lesson(private.group_lesson_id(question_group_id)));

-- Course-level tables.
create policy announcements_read on public.announcements for select to authenticated using (true);
create policy announcements_write on public.announcements for all to authenticated
  using (private.is_course_staff(course_id))
  with check (private.is_course_staff(course_id) and instructor_id = private.current_instructor_id());

create policy calendar_events_read on public.calendar_events for select to authenticated using (true);
create policy calendar_events_write on public.calendar_events for all to authenticated
  using (host_instructor_id = private.current_instructor_id() or private.is_course_staff(course_id))
  with check (host_instructor_id = private.current_instructor_id()
              and (scope = 'global' or private.is_course_staff(course_id)));

create policy cogniterra_course_config_read on public.cogniterra_course_config for select to authenticated
  using (private.is_course_staff(course_id));

-- Learner records: your own rows, or rows in a course you teach.
create policy quiz_submissions_read on public.quiz_submissions for select to authenticated
  using (platform_user_id = (select auth.uid())::text or private.can_edit_lesson(lesson_id));
create policy quiz_responses_read on public.quiz_responses for select to authenticated
  using (exists (select 1 from public.quiz_submissions s where s.id = submission_id));
create policy lesson_completions_read on public.lesson_completions for select to authenticated
  using (platform_user_id = (select auth.uid())::text or private.can_edit_lesson(lesson_id));
create policy lti_results_read on public.lti_results for select to authenticated
  using (platform_user_id = (select auth.uid())::text
         or exists (select 1 from public.lti_links l where l.id = link_id and private.can_edit_lesson(l.lesson_id)));
create policy autolab_scores_read on public.autolab_scores for select to authenticated
  using (platform_user_id = (select auth.uid())::text
         or exists (select 1 from public.autolab_links l where l.id = link_id and private.can_edit_lesson(l.lesson_id)));

-- The server writes learner records and serves quizzes with answer keys removed.
revoke all on public.quiz_submissions, public.quiz_responses, public.lesson_completions,
  public.lti_results, public.autolab_scores from authenticated;
grant select on public.quiz_submissions, public.quiz_responses, public.lesson_completions,
  public.lti_results, public.autolab_scores to authenticated;

create policy questions_read on public.questions for select to authenticated
  using (private.can_edit_lesson(private.group_lesson_id(question_group_id)));

-- Service-only tables (admins, course staff, email signups, credentials,
-- LTI secrets and the unused LTI 1.3 scaffold) have RLS with no API policies.

-- Supabase serves public lesson-media URLs. Storage API object operations
-- are restricted to signed-in instructors.
insert into storage.buckets (id, name, public)
values ('lesson-media', 'lesson-media', true)
on conflict (id) do nothing;

create policy lesson_media_instructors on storage.objects for all to authenticated
  using (bucket_id = 'lesson-media' and private.current_instructor_id() is not null)
  with check (bucket_id = 'lesson-media' and private.current_instructor_id() is not null);

-- Course catalog and instructor activity RPCs

create function public.student_course_summaries()
returns table (
  code text, title text, department text, track text,
  "unitCount" int, "contentLessonCount" int, "quizLessonCount" int,
  "completedLessonCount" int, "totalLessonCount" int, "percentComplete" int,
  "resumeLessonId" uuid, "resumeLessonCode" text, "resumeLessonTitle" text
)
language sql stable security invoker set search_path = ''
as $$
  with published_lessons as materialized (
    select u.course_id, u.id as unit_id, u.position as unit_position, l.position as lesson_position,
      l.id, l.code, l.title, l.type, lc.lesson_id is not null as complete
    from public.units u
    join public.lessons l on l.unit_id = u.id and l.is_published
    left join public.lesson_completions lc on lc.lesson_id = l.id
      and lc.platform_user_id = (select auth.uid())::text
  ),
  totals as (
    select course_id, count(distinct unit_id) as units, count(*) as lessons,
      count(*) filter (where type = 'quiz') as quizzes,
      count(*) filter (where complete) as completed
    from published_lessons group by course_id
  ),
  resume as (
    select distinct on (course_id) course_id, id, code, title
    from published_lessons
    order by course_id, complete, unit_position, lesson_position, id
  )
  select c.code, c.title, c.department, c.track,
    coalesce(t.units, 0)::int, coalesce(t.lessons - t.quizzes, 0)::int, coalesce(t.quizzes, 0)::int,
    coalesce(t.completed, 0)::int, coalesce(t.lessons, 0)::int,
    coalesce(round(100.0 * t.completed / nullif(t.lessons, 0)), 0)::int,
    r.id, r.code, r.title
  from public.courses c
  left join totals t on t.course_id = c.id
  left join resume r on r.course_id = c.id
  order by c.code;
$$;

revoke all on function public.student_course_summaries() from public, anon, authenticated, service_role;
grant execute on function public.student_course_summaries() to authenticated;

create function public.course_activity_summary(p_course_id uuid, p_page integer default 1)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  -- Authorize the caller before reading progress or private Auth profiles.
  if not private.is_course_staff(p_course_id) then
    raise insufficient_privilege using message = 'Course staff access required';
  end if;

  with course_lessons as materialized (
    select l.id, l.is_published
    from public.lessons l
    join public.units u on u.id = l.unit_id
    where u.course_id = p_course_id
  ),
  activity as materialized (
    select c.platform_user_id as learner_id, c.lesson_id, c.completed_at as active_at,
      true as completed, null::int as quiz_score
    from public.lesson_completions c join course_lessons l on l.id = c.lesson_id
    union all
    select q.platform_user_id, q.lesson_id, q.submitted_at, false, q.score_percent
    from public.quiz_submissions q join course_lessons l on l.id = q.lesson_id
    union all
    select r.platform_user_id, link.lesson_id, r.last_launched_at, false, null::int
    from public.lti_results r
    join public.lti_links link on link.id = r.link_id
    join course_lessons l on l.id = link.lesson_id
  ),
  published as (
    select count(*) filter (where is_published) as lesson_count from course_lessons
  ),
  learner_stats as materialized (
    select a.learner_id,
      count(*) filter (where a.completed) as lessons_completed,
      least(100, coalesce(round(
        100.0 * count(*) filter (where a.completed) / nullif(p.lesson_count, 0)
      ), 0)) as percent_complete,
      round(avg(a.quiz_score)) as average_quiz_score,
      max(a.active_at) as last_active_at
    from activity a cross join published p
    group by a.learner_id, p.lesson_count
  ),
  lesson_stats as (
    select lesson_id, count(*) filter (where completed) as completion_count,
      round(avg(quiz_score)) as average_quiz_score
    from activity
    group by lesson_id
  ),
  totals as (
    select count(*) as learner_count, round(avg(percent_complete)) as avg_completion,
      greatest(1, (count(*) + 49) / 50) as page_count
    from learner_stats
  ),
  paging as (
    select *, least(greatest(1, coalesce(p_page, 1)), page_count) as page_number
    from totals
  ),
  learner_page as (
    select * from learner_stats
    order by last_active_at desc, learner_id
    limit 50 offset (select (page_number - 1) * 50 from paging)
  )
  select jsonb_build_object(
    'learnerCount', paging.learner_count,
    'learnerPage', paging.page_number,
    'learnerPageCount', paging.page_count,
    'averagePercentComplete', paging.avg_completion,
    'averageQuizScore', (select round(avg(quiz_score)) from activity),
    'completionsByLessonId', coalesce((
      select jsonb_object_agg(lesson_id, completion_count) from lesson_stats where completion_count > 0
    ), '{}'::jsonb),
    'averageScoreByQuizId', coalesce((
      select jsonb_object_agg(lesson_id, average_quiz_score) from lesson_stats where average_quiz_score is not null
    ), '{}'::jsonb),
    'learners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.learner_id,
        'name', case when p.learner_id like 'stub-learner%' then 'Test learner (pre-login)' else
          coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
            nullif(split_part(u.email, '@', 1), ''), 'Learner ' || left(p.learner_id, 8)) end,
        'email', u.email,
        'lessonsCompleted', p.lessons_completed,
        'percentComplete', p.percent_complete,
        'averageQuizScore', p.average_quiz_score,
        'lastActiveAt', p.last_active_at
      ) order by p.last_active_at desc, p.learner_id)
      from learner_page p
      left join auth.users u on u.id = case
        when p.learner_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then p.learner_id::uuid end
    ), '[]'::jsonb)
  ) into result
  from paging;

  return result;
end;
$$;

revoke all on function public.course_activity_summary(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.course_activity_summary(uuid, integer) to authenticated;
