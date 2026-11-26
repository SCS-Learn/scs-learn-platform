#!/usr/bin/env bash
# Local RLS regression check. Never touches the hosted Supabase project.
#
# Starts a throwaway Postgres with local Auth/Storage stand-ins, replays the
# canonical chain with the Supabase CLI, verifies migration history and runs
# the RLS checks. Candidate SQL runs after the tracked migrations.
#
# Usage:
#   supabase/tests/rls/run.sh
#   supabase/tests/rls/run.sh --candidate path/to/proposed-migration.sql
#
# Needs supabase, initdb, pg_ctl and psql on PATH.
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

for bin in supabase initdb pg_ctl psql; do
  command -v "$bin" >/dev/null || { echo "$bin not found. See supabase/README.md for prerequisites." >&2; exit 2; }
done

TMP="$(mktemp -d "${TMPDIR:-/tmp}/rls-test.XXXXXX")"
PORT="${RLS_TEST_PORT:-$(( 55000 + RANDOM % 5000 ))}"
cleanup() {
  pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

# Give the CLI a fresh project directory so it cannot use this repo's link state.
export LC_ALL=C
PROJECT="$TMP/project"
mkdir -p "$PROJECT/supabase/migrations"
cp "$SUPA/config.toml" "$PROJECT/supabase/"
previous_version=
for migration in "$SUPA"/migrations/*.sql; do
  filename="${migration##*/}"
  if [[ ! "$filename" =~ ^([0-9]{14})_[a-z0-9_]+\.sql$ ]]; then
    echo "Invalid migration filename: $filename" >&2
    exit 2
  fi
  version="${BASH_REMATCH[1]}"
  if [ "$previous_version" = "$version" ]; then
    echo "Duplicate migration version: $version" >&2
    exit 2
  fi
  previous_version="$version"
  printf '%s\n' "$version" >> "$TMP/expected-versions"
  cp "$migration" "$PROJECT/supabase/migrations/"
done

initdb -D "$TMP/data" -U postgres --auth=trust -E UTF8 >/dev/null
# TCP on localhost and no Unix socket: macOS caps socket paths at 103 bytes,
# which a long TMPDIR exceeds.
pg_ctl -D "$TMP/data" -o "-p $PORT -k '' -c listen_addresses=127.0.0.1" -l "$TMP/pg.log" -w start >/dev/null

DB_URL="postgresql://postgres@127.0.0.1:$PORT/postgres?sslmode=disable"
run_sql() {
  psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"
}

apply() {
  if ! run_sql -f "$1" >/dev/null 2>"$TMP/err"; then
    echo "FAILED applying ${1#"$SUPA"/}:" >&2
    grep -v '^psql.*NOTICE' "$TMP/err" >&2
    exit 2
  fi
}

verify_versions() {
  run_sql -tA -c 'select version from supabase_migrations.schema_migrations order by version' > "$TMP/applied-versions"
  diff -u "$TMP/expected-versions" "$TMP/applied-versions"
}

apply "$HERE/supabase-stub.sql"
supabase migration up --db-url "$DB_URL" --workdir "$PROJECT"
verify_versions
apply "$HERE/fresh.sql"
supabase migration up --db-url "$DB_URL" --workdir "$PROJECT"
verify_versions
echo "Canonical migration history matches; second pass has zero pending migrations."

if [ ${#candidates[@]} -gt 0 ]; then
  for candidate in "${candidates[@]}"; do apply "$candidate"; done
fi
apply "$HERE/fixtures.sql"

out="$(run_sql -tA -f "$HERE/checks.sql" 2>"$TMP/err")" || { cat "$TMP/err" >&2; exit 2; }
echo "$out"
pass="$(printf '%s\n' "$out" | grep -c '^PASS' || true)"
fail="$(printf '%s\n' "$out" | grep -c '^FAIL' || true)"
echo
echo "$pass passed, $fail failed"
[ "$pass" -gt 0 ] && [ "$fail" -eq 0 ]
