-- Optional load-test courses for a disposable local database. Run demo-course.sql first.
begin;

with new_courses as (
  insert into public.courses (code, title, department, track, instructor_id)
  select
    'TEST-' || lpad(n::text, 3, '0'),
    'Dummy Course ' || n,
    'Test Department',
    'Test track',
    'd0000000-0000-0000-0000-000000000001'
  from generate_series(1, 25) as n
  on conflict (code) do nothing
  returning id, instructor_id
)
insert into public.course_instructors (course_id, instructor_id)
select id, instructor_id from new_courses;

commit;
