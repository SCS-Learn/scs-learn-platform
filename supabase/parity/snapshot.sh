#!/usr/bin/env bash
# Capture schema, platform metadata and history over a read-only connection.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: bash supabase/parity/snapshot.sh CONNINFO OUTPUT_DIRECTORY" >&2
  exit 2
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
umask 077
TMP="$(mktemp -d "${TMPDIR:-/tmp}/scs-db-parity.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
export LC_ALL=C
export PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c default_transaction_read_only=on"

pg_dump --dbname="$1" --schema-only --schema=public --schema=private > "$TMP/schema.raw"
sed -E '/^\\(un)?restrict /d; /^-- Dumped (from database|by pg_dump) version /d' \
  "$TMP/schema.raw" > "$TMP/schema.sql"

psql --dbname="$1" -X -qAt -v ON_ERROR_STOP=1 -f "$HERE/platform.sql" > "$TMP/platform.jsonl"
psql --dbname="$1" -X -qAt -v ON_ERROR_STOP=1 -f "$HERE/history.sql" > "$TMP/history.jsonl"

mkdir "$2"
mv "$TMP/schema.sql" "$TMP/platform.jsonl" "$TMP/history.jsonl" "$2"
