-- Demo course: slides + a quiz + an autograded assignment, all seeded directly
-- so you can look at the instructor UI without running the Drive import
-- pipeline (useful while Anthropic API credits are unavailable, since import
-- classification calls the API).
--
-- Run AFTER supabase/schema.sql. supabase/autolab.sql is optional - if it has
-- not been run yet, the autolab_links/autolab_scores rows below are skipped
-- automatically (see the guarded block near the end) rather than erroring.
--
-- Safe to re-run: deletes this demo course by code first (cascades to its
-- units/lessons/lesson_blocks/question_groups/questions/attachments and any
-- autolab_links/autolab_scores row), then reinserts. Does not touch any
-- other course or seed data.
--
-- Keep this file ASCII-only (same clip.exe caveat as schema.sql).

delete from public.courses where code = 'DEMO-100';

insert into public.courses (id, code, title, department, track, instructor_id, student_count) values
  ('00000000-0000-0000-0000-000000000901', 'DEMO-100', 'Demo Course: Slides, Quiz and Autograded Assignment', 'Demo', 'Demo track', '00000000-0000-0000-0000-000000000001', 0);

insert into public.units (id, course_id, code, title, position) values
  ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000901', 'Unit 1', 'Getting started', 1);

-- is_published = true on all three: the student viewer (app/student) only
-- shows published lessons, and there is no instructor UI step in this seed
-- flow to publish them afterward.
insert into public.lessons (id, unit_id, code, title, type, position, content_html, content_source, is_published) values
  ('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000902', '1.1', 'Slides: welcome to the demo', 'lesson', 1, '', 'blocks', true),
  ('00000000-0000-0000-0000-000000000912', '00000000-0000-0000-0000-000000000902', '1.2', 'Quiz: demo check-in', 'quiz', 2, '', 'blocks', true),
  ('00000000-0000-0000-0000-000000000913', '00000000-0000-0000-0000-000000000902', '1.3', 'Assignment: autograded practice set', 'lesson', 3, '', 'blocks', true);

-- Slides ----------------------------------------------------------------
-- render_mode 'slide_card_images' with hand-written body_html avoids any
-- dependency on Drive/Google OAuth or the pptx renderer.

insert into public.lesson_blocks (id, lesson_id, position, kind, title, render_mode, body_html) values
  ('00000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000911', 1, 'slide_file', 'Welcome deck', 'slide_card_images',
   '<section class="slide"><h2>Slide 1: Welcome</h2><p>This is a placeholder slide deck, seeded directly into the database for testing the instructor UI.</p></section>' ||
   '<section class="slide"><h2>Slide 2: What you will do</h2><ul><li>Read three slides</li><li>Take a short quiz</li><li>Submit an autograded assignment</li></ul></section>' ||
   '<section class="slide"><h2>Slide 3: Good luck</h2><p>Everything in this lesson is placeholder content.</p></section>');

-- Quiz --------------------------------------------------------------------

insert into public.question_groups (id, lesson_id, source_drive_file_id, title, position) values
  ('00000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000912', 'demo-quiz-seed', 'Demo check-in quiz', 1);

insert into public.lesson_blocks (id, lesson_id, position, kind, title, question_group_id) values
  ('00000000-0000-0000-0000-000000000922', '00000000-0000-0000-0000-000000000912', 1, 'question_group', 'Demo check-in quiz', '00000000-0000-0000-0000-000000000931');

insert into public.questions (question_group_id, position, prompt_text, choices, answer_key, question_type) values
  ('00000000-0000-0000-0000-000000000931', 1, 'What does a FASTA record store per entry?', '["A header line and a sequence", "Only quality scores", "A binary alignment", "A phylogenetic tree"]'::jsonb, 'A header line and a sequence', 'multiple_choice'),
  ('00000000-0000-0000-0000-000000000931', 2, 'Which alignment algorithm guarantees a globally optimal alignment?', '["Needleman-Wunsch", "Smith-Waterman", "BLAST", "k-mer hashing"]'::jsonb, 'Needleman-Wunsch', 'multiple_choice'),
  ('00000000-0000-0000-0000-000000000931', 3, 'A lower E-value on a BLAST hit generally means what?', '["A more significant match", "A longer query sequence", "Fewer gaps", "Higher GC content"]'::jsonb, 'A more significant match', 'multiple_choice'),
  ('00000000-0000-0000-0000-000000000931', 4, 'A FASTQ file adds which extra information beyond FASTA?', '["Per-base quality scores", "A reference genome", "Codon usage tables", "Exon boundaries"]'::jsonb, 'Per-base quality scores', 'multiple_choice'),
  ('00000000-0000-0000-0000-000000000931', 5, 'In Smith-Waterman local alignment, negative-scoring cells in the matrix are reset to what?', '["Zero", "Negative infinity", "The gap penalty", "The previous diagonal value"]'::jsonb, 'Zero', 'multiple_choice'),
  ('00000000-0000-0000-0000-000000000931', 6, 'What is the main purpose of a substitution matrix like BLOSUM62?', '["Score how likely one amino acid is to replace another", "Store raw read counts", "Index k-mers for a hash table", "Define gap-open penalties only"]'::jsonb, 'Score how likely one amino acid is to replace another', 'multiple_choice'),
  ('00000000-0000-0000-0000-000000000931', 7, 'Name one reason two biological replicates of the same sample can still show different raw read counts.', null, 'Differences in sequencing depth (library size) between the two runs', 'short_answer');

-- Autograded assignment -----------------------------------------------------
-- The questions/answer_key rows below are reference content only - this repo
-- has no in-app grading engine yet (see AGENTS.md-adjacent note: grading is
-- always delegated to an external tool). The autolab_links/autolab_scores
-- rows further down are what actually represent "autograded" as this
-- codebase models it today.

insert into public.question_groups (id, lesson_id, source_drive_file_id, title, position) values
  ('00000000-0000-0000-0000-000000000932', '00000000-0000-0000-0000-000000000913', 'demo-assignment-seed', 'Practice set 1', 1);

insert into public.lesson_blocks (id, lesson_id, position, kind, title, question_group_id) values
  ('00000000-0000-0000-0000-000000000923', '00000000-0000-0000-0000-000000000913', 1, 'question_group', 'Practice set 1', '00000000-0000-0000-0000-000000000932');

insert into public.questions (question_group_id, position, prompt_text, answer_key, question_type) values
  ('00000000-0000-0000-0000-000000000932', 1, 'Write the reverse complement of ATGGCC.', 'GGCCAT', 'short_answer'),
  ('00000000-0000-0000-0000-000000000932', 2, 'In one sentence, explain why raw read counts alone do not measure gene expression.', 'Counts scale with library depth and transcript length, so they must be normalized before comparing expression.', 'free_response');

-- Only insert Autolab rows if supabase/autolab.sql has been run in this
-- database - keeps this file runnable against schema.sql alone.
do $$
begin
  if to_regclass('public.autolab_links') is not null then
    insert into public.autolab_links (id, lesson_id, course_name, assessment_name, title, points_possible)
    values ('00000000-0000-0000-0000-000000000941', '00000000-0000-0000-0000-000000000913', 'demo-course-f26', 'practice-set-1', 'Practice set 1 (autograded)', 10)
    on conflict (lesson_id) do nothing;

    -- platform_user_id/autolab_email match the stub learner identity that
    -- getLaunchingUser() (lib/lti/config.ts) always returns under stub auth,
    -- so the student viewer's current "logged in" learner sees this score.
    insert into public.autolab_scores (link_id, platform_user_id, autolab_email, score, points_possible, raw)
    values ('00000000-0000-0000-0000-000000000941', 'stub-learner-0001', 'scs-learn-test@andrew.cmu.edu', 8.5, 10,
      '{"problems": [{"name": "reverse_complement", "score": 5, "max": 5}, {"name": "explain_normalization", "score": 3.5, "max": 5}]}'::jsonb)
    on conflict (link_id, platform_user_id) do nothing;
  end if;
end $$;

-- Cleanup, once you're done: delete from public.courses where code = 'DEMO-100';
