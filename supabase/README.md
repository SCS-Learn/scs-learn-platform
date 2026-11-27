# Database migrations

`supabase/migrations/` is the deployable chain. It starts with
[`20261126000000_baseline.sql`](migrations/20261126000000_baseline.sql), the application
schema and access model at `bbc5031`. Supabase provisions the Auth and
Storage schemas and API roles before it runs this migration. Add changes in
new files named `YYYYMMDDHHMMSS_description.sql` and keep applied versions
immutable.

The baseline defines 30 application tables, constraints and indexes, API
grants, RLS, the private policy helpers, the catalog and activity RPCs, and
the public `lesson-media` bucket with instructor-only object operations. It
includes quiz grading and progress, instructor and admin records, Google and
Cogniterra OAuth tables, LTI 1.1 and 1.3, Autolab, and email capture. There
are no application-defined triggers in the legacy chain at this revision.
The migration creates no user, instructor, admin, demo course, credential,
or learner data. First-admin provisioning is an environment-specific
operation through the maintainer's privileged database access.

## Local replay and RLS

From the repository root, run the RLS harness with a Supabase CLI and
`initdb`, `pg_ctl` and `psql` on PATH. PostgreSQL 17 matches the local stack
configuration. The server also needs the pgvector extension, because
`20261126014818_add_lesson_embeddings.sql` creates `vector` (for example
Homebrew's `pgvector`, or run the harness inside the `pgvector/pgvector:pg17`
image as the `postgres` user).

```sh
bash supabase/tests/rls/run.sh

# Use the verified CLI version without installing a repo dependency.
npm exec --yes --package=supabase@2.117.0 -- bash supabase/tests/rls/run.sh

# Preview a SQL change after the tracked migrations.
bash supabase/tests/rls/run.sh --candidate path/to/proposed-migration.sql
```

The harness creates its own temporary project and PostgreSQL cluster on
loopback. It installs Auth and Storage SQL stand-ins, uses `supabase migration up`
to replay the chain, compares the recorded migration versions to the files,
then repeats migration application against the same database. It checks that
the fresh database contains the bucket and no bootstrap identities or course
rows before loading its own fixtures. The role checks exercise PostgreSQL
grants, policies and RPCs. To exercise the full Supabase services, use a
Docker-compatible runtime and the local stack.

```sh
supabase start
supabase db reset --local --no-seed
supabase migration up --local
supabase migration list --local
```

The reset discards the local stack database. The second migration command
should report zero applied versions. The active stack prints its local
connection details with `supabase status`.

## Optional local demo data

Run these files only against a disposable local database after replay.
`demo-course.sql` adds slides, an in-app quiz and placeholder Autolab
assessment metadata. `dummy-courses.sql` adds 25 courses under the demo
instructor for import testing. Reapplying either seed does not duplicate
rows. Demo sign-in uses a real local Auth user you provision and link to the
demo instructor as needed.

```sh
psql "$LOCAL_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/seeds/demo-course.sql
psql "$LOCAL_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/seeds/dummy-courses.sql
```

## Read-only production parity before baseline adoption

1. Check out the exact commit under review. Use a freshly migrated local
   Supabase stack with seeding disabled. Use `pg_dump` and `psql` clients at
   least as new as both servers, and use the same client versions for both
   snapshots. Define two libpq services, one for local and one for
   production review, with passwords supplied through the maintainer's
   private credential store. Prefer a read-only review account that can
   dump the two application schemas and read the relevant Storage and
   history metadata.
2. Capture both through the read-only snapshot script. It writes schema
   definitions including grants, defaults, RLS and triggers, relevant
   Storage and extension metadata, and a separate migration history
   report. It does not select Auth users, lessons, scores, secrets from
   credential tables, or Storage object paths. Keep the snapshots private
   because schema definitions and migration metadata can be sensitive.

   ```sh
   bash supabase/parity/snapshot.sh 'service=scs-local-review' /tmp/scs-local-parity
   bash supabase/parity/snapshot.sh 'service=scs-prod-review' /tmp/scs-prod-parity
   diff -u /tmp/scs-local-parity/schema.sql /tmp/scs-prod-parity/schema.sql
   diff -u /tmp/scs-local-parity/platform.jsonl /tmp/scs-prod-parity/platform.jsonl
   diff -u /tmp/scs-local-parity/history.jsonl /tmp/scs-prod-parity/history.jsonl
   ```

3. Review each difference. Compare table columns, constraints, indexes,
   defaults and ACLs, function signatures and security modes, triggers on
   application tables and Auth/Storage hooks, effective API permissions,
   policies and the bucket's configuration. Record platform-managed
   differences with their scope and rationale. Reconcile application drift
   with explicit, reviewed migrations before repairing history. Test each
   reconciliation against both a production-like restored database and a
   fresh replay. Historical transforms involving existing rows (owner staff
   memberships, question points and renamed question types) need their own
   invariant checks and an explicit backfill migration if any conversion is
   missing. Bootstrap and demo rows are data and do not establish schema
   parity.
4. Compare local filenames to database history separately. A missing
   history table, a missing version, a version recorded only in
   production, and a matching version with different stored SQL metadata
   all deserve review. The report prints a digest of stored SQL statements
   without exporting statement text. A CLI history repair can record a
   version without stored SQL. The record does not prove the schema matches.
   If local contains later feature migrations, compare the production
   snapshot to a local replay through the version being adopted and track
   new features as pending.
5. Once parity is confirmed and the maintainer has approved the exact
   history change, the maintainer may mark the verified baseline version
   `20261126000000` applied through Supabase CLI `migration repair --status
   applied`. This is a separate write operation on an explicitly selected
   project. Preserve and review any production-only history records before
   authorizing edits. Re-snapshot history and confirm the baseline appears
   once and later versions are still pending. On a database with the legacy
   schema, use this adoption procedure before running the deployment chain.

See the [Supabase CLI migration reference](https://supabase.com/docs/reference/cli/supabase-migration-list).

## Legacy SQL inventory

[`archive/legacy/`](archive/legacy/) preserves the SQL from `bbc5031`. Its
bootstrap and standalone files drop tables and contain sample data or early
permissive policies. Use the archive as historical reference. The
[legacy inventory](archive/legacy/README.md) records the old RLS runner order.
