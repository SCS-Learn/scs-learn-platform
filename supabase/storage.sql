-- Storage bucket + policies for lesson media (images/video embedded in lesson
-- content, plus the "Attachments" list). Run once in the Supabase Dashboard
-- SQL Editor, alongside schema.sql.
--
-- Keep this file ASCII-only: pasting via clip.exe (WSL -> Windows clipboard)
-- silently mangles non-ASCII characters.
--
-- Auth status: stubbed, same as schema.sql. Policies below are permissive
-- ("using (true)") since there is no session identity to check against yet -
-- not production-safe. Tighten once real login exists.

insert into storage.buckets (id, name, public)
values ('lesson-media', 'lesson-media', true)
on conflict (id) do nothing;

drop policy if exists "stub_auth_lesson_media_select" on storage.objects;
drop policy if exists "stub_auth_lesson_media_insert" on storage.objects;
drop policy if exists "stub_auth_lesson_media_delete" on storage.objects;

create policy "stub_auth_lesson_media_select"
on storage.objects for select
using (bucket_id = 'lesson-media');

create policy "stub_auth_lesson_media_insert"
on storage.objects for insert
with check (bucket_id = 'lesson-media');

create policy "stub_auth_lesson_media_delete"
on storage.objects for delete
using (bucket_id = 'lesson-media');
