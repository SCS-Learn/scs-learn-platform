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
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Wired up in the file-uploads slice; the table exists now so the FK is in place.
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  name text not null,
  storage_path text not null,
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
