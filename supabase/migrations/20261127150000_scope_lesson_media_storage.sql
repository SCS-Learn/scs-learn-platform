-- lesson-media: scope Storage API writes to the lesson's course staff, and
-- limit what the bucket accepts.
--
-- The baseline lets any signed-in instructor upload, overwrite, delete or list
-- any object in the bucket, including another course's files. Browser uploads
-- (lib/instructor/upload.ts) always write under "<lesson id>/...", so a
-- signed-in user may now only touch objects under a lesson they can edit.
-- Everything else (drive-import/..., course-bundles/...) is written by the
-- server with the service role, which bypasses these policies.
--
-- Public object URLs are unaffected: the bucket stays public.

-- The lesson id an object path starts with, or null for any other path.
create or replace function private.lesson_media_lesson_id(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end
$$;

revoke all on function private.lesson_media_lesson_id(text) from public;
grant execute on function private.lesson_media_lesson_id(text) to authenticated;

drop policy if exists lesson_media_instructors on storage.objects;
drop policy if exists lesson_media_lesson_staff on storage.objects;
create policy lesson_media_lesson_staff on storage.objects for all to authenticated
  using (bucket_id = 'lesson-media'
         and private.can_edit_lesson(private.lesson_media_lesson_id(name)))
  with check (bucket_id = 'lesson-media'
              and private.can_edit_lesson(private.lesson_media_lesson_id(name)));

-- The Storage API enforces these for every client, service role included.
-- No HTML, SVG, XML or JavaScript: those would run script when opened from the
-- public URL. Types are what the editor, attachments and Drive import upload
-- (the hosted bucket on 2026-11-27 held only PNG, JPEG, GIF and PDF; the
-- largest object was a 38.7 MB PDF). application/octet-stream covers
-- attachments the browser can't type; it downloads rather than renders.
update storage.buckets
set file_size_limit = 52428800, -- 50 MB
    allowed_mime_types = array[
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/msword', 'application/vnd.ms-excel',
      'application/zip', 'application/json',
      'text/plain', 'text/csv', 'text/markdown', 'text/x-python',
      'application/octet-stream'
    ]
where id = 'lesson-media';
