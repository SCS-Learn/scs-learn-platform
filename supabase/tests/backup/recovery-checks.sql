-- Reusable read-only recovery checks for any restored copy of this project, real or synthetic.
-- Include it from project-specific assertions (\ir recovery-checks.sql) or pass it as --checks-sql.
-- Each check raises an error naming the object, never the row values.
do $$
declare
  item record;
  failed boolean;
begin
  -- Data is loaded with triggers disabled, so foreign keys that already existed in the platform
  -- bootstrap (Auth and Storage) are not revalidated by the restore. Check every key explicitly.
  for item in
    select c.conname, c.conrelid::regclass as child, c.confrelid::regclass as parent,
           cardinality(c.conkey) as width,
           (select string_agg(format('c.%I', a.attname), ', ' order by k.ord)
              from unnest(c.conkey) with ordinality as k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as child_columns,
           (select string_agg(format('p.%I', a.attname), ', ' order by k.ord)
              from unnest(c.confkey) with ordinality as k(attnum, ord)
              join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as parent_columns
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
     where c.contype = 'f'
       and n.nspname in ('public', 'private', 'auth', 'storage', 'supabase_migrations')
  loop
    execute format(
      'select exists (select 1 from %s as c where num_nonnulls(%s) = %s '
      'and not exists (select 1 from %s as p where (%s) = (%s)))',
      item.child, item.child_columns, item.width, item.parent, item.parent_columns, item.child_columns
    ) into failed;
    if failed then
      raise exception 'restored rows violate foreign key % on %', item.conname, item.child;
    end if;
  end loop;

  -- Every application table in public is protected by row-level security in this project.
  for item in
    select c.oid::regclass as relation
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    raise exception 'row-level security is not enabled on %', item.relation;
  end loop;

  -- A sequence behind its column would make the next insert collide with a restored row.
  for item in
    select s.seqrelid::regclass as sequence, d.refobjid::regclass as relation, a.attname
      from pg_sequence s
      join pg_depend d on d.classid = 'pg_class'::regclass and d.objid = s.seqrelid
                       and d.refclassid = 'pg_class'::regclass and d.deptype in ('a', 'i')
      join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
      join pg_class r on r.oid = d.refobjid
      join pg_namespace n on n.oid = r.relnamespace
     where n.nspname in ('public', 'private', 'auth', 'storage')
  loop
    execute format(
      'select coalesce((select max(%I) from %s), 0) > '
      'coalesce((select case when is_called then last_value else last_value - 1 end from %s), 0)',
      item.attname, item.relation, item.sequence
    ) into failed;
    if failed then
      raise exception 'sequence % is behind %.%', item.sequence, item.relation, item.attname;
    end if;
  end loop;
end $$;
