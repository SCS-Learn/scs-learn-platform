-- Synthetic application data, with cross-schema dependencies on Supabase.
create schema private;
create table public.courses (
  id integer primary key,
  title text not null,
  owner_id uuid not null references auth.users (id)
);
alter table public.courses enable row level security;
create policy own_course on public.courses to authenticated using (owner_id = auth.uid());
grant select on public.courses to authenticated;
create table public.course_notes (
  id bigint generated always as identity primary key,
  course_id integer not null references public.courses (id),
  body text not null
);
alter table public.course_notes enable row level security;
create table private.auth_audit (id uuid primary key);
create function private.log_user() returns trigger language plpgsql as $$
begin
  insert into private.auth_audit values (new.id);
  return new;
end $$;
create trigger scs_log_user after insert on auth.users for each row execute function private.log_user();
create policy lesson_media on storage.objects for select to authenticated using (bucket_id = 'lesson-media');

insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'synthetic@example.test');
insert into auth.identities values ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'email');
insert into public.courses values (1, 'Recovery fixture course', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into public.course_notes (course_id, body) values (1, 'first'), (1, 'second');
insert into storage.buckets values ('lesson-media', 'lesson-media', false);
insert into storage.objects (bucket_id, name) values ('lesson-media', 'fixture/metadata-only.pdf');
update auth.schema_migrations set version = 'source-platform-version';
update storage.migrations set name = 'source-platform-version';

create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);
insert into supabase_migrations.schema_migrations values ('20260731000000', 'initial', array['select 1']);
