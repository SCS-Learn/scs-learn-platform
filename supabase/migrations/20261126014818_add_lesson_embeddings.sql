create extension if not exists vector with schema extensions;

create table public.lesson_embeddings (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  lesson_block_id uuid references public.lesson_blocks (id) on delete cascade,
  attachment_id uuid references public.attachments (id) on delete cascade,
  source_type text not null check (
    source_type in ('content_html', 'notes', 'pdf', 'caption', 'quiz_question')
  ),
  chunk_index integer not null default 0,
  chunk_text text not null,
  metadata jsonb not null default '{}'::jsonb,
  content_hash text not null,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now()
);

create index lesson_embeddings_lesson_id_idx
  on public.lesson_embeddings (lesson_id);

create index lesson_embeddings_embedding_idx
  on public.lesson_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.lesson_embeddings enable row level security;

create or replace function public.match_lesson_chunks(
  query_embedding extensions.vector(1536),
  filter_course_id uuid,
  match_count integer default 5,
  include_quiz boolean default false
)
returns table (
  id uuid,
  lesson_id uuid,
  source_type text,
  chunk_text text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select
    e.id,
    e.lesson_id,
    e.source_type,
    e.chunk_text,
    e.metadata,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.lesson_embeddings e
  join public.lessons l on l.id = e.lesson_id
  join public.units u on u.id = l.unit_id
  where u.course_id = filter_course_id
    and (include_quiz or e.source_type <> 'quiz_question')
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_lesson_chunks(extensions.vector, uuid, integer, boolean)
  from public, anon, authenticated;;
