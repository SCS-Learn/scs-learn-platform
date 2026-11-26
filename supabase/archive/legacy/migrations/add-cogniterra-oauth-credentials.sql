-- Per-instructor Cogniterra OAuth ("Connect Cogniterra"). Cogniterra's public
-- JSON API (used by lib/cogniterra/client.ts to list a course's lessons)
-- silently refuses to enumerate a PRIVATE course when called anonymously -
-- it returns other courses' sections instead and treats the real course as
-- unlistable. Storing a refresh token from the authorization_code grant lets
-- those calls run as the instructor's own Cogniterra account instead, which
-- can see whatever that account can see (e.g. a private course they teach).
--
-- Same reasoning as instructor_google_credentials: a real third-party
-- secret, so no client-reachable RLS policy at all - only the service-role
-- client (lib/supabase/admin.ts) may touch this table.
create table if not exists public.instructor_cogniterra_credentials (
  instructor_id uuid primary key references public.instructors (id) on delete cascade,
  refresh_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.instructor_cogniterra_credentials enable row level security;
-- No policy created on purpose: RLS enabled with zero policies denies every
-- client-key request; only the service-role key (which bypasses RLS) can
-- touch this table.
