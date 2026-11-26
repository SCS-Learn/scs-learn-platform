-- Fixture-specific assertions after the reusable checks.
\ir recovery-checks.sql

do $$
begin
  if (select title from public.courses where id = 1) is distinct from 'Recovery fixture course'
    or exists (select 1 from public.courses where id = 2) then
    raise exception 'course data differs from the capture';
  end if;
  if not exists (select 1 from auth.identities i join auth.users u on u.id = i.user_id
                 where u.email = 'synthetic@example.test' and i.provider = 'email')
    or exists (select 1 from auth.users where email = 'later@example.test') then
    raise exception 'auth metadata differs from the capture';
  end if;
  if not exists (select 1 from storage.objects o join storage.buckets b on b.id = o.bucket_id
                 where o.name = 'fixture/metadata-only.pdf' and b.public = false) then
    raise exception 'storage metadata differs from the capture';
  end if;
  if (select statements from supabase_migrations.schema_migrations where version = '20260731000000')
     is distinct from array['select 1'] then
    raise exception 'migration history statements differ from the capture';
  end if;
  if (select version from auth.schema_migrations) is distinct from 'platform-bootstrap'
    or (select name from storage.migrations) is distinct from 'platform-bootstrap' then
    raise exception 'platform service migration markers changed';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'scs_log_user')
    or (select count(*) from private.auth_audit) <> 1 then
    raise exception 'application trigger or private schema was not recovered';
  end if;
  if (select string_agg(body, ',' order by id) from public.course_notes) is distinct from 'first,second' then
    raise exception 'identity-keyed rows differ from the capture';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
do $$
begin
  if (select count(*) from public.courses) <> 1 or (select count(*) from storage.objects) <> 1 then
    raise exception 'application RLS or managed storage policy was not recovered';
  end if;
end $$;
