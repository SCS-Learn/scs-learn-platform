begin read only;

-- Bucket configuration only. Object paths and stored files stay out of the snapshot.
select jsonb_build_object('lesson_media_bucket', (
  select to_jsonb(b) - 'created_at' - 'updated_at'
  from storage.buckets b where id = 'lesson-media'
));

-- Include every policy here since a broad policy could also affect lesson media.
select jsonb_build_object('storage_objects_policy', to_jsonb(p))
from pg_policies p
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

select jsonb_build_object(
  'storage_table', c.relname,
  'row_security', c.relrowsecurity,
  'force_row_security', c.relforcerowsecurity,
  'owner', pg_get_userbyid(c.relowner),
  'acl', array(select entry::text
    from unnest(coalesce(c.relacl, acldefault('r', c.relowner))) as entry order by entry::text)
)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'storage' and c.relname in ('buckets', 'objects')
order by c.relname;

-- A trigger on a platform table can call into an app schema.
select jsonb_build_object('trigger', pg_get_triggerdef(t.oid), 'enabled', t.tgenabled)
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc f on f.oid = t.tgfoid
join pg_namespace fn on fn.oid = f.pronamespace
where not t.tgisinternal
  and n.nspname in ('auth', 'storage')
  and fn.nspname in ('public', 'private')
order by n.nspname, c.relname, t.tgname;

select jsonb_build_object('extension', e.extname, 'version', e.extversion, 'schema', n.nspname)
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'pgcrypto';

commit;
