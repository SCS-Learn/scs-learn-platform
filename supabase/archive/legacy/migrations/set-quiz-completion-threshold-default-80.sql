-- New quiz lessons default to 80% completion threshold (was 100%).
alter table public.lessons
  alter column quiz_completion_threshold set default 80;
