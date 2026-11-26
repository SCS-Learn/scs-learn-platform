begin read only;

select (to_regclass('supabase_migrations.schema_migrations') is not null) as has_history
\gset
\if :has_history
  \echo {"history_table":true}
  select jsonb_build_object(
    'version', version,
    'name', to_jsonb(m)->>'name',
    'statements_md5', md5((to_jsonb(m)->'statements')::text)
  )
  from supabase_migrations.schema_migrations m
  order by version;
\else
  \echo {"history_table":false}
\endif

commit;
