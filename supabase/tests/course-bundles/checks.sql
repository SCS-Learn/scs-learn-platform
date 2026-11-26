-- Run only against the throwaway Postgres created by ../rls/run.sh.
begin;

insert into public.instructors (id, name, initials)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Synthetic Bundle Owner', 'SB');

insert into private.course_bundle_destination (id, environment, origin, instructor_id)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'local', 'http://127.0.0.1:54321', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

create function pg_temp.media_path(version text, code text default 'BUNDLE_SQL_SMOKE') returns text language sql as $$
  select 'course-bundles/' || code || '/' || version || '/' || repeat('f', 64) || '.png';
$$;

create function pg_temp.payload(version text, code text default 'BUNDLE_SQL_SMOKE') returns jsonb language sql as $$
  select replace(replace(replace($graph$
    {
      "course": {"code":"CODE","title":"Synthetic Course","department":"SCS","track":"test"},
      "units": [{"id":"10000000-0000-0000-0000-00000000000V","code":"UNIT","title":"Fixture Unit","position":1}],
      "lessons": [
        {"id":"20000000-0000-0000-0000-00000000000V","unit_id":"10000000-0000-0000-0000-00000000000V","code":"TOPIC","title":"Fixture Topic","type":"lesson","position":1,"content_html":"<img src=\"http://127.0.0.1:54321/storage/v1/object/public/lesson-media/MEDIA\">","is_published":true,"content_source":"html","show_reference_answers":false,"quiz_completion_threshold":80},
        {"id":"30000000-0000-0000-0000-00000000000V","unit_id":"10000000-0000-0000-0000-00000000000V","code":"QUIZ","title":"Fixture Quiz","type":"quiz","position":2,"content_html":"","is_published":true,"content_source":"blocks","show_reference_answers":false,"quiz_completion_threshold":80}
      ],
      "question_groups": [{"id":"40000000-0000-0000-0000-00000000000V","lesson_id":"30000000-0000-0000-0000-00000000000V","title":"Quiz","position":1}],
      "lesson_blocks": [{"id":"50000000-0000-0000-0000-00000000000V","lesson_id":"30000000-0000-0000-0000-00000000000V","position":1,"kind":"question_group","question_group_id":"40000000-0000-0000-0000-00000000000V"}],
      "attachments": [{"id":"60000000-0000-0000-0000-00000000000V","lesson_id":"20000000-0000-0000-0000-00000000000V","name":"pixel.png","storage_path":"MEDIA","url":"http://127.0.0.1:54321/storage/v1/object/public/lesson-media/MEDIA","content_type":"image/png","size_bytes":16,"position":1}],
      "questions": [{"id":"70000000-0000-0000-0000-00000000000V","question_group_id":"40000000-0000-0000-0000-00000000000V","position":1,"prompt_text":"What is 2 + 2?","prompt_source":"verbatim_extracted","choices":["3","4","5"],"answer_key":"4","points":1,"question_type":"multiple_choice","needs_review":false,"variants":[]}]
    }
  $graph$, '00V', '00' || right(version, 1)), 'MEDIA', pg_temp.media_path(version, code)), 'CODE', code)::jsonb;
$$;

create function pg_temp.publish(version text, content jsonb, replacement text, dry_run boolean,
  code text default 'BUNDLE_SQL_SMOKE')
returns jsonb language sql as $$
  select public.course_bundle_publish(
    'local', 'http://127.0.0.1:54321', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    code, version, repeat(right(version, 1), 64), content,
    jsonb_build_array(pg_temp.media_path(version, code)), replacement, dry_run
  );
$$;

create function pg_temp.status(version text, code text default 'BUNDLE_SQL_SMOKE') returns jsonb language sql as $$
  select public.course_bundle_status('local', 'http://127.0.0.1:54321', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    code, version, repeat(right(version, 1), 64));
$$;

-- Expect one bundle_* refusal from a statement.
create function pg_temp.refuses(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected % from: %', expected, statement;
exception when raise_exception then
  if sqlerrm <> expected then raise; end if;
end;
$$;

do $$
declare
  first_graph jsonb := pg_temp.payload('v1');
  second_graph jsonb := pg_temp.payload('v2');
  result jsonb;
  first_id text;
begin
  if has_function_privilege('anon', 'public.course_bundle_publish(text,text,uuid,text,text,text,jsonb,jsonb,text,boolean)', 'execute')
    or has_function_privilege('authenticated', 'public.course_bundle_publish(text,text,uuid,text,text,text,jsonb,jsonb,text,boolean)', 'execute')
    or not has_function_privilege('service_role', 'public.course_bundle_publish(text,text,uuid,text,text,text,jsonb,jsonb,text,boolean)', 'execute')
  then raise exception 'Wrong publication RPC privileges'; end if;

  begin
    perform public.course_bundle_target('staging', 'http://127.0.0.1:54321', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    raise exception 'Accepted wrong destination';
  exception when raise_exception then
    if sqlerrm <> 'bundle_wrong_destination' then raise; end if;
  end;
  begin
    perform pg_temp.publish('v1', first_graph - 'lesson_blocks', null, true);
    raise exception 'Accepted malformed DB input';
  exception when raise_exception then
    if sqlerrm <> 'bundle_invalid_publication' then raise; end if;
  end;
  begin
    perform pg_temp.publish('v1', jsonb_set(first_graph, '{question_groups,0,lesson_id}',
      '"20000000-0000-0000-0000-000000000001"'), null, true);
    raise exception 'Accepted cross-lesson relationship';
  exception when raise_exception then
    if sqlerrm <> 'bundle_invalid_publication_reference' then raise; end if;
  end;

  insert into public.courses (code, title, department, track, instructor_id)
  values ('BUNDLE_SQL_SMOKE', 'Unmanaged', 'SCS', 'test', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  begin
    perform pg_temp.publish('v1', first_graph, null, true);
    raise exception 'Accepted unmanaged collision';
  exception when raise_exception then
    if sqlerrm <> 'bundle_unmanaged_course_collision' then raise; end if;
  end;
  if (select title from public.courses where code = 'BUNDLE_SQL_SMOKE') <> 'Unmanaged' then
    raise exception 'Unmanaged course changed';
  end if;
  delete from public.courses where code = 'BUNDLE_SQL_SMOKE';

  result := pg_temp.publish('v1', first_graph, null, true);
  if result->>'state' is distinct from 'ready'
    or exists (select 1 from public.courses where code = 'BUNDLE_SQL_SMOKE')
  then raise exception 'Dry-run should leave no rows'; end if;
  begin
    perform pg_temp.publish('v1', first_graph, null, false);
    raise exception 'Published without Storage object';
  exception when raise_exception then
    if sqlerrm <> 'bundle_media_missing' then raise; end if;
  end;

  -- The local harness stubs Storage. Production publication uses the HTTP
  -- Storage API and never writes object metadata directly.
  insert into storage.objects (bucket_id, name) values ('lesson-media', pg_temp.media_path('v1'));
  result := pg_temp.publish('v1', first_graph, null, false);
  first_id := result->>'courseId';
  if result->>'state' is distinct from 'installed'
    or result->>'sha256' is distinct from repeat('1', 64)
    or jsonb_array_length(result->'lessons') is distinct from 2
    or result->'mediaPaths'->>0 is distinct from pg_temp.media_path('v1')
  then raise exception 'Initial installation or status failed: %', result; end if;
  if pg_temp.publish('v1', first_graph, null, true) <> result
    or pg_temp.publish('v1', first_graph, null, false) <> result
    or (select count(*) from public.units where course_id = first_id::uuid) <> 1
    or (select count(*) from private.course_bundle_versions where code = 'BUNDLE_SQL_SMOKE') <> 1
  then raise exception 'Same version is not idempotent'; end if;

  begin
    perform pg_temp.publish('v2', second_graph, null, true);
    raise exception 'Accepted implicit replacement';
  exception when raise_exception then
    if sqlerrm <> 'bundle_replace_expected_version' then raise; end if;
  end;
  insert into storage.objects (bucket_id, name) values ('lesson-media', pg_temp.media_path('v2'));
  begin
    perform pg_temp.publish('v2', jsonb_set(second_graph, '{questions,0,points}', '-1'), 'v1', false);
    raise exception 'Accepted invalid replacement';
  exception when check_violation then null;
  end;
  if pg_temp.publish('v1', first_graph, null, true) <> result
    or not exists (select 1 from public.questions where id = '70000000-0000-0000-0000-000000000001' and answer_key = '4')
    or not exists (select 1 from public.attachments where storage_path = pg_temp.media_path('v1'))
  then raise exception 'Failed replacement damaged the active course'; end if;

  update public.courses set import_lock_started_at = now() where id = first_id::uuid;
  begin
    perform pg_temp.publish('v2', second_graph, 'v1', true);
    raise exception 'Allowed replacement during Drive import';
  exception when raise_exception then
    if sqlerrm <> 'bundle_course_has_active_drive_import' then raise; end if;
  end;
  update public.courses set import_lock_started_at = null where id = first_id::uuid;

  result := pg_temp.publish('v2', second_graph, 'v1', false);
  if result->>'state' is distinct from 'installed' or result->>'courseId' is distinct from first_id
    or not exists (select 1 from storage.objects where name = pg_temp.media_path('v1'))
  then raise exception 'Replacement lost stable ownership or prior media'; end if;
  begin
    perform pg_temp.publish('v1', first_graph, 'v2', false);
    raise exception 'Allowed reactivation of a historical version';
  exception when raise_exception then
    if sqlerrm <> 'bundle_immutable_version' then raise; end if;
  end;

  insert into public.lesson_completions (lesson_id, platform_user_id)
  values ('20000000-0000-0000-0000-000000000002', 'generated-fixture-learner');
  begin
    perform pg_temp.publish('v3', pg_temp.payload('v3'), 'v2', true);
    raise exception 'Replacement would cause an activity cascade';
  exception when raise_exception then
    if sqlerrm <> 'bundle_replacement_has_activity_or_external_references' then raise; end if;
  end;
  if pg_temp.publish('v2', second_graph, null, true) <> result
    or not exists (select 1 from public.lesson_completions where platform_user_id = 'generated-fixture-learner')
  then raise exception 'Course and synthetic activity should survive failed replacement'; end if;
end;
$$;

-- Protect managed staging content without blocking edits in development.
update private.course_bundle_destination set environment = 'staging';
insert into public.courses (code, title, department, track, instructor_id)
  values ('UNMANAGED_EDIT', 'Editable', 'SCS', 'test', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.units (course_id, code, title, position)
  select id, 'U', 'Unit', 1 from public.courses where code = 'UNMANAGED_EDIT';
insert into public.lessons (unit_id, code, position)
  select u.id, 'MOVABLE', 1 from public.units u join public.courses c on c.id = u.course_id where c.code = 'UNMANAGED_EDIT';
set local role service_role;
select pg_temp.refuses($s$update public.lessons set title = 'Edited' where id = '20000000-0000-0000-0000-000000000002'$s$,
  'bundle_managed_content_read_only');
select pg_temp.refuses($s$update public.courses set title = 'Edited' where code = 'BUNDLE_SQL_SMOKE'$s$,
  'bundle_managed_content_read_only');
select pg_temp.refuses($s$delete from public.questions where id = '70000000-0000-0000-0000-000000000002'$s$,
  'bundle_managed_content_read_only');
select pg_temp.refuses($s$delete from public.units where id = '10000000-0000-0000-0000-000000000002'$s$,
  'bundle_managed_content_read_only');
select pg_temp.refuses($s$insert into public.lessons (unit_id, code, position)
  values ('10000000-0000-0000-0000-000000000002', 'EXTRA', 9)$s$, 'bundle_managed_content_read_only');
select pg_temp.refuses($s$update public.lessons set unit_id = '10000000-0000-0000-0000-000000000002'
  where id in (select l.id from public.lessons l join public.units u on u.id = l.unit_id
    join public.courses c on c.id = u.course_id where c.code = 'UNMANAGED_EDIT')$s$, 'bundle_managed_content_read_only');
select pg_temp.refuses('truncate public.attachments', 'bundle_managed_content_read_only');
reset role;
select pg_temp.refuses($s$update public.attachments set name = 'edited.png' where lesson_id = '20000000-0000-0000-0000-000000000002'$s$,
  'bundle_managed_content_read_only');
update private.course_bundle_destination set environment = 'local';

do $$
declare
  active jsonb := pg_temp.status('v2');
begin
  -- The app keeps its course counters and Drive lease column.
  update public.courses set student_count = student_count + 1, import_lock_started_at = null where code = 'BUNDLE_SQL_SMOKE';
  update public.lessons set title = 'Edited' where code = 'MOVABLE';
  delete from public.courses where code = 'UNMANAGED_EDIT';
  if pg_temp.status('v2') <> active then raise exception 'Allowed edits changed the pinned graph'; end if;
end;
$$;

-- A normal development edit is allowed. Replacement reports it without
-- overwriting it and the pin stays unusable until the edit is reverted.
set local role service_role;
update public.lessons set content_html = '<p>Local edit</p>' where id = '20000000-0000-0000-0000-000000000002';
reset role;
delete from public.lesson_completions where platform_user_id = 'generated-fixture-learner';
insert into storage.objects (bucket_id, name) values ('lesson-media', pg_temp.media_path('v3'));
select pg_temp.refuses($s$select pg_temp.status('v2')$s$, 'bundle_published_content_changed');
select pg_temp.refuses($s$select pg_temp.publish('v3', pg_temp.payload('v3'), 'v2', true)$s$, 'bundle_published_content_changed');
select pg_temp.refuses($s$select pg_temp.publish('v3', pg_temp.payload('v3'), 'v2', false)$s$, 'bundle_published_content_changed');
do $$
begin
  if (select content_html from public.lessons where id = '20000000-0000-0000-0000-000000000002') <> '<p>Local edit</p>'
    or (select current_version from private.course_bundle_ownership where code = 'BUNDLE_SQL_SMOKE') <> 'v2'
    or exists (select 1 from public.lessons where id = '20000000-0000-0000-0000-000000000003')
  then raise exception 'Refused replacement changed the edited course'; end if;
end;
$$;
update public.lessons set content_html = (select l->>'content_html' from jsonb_array_elements(pg_temp.payload('v2')->'lessons') l
  where l->>'code' = 'TOPIC') where id = '20000000-0000-0000-0000-000000000002';
do $$
begin
  if pg_temp.status('v2')->>'state' <> 'installed' then raise exception 'Reverted edit should restore the pin'; end if;
end;
$$;

-- References are found through the catalog, including tables added later.
create table public.zz_future_progress (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade
);
insert into public.zz_future_progress (question_id) values ('70000000-0000-0000-0000-000000000002');
select pg_temp.refuses($s$select pg_temp.publish('v3', pg_temp.payload('v3'), 'v2', false)$s$,
  'bundle_replacement_has_activity_or_external_references');
drop table public.zz_future_progress;

-- A course with history is kept. The update is published as a new course
-- code, the next fixture generation, and both versions remain usable.
insert into public.lesson_completions (lesson_id, platform_user_id)
values ('20000000-0000-0000-0000-000000000002', 'generated-fixture-learner');
insert into storage.objects (bucket_id, name) values ('lesson-media', pg_temp.media_path('v4', 'BUNDLE_SQL_SMOKE_2'));
do $$
declare
  previous jsonb := pg_temp.status('v2');
  next_generation jsonb;
begin
  next_generation := pg_temp.publish('v4', pg_temp.payload('v4', 'BUNDLE_SQL_SMOKE_2'), null, false, 'BUNDLE_SQL_SMOKE_2');
  if next_generation->>'state' <> 'installed' or next_generation->>'courseId' = previous->>'courseId'
    or pg_temp.status('v2') <> previous
    or not exists (select 1 from public.lesson_completions where platform_user_id = 'generated-fixture-learner')
  then raise exception 'New fixture generation disturbed the previous course: %', next_generation; end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_proc p where p.oid = 'public.course_bundle_publish(text,text,uuid,text,text,text,jsonb,jsonb,text,boolean)'::regprocedure
      and 'lock_timeout=5s' = any (p.proconfig))
    or not exists (select 1 from pg_proc p where p.oid = 'public.course_bundle_status(text,text,uuid,text,text,text)'::regprocedure
      and 'lock_timeout=5s' = any (p.proconfig))
    or current_setting('course_bundle.publication', true) is distinct from null
       and current_setting('course_bundle.publication', true) <> ''
  then raise exception 'Publication lock timeout or writer scope is wrong'; end if;
end;
$$;

insert into private.course_bundle_export_allowlist values ('BUNDLE_SQL_SMOKE', encode(sha256(convert_to(repeat('9', 64), 'UTF8')), 'hex'));
set local role anon;
do $$
declare
  snapshot jsonb;
begin
  begin
    perform public.course_bundle_export('BUNDLE_SQL_SMOKE');
    raise exception 'Read export with no token';
  exception when raise_exception then
    if sqlerrm <> 'bundle_source_not_allowlisted' then raise; end if;
  end;
  perform set_config('request.headers', jsonb_build_object('x-course-bundle-export', repeat('9', 64))::text, true);
  begin
    perform public.course_bundle_export('UNLISTED');
    raise exception 'Read export for unapproved course';
  exception when raise_exception then
    if sqlerrm <> 'bundle_source_not_allowlisted' then raise; end if;
  end;
  snapshot := public.course_bundle_export('BUNDLE_SQL_SMOKE');
  if jsonb_array_length(snapshot->'lessons') is distinct from 2
    or snapshot::text ~ '(instructor_id|platform_user_id|generated-fixture-learner|source_drive_file_id|student_count)'
  then raise exception 'Unexpected fields in export'; end if;
end;
$$;
reset role;

rollback;
