-- Run in Supabase SQL editor if lessons already exists without a category column.
alter table public.lessons add column if not exists category text;
alter table public.lessons drop constraint if exists lessons_category_check;
alter table public.lessons add constraint lessons_category_check
  check (category in ('assignment', 'homework'));
