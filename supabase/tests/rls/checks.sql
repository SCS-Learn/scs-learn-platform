-- RLS checks: the access model this app should enforce, one statement per row.
--
-- _t(label, role, jwt_sub, statement, expected) runs the statement as that
-- role with auth.uid() = jwt_sub, counts the rows it returned or touched, then
-- rolls back any write. Outcomes:
--   denied  permission error or row-level-security violation
--   zero    ran, but RLS hid every row
--   rows    ran and returned or changed rows
-- Write statements need "returning 1" so their rows are counted.
--
-- Expectations encode the policy model of
-- supabase/migrations/replace-stub-auth-policies.sql followed by
-- server-side-learner-writes.sql. When a table, policy or role rule changes,
-- change or add a row here in the same PR.

create or replace function public._t(label text, r text, sub text, q text, expect text)
returns text language plpgsql as $$
declare n bigint; outcome text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(sub, ''), true);
  begin
    execute format('set local role %I', r);
    execute 'with x as (' || q || ') select count(*) from x' into n;
    outcome := case when n = 0 then 'zero' else 'rows' end;
    raise exception using errcode = 'P0001', message = '__undo__';
  exception
    when insufficient_privilege then outcome := 'denied';
    when others then
      if sqlerrm <> '__undo__' then outcome := 'error ' || sqlstate || ': ' || sqlerrm; end if;
  end;
  reset role;
  return rpad(case when outcome = expect then 'PASS' else 'FAIL' end, 5)
      || rpad(case r when 'authenticated' then coalesce(left(sub, 2), '?') else r end, 14)
      || label || '  [want ' || expect || ', got ' || outcome || ']';
end $$;

\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set L1 '''11111111-0000-0000-0000-000000000001'''
\set L2 '''22222222-0000-0000-0000-000000000002'''

select r from (values
  (_t('read catalog summaries', 'anon', null,
    $q$select * from public.student_course_summaries()$q$, 'denied')),
  (_t('catalog summary excludes other learners and draft lessons', 'authenticated', :L1,
    $q$select 1 from public.student_course_summaries()
      where "totalLessonCount" = 2 and "completedLessonCount" = 0
        and "resumeLessonId" = '00000000-0000-0000-0000-000000000301'$q$, 'rows')),
  (_t('catalog summary counts own completion and resumes ahead', 'authenticated', :L2,
    $q$select 1 from public.student_course_summaries()
      where "unitCount" = 1 and "totalLessonCount" = 2 and "quizLessonCount" = 1
        and "completedLessonCount" = 1 and "percentComplete" = 50
        and "resumeLessonId" = '00000000-0000-0000-0000-000000000303'$q$, 'rows')),
  (_t('read course activity summary', 'anon', null,
    $q$select 1 where public.course_activity_summary('00000000-0000-0000-0000-000000000101') is not null$q$, 'denied')),
  (_t('read course activity as a learner with progress', 'authenticated', :L2,
    $q$select 1 where public.course_activity_summary('00000000-0000-0000-0000-000000000101') is not null$q$, 'denied')),
  (_t('read activity in a course not taught', 'authenticated', :B,
    $q$select 1 where public.course_activity_summary('00000000-0000-0000-0000-000000000101') is not null$q$, 'denied')),
  (_t('aggregate activity and resolve roster identity as owner', 'authenticated', :A,
    $q$select 1 from public.course_activity_summary('00000000-0000-0000-0000-000000000101') as summary(value)
      where value @> '{"learnerCount":1,"learnerPage":1,"learnerPageCount":1,"averagePercentComplete":50,"averageQuizScore":40,
        "completionsByLessonId":{"00000000-0000-0000-0000-000000000301":1},
        "averageScoreByQuizId":{"00000000-0000-0000-0000-000000000303":40},
        "learners":[{"id":"22222222-0000-0000-0000-000000000002","name":"Learner Two","email":"l2@example.edu",
          "lessonsCompleted":1,"percentComplete":50,"averageQuizScore":40}]}'::jsonb$q$, 'rows')),
  (_t('limit the first roster page to 50 learners', 'authenticated', :B,
    $q$select 1 from public.course_activity_summary('00000000-0000-0000-0000-000000000102') as summary(value)
      where jsonb_array_length(value->'learners') = 50$q$, 'rows')),
  (_t('page activity as co-staff with course-wide totals and legacy names', 'authenticated', :B,
    $q$select 1 from public.course_activity_summary('00000000-0000-0000-0000-000000000102', 9) as summary(value)
      where jsonb_array_length(value->'learners') = 1
        and value @> '{"learnerCount":51,"learnerPage":2,"learnerPageCount":2,"averagePercentComplete":0,"averageQuizScore":null,
          "learners":[{"id":"stub-learner-1","name":"Test learner (pre-login)","email":null}]}'::jsonb$q$, 'rows'))
) t(r);

select r from (values
  -- Signed out: the anon key alone reaches nothing.
  (_t('read lessons',                            'anon', null, $q$select 1 from public.lessons$q$, 'denied')),
  (_t('read answer keys',                        'anon', null, $q$select answer_key from public.questions$q$, 'denied')),
  (_t('hijack instructor (auth_user_id)',        'anon', null, $q$update public.instructors set auth_user_id = null returning 1$q$, 'denied')),
  (_t('rewrite lesson HTML',                     'anon', null, $q$update public.lessons set content_html = '<script>' returning 1$q$, 'denied')),
  (_t('wipe quiz submissions',                   'anon', null, $q$delete from public.quiz_submissions returning 1$q$, 'denied')),
  (_t('call a private helper',                   'anon', null, $q$select private.current_instructor_id()$q$, 'denied')),
  (_t('upload to lesson-media',                  'anon', null, $q$insert into storage.objects (bucket_id, name) values ('lesson-media', 'x.html') returning 1$q$, 'denied')),

  -- Learner L1: reads published content and their own rows, writes nothing else.
  (_t('read instructor names',                   'authenticated', :L1, $q$select id, name, initials from public.instructors$q$, 'rows')),
  (_t('read instructor emails',                  'authenticated', :L1, $q$select email from public.instructors$q$, 'denied')),
  (_t('claim instructor row',                    'authenticated', :L1, $q$update public.instructors set auth_user_id = '11111111-0000-0000-0000-000000000001' where id = '00000000-0000-0000-0000-000000000001' returning 1$q$, 'denied')),
  (_t('insert self as instructor',               'authenticated', :L1, $q$insert into public.instructors (name, initials) values ('x', 'x') returning 1$q$, 'denied')),
  (_t('take over course ownership',              'authenticated', :L1, $q$update public.courses set instructor_id = '00000000-0000-0000-0000-000000000002' returning 1$q$, 'denied')),
  (_t('create a course',                         'authenticated', :L1, $q$insert into public.courses (code, title, department, track, instructor_id) values ('x', 'x', '', '', '00000000-0000-0000-0000-000000000001') returning 1$q$, 'denied')),
  (_t('read published lesson',                   'authenticated', :L1, $q$select 1 from public.lessons where id = '00000000-0000-0000-0000-000000000301'$q$, 'rows')),
  (_t('read unpublished lesson',                 'authenticated', :L1, $q$select 1 from public.lessons where id = '00000000-0000-0000-0000-000000000302'$q$, 'zero')),
  (_t('rewrite lesson HTML',                     'authenticated', :L1, $q$update public.lessons set content_html = '<script>' returning 1$q$, 'zero')),
  (_t('read published quiz questions (keys)',    'authenticated', :L1, $q$select answer_key from public.questions where id = '00000000-0000-0000-0000-000000000501'$q$, 'zero')),
  (_t('read published quiz block',               'authenticated', :L1, $q$select 1 from public.question_groups where id = '00000000-0000-0000-0000-000000000401'$q$, 'rows')),
  (_t('read unpublished answer key',             'authenticated', :L1, $q$select answer_key from public.questions where id = '00000000-0000-0000-0000-000000000502'$q$, 'zero')),
  (_t('write own quiz submission directly',      'authenticated', :L1, $q$insert into public.quiz_submissions (lesson_id, platform_user_id, score_percent) values ('00000000-0000-0000-0000-000000000303', '11111111-0000-0000-0000-000000000001', 100) returning 1$q$, 'denied')),
  (_t('complete own lesson directly',           'authenticated', :L1, $q$insert into public.lesson_completions (lesson_id, platform_user_id) values ('00000000-0000-0000-0000-000000000303', '11111111-0000-0000-0000-000000000001') returning 1$q$, 'denied')),
  (_t('submit quiz as another learner',          'authenticated', :L1, $q$insert into public.quiz_submissions (lesson_id, platform_user_id) values ('00000000-0000-0000-0000-000000000301', '22222222-0000-0000-0000-000000000002') returning 1$q$, 'denied')),
  (_t('read another learner''s submission',      'authenticated', :L1, $q$select 1 from public.quiz_submissions$q$, 'zero')),
  (_t('change another learner''s score',         'authenticated', :L1, $q$update public.quiz_submissions set score_percent = 0 returning 1$q$, 'denied')),
  (_t('read another learner''s responses',       'authenticated', :L1, $q$select 1 from public.quiz_responses$q$, 'zero')),
  (_t('read another learner''s completion',      'authenticated', :L1, $q$select 1 from public.lesson_completions$q$, 'zero')),
  (_t('read another learner''s LTI score',       'authenticated', :L1, $q$select 1 from public.lti_results$q$, 'zero')),
  (_t('read another learner''s Autolab score',   'authenticated', :L1, $q$select autolab_email from public.autolab_scores$q$, 'zero')),
  (_t('write an LTI score',                      'authenticated', :L1, $q$update public.lti_results set score = 100 returning 1$q$, 'denied')),
  (_t('complete lesson as another learner',      'authenticated', :L1, $q$insert into public.lesson_completions (lesson_id, platform_user_id) values ('00000000-0000-0000-0000-000000000303', '22222222-0000-0000-0000-000000000002') returning 1$q$, 'denied')),
  (_t('upload to lesson-media',                  'authenticated', :L1, $q$insert into storage.objects (bucket_id, name) values ('lesson-media', 'x.html') returning 1$q$, 'denied')),
  (_t('read LTI shared secrets',                 'authenticated', :L1, $q$select shared_secret from public.lti_tools$q$, 'zero')),
  (_t('read mailing list',                       'authenticated', :L1, $q$select email from public.email_signups$q$, 'zero')),
  (_t('read Cogniterra course config',           'authenticated', :L1, $q$select 1 from public.cogniterra_course_config$q$, 'zero')),
  (_t('register an LTI 1.3 platform',            'authenticated', :L1, $q$insert into public.lti_platforms (name, issuer, client_id, deployment_id, auth_login_url, auth_token_url, jwks_url) values ('x','x','x','x','x','x','x') returning 1$q$, 'denied')),
  (_t('post an announcement',                    'authenticated', :L1, $q$insert into public.announcements (course_id, instructor_id, message) values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'phish') returning 1$q$, 'denied')),
  (_t('delete calendar events',                  'authenticated', :L1, $q$delete from public.calendar_events returning 1$q$, 'zero')),
  (_t('repoint an LTI link',                     'authenticated', :L1, $q$update public.lti_links set custom_params = '{}' returning 1$q$, 'denied')),

  -- Learner L2: reads their own records; every write goes through the server.
  (_t('read own quiz submission',                'authenticated', :L2, $q$select score_percent from public.quiz_submissions$q$, 'rows')),
  (_t('read own quiz responses',                 'authenticated', :L2, $q$select response_text from public.quiz_responses$q$, 'rows')),
  (_t('read own lesson completion',              'authenticated', :L2, $q$select 1 from public.lesson_completions$q$, 'rows')),
  (_t('raise own quiz score directly',           'authenticated', :L2, $q$update public.quiz_submissions set score_percent = 100 returning 1$q$, 'denied')),
  (_t('upsert own quiz submission directly',     'authenticated', :L2, $q$insert into public.quiz_submissions (lesson_id, platform_user_id, score_percent) values ('00000000-0000-0000-0000-000000000303', '22222222-0000-0000-0000-000000000002', 90) on conflict (lesson_id, platform_user_id) do update set score_percent = excluded.score_percent returning id$q$, 'denied')),
  (_t('rewrite own responses directly',          'authenticated', :L2, $q$update public.quiz_responses set is_correct = true, score_fraction = 1 returning 1$q$, 'denied')),
  (_t('delete own quiz responses directly',      'authenticated', :L2, $q$delete from public.quiz_responses where submission_id = '00000000-0000-0000-0000-000000000601' returning 1$q$, 'denied')),
  (_t('delete own lesson completion directly',   'authenticated', :L2, $q$delete from public.lesson_completions where platform_user_id = '22222222-0000-0000-0000-000000000002' returning 1$q$, 'denied')),
  (_t('raise own LTI score',                     'authenticated', :L2, $q$update public.lti_results set score = 100 returning 1$q$, 'denied')),
  (_t('read own LTI score through its link',     'authenticated', :L2, $q$select r.score from public.lti_links l join public.lti_results r on r.link_id = l.id$q$, 'rows')),
  (_t('read own Autolab score',                  'authenticated', :L2, $q$select 1 from public.autolab_scores$q$, 'rows')),
  (_t('announcement with instructor name',       'authenticated', :L2, $q$select a.message, i.name, i.initials from public.announcements a join public.instructors i on i.id = a.instructor_id$q$, 'rows')),

  -- Instructor A: full control of courses 101 and 102, nothing on 103.
  (_t('edit own unpublished lesson',             'authenticated', :A, $q$update public.lessons set title = 't' where id = '00000000-0000-0000-0000-000000000302' returning 1$q$, 'rows')),
  (_t('add a unit to own course',                'authenticated', :A, $q$insert into public.units (course_id, code, title, position) values ('00000000-0000-0000-0000-000000000101', 'U', 'U', 9) returning 1$q$, 'rows')),
  (_t('read answer keys in own course',          'authenticated', :A, $q$select answer_key from public.questions where id in ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000502')$q$, 'rows')),
  (_t('add quiz block for own lesson''s quiz',   'authenticated', :A, $q$insert into public.lesson_blocks (lesson_id, position, kind, question_group_id) values ('00000000-0000-0000-0000-000000000303', 9, 'question_group', '00000000-0000-0000-0000-000000000401') returning 1$q$, 'rows')),
  (_t('repoint own course to another tool',      'authenticated', :A, $q$update public.cogniterra_course_config set tool_id = '00000000-0000-0000-0000-000000000702' where course_id = '00000000-0000-0000-0000-000000000101' returning 1$q$, 'denied')),
  (_t('link own lesson to another tool',         'authenticated', :A, $q$insert into public.lti_links (lesson_id, tool_id) values ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000702') returning 1$q$, 'denied')),
  (_t('add a question to own quiz',              'authenticated', :A, $q$insert into public.questions (question_group_id, position, prompt_text) values ('00000000-0000-0000-0000-000000000402', 2, 'q') returning 1$q$, 'rows')),
  (_t('move lesson between own courses',         'authenticated', :A, $q$update public.lessons set unit_id = '00000000-0000-0000-0000-000000000207' where id = '00000000-0000-0000-0000-000000000301' returning 1$q$, 'rows')),
  (_t('move lesson into a course not taught',    'authenticated', :A, $q$update public.lessons set unit_id = '00000000-0000-0000-0000-000000000206' where id = '00000000-0000-0000-0000-000000000301' returning 1$q$, 'denied')),
  (_t('delete own lesson (cascades)',            'authenticated', :A, $q$delete from public.lessons where id = '00000000-0000-0000-0000-000000000303' returning 1$q$, 'rows')),
  (_t('rename own course',                       'authenticated', :A, $q$update public.courses set title = 't' where id = '00000000-0000-0000-0000-000000000101' returning 1$q$, 'rows')),
  (_t('set own course import lock',              'authenticated', :A, $q$update public.courses set import_lock_started_at = now() where id = '00000000-0000-0000-0000-000000000101' returning 1$q$, 'rows')),
  (_t('change course owner',                     'authenticated', :A, $q$update public.courses set instructor_id = '00000000-0000-0000-0000-000000000002' where id = '00000000-0000-0000-0000-000000000101' returning 1$q$, 'denied')),
  (_t('create own course',                       'authenticated', :A, $q$insert into public.courses (code, title, department, track, instructor_id) values ('new', 'n', '', '', '00000000-0000-0000-0000-000000000001') returning 1$q$, 'rows')),
  (_t('create course owned by someone else',     'authenticated', :A, $q$insert into public.courses (code, title, department, track, instructor_id) values ('new', 'n', '', '', '00000000-0000-0000-0000-000000000002') returning 1$q$, 'denied')),
  (_t('read learners'' submissions',             'authenticated', :A, $q$select 1 from public.quiz_submissions$q$, 'rows')),
  (_t('read learners'' responses',               'authenticated', :A, $q$select 1 from public.quiz_responses$q$, 'rows')),
  (_t('read learners'' completions',             'authenticated', :A, $q$select 1 from public.lesson_completions$q$, 'rows')),
  (_t('read learners'' LTI scores',              'authenticated', :A, $q$select 1 from public.lti_results$q$, 'rows')),
  (_t('read learners'' Autolab scores',          'authenticated', :A, $q$select 1 from public.autolab_scores$q$, 'rows')),
  (_t('read own Cogniterra config',              'authenticated', :A, $q$select 1 from public.cogniterra_course_config$q$, 'rows')),
  (_t('post announcement in own course',         'authenticated', :A, $q$insert into public.announcements (course_id, instructor_id, message) values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'hi') returning 1$q$, 'rows')),
  (_t('post announcement as another instructor', 'authenticated', :A, $q$insert into public.announcements (course_id, instructor_id, message) values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000002', 'hi') returning 1$q$, 'denied')),
  (_t('add global calendar event',               'authenticated', :A, $q$insert into public.calendar_events (date, title, type, scope, host_instructor_id) values (current_date, 't', 'live-talk', 'global', '00000000-0000-0000-0000-000000000001') returning 1$q$, 'rows')),
  (_t('add event to a course not taught',        'authenticated', :A, $q$insert into public.calendar_events (date, title, type, scope, course_id, host_instructor_id) values (current_date, 't', 'live-talk', 'course', '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001') returning 1$q$, 'denied')),
  (_t('edit lesson in a course not taught',      'authenticated', :A, $q$update public.lessons set title = 'x' where id = '00000000-0000-0000-0000-000000000313' returning 1$q$, 'zero')),
  (_t('delete a course not owned',               'authenticated', :A, $q$delete from public.courses where id = '00000000-0000-0000-0000-000000000103' returning 1$q$, 'zero')),
  (_t('upload to lesson-media',                  'authenticated', :A, $q$insert into storage.objects (bucket_id, name) values ('lesson-media', 'a.png') returning 1$q$, 'rows')),
  (_t('read Google refresh tokens',              'authenticated', :A, $q$select 1 from public.instructor_google_credentials$q$, 'zero')),
  (_t('read admins list',                        'authenticated', :A, $q$select 1 from public.admins$q$, 'zero')),

  -- Instructor B: owns 103, co-staff on 102, outsider on 101.
  (_t('edit lesson as co-staff (102)',           'authenticated', :B, $q$update public.lessons set title = 'x' where id = '00000000-0000-0000-0000-000000000314' returning 1$q$, 'rows')),
  (_t('delete course as co-staff (102)',         'authenticated', :B, $q$delete from public.courses where id = '00000000-0000-0000-0000-000000000102' returning 1$q$, 'zero')),
  (_t('edit lesson in 101 (outsider)',           'authenticated', :B, $q$update public.lessons set content_html = 'x' where id = '00000000-0000-0000-0000-000000000301' returning 1$q$, 'zero')),
  (_t('read 101 answer keys',                    'authenticated', :B, $q$select answer_key from public.questions where id = '00000000-0000-0000-0000-000000000501'$q$, 'zero')),
  (_t('read 101 learners'' submissions',         'authenticated', :B, $q$select 1 from public.quiz_submissions$q$, 'zero')),
  (_t('read 101 Cogniterra config',              'authenticated', :B, $q$select 1 from public.cogniterra_course_config where course_id = '00000000-0000-0000-0000-000000000101'$q$, 'zero')),
  (_t('read own Cogniterra config (103)',        'authenticated', :B, $q$select 1 from public.cogniterra_course_config where course_id = '00000000-0000-0000-0000-000000000103'$q$, 'rows')),
  (_t('link another course''s quiz to own lesson', 'authenticated', :B, $q$insert into public.lesson_blocks (lesson_id, position, kind, question_group_id) values ('00000000-0000-0000-0000-000000000313', 2, 'question_group', '00000000-0000-0000-0000-000000000401') returning 1$q$, 'denied')),
  (_t('repoint own Autolab link',                'authenticated', :B, $q$update public.autolab_links set course_name = 'x' where id = '00000000-0000-0000-0000-000000000902' returning 1$q$, 'denied')),
  (_t('add self as staff on 101',                'authenticated', :B, $q$insert into public.course_instructors (course_id, instructor_id) values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000002') returning 1$q$, 'denied')),
  (_t('delete 101 announcements',                'authenticated', :B, $q$delete from public.announcements where course_id = '00000000-0000-0000-0000-000000000101' returning 1$q$, 'zero')),

  -- Service role (server code after its own checks) is unaffected.
  (_t('link an instructor',                      'service_role', null, $q$update public.instructors set name = name returning 1$q$, 'rows')),
  (_t('read LTI secrets',                        'service_role', null, $q$select 1 from public.lti_tools$q$, 'rows')),
  (_t('write LTI scores',                        'service_role', null, $q$update public.lti_results set score = 1 returning 1$q$, 'rows')),
  (_t('link a lesson to a tool',                 'service_role', null, $q$insert into public.lti_links (lesson_id, tool_id) values ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000702') returning 1$q$, 'rows')),
  (_t('save a graded quiz submission',           'service_role', null, $q$update public.quiz_submissions set score_percent = 80 returning 1$q$, 'rows')),
  (_t('read questions with answer keys',         'service_role', null, $q$select answer_key from public.questions$q$, 'rows'))
) t(r);
