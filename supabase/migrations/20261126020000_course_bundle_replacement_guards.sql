-- Course bundle replacement guards. Follows 20261126010000, which stays as
-- shipped. See docs/course-bundles.md for the operator procedure.
--
-- * Managed staging content is read-only outside course_bundle_publish.
-- * A replacement refuses a live graph that differs from the pinned graph, and
--   any reference into the old rows from outside it (learner activity, links).
-- * Publication and status wait at most 5 seconds for a lock.
begin;

-- The triggers below need a short table lock. Fail instead of queueing app
-- traffic behind this migration; it rolls back and can be rerun.
set local lock_timeout = '5s';

-- Map a content row to its course. Missing parents (rows removed earlier by
-- the same cascade) return null.
create function private.course_bundle_row_course(p_table text, p_row jsonb) returns uuid
language sql stable set search_path = '' as $$
  select case p_table
    when 'courses' then (p_row->>'id')::uuid
    when 'units' then (p_row->>'course_id')::uuid
    when 'lessons' then (select u.course_id from public.units u where u.id = (p_row->>'unit_id')::uuid)
    when 'question_groups' then (select u.course_id from public.lessons l join public.units u on u.id = l.unit_id
      where l.id = (p_row->>'lesson_id')::uuid)
    when 'lesson_blocks' then (select u.course_id from public.lessons l join public.units u on u.id = l.unit_id
      where l.id = (p_row->>'lesson_id')::uuid)
    when 'attachments' then (select u.course_id from public.lessons l join public.units u on u.id = l.unit_id
      where l.id = (p_row->>'lesson_id')::uuid)
    when 'questions' then (select u.course_id from public.question_groups g
      join public.lessons l on l.id = g.lesson_id join public.units u on u.id = l.unit_id
      where g.id = (p_row->>'question_group_id')::uuid)
  end;
$$;

-- Only course_bundle_publish sets the transaction-local writer to the code it
-- holds the publication lock for. The API cannot set configuration values.
create function private.course_bundle_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  touched uuid[] := '{}';
  writer text := nullif(current_setting('course_bundle.publication', true), '');
begin
  if exists (select 1 from private.course_bundle_destination where environment = 'staging')
    and exists (select 1 from private.course_bundle_ownership)
  then
    if tg_op = 'TRUNCATE' then
      raise exception using message = 'bundle_managed_content_read_only';
    end if;
    if tg_op <> 'INSERT' then
      touched := touched || private.course_bundle_row_course(tg_table_name, to_jsonb(old));
    end if;
    if tg_op <> 'DELETE' then
      touched := touched || private.course_bundle_row_course(tg_table_name, to_jsonb(new));
    end if;
    if exists (
      select 1 from private.course_bundle_ownership o
      where o.course_id = any (touched) and o.code is distinct from writer
    ) then
      raise exception using message = 'bundle_managed_content_read_only';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.course_bundle_row_course(text, jsonb), private.course_bundle_guard()
  from public, anon, authenticated, service_role;

-- Course rows keep their app-managed counters and Drive import lease.
create trigger course_bundle_guard before update of code, title, department, track, instructor_id
  on public.courses for each row
  when (old.code is distinct from new.code or old.title is distinct from new.title
    or old.department is distinct from new.department or old.track is distinct from new.track
    or old.instructor_id is distinct from new.instructor_id)
  execute function private.course_bundle_guard();
create trigger course_bundle_guard_delete before delete on public.courses
  for each row execute function private.course_bundle_guard();

do $$
declare
  t text;
begin
  foreach t in array array['units', 'lessons', 'question_groups', 'lesson_blocks', 'attachments', 'questions'] loop
    execute format('create trigger course_bundle_guard before insert or update or delete on public.%I
      for each row execute function private.course_bundle_guard()', t);
  end loop;
  foreach t in array array['courses', 'units', 'lessons', 'question_groups', 'lesson_blocks', 'attachments', 'questions'] loop
    execute format('create trigger course_bundle_guard_truncate before truncate on public.%I
      for each statement execute function private.course_bundle_guard()', t);
  end loop;
end;
$$;

-- True when a row outside the managed graph references one of its rows.
-- Uses the catalog, so activity, LTI/Autolab links and future tables are
-- covered without a hand-maintained list. Unsupported key shapes fail closed.
create function private.course_bundle_has_external_references(p_rows jsonb) returns boolean
language plpgsql stable set search_path = '' as $$
declare
  graph constant text[] := array['units', 'lessons', 'question_groups', 'lesson_blocks', 'attachments', 'questions'];
  fk record;
  ids uuid[];
  own uuid[];
  found boolean;
begin
  for fk in
    select c.conrelid::regclass as source, sn.nspname as source_schema, s.relname as source_table,
      t.relname as target_table, a.attname as source_column, ta.attname as target_column,
      cardinality(c.conkey) as width
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.confrelid
    join pg_catalog.pg_namespace tn on tn.oid = t.relnamespace
    join pg_catalog.pg_class s on s.oid = c.conrelid
    join pg_catalog.pg_namespace sn on sn.oid = s.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_catalog.pg_attribute ta on ta.attrelid = c.confrelid and ta.attnum = c.confkey[1]
    where c.contype = 'f' and tn.nspname = 'public' and t.relname = any (graph)
  loop
    if fk.width <> 1 or fk.target_column <> 'id' then
      raise exception using message = 'bundle_replacement_unsupported_reference';
    end if;
    select coalesce(array_agg(x::uuid), '{}') into ids from jsonb_array_elements_text(p_rows->fk.target_table) x;
    if fk.source_schema = 'public' and fk.source_table = any (graph) then
      select coalesce(array_agg(x::uuid), '{}') into own from jsonb_array_elements_text(p_rows->fk.source_table) x;
      execute format('select exists (select 1 from %s r where r.%I = any ($1) and r.id <> all ($2))',
        fk.source, fk.source_column) into found using ids, own;
    else
      execute format('select exists (select 1 from %s r where r.%I = any ($1))', fk.source, fk.source_column)
        into found using ids;
    end if;
    if found then return true; end if;
  end loop;
  return false;
end;
$$;

revoke all on function private.course_bundle_has_external_references(jsonb) from public, anon, authenticated, service_role;

create or replace function public.course_bundle_target(p_environment text, p_origin text, p_destination uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from private.course_bundle_destination d
    where d.environment = p_environment and d.origin = p_origin and d.id = p_destination
  ) then
    raise exception using message = 'bundle_wrong_destination';
  end if;
  if not exists (select 1 from storage.buckets b where b.id = 'lesson-media' and b.public) then
    raise exception using message = 'bundle_public_media_bucket_required';
  end if;
  return jsonb_build_object('migration', '20261126020000', 'bucket', 'lesson-media', 'destination', p_destination);
end;
$$;

alter function public.course_bundle_status(text, text, uuid, text, text, text) set lock_timeout = '5s';

create or replace function public.course_bundle_publish(
  p_environment text, p_origin text, p_destination uuid,
  p_code text, p_version text, p_digest text,
  p_content jsonb, p_media jsonb, p_replace text, p_dry_run boolean
) returns jsonb language plpgsql security definer
set search_path = '' set lock_timeout = '5s' set course_bundle.publication = ''
as $$
declare
  owner_id uuid;
  current_owner uuid;
  drive_import_started_at timestamptz;
  v_course_id uuid;
  active_version text;
  active_rows jsonb;
  active_graph text;
  new_rows jsonb;
begin
  perform public.course_bundle_target(p_environment, p_origin, p_destination);
  if p_code is null or p_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'
    or p_version is null or p_version !~ '^[a-z0-9][a-z0-9._-]{0,79}$'
    or p_digest is null or p_digest !~ '^[a-f0-9]{64}$' or p_dry_run is null
    or p_content->'course'->>'code' is distinct from p_code
    or jsonb_typeof(p_media) is distinct from 'array'
    or (select count(*) from jsonb_object_keys(p_content)) <> 7
    or exists (select 1 from unnest(array['units', 'lessons', 'question_groups', 'lesson_blocks', 'attachments', 'questions']) k
      where jsonb_typeof(p_content->k) is distinct from 'array')
  then raise exception using message = 'bundle_invalid_publication'; end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_media) m(path)
    where left(path, length('course-bundles/' || p_code || '/' || p_version || '/'))
      is distinct from ('course-bundles/' || p_code || '/' || p_version || '/')
      or path !~ '/[a-f0-9]{64}\.(png|jpg|gif|webp|pdf|mp4|webm|mp3|wav|txt)$'
      or array_length(string_to_array(path, '/'), 1) <> 4
  ) then raise exception using message = 'bundle_invalid_media_path'; end if;

  begin
    -- One publication per course code. Lock waits end after lock_timeout.
    perform pg_advisory_xact_lock(hashtextextended('course-bundle:' || p_code, 0));
    select c.id, c.instructor_id, c.import_lock_started_at into v_course_id, current_owner, drive_import_started_at
      from public.courses c where c.code = p_code for update;
    select o.current_version, v.row_ids, v.graph_sha256 into active_version, active_rows, active_graph
      from private.course_bundle_ownership o join private.course_bundle_versions v
        on v.code = o.code and v.version = o.current_version
      where o.code = p_code and o.course_id = v_course_id and o.instructor_id = current_owner;
    if active_version is null and (v_course_id is not null or exists (
      select 1 from private.course_bundle_ownership o where o.code = p_code
    )) then raise exception using message = 'bundle_unmanaged_course_collision'; end if;
    if active_version = p_version then
      if not exists (select 1 from private.course_bundle_versions v
        where v.code = p_code and v.version = p_version and v.manifest_sha256 = p_digest)
      then raise exception using message = 'bundle_immutable_version'; end if;
      return public.course_bundle_status(p_environment, p_origin, p_destination, p_code, p_version, p_digest);
    end if;
    if exists (select 1 from private.course_bundle_versions v where v.code = p_code and v.version = p_version)
    then raise exception using message = 'bundle_immutable_version'; end if;
    if p_replace is distinct from active_version then
      raise exception using message = 'bundle_replace_expected_version';
    end if;
    -- Respect the existing Drive import lease and its 30-minute stale cutoff.
    if drive_import_started_at >= now() - interval '30 minutes' then
      raise exception using message = 'bundle_course_has_active_drive_import';
    end if;

    -- Every child reference must resolve within the candidate graph. Existing
    -- destination rows cannot be used to satisfy missing candidate references.
    if exists (
      select 1 from jsonb_to_recordset(p_content->'lessons') l(unit_id uuid)
      where not exists (select 1 from jsonb_to_recordset(p_content->'units') u(id uuid) where u.id = l.unit_id)
      union all
      select 1 from jsonb_to_recordset(p_content->'question_groups') g(lesson_id uuid)
      where not exists (select 1 from jsonb_to_recordset(p_content->'lessons') l(id uuid) where l.id = g.lesson_id)
      union all
      select 1 from jsonb_to_recordset(p_content->'questions') q(question_group_id uuid)
      where not exists (select 1 from jsonb_to_recordset(p_content->'question_groups') g(id uuid) where g.id = q.question_group_id)
      union all
      select 1 from jsonb_to_recordset(p_content->'lesson_blocks') b(lesson_id uuid, question_group_id uuid)
      where not exists (select 1 from jsonb_to_recordset(p_content->'lessons') l(id uuid) where l.id = b.lesson_id)
        or (b.question_group_id is not null and not exists (
          select 1 from jsonb_to_recordset(p_content->'question_groups') g(id uuid, lesson_id uuid)
          where g.id = b.question_group_id and g.lesson_id = b.lesson_id))
      union all
      select 1 from jsonb_to_recordset(p_content->'attachments') a(lesson_id uuid, lesson_block_id uuid, storage_path text, url text)
      where not exists (select 1 from jsonb_to_recordset(p_content->'lessons') l(id uuid) where l.id = a.lesson_id)
        or (a.lesson_block_id is not null and not exists (
          select 1 from jsonb_to_recordset(p_content->'lesson_blocks') b(id uuid, lesson_id uuid)
          where b.id = a.lesson_block_id and b.lesson_id = a.lesson_id))
        or (a.storage_path is not null and (not (p_media ? a.storage_path)
          or a.url is distinct from p_origin || '/storage/v1/object/public/lesson-media/' || a.storage_path))
    ) then raise exception using message = 'bundle_invalid_publication_reference'; end if;
    if not p_dry_run and exists (
      select 1 from jsonb_array_elements_text(p_media) path where not exists (
        select 1 from storage.objects s where s.bucket_id = 'lesson-media' and s.name = path
      )
    ) then raise exception using message = 'bundle_media_missing'; end if;

    if active_version is not null then
      -- Lock descendants before checking the graph and its references. Row
      -- locks also block new references (learner writes) until commit.
      perform 1 from public.units u where u.course_id = v_course_id for update;
      perform 1 from public.lessons l join public.units u on u.id = l.unit_id where u.course_id = v_course_id for update of l;
      perform 1 from public.question_groups g where active_rows->'question_groups' ? g.id::text for update;
      perform 1 from public.questions q where active_rows->'questions' ? q.id::text for update;
      perform 1 from public.lesson_blocks b where active_rows->'lesson_blocks' ? b.id::text for update;
      perform 1 from public.attachments a where active_rows->'attachments' ? a.id::text for update;

      if private.course_bundle_row_ids(private.course_bundle_graph(p_code)) is distinct from active_rows
      then raise exception using message = 'bundle_ownership_changed'; end if;
      -- Anything edited since publication would be lost. Fail instead.
      if encode(sha256(convert_to(private.course_bundle_graph(p_code)::text, 'UTF8')), 'hex') is distinct from active_graph
      then raise exception using message = 'bundle_published_content_changed'; end if;
      if private.course_bundle_has_external_references(active_rows)
      then raise exception using message = 'bundle_replacement_has_activity_or_external_references'; end if;
    end if;

    perform set_config('course_bundle.publication', p_code, true);
    begin
      if active_version is null then
        select d.instructor_id into strict owner_id from private.course_bundle_destination d where d.id = p_destination;
        insert into public.courses (code, title, department, track, instructor_id)
          values (p_code, p_content->'course'->>'title', p_content->'course'->>'department',
            p_content->'course'->>'track', owner_id)
          returning id into v_course_id;
        insert into private.course_bundle_ownership (code, course_id, instructor_id, current_version)
          values (p_code, v_course_id, owner_id, p_version);
      else
        -- A question-group block requires its group, even while cascading.
        delete from public.lesson_blocks b where active_rows->'lesson_blocks' ? b.id::text;
        delete from public.units u where u.course_id = v_course_id;
        update public.courses set title = p_content->'course'->>'title',
          department = p_content->'course'->>'department', track = p_content->'course'->>'track'
          where id = v_course_id;
        update private.course_bundle_ownership set current_version = p_version where code = p_code;
      end if;

      insert into public.units (id, course_id, code, title, position)
        select x.id, v_course_id, x.code, x.title, x.position
        from jsonb_to_recordset(p_content->'units') x(id uuid, code text, title text, position int);
      insert into public.lessons (
        id, unit_id, code, title, type, position, content_html, is_published, content_source,
        category, show_reference_answers, quiz_completion_threshold
      )
        select id, unit_id, code, title, type, position, content_html, is_published, content_source,
          category, show_reference_answers, quiz_completion_threshold
        from jsonb_to_recordset(p_content->'lessons') x(
          id uuid, unit_id uuid, code text, title text, type text, position int, content_html text,
          is_published boolean, content_source text, category text, show_reference_answers boolean, quiz_completion_threshold int
        );
      insert into public.question_groups (id, lesson_id, source_drive_file_id, title, position)
        select id, lesson_id, 'course-bundle:' || id::text, title, position
        from jsonb_to_recordset(p_content->'question_groups') x(id uuid, lesson_id uuid, title text, position int);
      insert into public.lesson_blocks (
        id, lesson_id, position, kind, title, render_mode, body_html, rendered_image_urls, video_url, question_group_id
      )
        select id, lesson_id, position, kind, title, render_mode, body_html, rendered_image_urls, video_url, question_group_id
        from jsonb_to_recordset(p_content->'lesson_blocks') x(
          id uuid, lesson_id uuid, position int, kind text, title text, render_mode text,
          body_html text, rendered_image_urls text[], video_url text, question_group_id uuid
        );
      insert into public.attachments (id, lesson_id, lesson_block_id, name, storage_path, url, content_type, size_bytes, position)
        select id, lesson_id, lesson_block_id, name, storage_path, url, content_type, size_bytes, position
        from jsonb_to_recordset(p_content->'attachments') x(
          id uuid, lesson_id uuid, lesson_block_id uuid, name text, storage_path text, url text,
          content_type text, size_bytes bigint, position int
        );
      insert into public.questions (
        id, question_group_id, position, prompt_text, prompt_source, choices, answer_key, question_type,
        points, source_slide_or_page_index, needs_review, variants
      )
        select id, question_group_id, position, prompt_text, prompt_source, choices, answer_key, question_type,
          points, source_slide_or_page_index, needs_review, variants
        from jsonb_to_recordset(p_content->'questions') x(
          id uuid, question_group_id uuid, position int, prompt_text text, prompt_source text, choices jsonb,
          answer_key text, question_type text, points int, source_slide_or_page_index int, needs_review boolean, variants jsonb
        );

      new_rows := private.course_bundle_row_ids(p_content);
      insert into private.course_bundle_versions (code, version, manifest_sha256, row_ids, graph_sha256, media_paths)
        values (p_code, p_version, p_digest, new_rows,
          encode(sha256(convert_to(private.course_bundle_graph(p_code)::text, 'UTF8')), 'hex'), p_media);
      if p_dry_run then raise sqlstate 'ZB001'; end if;
    exception when sqlstate 'ZB001' then
      -- Entering the exception handler rolls back the candidate DML.
      return jsonb_build_object('state', 'ready');
    when unique_violation then
      raise exception using message = 'bundle_unmanaged_row_or_course_collision';
    end;
    return public.course_bundle_status(p_environment, p_origin, p_destination, p_code, p_version, p_digest);
  exception when lock_not_available then
    raise exception using message = 'bundle_destination_busy';
  end;
end;
$$;

commit;
