-- Replace the stub-auth RLS policies with role-scoped ones.
--
-- Prerequisites: every other migration has run (this needs
-- course_instructors, courses.import_lock_started_at and the autolab tables).
-- Safe to re-run, and safe to run before or after the app deploy that ships
-- with it. Drops EVERY policy in schema public first, so compare the live
-- policies against this file before running.
--
-- On a first run, section 8 keeps learners' direct writes to their own
-- quiz_submissions, quiz_responses and lesson_completions rows (and their
-- reads of published quiz questions) for older app versions.
-- server-side-learner-writes.sql removes them once the app grades and writes
-- those rows on the server; re-running this file after that keeps them closed.
--
-- The expected access model is supabase/tests/rls/checks.sql; test changes
-- with supabase/tests/rls/run.sh before running them here.

begin;

-- 1. Signed-out clients get no table access at all. -------------------------
revoke all on all tables in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;

-- 2. Helpers, in a schema the REST API does not expose. security definer so
--    they read instructors/courses/course_instructors without recursing
--    through RLS; empty search_path so they can't be hijacked.
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.current_instructor_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.instructors where auth_user_id = (select auth.uid())
$$;

create or replace function private.is_course_staff(p_course_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.courses
                 where id = p_course_id and instructor_id = private.current_instructor_id())
      or exists (select 1 from public.course_instructors
                 where course_id = p_course_id and instructor_id = private.current_instructor_id())
$$;

create or replace function private.unit_course_id(p_unit_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select course_id from public.units where id = p_unit_id
$$;

create or replace function private.lesson_course_id(p_lesson_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.course_id from public.lessons l join public.units u on u.id = l.unit_id
  where l.id = p_lesson_id
$$;

create or replace function private.can_edit_lesson(p_lesson_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_course_staff(private.lesson_course_id(p_lesson_id))
$$;

create or replace function private.can_read_lesson(p_lesson_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_published from public.lessons where id = p_lesson_id), false)
      or private.can_edit_lesson(p_lesson_id)
$$;

create or replace function private.group_lesson_id(p_group_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select lesson_id from public.question_groups where id = p_group_id
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- 3. Drop every policy in public: the stubs and anything added by hand. ------
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 4. instructors: signed-in users see names only. Writes: service role only.
revoke all on public.instructors from authenticated;
grant select (id, name, initials) on public.instructors to authenticated;
create policy instructors_read on public.instructors for select to authenticated using (true);

-- 5. courses: browse when signed in; staff edit; owner deletes; only the
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

-- 6. Course structure: read when signed in (lessons: published, or staff);
--    write when staff of the owning course.
create policy units_read on public.units for select to authenticated using (true);
create policy units_write on public.units for all to authenticated
  using (private.is_course_staff(course_id)) with check (private.is_course_staff(course_id));

create policy lessons_read on public.lessons for select to authenticated
  using (is_published or private.is_course_staff(private.unit_course_id(unit_id)));
create policy lessons_write on public.lessons for all to authenticated
  using (private.is_course_staff(private.unit_course_id(unit_id)))
  with check (private.is_course_staff(private.unit_course_id(unit_id)));

do $$
declare t text;
begin
  foreach t in array array['lesson_blocks', 'question_groups', 'attachments', 'lti_links', 'autolab_links'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.can_read_lesson(lesson_id))', t || '_read', t);
  end loop;
  foreach t in array array['question_groups', 'attachments'] loop
    execute format('create policy %I on public.%I for all to authenticated using (private.can_edit_lesson(lesson_id)) with check (private.can_edit_lesson(lesson_id))', t || '_write', t);
  end loop;
end $$;

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

-- 7. Course-level tables.
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

-- 8. Learner records: your own rows, or rows in a course you teach.
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

-- Questions, and learners' own writes. Until server-side-learner-writes.sql
-- has run (it revokes learners' INSERT on quiz_submissions), older app
-- versions need learners to read questions of lessons they can read and to
-- write their own records. After it, re-running this file keeps both closed.
do $$
begin
  if has_table_privilege('authenticated', 'public.quiz_submissions', 'INSERT') then
    create policy questions_read on public.questions for select to authenticated
      using (private.can_read_lesson(private.group_lesson_id(question_group_id)));
    create policy quiz_submissions_own_write on public.quiz_submissions for all to authenticated
      using (platform_user_id = (select auth.uid())::text)
      with check (platform_user_id = (select auth.uid())::text);
    create policy quiz_responses_own_write on public.quiz_responses for all to authenticated
      using (exists (select 1 from public.quiz_submissions s
                     where s.id = submission_id and s.platform_user_id = (select auth.uid())::text))
      with check (exists (select 1 from public.quiz_submissions s
                          where s.id = submission_id and s.platform_user_id = (select auth.uid())::text));
    create policy lesson_completions_own_write on public.lesson_completions for all to authenticated
      using (platform_user_id = (select auth.uid())::text)
      with check (platform_user_id = (select auth.uid())::text);
  else
    create policy questions_read on public.questions for select to authenticated
      using (private.can_edit_lesson(private.group_lesson_id(question_group_id)));
  end if;
end $$;

-- 9. No policy, service role only: admins, course_instructors, email_signups,
--    every credentials table, lti_tools, lti_nonces, and the unused LTI 1.3
--    tables (lti_platforms, lti_launches, lti_assignments, lti_submissions).

-- 10. Storage: public URLs keep working for everyone (public bucket); only
--     instructors can upload, overwrite, delete or list through the API.
drop policy if exists "stub_auth_lesson_media_select" on storage.objects;
drop policy if exists "stub_auth_lesson_media_insert" on storage.objects;
drop policy if exists "stub_auth_lesson_media_update" on storage.objects;
drop policy if exists "stub_auth_lesson_media_delete" on storage.objects;
drop policy if exists lesson_media_instructors on storage.objects;
create policy lesson_media_instructors on storage.objects for all to authenticated
  using (bucket_id = 'lesson-media' and private.current_instructor_id() is not null)
  with check (bucket_id = 'lesson-media' and private.current_instructor_id() is not null);

commit;
