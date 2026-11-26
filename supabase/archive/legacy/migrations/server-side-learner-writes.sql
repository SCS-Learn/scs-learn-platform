-- Learner records are written only by the server, and quiz questions (which
-- carry answer keys) are readable only by course staff.
--
-- Run AFTER deploying the app version that grades quizzes on the server and
-- writes learner records with the service role (lib/student/data/
-- learner-records.ts). With an older app, learners could no longer submit
-- quizzes or mark lessons complete.
--
-- Prerequisite: replace-stub-auth-policies.sql. Safe to re-run, and that file
-- can be re-run after this one without reopening anything.

begin;

-- 1. Learner records: signed-in users read their own rows (and staff read
--    their courses' rows) under the existing *_read policies. Every write
--    comes from the server after it grades the attempt or checks the
--    completion threshold.
drop policy if exists quiz_submissions_own_write on public.quiz_submissions;
drop policy if exists quiz_responses_own_write on public.quiz_responses;
drop policy if exists lesson_completions_own_write on public.lesson_completions;

revoke all on public.quiz_submissions, public.quiz_responses, public.lesson_completions,
  public.lti_results, public.autolab_scores from authenticated;
grant select on public.quiz_submissions, public.quiz_responses, public.lesson_completions,
  public.lti_results, public.autolab_scores to authenticated;

-- 2. Questions: course staff only. Learners get questions from the server
--    with the answer keys removed.
drop policy if exists questions_read on public.questions;
create policy questions_read on public.questions for select to authenticated
  using (private.can_edit_lesson(private.group_lesson_id(question_group_id)));

commit;
