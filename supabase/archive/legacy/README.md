# Legacy SQL at bbc5031

These files document the SQL Editor-era database setup. The old bootstrap
drops application tables, creates permissive placeholder policies, and
seeds sample data. The archived standalone LTI and Autolab SQL also drops
their integration tables. Use the [canonical migrations](../../README.md)
for deployments.

The previous `supabase/tests/rls/run.sh` applied the following files, in
this order. Paths are relative to this directory. The runner applied any
additional migration files alphabetically after the list, then any
explicit candidate SQL and the RLS test fixtures.

| Order | File | Role in the legacy setup |
| --- | --- | --- |
| 1 | `schema.sql` | Destructive course, instructor, lesson composition, learner progress, LTI 1.3 and Google credentials bootstrap. Includes sample catalog, announcements and calendar data. |
| 2 | `lti.sql` | Standalone LTI 1.1 tool, link, result and nonce tables and external lesson type. |
| 3 | `autolab.sql` | Standalone Autolab credentials, links and scores. |
| 4 | `storage.sql` | Public lesson-media bucket and stub Storage policies. |
| 5 | `migrations/add-instructor-accounts.sql` | Instructor email matching. |
| 6 | `migrations/add-admins-and-course-instructors.sql` | Admins, staff membership and legacy admin/owner backfill. |
| 7 | `migrations/add-cogniterra-integration.sql` | Cogniterra per-course config and overlapping LTI definitions. |
| 8 | `migrations/add-cogniterra-oauth-credentials.sql` | Instructor Cogniterra OAuth. |
| 9 | `migrations/add-course-import-lock.sql` | Course import lock. |
| 10 | `migrations/add-email-signups.sql` | Landing page email capture. |
| 11 | `migrations/add-lesson-category.sql` | Quiz lesson categories. |
| 12 | `migrations/add-course-notes-block.sql` | Course notes block and payload constraint. |
| 13 | `migrations/add-lesson-completions.sql` | Learner completion table and index. |
| 14 | `migrations/add-quiz-progress.sql` | Quiz submission and response tables and indexes. |
| 15 | `migrations/add-free-response-grading.sql` | Fractional credit and feedback. |
| 16 | `migrations/add-grading-feedback-rating.sql` | Grader feedback rating. |
| 17 | `migrations/add-show-reference-answers.sql` | Quiz reference-answer visibility. |
| 18 | `migrations/add-quiz-completion-threshold.sql` | Completion threshold and constraint. |
| 19 | `migrations/set-quiz-completion-threshold-default-80.sql` | Completion threshold default. |
| 20 | `migrations/add-question-points.sql` | Question points and historical allocation backfill. |
| 21 | `migrations/add-question-variants.sql` | Learner question variants and last submitted variant. |
| 22 | `migrations/add-quiz-question-types.sql` | Expanded question-type constraint. |
| 23 | `migrations/add-all-quiz-question-types.sql` | Further question-type expansion. |
| 24 | `migrations/remove-random-short-answer-matching.sql` | Question-type cleanup. |
| 25 | `migrations/remove-dictation.sql` | Question-type cleanup. |
| 26 | `migrations/remove-word-bank.sql` | Question-type cleanup. |
| 27 | `migrations/remove-complex-number-and-big-o.sql` | Question-type cleanup. |
| 28 | `migrations/remove-calculated-question-types.sql` | Question-type cleanup. |
| 29 | `migrations/remove-chemical-formula.sql` | Final question-type constraint. |
| 30 | `migrations/replace-stub-auth-policies.sql` | Role-scoped policies, grants, private helpers and Storage policy. |
| 31 | `migrations/server-side-learner-writes.sql` | Server-only learner writes and staff-only access to question rows. |
| 32 | `migrations/optimize-course-reads.sql` | Supporting indexes and course summary RPCs. |

`seed-demo-course.sql` and `seed-dummy-courses.sql` were separate manual
samples. The former also deletes and recreates its demo course.
