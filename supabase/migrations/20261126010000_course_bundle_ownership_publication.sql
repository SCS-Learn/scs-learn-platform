-- The canonical baseline provides the application tables and the lesson-media bucket.
begin;

create schema if not exists private;

create table private.course_bundle_destination (
  singleton boolean primary key default true check (singleton),
  id uuid unique not null,
  environment text not null check (environment in ('local', 'personal', 'shared-dev', 'staging')),
  origin text not null,
  instructor_id uuid not null references public.instructors (id) on delete restrict
);

create table private.course_bundle_export_allowlist (
  code text primary key references public.courses (code) on delete cascade,
  token_sha256 text not null check (token_sha256 ~ '^[a-f0-9]{64}$')
);

create table private.course_bundle_ownership (
  code text primary key,
  course_id uuid unique not null references public.courses (id) on delete restrict,
  instructor_id uuid not null references public.instructors (id) on delete restrict,
  current_version text not null
);

create table private.course_bundle_versions (
  code text not null references private.course_bundle_ownership (code),
  version text not null,
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  row_ids jsonb not null,
  graph_sha256 text not null,
  media_paths jsonb not null,
  published_at timestamptz not null default now(),
  primary key (code, version)
);

alter table private.course_bundle_ownership add foreign key (code, current_version)
  references private.course_bundle_versions (code, version) deferrable initially deferred;

revoke all on private.course_bundle_destination, private.course_bundle_export_allowlist,
  private.course_bundle_ownership, private.course_bundle_versions from public, anon, authenticated, service_role;

-- Ordinary editor uploads keep their existing permissions. Bundle paths can
-- only be written by the server-side publication operator.
create policy course_bundle_media_insert on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'lesson-media' or name not like 'course-bundles/%');
create policy course_bundle_media_update on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'lesson-media' or name not like 'course-bundles/%')
  with check (bucket_id <> 'lesson-media' or name not like 'course-bundles/%');
create policy course_bundle_media_delete on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'lesson-media' or name not like 'course-bundles/%');

-- An explicit projection is shared by the read-only exporter and the check
-- for unmanaged descendants. Drive IDs, staff identities and activity never
-- enter the export payload.
create function private.course_bundle_graph(p_code text) returns jsonb
language sql stable set search_path = '' as $$
  with
  course as (
    select id, code, title, department, track from public.courses where code = p_code
  ),
  units as (
    select u.id, u.code, u.title, u.position
    from public.units u join course c on c.id = u.course_id
  ),
  lessons as (
    select l.id, l.unit_id, l.code, l.title, l.type, l.position, l.content_html,
      l.is_published, l.content_source, l.category, l.show_reference_answers, l.quiz_completion_threshold
    from public.lessons l join units u on u.id = l.unit_id
  ),
  groups as (
    select g.id, g.lesson_id, g.title, g.position
    from public.question_groups g join lessons l on l.id = g.lesson_id
  ),
  blocks as (
    select b.id, b.lesson_id, b.position, b.kind, b.title, b.render_mode, b.body_html,
      b.rendered_image_urls, b.video_url, b.question_group_id
    from public.lesson_blocks b join lessons l on l.id = b.lesson_id
  ),
  attachments as (
    select a.id, a.lesson_id, a.lesson_block_id, a.name, a.storage_path, a.url,
      a.content_type, a.size_bytes, a.position, a.created_at
    from public.attachments a join lessons l on l.id = a.lesson_id
  ),
  questions as (
    select q.id, q.question_group_id, q.position, q.prompt_text, q.prompt_source, q.choices,
      q.answer_key, q.question_type, q.points, q.source_slide_or_page_index, q.needs_review, q.variants
    from public.questions q join groups g on g.id = q.question_group_id
  )
  select jsonb_build_object(
    'course', to_jsonb(course) - 'id',
    'units', coalesce((select jsonb_agg(to_jsonb(u) order by position, id) from units u), '[]'),
    'lessons', coalesce((select jsonb_agg(to_jsonb(l) order by unit_id, position, id) from lessons l), '[]'),
    'question_groups', coalesce((select jsonb_agg(to_jsonb(g) order by lesson_id, position, id) from groups g), '[]'),
    'lesson_blocks', coalesce((select jsonb_agg(to_jsonb(b) order by lesson_id, position, id) from blocks b), '[]'),
    'attachments', coalesce((select jsonb_agg(to_jsonb(a) - 'created_at'
      order by lesson_id, position nulls last, created_at, id) from attachments a), '[]'),
    'questions', coalesce((select jsonb_agg(to_jsonb(q) order by question_group_id, position, id) from questions q), '[]')
  ) from course;
$$;

revoke all on function private.course_bundle_graph(text) from public, anon, authenticated, service_role;

create function public.course_bundle_export(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  token text := nullif(current_setting('request.headers', true), '')::jsonb->>'x-course-bundle-export';
begin
  if token is null or token !~ '^[a-f0-9]{64}$' or not exists (
    select 1 from private.course_bundle_export_allowlist a where a.code = p_code
      and a.token_sha256 = encode(sha256(convert_to(token, 'UTF8')), 'hex')
  ) then
    raise exception using message = 'bundle_source_not_allowlisted';
  end if;
  if exists (
    select 1 from public.courses c join public.units u on u.course_id = c.id
    join public.lessons l on l.unit_id = u.id
    where c.code = p_code and (l.type = 'external'
      or exists (select 1 from public.lti_links x where x.lesson_id = l.id)
      or exists (select 1 from public.autolab_links x where x.lesson_id = l.id)
      or exists (select 1 from public.lti_assignments x where x.lesson_id = l.id))
  ) then
    raise exception using message = 'bundle_source_has_external_activity';
  end if;
  return private.course_bundle_graph(p_code);
end;
$$;

create function public.course_bundle_target(p_environment text, p_origin text, p_destination uuid) returns jsonb
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
  return jsonb_build_object('migration', '20261126010000', 'bucket', 'lesson-media', 'destination', p_destination);
end;
$$;

create function private.course_bundle_row_ids(p_content jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_object_agg(k, coalesce((select jsonb_agg(r->>'id' order by r->>'id') from jsonb_array_elements(v) r), '[]'))
  from jsonb_each(p_content) as e(k, v) where k <> 'course';
$$;

revoke all on function private.course_bundle_row_ids(jsonb) from public, anon, authenticated, service_role;

create function public.course_bundle_status(
  p_environment text, p_origin text, p_destination uuid, p_code text, p_version text, p_digest text
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  installed record;
  live_graph jsonb;
begin
  perform public.course_bundle_target(p_environment, p_origin, p_destination);
  select c.id, v.manifest_sha256, v.row_ids, v.graph_sha256, v.media_paths into installed
    from private.course_bundle_ownership o
    join public.courses c on c.id = o.course_id and c.code = o.code and c.instructor_id = o.instructor_id
    join private.course_bundle_versions v on v.code = o.code and v.version = o.current_version
    where o.code = p_code and v.version = p_version and v.manifest_sha256 = p_digest;
  if not found then return jsonb_build_object('state', 'missing'); end if;
  live_graph := private.course_bundle_graph(p_code);
  if private.course_bundle_row_ids(live_graph) is distinct from installed.row_ids then
    raise exception using message = 'bundle_ownership_changed';
  end if;
  if encode(sha256(convert_to(live_graph::text, 'UTF8')), 'hex') is distinct from installed.graph_sha256 then
    raise exception using message = 'bundle_published_content_changed';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(installed.media_paths) path where not exists (
      select 1 from storage.objects s where s.bucket_id = 'lesson-media' and s.name = path
    )
  ) then raise exception using message = 'bundle_media_missing'; end if;
  return jsonb_build_object(
    'state', 'installed', 'course', p_code, 'version', p_version, 'sha256', installed.manifest_sha256,
    'courseId', installed.id, 'mediaPaths', installed.media_paths,
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'code', l.code, 'type', l.type) order by u.position, l.position, l.id)
      from public.units u join public.lessons l on l.unit_id = u.id where u.course_id = installed.id
    ), '[]')
  );
end;
$$;

create function public.course_bundle_publish(
  p_environment text, p_origin text, p_destination uuid,
  p_code text, p_version text, p_digest text,
  p_content jsonb, p_media jsonb, p_replace text, p_dry_run boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  current_owner uuid;
  drive_import_started_at timestamptz;
  v_course_id uuid;
  active_version text;
  active_rows jsonb;
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

  perform pg_advisory_xact_lock(hashtextextended('course-bundle:' || p_code, 0));
  select c.id, c.instructor_id, c.import_lock_started_at into v_course_id, current_owner, drive_import_started_at
    from public.courses c where c.code = p_code for update;
  select o.current_version, v.row_ids into active_version, active_rows
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
      -- Lock descendants before checking ownership and activity. Row locks
      -- also block new FK references while this graph is being replaced.
      perform 1 from public.units u where u.course_id = v_course_id for update;
      perform 1 from public.lessons l join public.units u on u.id = l.unit_id where u.course_id = v_course_id for update of l;
      perform 1 from public.question_groups g where active_rows->'question_groups' ? g.id::text for update;
      perform 1 from public.questions q where active_rows->'questions' ? q.id::text for update;
      perform 1 from public.lesson_blocks b where active_rows->'lesson_blocks' ? b.id::text for update;
      perform 1 from public.attachments a where active_rows->'attachments' ? a.id::text for update;

      if private.course_bundle_row_ids(private.course_bundle_graph(p_code)) is distinct from active_rows
      then raise exception using message = 'bundle_ownership_changed'; end if;
      if exists (
        select 1 from public.quiz_submissions x where active_rows->'lessons' ? x.lesson_id::text
        union all select 1 from public.quiz_responses x where active_rows->'questions' ? x.question_id::text
        union all select 1 from public.lesson_completions x where active_rows->'lessons' ? x.lesson_id::text
        union all select 1 from public.lti_links x where active_rows->'lessons' ? x.lesson_id::text
        union all select 1 from public.autolab_links x where active_rows->'lessons' ? x.lesson_id::text
        union all select 1 from public.lti_assignments x where active_rows->'lessons' ? x.lesson_id::text
        union all select 1 from public.lesson_blocks x where active_rows->'question_groups' ? x.question_group_id::text
          and not (active_rows->'lesson_blocks' ? x.id::text)
        union all select 1 from public.attachments x where active_rows->'lesson_blocks' ? x.lesson_block_id::text
          and not (active_rows->'attachments' ? x.id::text)
      ) then raise exception using message = 'bundle_replacement_has_activity_or_external_references'; end if;
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
end;
$$;

revoke all on function public.course_bundle_export(text) from public, anon, authenticated, service_role;
revoke all on function public.course_bundle_target(text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.course_bundle_status(text, text, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.course_bundle_publish(text, text, uuid, text, text, text, jsonb, jsonb, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.course_bundle_export(text) to anon;
grant execute on function public.course_bundle_target(text, text, uuid) to service_role;
grant execute on function public.course_bundle_status(text, text, uuid, text, text, text) to service_role;
grant execute on function public.course_bundle_publish(text, text, uuid, text, text, text, jsonb, jsonb, text, boolean) to service_role;

commit;
