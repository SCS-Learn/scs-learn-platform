-- Minimal local stand-in for the parts of Supabase that RLS policies depend on:
-- the three API roles, auth.uid(), auth.users, and storage.objects. Loaded by
-- run.sh into a throwaway Postgres before the repo's own SQL. Not a full
-- Supabase: PostgREST, Storage API and GoTrue behavior are not emulated.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
-- Supabase reads the caller's JWT "sub" claim; checks.sql sets it per check.
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;

create schema extensions;
create extension pgcrypto with schema extensions;

grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

-- Supabase's default: every new table and function in public is fully granted
-- to the API roles, so RLS (not grants) is what stands between them and data.
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
