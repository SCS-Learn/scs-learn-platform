-- Inspect the migrated database before loading any test fixtures.
do $$
begin
  if exists (select 1 from public.instructors)
    or exists (select 1 from public.admins)
    or exists (select 1 from public.courses)
    or exists (select 1 from public.course_instructors)
    or exists (select 1 from auth.users)
  then
    raise exception 'Fresh migration replay contains application or Auth seed rows';
  end if;

  if not exists (
    select 1 from storage.buckets where id = 'lesson-media' and name = 'lesson-media' and public
  ) then
    raise exception 'Expected the public lesson-media bucket after migration replay';
  end if;
end;
$$;
