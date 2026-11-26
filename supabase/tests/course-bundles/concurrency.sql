-- Run only against the throwaway Postgres created by ../rls/run.sh.
-- A second session (dblink) needs committed rows, so this file commits its
-- fixtures and removes them again before the RLS fixtures load.
-- A missing lock timeout fails the run instead of waiting on the peer forever.
set statement_timeout = '30s';
create extension dblink;

insert into public.instructors (id, name, initials)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Synthetic Race Owner', 'SR');
insert into private.course_bundle_destination (id, environment, origin, instructor_id)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'local', 'http://127.0.0.1:54321', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

create function pg_temp.media_path(code text, version text) returns text language sql as $$
  select 'course-bundles/' || code || '/' || version || '/' || repeat('e', 64) || '.png';
$$;

-- Row IDs are unique per code and version, as preparePublication derives them.
create function pg_temp.call(code text, version text, replacement text) returns text language sql as $$
  select format($q$select public.course_bundle_publish('local', 'http://127.0.0.1:54321',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', %L, %L, %L, %L::jsonb, %L::jsonb, %L, false)$q$,
    code, version, repeat(right(version, 1), 64), replace(replace(replace($graph$
    {
      "course": {"code":"CODE","title":"Race Course","department":"SCS","track":"test"},
      "units": [{"id":"UUID1","code":"UNIT","title":"Unit","position":1}],
      "lessons": [{"id":"UUID2","unit_id":"UUID1","code":"TOPIC","title":"Topic","type":"lesson","position":1,
        "content_html":"<p>Topic</p>","is_published":true,"content_source":"html","show_reference_answers":false,
        "quiz_completion_threshold":80}],
      "question_groups": [], "lesson_blocks": [], "questions": [],
      "attachments": [{"id":"UUID3","lesson_id":"UUID2","name":"pixel.png","storage_path":"MEDIA",
        "url":"http://127.0.0.1:54321/storage/v1/object/public/lesson-media/MEDIA","content_type":"image/png",
        "size_bytes":16,"position":1}]
    }
  $graph$, 'CODE', code), 'MEDIA', pg_temp.media_path(code, version)), 'UUID',
    left(md5(code || version), 8) || '-0000-0000-0000-00000000000'),
    jsonb_build_array(pg_temp.media_path(code, version)), replacement);
$$;

create function pg_temp.lesson(code text, version text) returns uuid language sql as $$
  select (left(md5(code || version), 8) || '-0000-0000-0000-000000000002')::uuid;
$$;

create function pg_temp.status(code text, version text) returns jsonb language sql as $$
  select public.course_bundle_status('local', 'http://127.0.0.1:54321', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    code, version, repeat(right(version, 1), 64));
$$;

-- Expect one error from a statement and return the elapsed seconds.
create function pg_temp.fails(statement text, expected text) returns numeric language plpgsql as $$
declare
  started timestamptz := clock_timestamp();
begin
  execute statement;
  raise exception 'Expected % from: %', expected, statement;
exception when others then
  if sqlerrm <> expected and sqlstate <> expected then raise; end if;
  return extract(epoch from clock_timestamp() - started);
end;
$$;

create function pg_temp.peer(statement text) returns text language sql as $$
  select dblink_exec('peer', format('do %s begin perform %s; end %s', '$p$', statement, '$p$'));
$$;

insert into storage.objects (bucket_id, name)
select 'lesson-media', pg_temp.media_path(c, v)
from (values ('BUNDLE_SQL_RACE', 'v1'), ('BUNDLE_SQL_RACE', 'v2'), ('BUNDLE_SQL_RACE', 'v3'), ('BUNDLE_SQL_NEW', 'v1')) x(c, v);
do $$ begin execute pg_temp.call('BUNDLE_SQL_RACE', 'v1', null); end $$;

select dblink_connect('peer', format('host=127.0.0.1 port=%s dbname=%s user=postgres',
  current_setting('port'), current_database()));

-- 1. An uncommitted replacement holds the course. A second publication gives
-- up after lock_timeout, readers still see v1, and learner writes wait and
-- then fail instead of being cascaded away.
select dblink_exec('peer', 'begin');
select pg_temp.peer(substr(pg_temp.call('BUNDLE_SQL_RACE', 'v2', 'v1'), 8));
do $$
declare
  waited numeric := pg_temp.fails(pg_temp.call('BUNDLE_SQL_RACE', 'v2', 'v1'), 'bundle_destination_busy');
begin
  if waited < 4.5 or waited > 15 then raise exception 'Unexpected publication lock wait: %s', waited; end if;
  if pg_temp.status('BUNDLE_SQL_RACE', 'v1')->>'state' <> 'installed' then
    raise exception 'Readers lost the committed version during replacement';
  end if;
  set local lock_timeout = '1s';
  perform pg_temp.fails(format($q$insert into public.quiz_submissions (lesson_id, platform_user_id)
    values (%L, 'race-learner')$q$, pg_temp.lesson('BUNDLE_SQL_RACE', 'v1')), '55P03');
end;
$$;
select dblink_exec('peer', 'commit');
do $$
begin
  perform pg_temp.fails(format($q$insert into public.quiz_submissions (lesson_id, platform_user_id)
    values (%L, 'race-learner')$q$, pg_temp.lesson('BUNDLE_SQL_RACE', 'v1')), '23503');
  -- A retry of the committed publication is idempotent.
  execute pg_temp.call('BUNDLE_SQL_RACE', 'v2', 'v1');
  if pg_temp.status('BUNDLE_SQL_RACE', 'v2')->>'state' <> 'installed'
    or (select count(*) from private.course_bundle_versions where code = 'BUNDLE_SQL_RACE') <> 2
  then raise exception 'Concurrent replacement did not publish exactly once'; end if;
end;
$$;

-- 2. An in-flight learner write blocks replacement. Once it commits, the
-- replacement refuses to delete it and v2 stays usable.
select dblink_exec('peer', 'begin');
select dblink_exec('peer', format($q$insert into public.quiz_submissions (lesson_id, platform_user_id, score_percent)
  values (%L, 'race-learner', 100)$q$, pg_temp.lesson('BUNDLE_SQL_RACE', 'v2')));
do $$
begin
  perform pg_temp.fails(pg_temp.call('BUNDLE_SQL_RACE', 'v3', 'v2'), 'bundle_destination_busy');
end;
$$;
select dblink_exec('peer', 'commit');
do $$
begin
  perform pg_temp.fails(pg_temp.call('BUNDLE_SQL_RACE', 'v3', 'v2'), 'bundle_replacement_has_activity_or_external_references');
  if pg_temp.status('BUNDLE_SQL_RACE', 'v2')->>'state' <> 'installed'
    or not exists (select 1 from public.quiz_submissions where platform_user_id = 'race-learner' and score_percent = 100)
  then raise exception 'Learner progress or the active version was lost'; end if;
end;
$$;

-- 3. Two first installs of one new course: the second waits, and a failed
-- first attempt leaves nothing behind for the retry.
select dblink_exec('peer', 'begin');
select pg_temp.peer(substr(pg_temp.call('BUNDLE_SQL_NEW', 'v1', null), 8));
do $$
begin
  perform pg_temp.fails(pg_temp.call('BUNDLE_SQL_NEW', 'v1', null), 'bundle_destination_busy');
end;
$$;
select dblink_exec('peer', 'rollback');
do $$
begin
  execute pg_temp.call('BUNDLE_SQL_NEW', 'v1', null);
  if pg_temp.status('BUNDLE_SQL_NEW', 'v1')->>'state' <> 'installed' then raise exception 'Retry after rollback failed'; end if;
end;
$$;
select dblink_disconnect('peer');

-- Remove the committed fixtures. Detaching ownership first releases the guard.
begin;
delete from public.quiz_submissions where platform_user_id = 'race-learner';
delete from private.course_bundle_versions where code in ('BUNDLE_SQL_RACE', 'BUNDLE_SQL_NEW');
delete from private.course_bundle_ownership where code in ('BUNDLE_SQL_RACE', 'BUNDLE_SQL_NEW');
delete from public.courses where code in ('BUNDLE_SQL_RACE', 'BUNDLE_SQL_NEW');
delete from private.course_bundle_destination;
delete from public.instructors where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
delete from storage.objects where name like 'course-bundles/%';
commit;
drop extension dblink;
