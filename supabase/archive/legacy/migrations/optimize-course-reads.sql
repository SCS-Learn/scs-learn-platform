-- Apply after replace-stub-auth-policies.sql and the learner progress migrations.
begin;

create index if not exists units_course_position_idx on public.units (course_id, position);
create index if not exists lessons_unit_position_idx on public.lessons (unit_id, position);
create index if not exists lesson_blocks_lesson_position_idx on public.lesson_blocks (lesson_id, position);
create index if not exists questions_group_position_idx on public.questions (question_group_id, position);
create index if not exists attachments_lesson_idx on public.attachments (lesson_id);
create index if not exists announcements_course_created_idx on public.announcements (course_id, created_at desc);

create or replace function public.student_course_summaries()
returns table (
  code text, title text, department text, track text,
  "unitCount" int, "contentLessonCount" int, "quizLessonCount" int,
  "completedLessonCount" int, "totalLessonCount" int, "percentComplete" int,
  "resumeLessonId" uuid, "resumeLessonCode" text, "resumeLessonTitle" text
)
language sql stable security invoker set search_path = ''
as $$
  with published_lessons as materialized (
    select u.course_id, u.id as unit_id, u.position as unit_position, l.position as lesson_position,
      l.id, l.code, l.title, l.type, lc.lesson_id is not null as complete
    from public.units u
    join public.lessons l on l.unit_id = u.id and l.is_published
    left join public.lesson_completions lc on lc.lesson_id = l.id
      and lc.platform_user_id = (select auth.uid())::text
  ),
  totals as (
    select course_id, count(distinct unit_id) as units, count(*) as lessons,
      count(*) filter (where type = 'quiz') as quizzes,
      count(*) filter (where complete) as completed
    from published_lessons group by course_id
  ),
  resume as (
    select distinct on (course_id) course_id, id, code, title
    from published_lessons
    order by course_id, complete, unit_position, lesson_position, id
  )
  select c.code, c.title, c.department, c.track,
    coalesce(t.units, 0)::int, coalesce(t.lessons - t.quizzes, 0)::int, coalesce(t.quizzes, 0)::int,
    coalesce(t.completed, 0)::int, coalesce(t.lessons, 0)::int,
    coalesce(round(100.0 * t.completed / nullif(t.lessons, 0)), 0)::int,
    r.id, r.code, r.title
  from public.courses c
  left join totals t on t.course_id = c.id
  left join resume r on r.course_id = c.id
  order by c.code;
$$;

revoke all on function public.student_course_summaries() from public, anon, authenticated, service_role;
grant execute on function public.student_course_summaries() to authenticated;

create or replace function public.course_activity_summary(p_course_id uuid, p_page integer default 1)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  -- Authorize the caller before reading progress or private Auth profiles.
  if not private.is_course_staff(p_course_id) then
    raise insufficient_privilege using message = 'Course staff access required';
  end if;

  with course_lessons as materialized (
    select l.id, l.is_published
    from public.lessons l
    join public.units u on u.id = l.unit_id
    where u.course_id = p_course_id
  ),
  activity as materialized (
    select c.platform_user_id as learner_id, c.lesson_id, c.completed_at as active_at,
      true as completed, null::int as quiz_score
    from public.lesson_completions c join course_lessons l on l.id = c.lesson_id
    union all
    select q.platform_user_id, q.lesson_id, q.submitted_at, false, q.score_percent
    from public.quiz_submissions q join course_lessons l on l.id = q.lesson_id
    union all
    select r.platform_user_id, link.lesson_id, r.last_launched_at, false, null::int
    from public.lti_results r
    join public.lti_links link on link.id = r.link_id
    join course_lessons l on l.id = link.lesson_id
  ),
  published as (
    select count(*) filter (where is_published) as lesson_count from course_lessons
  ),
  learner_stats as materialized (
    select a.learner_id,
      count(*) filter (where a.completed) as lessons_completed,
      least(100, coalesce(round(
        100.0 * count(*) filter (where a.completed) / nullif(p.lesson_count, 0)
      ), 0)) as percent_complete,
      round(avg(a.quiz_score)) as average_quiz_score,
      max(a.active_at) as last_active_at
    from activity a cross join published p
    group by a.learner_id, p.lesson_count
  ),
  lesson_stats as (
    select lesson_id, count(*) filter (where completed) as completion_count,
      round(avg(quiz_score)) as average_quiz_score
    from activity
    group by lesson_id
  ),
  totals as (
    select count(*) as learner_count, round(avg(percent_complete)) as avg_completion,
      greatest(1, (count(*) + 49) / 50) as page_count
    from learner_stats
  ),
  paging as (
    select *, least(greatest(1, coalesce(p_page, 1)), page_count) as page_number
    from totals
  ),
  learner_page as (
    select * from learner_stats
    order by last_active_at desc, learner_id
    limit 50 offset (select (page_number - 1) * 50 from paging)
  )
  select jsonb_build_object(
    'learnerCount', paging.learner_count,
    'learnerPage', paging.page_number,
    'learnerPageCount', paging.page_count,
    'averagePercentComplete', paging.avg_completion,
    'averageQuizScore', (select round(avg(quiz_score)) from activity),
    'completionsByLessonId', coalesce((
      select jsonb_object_agg(lesson_id, completion_count) from lesson_stats where completion_count > 0
    ), '{}'::jsonb),
    'averageScoreByQuizId', coalesce((
      select jsonb_object_agg(lesson_id, average_quiz_score) from lesson_stats where average_quiz_score is not null
    ), '{}'::jsonb),
    'learners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.learner_id,
        'name', case when p.learner_id like 'stub-learner%' then 'Test learner (pre-login)' else
          coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
            nullif(split_part(u.email, '@', 1), ''), 'Learner ' || left(p.learner_id, 8)) end,
        'email', u.email,
        'lessonsCompleted', p.lessons_completed,
        'percentComplete', p.percent_complete,
        'averageQuizScore', p.average_quiz_score,
        'lastActiveAt', p.last_active_at
      ) order by p.last_active_at desc, p.learner_id)
      from learner_page p
      left join auth.users u on u.id = case
        when p.learner_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then p.learner_id::uuid end
    ), '[]'::jsonb)
  ) into result
  from paging;

  return result;
end;
$$;

revoke all on function public.course_activity_summary(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.course_activity_summary(uuid, integer) to authenticated;

commit;
