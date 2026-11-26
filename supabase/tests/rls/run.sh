#!/usr/bin/env bash
# Local RLS regression check. Never touches the hosted Supabase project.
#
# Starts a throwaway Postgres, loads supabase-stub.sql (the Supabase roles,
# auth.uid() and storage.objects), applies the repo's SQL in the order below,
# then any --candidate files, loads fixtures.sql and runs checks.sql. Prints
# one PASS/FAIL line per check and exits 1 if any check fails.
#
# Usage:
#   supabase/tests/rls/run.sh
#   supabase/tests/rls/run.sh --candidate path/to/proposed-migration.sql
#
# Needs initdb, pg_ctl and psql on PATH (brew install postgresql@16).
# Written for macOS's bash 3.2.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SUPA="$(cd "$HERE/../.." && pwd)"

candidates=()
while [ $# -gt 0 ]; do
  case "$1" in
    --candidate)
      [ $# -ge 2 ] || { echo "--candidate needs a file" >&2; exit 2; }
      candidates+=("$(cd "$(dirname "$2")" && pwd)/$(basename "$2")")
      shift 2 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

for bin in initdb pg_ctl psql; do
  command -v "$bin" >/dev/null || { echo "$bin not found. Install PostgreSQL (brew install postgresql@16)." >&2; exit 2; }
done

# The migrations have no timestamps, so their order is written down here.
# Files missing from this list still run, after it, alphabetically.
ORDER="
schema.sql
lti.sql
autolab.sql
storage.sql
migrations/add-instructor-accounts.sql
migrations/add-admins-and-course-instructors.sql
migrations/add-cogniterra-integration.sql
migrations/add-cogniterra-oauth-credentials.sql
migrations/add-course-import-lock.sql
migrations/add-email-signups.sql
migrations/add-lesson-category.sql
migrations/add-course-notes-block.sql
migrations/add-lesson-completions.sql
migrations/add-quiz-progress.sql
migrations/add-free-response-grading.sql
migrations/add-grading-feedback-rating.sql
migrations/add-show-reference-answers.sql
migrations/add-quiz-completion-threshold.sql
migrations/set-quiz-completion-threshold-default-80.sql
migrations/add-question-points.sql
migrations/add-question-variants.sql
migrations/add-quiz-question-types.sql
migrations/add-all-quiz-question-types.sql
migrations/remove-random-short-answer-matching.sql
migrations/remove-dictation.sql
migrations/remove-word-bank.sql
migrations/remove-complex-number-and-big-o.sql
migrations/remove-calculated-question-types.sql
migrations/remove-chemical-formula.sql
migrations/replace-stub-auth-policies.sql
migrations/server-side-learner-writes.sql
migrations/optimize-course-reads.sql
"

files=()
for rel in $ORDER; do
  [ -f "$SUPA/$rel" ] && files+=("$SUPA/$rel")
done
for f in "$SUPA"/migrations/*.sql; do
  rel="migrations/$(basename "$f")"
  case "$ORDER" in
    *"$rel"*) ;;
    *) echo "note: $rel is not in run.sh's ORDER list; applying it after the listed files" >&2
       files+=("$f") ;;
  esac
done
if [ ${#candidates[@]} -gt 0 ]; then files+=("${candidates[@]}"); fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/rls-test.XXXXXX")"
PORT="${RLS_TEST_PORT:-$(( 55000 + RANDOM % 5000 ))}"
cleanup() {
  pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

initdb -D "$TMP/data" -U postgres --auth=trust -E UTF8 >/dev/null
# TCP on localhost and no Unix socket: macOS caps socket paths at 103 bytes,
# which a long TMPDIR exceeds.
pg_ctl -D "$TMP/data" -o "-p $PORT -k '' -c listen_addresses=127.0.0.1" -l "$TMP/pg.log" -w start >/dev/null

run_sql() {
  psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"
}

apply() {
  if ! run_sql -f "$1" >/dev/null 2>"$TMP/err"; then
    echo "FAILED applying ${1#"$SUPA"/}:" >&2
    grep -v '^psql.*NOTICE' "$TMP/err" >&2
    exit 2
  fi
}

apply "$HERE/supabase-stub.sql"
for f in "${files[@]}"; do apply "$f"; done
apply "$HERE/fixtures.sql"

out="$(run_sql -tA -f "$HERE/checks.sql" 2>"$TMP/err")" || { cat "$TMP/err" >&2; exit 2; }
echo "$out"
pass="$(printf '%s\n' "$out" | grep -c '^PASS' || true)"
fail="$(printf '%s\n' "$out" | grep -c '^FAIL' || true)"
echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
