-- Optional sample content for a disposable local database.
begin;

insert into public.instructors (id, name, initials) values
  ('d0000000-0000-0000-0000-000000000001', 'Demo Instructor', 'DI')
on conflict (id) do nothing;

insert into public.courses (id, code, title, department, track, instructor_id) values
  ('d0000000-0000-0000-0000-000000000100', 'DEMO-100', 'Demo Course', 'Demo', 'Demo track',
   'd0000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.course_instructors (course_id, instructor_id) values
  ('d0000000-0000-0000-0000-000000000100', 'd0000000-0000-0000-0000-000000000001')
on conflict (course_id, instructor_id) do nothing;

insert into public.units (id, course_id, code, title, position) values
  ('d0000000-0000-0000-0000-000000000200', 'd0000000-0000-0000-0000-000000000100', 'Unit 1', 'Getting started', 1)
on conflict (id) do nothing;

insert into public.lessons (id, unit_id, code, title, type, position, content_source, is_published) values
  ('d0000000-0000-0000-0000-000000000301', 'd0000000-0000-0000-0000-000000000200', '1.1', 'Welcome slides', 'lesson', 1, 'blocks', true),
  ('d0000000-0000-0000-0000-000000000302', 'd0000000-0000-0000-0000-000000000200', '1.2', 'Demo check-in', 'quiz', 2, 'blocks', true),
  ('d0000000-0000-0000-0000-000000000303', 'd0000000-0000-0000-0000-000000000200', '1.3', 'Autolab practice set', 'lesson', 3, 'html', true)
on conflict (id) do nothing;

insert into public.lesson_blocks (id, lesson_id, position, kind, title, render_mode, body_html) values
  ('d0000000-0000-0000-0000-000000000401', 'd0000000-0000-0000-0000-000000000301', 1, 'slide_file', 'Welcome deck', 'slide_card_images',
   '<section class="slide"><h2>Welcome</h2><p>Read this slide, then try the demo check-in.</p></section>')
on conflict (id) do nothing;

insert into public.question_groups (id, lesson_id, source_drive_file_id, title, position) values
  ('d0000000-0000-0000-0000-000000000500', 'd0000000-0000-0000-0000-000000000302', 'demo-quiz-seed', 'Demo check-in', 1)
on conflict (id) do nothing;

insert into public.lesson_blocks (id, lesson_id, position, kind, title, question_group_id) values
  ('d0000000-0000-0000-0000-000000000402', 'd0000000-0000-0000-0000-000000000302', 1, 'question_group', 'Demo check-in',
   'd0000000-0000-0000-0000-000000000500')
on conflict (id) do nothing;

insert into public.questions (id, question_group_id, position, prompt_text, choices, answer_key, question_type, points) values
  ('d0000000-0000-0000-0000-000000000600', 'd0000000-0000-0000-0000-000000000500', 1,
   'What does a FASTA record store per entry?', '["A header line and a sequence", "Only quality scores"]'::jsonb,
   'A header line and a sequence', 'multiple_choice', 100)
on conflict (id) do nothing;

-- Placeholder assessment metadata. A real launch needs an Autolab connection.
insert into public.autolab_links (id, lesson_id, course_name, assessment_name, title, points_possible) values
  ('d0000000-0000-0000-0000-000000000700', 'd0000000-0000-0000-0000-000000000303', 'demo-course', 'practice-set',
   'Practice set', 10)
on conflict (id) do nothing;

commit;
