-- Bulk-adds throwaway courses under the stub instructor (Phillip Compeau,
-- 00000000-0000-0000-0000-000000000001) so you have plenty of course codes
-- to test the Drive import / atom pipeline against without touching real
-- seed data. Purely additive - does not drop or modify anything.
--
-- Run in the Supabase Dashboard SQL Editor. Adjust the "generate_series"
-- range to change how many you get (currently 25: TEST-001..TEST-025).

insert into public.courses (code, title, department, track, instructor_id, student_count)
select
  'TEST-' || lpad(n::text, 3, '0'),
  'Dummy Course ' || n,
  'Test Department',
  'Test track',
  '00000000-0000-0000-0000-000000000001',
  0
from generate_series(1, 25) as n
on conflict (code) do nothing;

-- Cleanup, once you're done testing (courses cascade-delete their units/lessons/attachments):
-- delete from public.courses where code like 'TEST-%';
