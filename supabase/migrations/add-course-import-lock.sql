-- Prevents two Drive imports from running concurrently against the same
-- course. Without this, closing the import dialog (or double-submitting)
-- while an import is still running server-side doesn't actually cancel it -
-- a second run then races the first, and both independently classify and
-- persist the same Drive files, producing duplicated units/lessons.
--
-- NULL means no import is running. runDriveImportOrganize sets this to now()
-- via a conditional UPDATE (only when NULL or older than 30 minutes, so a
-- crashed run can never wedge a course closed forever) and clears it in a
-- finally block when the run ends, however it ends.
alter table public.courses
  add column if not exists import_lock_started_at timestamptz;
