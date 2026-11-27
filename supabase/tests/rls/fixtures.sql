-- Fixture data for checks.sql, loaded as postgres (bypasses RLS).
--
--   A  = auth user aaaaaaaa-...  -> instructor ...0001, owns courses 101 and 102
--   B  = auth user bbbbbbbb-...  -> instructor ...0002, owns 103, co-staff on 102
--   L1 = auth user 11111111-...  -> plain learner, no rows of their own
--   L2 = auth user 22222222-...  -> plain learner with a submission, completion,
--                                   LTI result and Autolab score

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.edu'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.edu'),
  ('11111111-0000-0000-0000-000000000001', 'l1@example.edu'),
  ('22222222-0000-0000-0000-000000000002', 'l2@example.edu');
update auth.users set raw_user_meta_data = '{"full_name": " Learner Two "}'
  where id = '22222222-0000-0000-0000-000000000002';
insert into public.instructors (id, name, initials, auth_user_id, email) values
  ('00000000-0000-0000-0000-000000000001', 'Instructor A', 'IA', 'aaaaaaaa-0000-0000-0000-000000000001', 'a@example.edu'),
  ('00000000-0000-0000-0000-000000000002', 'Instructor B', 'IB', 'bbbbbbbb-0000-0000-0000-000000000002', 'b@example.edu');

insert into public.courses (id, code, title, department, track, instructor_id) values
  ('00000000-0000-0000-0000-000000000101', '99-101', 'A course', '', '', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000102', '99-102', 'A second course', '', '', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000103', '99-999', 'B course', '', '', '00000000-0000-0000-0000-000000000002');
insert into public.course_instructors (course_id, instructor_id) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000002')
on conflict do nothing;
insert into public.units (id, course_id, code, title, position) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'Unit 1', 'A unit', 1),
  ('00000000-0000-0000-0000-000000000206', '00000000-0000-0000-0000-000000000103', 'Unit 1', 'B unit', 1),
  ('00000000-0000-0000-0000-000000000207', '00000000-0000-0000-0000-000000000102', 'Unit 1', '102 unit', 1);
insert into public.lessons (id, unit_id, code, title, type, position, is_published) values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', '1.1', 'Published lesson', 'lesson', 1, true),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000201', '1.2', 'Draft lesson', 'lesson', 2, false),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000201', '1.3', 'Published quiz', 'quiz', 3, true),
  ('00000000-0000-0000-0000-000000000313', '00000000-0000-0000-0000-000000000206', '1.1', 'B lesson', 'lesson', 1, true),
  ('00000000-0000-0000-0000-000000000314', '00000000-0000-0000-0000-000000000207', '1.1', '102 lesson', 'lesson', 1, false);

insert into public.announcements (course_id, instructor_id, message) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Fixture announcement');
insert into public.calendar_events (date, title, type, scope, host_instructor_id) values
  (current_date, 'Fixture talk', 'live-talk', 'global', '00000000-0000-0000-0000-000000000001');
insert into public.admins (email) values ('admin@example.edu');
insert into public.email_signups (email) values ('learner@example.edu');
insert into public.instructor_google_credentials (instructor_id, refresh_token, scope) values
  ('00000000-0000-0000-0000-000000000001', 'test-token', 'test-scope');

insert into public.question_groups (id, lesson_id, source_drive_file_id, position) values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000303', 'x', 1),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000302', 'y', 1);
insert into public.questions (id, question_group_id, position, prompt_text, answer_key) values
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000401', 1, 'Q published', 'A'),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000402', 1, 'Q unpublished', 'secret');

insert into public.quiz_submissions (id, lesson_id, platform_user_id, score_percent) values
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000303', '22222222-0000-0000-0000-000000000002', 40);
insert into public.quiz_responses (submission_id, question_id, response_text) values
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000501', 'B');
insert into public.lesson_completions (lesson_id, platform_user_id) values
  ('00000000-0000-0000-0000-000000000301', '22222222-0000-0000-0000-000000000002');
-- Legacy activity in course 102 exercises paging, missing Auth rows and a course with no published lessons.
insert into public.lesson_completions (lesson_id, platform_user_id, completed_at)
select '00000000-0000-0000-0000-000000000314', 'stub-learner-' || n, '2026-01-01'::date + n
from generate_series(1, 51) as pages(n);

insert into public.lti_tools (id, name, vendor, launch_url, consumer_key, shared_secret) values
  ('00000000-0000-0000-0000-000000000701', 'Cogniterra', 'cogniterra', 'https://example.org/lti', 'key', 'shh');
insert into public.lti_links (id, lesson_id, tool_id) values
  ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000701');
insert into public.lti_results (link_id, platform_user_id, score) values
  ('00000000-0000-0000-0000-000000000801', '22222222-0000-0000-0000-000000000002', 50);
insert into public.cogniterra_course_config (course_id, cogniterra_course_id, tool_id) values
  ('00000000-0000-0000-0000-000000000101', '64', '00000000-0000-0000-0000-000000000701');
-- B's course 103 has its own tool and config.
insert into public.lti_tools (id, name, vendor, launch_url, consumer_key, shared_secret) values
  ('00000000-0000-0000-0000-000000000702', 'Cogniterra B', 'cogniterra', 'https://example.org/lti', 'keyB', 'shhB');
insert into public.cogniterra_course_config (course_id, cogniterra_course_id, tool_id) values
  ('00000000-0000-0000-0000-000000000103', '99', '00000000-0000-0000-0000-000000000702');

insert into public.autolab_links (id, lesson_id, course_name, assessment_name) values
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000303', 'c', 'hw1'),
  ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000313', 'b-course', 'hw1');
insert into public.autolab_scores (link_id, platform_user_id, autolab_email, score) values
  ('00000000-0000-0000-0000-000000000901', '22222222-0000-0000-0000-000000000002', 'l2@example.edu', 10);

-- lesson-media objects: A's lesson 301, B's lesson 313, the shared 102 lesson
-- 314, and a server-written Drive import path.
insert into storage.objects (bucket_id, name) values
  ('lesson-media', '00000000-0000-0000-0000-000000000301/a-upload.png'),
  ('lesson-media', '00000000-0000-0000-0000-000000000313/b-upload.png'),
  ('lesson-media', '00000000-0000-0000-0000-000000000314/shared-upload.png'),
  ('lesson-media', 'drive-import/drive-file-1/figure.png');

insert into public.lesson_embeddings (lesson_id, source_type, chunk_text, content_hash, embedding) values
  ('00000000-0000-0000-0000-000000000303', 'quiz_question', 'Q published: A', 'h1',
   array_fill(0.1::real, array[1536])::extensions.vector);
