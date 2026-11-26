-- Run in Supabase SQL editor if lesson_blocks already exists without course_notes.
alter table public.lesson_blocks drop constraint if exists lesson_blocks_kind_check;
alter table public.lesson_blocks add constraint lesson_blocks_kind_check
  check (kind in ('slide_file', 'video', 'question_group', 'course_notes'));

alter table public.lesson_blocks drop constraint if exists lesson_blocks_kind_payload_ck;
alter table public.lesson_blocks add constraint lesson_blocks_kind_payload_ck check (
  (kind = 'slide_file' and render_mode is not null and video_url is null and question_group_id is null) or
  (kind = 'video' and video_url is not null and render_mode is null and question_group_id is null) or
  (kind = 'question_group' and question_group_id is not null and render_mode is null and video_url is null) or
  (kind = 'course_notes' and body_html is not null and render_mode is null and video_url is null and question_group_id is null)
);
