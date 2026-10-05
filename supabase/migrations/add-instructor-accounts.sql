-- Real instructor accounts. Instructors sign in through the same Supabase Auth
-- login as learners; an account is an instructor when it is linked to a row
-- here via auth_user_id (the column has existed in schema.sql since the
-- stub-auth days, unused).
--
-- Granting access = putting the person's email on an instructors row. The first
-- time they sign in with that email, lib/instructor/data/current-instructor.ts
-- links the row to their auth user. Nobody can make themselves an instructor
-- from the app (outside `next dev`, see app/instructor-access).
--
-- Run in the Supabase SQL editor after schema.sql; safe to re-run.
alter table public.instructors
  add column if not exists email text unique check (email = lower(email));

-- Example - give the seeded course owner (Phillip Compeau, who owns every seed
-- course) a real login. Replace the address, then uncomment and run:
-- update public.instructors
--   set email = 'someone@andrew.cmu.edu'
--   where id = '00000000-0000-0000-0000-000000000001';
--
-- Adding a brand-new instructor:
-- insert into public.instructors (name, initials, email)
--   values ('Ada Lovelace', 'AL', 'ada@andrew.cmu.edu');
