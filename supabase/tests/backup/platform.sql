-- Synthetic Supabase-managed schema for a socket-only test cluster.
\ir ../rls/supabase-stub.sql

create table auth.identities (
  id uuid primary key,
  user_id uuid not null references auth.users (id),
  provider text not null
);
create table auth.schema_migrations (version text primary key);
insert into auth.schema_migrations values ('platform-bootstrap');
create table storage.migrations (id integer primary key, name text not null);
insert into storage.migrations values (1, 'platform-bootstrap');
alter table storage.objects add foreign key (bucket_id) references storage.buckets (id);
