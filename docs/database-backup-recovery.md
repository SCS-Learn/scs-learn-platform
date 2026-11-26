# Supabase backup and recovery

Run a logical backup immediately before changing the database of a persistent environment. The migration job must stop on a nonzero exit or a missing backup ID. Preserve the ID in the release record so an operator can retrieve that exact snapshot. Keep the encrypted database copy in restricted S3 storage outside Supabase and outside deployment bundles, build artifacts, caches, and source control.

Release captures cover the database only. Storage object bytes, platform settings, and credentials are a separate recovery dependency with their own backup and evidence (see [Storage objects and platform settings](#storage-objects-and-platform-settings)).

## Configure the backup job

- Install Python 3.9 or newer, `age` and `age-keygen` (age 1.1 or newer), AWS CLI v2 with `s3api put-object --if-none-match`, and PostgreSQL clients. Use PostgreSQL 17 or newer when using the system CA trust store. The `pg_dump` major version must be at least the source server's major version. Use matching `pg_dump` and `pg_restore` clients. CI needs no PostgreSQL server binaries.
- Set `DEPLOY_ENV` and `EXPECTED_PROJECT_REF` from the protected deployment environment mapping. Set `DEPLOY_COMMIT` to the full SHA checked out for the release. Give `BACKUP_DATABASE_URL` the same connection string the migration job will use. Use the Supabase direct host (`db.<ref>.supabase.co`) with `postgres` or the shared session pooler (`<region-host>.pooler.supabase.com`) with `postgres.<ref>`, on port 5432 and database `postgres`. URL-encode special characters in the password. The query string is optional; its only accepted parameter is `sslmode` with `require`, `verify-ca`, or `verify-full`. Whatever the URL says, the backup connects with TLS `verify-full` against the system trust store. Set `BACKUP_DATABASE_SSL_ROOT_CERT` to a trusted CA bundle path if required by the project. Libpq routing overrides such as `PGHOSTADDR` and `PGSERVICE` are cleared.
- Set `BACKUP_S3_BUCKET` to a dedicated, private, general-purpose S3 bucket with a dot-free name in the recovery account. Set `BACKUP_S3_BUCKET_OWNER` to that account's 12-digit ID. Configure the bucket's AWS region and use a short-lived AWS role with `s3:GetBucketPublicAccessBlock` on the bucket and `s3:PutObject` and `s3:GetObject` only under `database-backups/<environment>/<ref>/`. The separate verifier role needs `s3:GetBucketPublicAccessBlock` and `s3:GetObject`. Set all four Block Public Access controls, use bucket-owner-enforced object ownership, deny requests without TLS, and restrict access in the bucket policy to the named backup and recovery roles. Use bucket versioning and a retention policy consistent with recovery and data retention requirements. Keep deletion and retention permissions outside CI. For write-once retention, configure S3 Object Lock under the recovery account.
- Set `BACKUP_AGE_RECIPIENT` to the recovery team's public X25519 age recipient. Keep its private identity in the independent recovery vault, grant it only to recovery operators, and test retrieval. Never give the recovery identity to CI, deployment secrets, or the capture runner: capture proves decryptability with its own one-time key instead. `decrypt` and `rehearse` refuse to run when `CI` or `GITHUB_ACTIONS` is set. Use a trusted ephemeral runner with private, encrypted scratch storage under `/tmp` for the brief plaintext capture. Plan scratch capacity for the dump archives, the package, its encrypted copy, and the decrypted readback. Rehearsal also needs space for expanded SQL and the temporary database.

## Capture and verify

```sh
backup_id=$(python3 scripts/db-backup.py capture \
  --environment "$DEPLOY_ENV" \
  --project-ref "$EXPECTED_PROJECT_REF" \
  --commit "$DEPLOY_COMMIT") || exit 1
[ -n "$backup_id" ] || exit 1
```

On success, stdout contains one `s3://<bucket>/database-backups/<environment>/<ref>/<timestamp>-<uuid>-<ciphertext-sha256>.age` line. Capture emits that receipt only after all of these pass against the stored object:

1. The bucket has the expected owner and all four public-access blocks.
2. `age-keygen` creates a one-time X25519 identity in a `0700` subdirectory of the private scratch directory. The package is encrypted to the recovery recipient and that one-time recipient.
3. The ciphertext is uploaded with an S3 SHA-256 checksum and a create-only condition, then downloaded in full. Its SHA-256 must equal the digest in the receipt.
4. The downloaded age header must have exactly two X25519 recipient stanzas.
5. The downloaded copy is decrypted with the one-time identity. The tar must contain exactly `manifest.json`, `application.dump`, and `managed.dump` as regular files. The manifest must equal the one written at capture, and each archive must match its manifest SHA-256.
6. `pg_restore --list` reads each archive index, and `pg_restore --file /dev/null` generates the full SQL stream for each archive. Archives are written with zlib compression, so this decompresses and checksums every table data block. It rejects truncated, damaged, or non-PostgreSQL archives that `--list` alone accepts. The managed archive must contain every recorded managed policy and trigger.
7. The one-time identity and all plaintext are deleted. The receipt is printed last.

The one-time identity never leaves the runner's scratch directory and is destroyed before the receipt exists. It adds no exposure beyond the plaintext dumps already in that scratch during capture. After capture, only the recovery identity can decrypt the object. Without that identity, capture cannot prove the recovery stanza opens. The header check limits recipients to the configured pair, and the operator drills below prove the recovery stanza.

Any failure exits nonzero with no stdout, so the release job has no receipt and does not migrate. A failure after upload can leave an encrypted object without a receipt. Retention may clean it up. The upload limit is 5 GB of ciphertext. Preserve the verified ID before starting migrations. Serialize migration jobs for each project so a second release cannot change the schema during capture or application.

```sh
python3 scripts/db-backup.py verify \
  --environment "$DEPLOY_ENV" \
  --project-ref "$EXPECTED_PROJECT_REF" \
  --backup-id "$backup_id"
```

`verify` repeats the bucket and full ciphertext checks and prints the ID only on success. It needs AWS read access and no key. Use the receipt from the trusted release record as the expected ID.

The encrypted manifest records the environment, validated project reference, checkout SHA, UTC snapshot time, PostgreSQL version, archive hashes, migration versions and a digest of the full migration-history rows, and selected table counts. A PostgreSQL repeatable-read transaction exports one snapshot for those queries and both `pg_dump` processes. The application archive captures `public`, `private` when present, and the `supabase_migrations` schema when present. A project without `supabase_migrations.schema_migrations` is recorded as having no history table. The managed archive captures Auth and Storage schema definitions and database rows, including users, identities, buckets, and object metadata. Managed service migration marker rows and the two Storage vector control tables' rows are left to the target platform. PostgreSQL sequences are nontransactional and can advance past the last captured row under concurrent writes. [PostgreSQL pg_dump documentation](https://www.postgresql.org/docs/17/app-pgdump.html)

## Decrypt as a recovery operator

Run recovery commands on an operator workstation or a dedicated recovery runner. Keep the recovery identity on that machine only for the session. Use private, encrypted storage for the output, and delete the plaintext when the work is recorded. The decrypted output contains Auth users, identities, and other personal data.

```sh
python3 scripts/db-backup.py decrypt \
  --environment "$DEPLOY_ENV" \
  --project-ref "$EXPECTED_PROJECT_REF" \
  --backup-id "$backup_id" \
  --identity-file "$RECOVERY_AGE_IDENTITY" \
  --output-dir "$RESTORE_DIR"
```

`decrypt` downloads and hash-checks the object, then decrypts it with the recovery identity. It runs the same tar, manifest, checksum, and `pg_restore` checks as capture. Then it creates `$RESTORE_DIR` with mode `0700`. That directory gets `manifest.json`, both archives, and the ordered restore SQL (`1-application-pre.sql` to `5-managed-custom.sql`). The command prints the backup ID, release SHA, and capture time as JSON. Add `--encrypted-file <path>` to use a copy you already retrieved, such as one from a replica bucket or from the S3 console. The copy must still match the digest in `--backup-id`, and S3 settings are not needed.

### Script-independent check

Use this procedure when the repository script is unavailable or must be cross-checked. It uses only AWS CLI, `shasum`, `age`, `tar`, Python, and `pg_restore`. It stops at the first mismatch. Set `BACKUP_ID`, `BACKUP_S3_BUCKET_OWNER`, `RECOVERY_AGE_IDENTITY`, and a new `RECOVERY_DIR`, and use recovery-account AWS read credentials.

<!-- tested: operator-decrypt -->
```sh
set -eu
umask 077
mkdir "$RECOVERY_DIR"
cd "$RECOVERY_DIR"
bucket=${BACKUP_ID#s3://}; bucket=${bucket%%/*}
key=${BACKUP_ID#"s3://$bucket/"}
digest=${key##*-}; digest=${digest%.age}
aws s3api get-object --bucket "$bucket" --key "$key" \
  --expected-bucket-owner "$BACKUP_S3_BUCKET_OWNER" backup.age >/dev/null
[ "$(shasum -a 256 backup.age | cut -d ' ' -f 1)" = "$digest" ]
age --decrypt --identity "$RECOVERY_AGE_IDENTITY" --output backup.tar backup.age
[ "$(tar -tf backup.tar | LC_ALL=C sort | tr '\n' ' ')" = "application.dump managed.dump manifest.json " ]
tar -xf backup.tar application.dump managed.dump manifest.json
rm backup.tar
for name in manifest.json application.dump managed.dump; do
  [ -f "$name" ] && [ ! -L "$name" ]
done
python3 -I - "$BACKUP_ID" <<'EOF'
import hashlib, json, sys
manifest = json.load(open("manifest.json"))
*_, environment, ref, name = sys.argv[1].split("/")
assert (manifest["environment"], manifest["project_ref"]) == (environment, ref), "wrong project"
assert name.startswith(manifest["capture_id"] + "-"), "wrong capture"
assert sorted(manifest["archives"]) == ["application.dump", "managed.dump"], "wrong archives"
for archive, digest in manifest["archives"].items():
    sha256 = hashlib.sha256()
    with open(archive, "rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            sha256.update(block)
    assert sha256.hexdigest() == digest, archive
print(manifest["commit"], manifest["captured_at"], manifest["migration_versions"][-1:])
EOF
for name in application.dump managed.dump; do
  pg_restore --list "$name" >/dev/null
  pg_restore --file /dev/null "$name"
done
```

The last lines of output give the release SHA, the snapshot time, and the newest recorded migration. Compare them with the release record. Then inspect `pg_restore --list` before selecting objects by hand. The ordered SQL from `decrypt` is the reviewed default.

## Restore into a bootstrapped target

A target is bootstrapped when it already has the platform's Auth and Storage schemas and service migration markers, the API roles, required extensions, and an empty `public` schema. A new Supabase project has this. A disposable local cluster needs bootstrap SQL (see [Validate recovery with real data](#validate-recovery-with-real-data)). Do not run the release migrations first. The archives contain the application schema and migration history.

Apply the `decrypt` output in one transaction. Data is loaded with triggers disabled, then constraints, policies, and managed custom objects are created. Then run the recovery checks read-only. The `--dbname` URL may point at a disposable local socket or a separately authorized recovery project. Never point it at a live source project.

<!-- tested: operator-restore -->
```sh
set -eu
cd "$RESTORE_DIR"
psql -X --set ON_ERROR_STOP=1 --dbname "$RECOVERY_DATABASE_URL" --single-transaction \
  --file 1-application-pre.sql \
  --command 'SET LOCAL session_replication_role = replica' \
  --file 2-managed-data.sql \
  --file 3-application-data.sql \
  --command 'SET LOCAL session_replication_role = origin' \
  --file 4-application-post.sql \
  --file 5-managed-custom.sql
psql -X --set ON_ERROR_STOP=1 --dbname "$RECOVERY_DATABASE_URL" --single-transaction \
  --command 'SET TRANSACTION READ ONLY' --file "$RECOVERY_CHECKS_SQL"
```

The destination owner is the connecting role. Application ACLs are applied using roles from the bootstrap. Managed policies on Auth, on Storage buckets and objects, and managed-schema triggers whose functions are in `public` or `private` are restored. Review other managed-schema customizations separately using the archived managed DDL and the release migrations. [Supabase backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

## Rehearse in isolation

`rehearse` runs the same decryption and the same ordered restore against a fresh socket-only PostgreSQL cluster. The cluster lives under a private temporary directory, accepts no TCP connections, and is destroyed on exit. It needs matching PostgreSQL server and client tools (`initdb`, `pg_ctl`, `psql`, `pg_restore`). After loading, it compares migration history and table counts to the manifest. Then it runs the assertion SQL read-only. The assertions must raise SQL errors on mismatch.

```sh
python3 scripts/db-backup.py rehearse \
  --environment "$DEPLOY_ENV" \
  --project-ref "$EXPECTED_PROJECT_REF" \
  --backup-id "$backup_id" \
  --identity-file "$RECOVERY_AGE_IDENTITY" \
  --bootstrap-sql "$RECOVERY_BOOTSTRAP_SQL" \
  --checks-sql "$RECOVERY_CHECKS_SQL"
```

Both `rehearse` and `decrypt` accept `--encrypted-file`. Neither runs in CI, because both need the recovery identity. Schedule an operator rehearsal on a regular cadence and after recovery-key rotation. A rehearsal proves that the recovery stanza of a real receipt opens.

## Validate recovery with real data

Use these steps for any real receipt. They need an operator authorized for that data and private scratch. Restore only to a disposable local cluster or a separately authorized recovery project.

1. **Select the receipt.** Take the backup ID from the trusted release record. Record the operator, machine, tool versions (`age --version`, `pg_restore --version`, `aws --version`), and start time.
2. **Prepare the bootstrap SQL.** The synthetic `supabase/tests/backup/platform.sql` is a test stand-in and is not valid for real data. Generate bootstrap SQL from an empty project on the source platform version. For example, start an empty local stack with the Supabase CLI version used for releases. Dump the roles without passwords (`pg_dumpall --roles-only --no-role-passwords`), then dump the `auth`, `storage`, and extension schemas with `pg_dump --schema-only`. Add the service migration marker rows with `pg_dump --data-only --table=auth.schema_migrations --table=storage.migrations`. Review the result. Do not add the application migrations. This step has not been run against a hosted project from this repository.
3. **Choose the checks.** Use `supabase/tests/backup/recovery-checks.sql` for any restore of this project. It checks every foreign key in `public`, `private`, `auth`, `storage`, and `supabase_migrations` for orphans. Auth and Storage keys need this because data is loaded with triggers disabled. It also checks that every `public` table has RLS enabled and that no owned sequence is behind its column. Add project-specific assertions in a separate file that begins with `\ir recovery-checks.sql`. Cover known course and lesson IDs, a known learner's identities and activity, instructor ownership links, `lesson-media` object names, and RLS results under `anon` and `authenticated` role claims. Assertions must report object names only, never row values.
4. **Rehearse.** Run `rehearse` with the receipt, the bootstrap SQL, and the checks. Record the JSON output, the elapsed time, and the scratch size used. For a hosted drill, run `decrypt` and the [bootstrapped-target restore](#restore-into-a-bootstrapped-target) against a separately authorized empty project instead.
5. **Compare.** The JSON reports migration versions, the history digest, and row counts that already match the manifest. Compare the newest migration with the release's migration chain. Compare row counts with the source at the snapshot time, if you have that evidence.
6. **Clean up and record.** Delete the decrypted directory and any disposable project. Record the backup ID, release SHA, capture time, restore time, check results, and any gaps with the release or incident.

## Storage objects and platform settings

The maintainers chose a separate, verified object backup and restore process. Release captures stay database-only. The database archive holds Storage bucket and object metadata (`storage.buckets`, `storage.objects`) but no object bytes. Until the object backup has a verified backup and restore record, a database restore cannot bring back lesson attachments or other files. Successful object backup and restoration evidence is a rollout requirement.

The object backup needs its own operator checklist and evidence:

- [ ] **Independent copy.** Copy object bytes for every bucket, including the public `lesson-media` bucket, out of Supabase. Write them to a separate account or bucket with its own credentials, using the Storage API or S3-compatible transfer. Use a read-only Supabase Storage credential for the transfer. Keep it in the recovery vault, not in release CI. Write with a role that cannot delete or shorten retention. [Supabase Storage transfer guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore#migrating-storage-objects)
- [ ] **Inventory.** Record a manifest for each object backup run: bucket, object name, size, SHA-256 of the bytes, content type, Supabase object ID and `updated_at`, the run start and end times, and the destination object version ID. Store the manifest with the copy and record its own SHA-256 in the release or operations record.
- [ ] **Secured retention.** Use a private bucket with all four public-access blocks, versioning, encryption at rest, and TLS-only access. Use S3 Object Lock or an equivalent write-once retention for at least as long as the matching database receipts are kept. Deletion and retention changes must need a separate role. Encrypt client-side to the recovery age recipient if object contents are as sensitive as the database.
- [ ] **Verification.** After each run, download a sample (and periodically all) objects and compare size and SHA-256 with the inventory. Confirm that the newest retained object version is the one in the inventory.
- [ ] **Timestamps.** Database and object captures happen at different times. Record both. During recovery, reconcile `storage.objects` rows from the database snapshot with the object inventory. List rows without bytes, and bytes without rows, created between the two captures. Decide each before cutover.
- [ ] **Restore drill.** Restore objects into a disposable project or bucket under the same bucket and key names, then download representative files. Combine this with a database rehearsal to show that metadata and bytes agree.
- [ ] **Credentials and settings.** Recreate Auth settings, signing keys, provider credentials, redirects, SMTP configuration, Storage settings, API keys, network settings, project integrations, Edge Functions and secrets, and application deployment configuration from their independent records. Restore any external extension state separately. Follow Supabase's separate root-key recovery procedure when the source uses Vault or pgsodium, and coordinate access before retiring the source. Rotate credentials that the snapshot or old project exposed. [Supabase backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

For a project restore, also provision the recovery project with compatible PostgreSQL, Auth, and Storage versions and required extensions. Restore custom role definitions, memberships, grants, and intended ownership. Rotate and assign login passwords from the recovery vault. Review Auth and Storage custom SQL and Realtime publications before enabling traffic.

## Choose the recovery action after a failed migration

Record the failing release and query the actual migration history and schema before changing anything. Determine which SQL committed and whether users or jobs wrote to the database or Storage after the backup. Limit further affected writes, preserve a recovery point for the current state, and retain a list of changes that need reconciliation. If the failure was entirely transactional, confirm that state before deciding whether to retry. Test the chosen corrective step with a restored copy.

| Action | Use when | Preserve later activity |
| --- | --- | --- |
| Forward fix | The database and migration history are identifiable and a new reviewed migration can safely repair the schema or data. | Confirm compatibility with the running application, verify the intended end state, and retain all unaffected rows and objects. |
| Partial recovery | Damage is limited to identifiable rows or objects and dependency-safe reconstruction is possible. | Restore to an isolated target, compare stable keys and timestamps against the current state, and merge only approved rows or object versions. Preserve newer valid writes and record any conflicts. Change migration history only under a separately reviewed repair. |
| Full recovery | Damage is widespread or the previous schema and data cannot be repaired safely in place. | Restore into a separate project, compare the logical snapshot with supported point-in-time recovery options, and replay or merge recoverable writes and Storage changes. Quantify and approve any loss before switching traffic. Validate history, Auth, RLS, Storage, and application behavior before cutover. |

Keep the affected project and the backup available through reconciliation. Record the actual recovery point, replayed writes, and gaps, then resume traffic after validating the chosen target.

## Tests

`python3 -B supabase/tests/backup/test_backup.py` runs locally with the real PostgreSQL, `age`, `age-keygen`, and AWS CLI tools. It uses a synthetic Supabase-shaped platform fixture and a loopback S3 fixture, and makes no hosted calls. It covers these cases:

- capture, verify, decrypt, and rehearse, with concurrent source writes that must be absent from the restore;
- a first release without migration history;
- failed dump, refused upload, failed readback, corrupted readback, and a public bucket;
- truncated or invalid dumps, a ciphertext without the one-time recipient, and a ciphertext the one-time key cannot open, all after upload. None of these may produce a receipt.
- the script `decrypt` from S3 and from `--encrypted-file`, with a tampered copy, the wrong identity, an existing output directory, and a CI environment;
- the two shell blocks above, run as written, into a separately bootstrapped disposable cluster;
- `recovery-checks.sql` rejecting orphaned Auth rows;
- database URL validation with and without a query string.
