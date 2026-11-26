-- Landing-page email capture ("Claim my spot"). Written only by the server
-- action in lib/landing/email-signup.ts through the service-role client.
--
-- RLS is enabled with no policies on purpose: a mailing list is personal data,
-- so the browser anon key can neither read it nor insert into it directly
-- (which would let anyone dump or spam the list). Run in the Supabase SQL
-- editor; safe to re-run.
create table if not exists public.email_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  -- Which form it came from, e.g. "hero".
  source text not null default 'landing',
  created_at timestamptz not null default now()
);

alter table public.email_signups enable row level security;
