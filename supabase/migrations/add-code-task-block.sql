-- IDE tasks: a lesson block holding an in-browser code editor plus a
-- Gradescope-format autograder. Run once in the Supabase SQL editor.
-- Safe to re-run. Keep this file ASCII-only (clip.exe mangles non-ASCII).
--
-- code_task (jsonb) holds the whole task - see lib/code-task/types.ts:
--   { language, entryFile, starterCode, prompt, autograder: { format,
--     files: [{ path, content }], tests: [...parsed test metadata] } }

alter table public.lesson_blocks add column if not exists code_task jsonb;

alter table public.lesson_blocks drop constraint if exists lesson_blocks_kind_check;
alter table public.lesson_blocks add constraint lesson_blocks_kind_check
  check (kind in ('slide_file', 'video', 'question_group', 'course_notes', 'code_task'));

alter table public.lesson_blocks drop constraint if exists lesson_blocks_kind_payload_ck;
alter table public.lesson_blocks add constraint lesson_blocks_kind_payload_ck check (
  (kind = 'slide_file' and render_mode is not null and video_url is null and question_group_id is null) or
  (kind = 'video' and video_url is not null and render_mode is null and question_group_id is null) or
  (kind = 'question_group' and question_group_id is not null and render_mode is null and video_url is null) or
  (kind = 'course_notes' and body_html is not null and render_mode is null and video_url is null and question_group_id is null) or
  (kind = 'code_task' and code_task is not null and render_mode is null and video_url is null and question_group_id is null)
);
