-- Admin role + multiple instructors per course. Run in the Supabase SQL editor
-- after schema.sql; safe to re-run. Supersedes add-instructor-accounts.sql
-- (its one statement is repeated below), so this is the only file to run.

-- 1. Instructor accounts are matched by email (lib/instructor/data/current-instructor.ts).
alter table public.instructors
  add column if not exists email text unique check (email = lower(email));

-- 2. Admins. A signed-in user whose *confirmed* email is listed here is an
--    admin and can use /admin (manage instructors, course staff, other
--    admins). Keyed by email so the first admin can be added before they ever
--    sign in. Service-role only: no RLS policy at all.
create table if not exists public.admins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- 3. Course staff: any number of instructors per course. courses.instructor_id
--    stays as the course's owner (who created it, and the only one who can
--    delete it); everyone listed here can teach and edit it.
create table if not exists public.course_instructors (
  course_id uuid not null references public.courses (id) on delete cascade,
  instructor_id uuid not null references public.instructors (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id, instructor_id)
);
alter table public.course_instructors enable row level security;
create index if not exists course_instructors_instructor_idx on public.course_instructors (instructor_id);

-- Every existing owner is also staff on their own course.
insert into public.course_instructors (course_id, instructor_id)
select id, instructor_id from public.courses
on conflict do nothing;

-- 4. Bootstrap the first admin. Edit the address if needed, then run.
insert into public.admins (email) values ('raymond4@andrew.cmu.edu')
on conflict do nothing;
