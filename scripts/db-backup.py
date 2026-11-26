#!/usr/bin/env python3
"""Capture and verify release backups, decrypt them for operators, and restore into a temporary Postgres cluster."""

import argparse
import base64
from contextlib import contextmanager
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
from urllib.parse import parse_qsl, unquote, urlsplit
import uuid


ROOT = Path(__file__).resolve().parents[1]
PROJECT_REF = re.compile(r"[a-z0-9]{20}")
ENVIRONMENT = re.compile(r"[a-z][a-z0-9-]{0,31}")
SHA256 = re.compile(r"[a-f0-9]{64}")
AGE_RECIPIENT = re.compile(r"age1[023456789acdefghjklmnpqrstuvwxyz]{58}")
BACKUP_ID = re.compile(
    r"s3://([a-z0-9][a-z0-9-]{1,61}[a-z0-9])/database-backups/([a-z0-9-]+)/([a-z0-9]+)/"
    r"(\d{8}T\d{12}Z-[a-f0-9]{32})-([a-f0-9]{64})\.age"
)
ARCHIVES = ("application.dump", "managed.dump")
METADATA = "manifest.json"
MANAGED_SKIP_DATA = (
    "auth.schema_migrations", "storage.migrations", "storage.buckets_vectors", "storage.vector_indexes"
)
MANAGED_CHECK_TABLES = ("auth.users", "auth.identities", "storage.buckets", "storage.objects")
APP_CHECK_TABLES = ("public.courses", "public.quiz_submissions", "public.lesson_completions")
HISTORY_TABLE = "supabase_migrations.schema_migrations"
MARKER = "__scs_backup_query_complete__"
RESTORE_FILES = (
    "1-application-pre.sql", "2-managed-data.sql", "3-application-data.sql",
    "4-application-post.sql", "5-managed-custom.sql",
)


class BackupError(Exception):
    pass


def required_env(name):
    value = os.environ.get(name)
    if not value:
        raise BackupError(f"Set {name} before running this command.")
    return value


def process_env():
    return {key: value for key, value in os.environ.items()
            if not key.startswith(("PG", "BACKUP_"))}


def run(command, stage, *, env=None, capture=False):
    try:
        return subprocess.run(
            command, check=True, stdin=subprocess.DEVNULL, stderr=subprocess.PIPE,
            stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
            text=True, encoding="utf-8", env=process_env() if env is None else env,
        ).stdout
    except FileNotFoundError:
        raise BackupError(f"{stage} failed. Install {command[0]} and put it on PATH.") from None
    except subprocess.CalledProcessError as error:
        # Child diagnostics can include credentials, SQL and customer data.
        raise BackupError(f"{stage} failed ({command[0]} exit {error.returncode}).") from None


def file_digest(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for data in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(data)
    return digest.hexdigest()


class Database:
    def __init__(self, settings):
        self.env = {key: value for key, value in process_env().items() if not key.startswith("AWS_")}
        self.env.update(PGCLIENTENCODING="UTF8", PGCONNECT_TIMEOUT="10", **settings)

    @classmethod
    def supabase(cls, url, project_ref):
        try:
            if any(ord(char) < 32 or ord(char) == 127 for char in url):
                raise ValueError
            parsed = urlsplit(url)
            # parse_qsl rejects an empty query in strict mode; a URL without parameters is valid.
            options = parse_qsl(parsed.query, keep_blank_values=True, strict_parsing=True) if parsed.query else []
            user = unquote(parsed.username or "", errors="strict")
            password = unquote(parsed.password or "", errors="strict")
            host = parsed.hostname or ""
            valid_direct = host == f"db.{project_ref}.supabase.co" and user == "postgres"
            valid_pooler = (
                re.fullmatch(r"[a-z0-9-]+\.pooler\.supabase\.com", host)
                and user == f"postgres.{project_ref}"
            )
            if (
                not PROJECT_REF.fullmatch(project_ref) or not (valid_direct or valid_pooler)
                or parsed.scheme not in ("postgresql", "postgres") or parsed.port not in (None, 5432)
                or parsed.path != "/postgres" or "#" in url or not password or "\x00" in password
                or len(options) > 1
                or any(key != "sslmode" or value not in ("require", "verify-ca", "verify-full")
                       for key, value in options)
            ):
                raise ValueError
        except ValueError:
            raise BackupError("Database URL does not identify the expected Supabase project and session endpoint.") from None
        return cls(dict(
            PGHOST=host, PGPORT="5432", PGDATABASE="postgres", PGUSER=user, PGPASSWORD=password,
            PGSSLMODE="verify-full", PGSSLROOTCERT=os.environ.get("BACKUP_DATABASE_SSL_ROOT_CERT", "system"),
            PGGSSENCMODE="disable",
        ))

    def psql(self, args, stage):
        return run(["psql", "-XqAw", "-v", "ON_ERROR_STOP=1", *args], stage, env=self.env, capture=True)

    @contextmanager
    def session(self):
        try:
            process = subprocess.Popen(
                ["psql", "-XqAtw", "-v", "ON_ERROR_STOP=1"], stdin=subprocess.PIPE,
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=self.env, text=True, encoding="utf-8",
            )
        except FileNotFoundError:
            raise BackupError("Install psql and put it on PATH.") from None

        def query(sql):
            try:
                process.stdin.write(sql + f"\n\\echo {MARKER}\n")
                process.stdin.flush()
            except BrokenPipeError:
                raise BackupError("PostgreSQL snapshot or inspection query failed.") from None
            rows = []
            for line in process.stdout:
                line = line.rstrip("\n")
                if line == MARKER:
                    return rows
                rows.append(line)
            raise BackupError("PostgreSQL snapshot or inspection query failed.")

        try:
            yield query
        finally:
            if process.poll() is None:
                process.terminate()
            process.wait()
            process.stdin.close()
            process.stdout.close()

    def dump(self, snapshot, schemas, path, exclude_data=()):
        run([
            # zlib blocks carry checksums, so a full pg_restore read detects damaged table data.
            "pg_dump", "--no-password", "--format=custom", "--compress=6", "--strict-names",
            "--lock-wait-timeout=30s", "--snapshot", snapshot, "--file", str(path),
            *(f"--schema={schema}" for schema in schemas),
            *(f"--exclude-table-data={table}" for table in exclude_data),
        ], f"Capture {path.name}", env=self.env)


def inspect_database(query):
    versions = None
    history_digest = None
    if query(f"SELECT to_regclass('{HISTORY_TABLE}') IS NOT NULL;") == ["t"]:
        (history_json,) = query(f"""
            SELECT json_build_object(
                'versions', COALESCE(json_agg(version ORDER BY version COLLATE "C"), '[]'::json),
                'sha256', encode(sha256(convert_to(COALESCE(string_agg(
                    to_jsonb(history)::text, chr(10) ORDER BY version COLLATE "C"
                ), ''), 'UTF8')), 'hex')
            ) FROM {HISTORY_TABLE} AS history;
        """)
        history = json.loads(history_json)
        versions, history_digest = history["versions"], history["sha256"]
        if any(not isinstance(version, str) or not re.fullmatch(r"[0-9]+", version) for version in versions):
            raise BackupError("Unexpected version format in Supabase migration history.")

    counts = {}
    for name in (*MANAGED_CHECK_TABLES, *APP_CHECK_TABLES):
        exists = query(f"SELECT to_regclass('{name}') IS NOT NULL;") == ["t"]
        if not exists and name in MANAGED_CHECK_TABLES:
            raise BackupError(f"Required Supabase table {name} is missing.")
        if exists:
            (count,) = query(f"SELECT count(*) FROM {name};")
            counts[name] = int(count)
    return {
        "migration_history_present": versions is not None, "migration_versions": versions or [],
        "migration_history_sha256": history_digest, "row_counts": counts,
    }


def capture_snapshot(database, directory):
    with database.session() as query:
        query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL row_security = off; "
              "SET LOCAL search_path = pg_catalog; SET LOCAL TIME ZONE 'UTC';")
        (snapshot_json,) = query("""
            SELECT json_build_object(
                'snapshot', pg_export_snapshot(),
                'captured_at', to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
                'postgres_version', current_setting('server_version_num')::int);
        """)
        details = json.loads(snapshot_json)
        snapshot = details.pop("snapshot")
        details.update(inspect_database(query))
        schemas = query("""
            SELECT nspname FROM pg_namespace WHERE nspname IN ('public', 'private', 'supabase_migrations')
            ORDER BY nspname;
        """)
        if "public" not in schemas:
            raise BackupError("Required Supabase application schema public is missing.")
        objects = query("""
            SELECT 'pg_policy'::regclass::oid || ' ' || p.oid
              FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'auth' OR (n.nspname = 'storage' AND c.relname IN ('buckets', 'objects'))
            UNION ALL
            SELECT 'pg_trigger'::regclass::oid || ' ' || t.oid
              FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
              JOIN pg_proc f ON f.oid = t.tgfoid JOIN pg_namespace fn ON fn.oid = f.pronamespace
              WHERE n.nspname IN ('auth', 'storage') AND fn.nspname IN ('public', 'private')
                AND NOT t.tgisinternal;
        """)
        details["managed_custom_objects"] = sorted(objects)
        database.dump(snapshot, schemas, directory / ARCHIVES[0])
        database.dump(snapshot, ("auth", "storage"), directory / ARCHIVES[1], MANAGED_SKIP_DATA)
        return details


def parse_backup_id(backup_id, environment, project_ref, bucket=None):
    match = BACKUP_ID.fullmatch(backup_id)
    if not match or (match[2], match[3]) != (environment, project_ref) or bucket not in (None, match[1]):
        raise BackupError("Backup ID is outside the configured environment and project prefix or has an invalid format.")
    return match[4], match[5]


def require_ciphertext_digest(path, digest):
    if file_digest(path) != digest:
        raise BackupError("Downloaded backup checksum differs from the backup ID.")


class BackupStore:
    def __init__(self, environment, project_ref):
        self.environment, self.project_ref = environment, project_ref
        self.bucket = required_env("BACKUP_S3_BUCKET")
        self.owner = required_env("BACKUP_S3_BUCKET_OWNER")
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", self.bucket) or not re.fullmatch(r"[0-9]{12}", self.owner):
            raise BackupError("Invalid S3 bucket name or expected bucket owner.")
        self.key_prefix = f"database-backups/{environment}/{project_ref}/"
        self.id_prefix = f"s3://{self.bucket}/{self.key_prefix}"
        self.env = dict(process_env(), AWS_IGNORE_CONFIGURED_ENDPOINT_URLS="true", AWS_PAGER="", AWS_CLI_AUTO_PROMPT="off")

    def aws(self, action, *args):
        return run([
            "aws", "--no-cli-pager", "--output", "json", "s3api", action,
            "--bucket", self.bucket, "--expected-bucket-owner", self.owner, *args,
        ], f"S3 {action}", env=self.env, capture=True)

    def require_private_bucket(self):
        config = json.loads(self.aws("get-public-access-block")).get("PublicAccessBlockConfiguration", {})
        if not all(config.get(flag) is True for flag in (
            "BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets",
        )):
            raise BackupError("Enable all four S3 Block Public Access controls on the backup bucket.")

    def upload(self, capture_id, path):
        if path.stat().st_size > 5_000_000_000:
            raise BackupError("Encrypted backup exceeds the 5 GB single-object upload limit.")
        digest = file_digest(path)
        object_name = f"{capture_id}-{digest}.age"
        self.aws(
            "put-object", "--key", self.key_prefix + object_name, "--body", str(path),
            "--if-none-match", "*", "--checksum-sha256", base64.b64encode(bytes.fromhex(digest)).decode("ascii"),
            "--server-side-encryption", "AES256", "--content-type", "application/octet-stream",
        )
        return self.id_prefix + object_name

    def download_verified(self, backup_id, path):
        capture_id, digest = parse_backup_id(backup_id, self.environment, self.project_ref, self.bucket)
        self.aws("get-object", "--key", backup_id[len(f"s3://{self.bucket}/"):], str(path))
        require_ciphertext_digest(path, digest)
        return capture_id


def one_time_identity(directory):
    """Create a capture-only age key in private scratch. It is deleted before the receipt is printed."""
    keys = directory / "readback-key"
    keys.mkdir(mode=0o700)
    identity = keys / "identity.txt"
    run(["age-keygen", "--output", str(identity)], "Create one-time readback key")
    recipient = run(["age-keygen", "-y", str(identity)], "Read one-time readback recipient", capture=True).strip()
    if not AGE_RECIPIENT.fullmatch(recipient):
        raise BackupError("age-keygen returned an unexpected one-time recipient.")
    return identity, recipient


def x25519_stanzas(path):
    """Count X25519 recipient stanzas in an age v1 header without decrypting the payload."""
    count = 0
    with path.open("rb") as stream:
        if stream.readline(64) != b"age-encryption.org/v1\n":
            raise BackupError("Stored backup is not an age v1 file.")
        for _ in range(1024):
            line = stream.readline(4096)
            if line.startswith(b"---"):
                return count
            if line.startswith(b"-> "):
                count += line.split(b" ")[1].strip() == b"X25519"
            elif not line.endswith(b"\n"):
                break
    raise BackupError("Stored backup has an unreadable age header.")


def unpack(encrypted, identity, directory, capture_id, args):
    """Decrypt, unpack and verify one backup into an empty private directory. Return the manifest and indexes."""
    bundle = directory / "logical-backup.tar"
    run([
        "age", "--decrypt", "--identity", str(identity), "--output", str(bundle), str(encrypted),
    ], "Decrypt backup")
    with tarfile.open(bundle, "r:") as archive:
        expected = {METADATA, *ARCHIVES}
        for member in archive:
            if member.name not in expected or not member.isfile():
                raise BackupError("Unexpected or duplicate file in the decrypted backup.")
            expected.remove(member.name)
            with archive.extractfile(member) as source, (directory / member.name).open("xb") as target:
                shutil.copyfileobj(source, target)
        if expected:
            raise BackupError("A required file is missing from the decrypted backup.")
    bundle.unlink()
    manifest = json.loads((directory / METADATA).read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or (
        manifest.get("format_version"), manifest.get("capture_id"),
        manifest.get("environment"), manifest.get("project_ref"),
    ) != (1, capture_id, args.environment, args.project_ref):
        raise BackupError("Decrypted backup manifest does not match the expected backup ID and project.")
    if manifest.get("archives") != {name: file_digest(directory / name) for name in ARCHIVES}:
        raise BackupError("Decrypted backup archive checksum verification failed.")
    return manifest, verify_archives(directory, manifest)


def verify_archives(directory, manifest):
    """Read every archive index and data block with pg_restore, without restoring or storing SQL."""
    tocs = {}
    for name in ARCHIVES:
        tocs[name] = run(["pg_restore", "--list", str(directory / name)], f"Read {name} index", capture=True)
        # Script output decompresses every table data block. --list alone misses truncation and damage.
        run(["pg_restore", "--file", os.devnull, str(directory / name)], f"Read {name} data stream")
    managed_objects = set(manifest["managed_custom_objects"])
    custom_entries = []
    for line in tocs[ARCHIVES[1]].splitlines():
        entry = re.match(r"\d+; (\d+ \d+) (?:POLICY|TRIGGER) ", line)
        if entry and entry[1] in managed_objects:
            managed_objects.remove(entry[1])
            custom_entries.append(line)
    if managed_objects:
        raise BackupError("Managed policy or trigger is missing from the backup archive.")
    return tocs[ARCHIVES[0]], custom_entries


def capture(args, database, store, directory):
    recipient = required_env("BACKUP_AGE_RECIPIENT")
    if not AGE_RECIPIENT.fullmatch(recipient):
        raise BackupError("BACKUP_AGE_RECIPIENT must be a public X25519 age recipient.")
    store.require_private_bucket()
    readback_identity, readback_recipient = one_time_identity(directory)
    if readback_recipient == recipient:
        raise BackupError("The one-time readback recipient must differ from the recovery recipient.")
    manifest = capture_snapshot(database, directory)
    timestamp = datetime.fromisoformat(manifest["captured_at"].replace("Z", "+00:00"))
    capture_id = timestamp.strftime("%Y%m%dT%H%M%S%fZ") + "-" + uuid.uuid4().hex
    manifest.update({
        "format_version": 1, "capture_id": capture_id, "environment": args.environment,
        "project_ref": args.project_ref, "commit": args.commit,
        "archives": {name: file_digest(directory / name) for name in ARCHIVES},
    })
    (directory / METADATA).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    bundle = directory / "logical-backup.tar"
    with tarfile.open(bundle, "w") as archive:
        for name in (METADATA, *ARCHIVES):
            archive.add(directory / name, arcname=name, recursive=False)
    encrypted = directory / "logical-backup.age"
    run([
        "age", "--encrypt", "--recipient", recipient, "--recipient", readback_recipient,
        "--output", str(encrypted), str(bundle),
    ], "Encrypt backup")
    for name in (METADATA, *ARCHIVES, bundle.name):
        (directory / name).unlink()
    backup_id = store.upload(capture_id, encrypted)

    # Prove the stored bytes, not the local copy: download, hash, decrypt and read every archive.
    downloaded = directory / "downloaded.age"
    store.download_verified(backup_id, downloaded)
    if x25519_stanzas(downloaded) != 2:
        raise BackupError("Stored backup must be encrypted to exactly the recovery and one-time readback recipients.")
    readback = directory / "readback"
    readback.mkdir(mode=0o700)
    if unpack(downloaded, readback_identity, readback, capture_id, args)[0] != manifest:
        raise BackupError("Stored backup manifest differs from the captured manifest.")
    readback_identity.unlink()
    shutil.rmtree(readback)
    return backup_id


def fetch(args, directory):
    """Return a hash-verified ciphertext and capture ID from S3 or from an operator-supplied copy."""
    if args.encrypted_file:
        capture_id, digest = parse_backup_id(args.backup_id, args.environment, args.project_ref)
        require_ciphertext_digest(args.encrypted_file, digest)
        return args.encrypted_file, capture_id
    store = BackupStore(args.environment, args.project_ref)
    store.require_private_bucket()
    encrypted = directory / "downloaded.age"
    return encrypted, store.download_verified(args.backup_id, encrypted)


def extract_backup(args, directory):
    encrypted, capture_id = fetch(args, directory)
    return unpack(encrypted, args.identity_file, directory, capture_id, args)


def prepare_restore(directory, indexes, output):
    """Write the ordered restore SQL for a target that already has the platform bootstrap."""
    application, managed = (directory / name for name in ARCHIVES)
    application_toc, custom_entries = indexes
    application_list = directory / "application.list"
    # The target already has public. Keep its restored ACLs and all contained objects.
    application_list.write_text("".join(
        line for line in application_toc.splitlines(keepends=True)
        if not re.match(r"\d+; \d+ \d+ SCHEMA - public ", line)
    ), encoding="utf-8")
    toc_file = directory / "managed-custom.list"
    toc_file.write_text("\n".join(custom_entries) + "\n", encoding="utf-8")
    restore_steps = (
        (application, "--section=pre-data"),
        (managed, "--section=data"),
        (application, "--section=data"),
        (application, "--section=post-data"),
        (managed, f"--use-list={toc_file}"),
    )
    paths = []
    for sql, (archive, selection) in zip(RESTORE_FILES, restore_steps):
        restore_list = [f"--use-list={application_list}"] if archive == application else []
        run(["pg_restore", "--no-owner", selection, *restore_list,
             "--file", str(output / sql), str(archive)], f"Prepare {sql}")
        paths.append(output / sql)
    return paths


def restore_command(paths):
    pre, managed_data, application_data, post, managed_custom = (str(path) for path in paths)
    return [
        "--single-transaction",
        "--file", pre,
        "--command", "SET LOCAL session_replication_role = replica",
        "--file", managed_data,
        "--file", application_data,
        "--command", "SET LOCAL session_replication_role = origin",
        "--file", post,
        "--file", managed_custom,
    ]


@contextmanager
def disposable_database(directory):
    cluster = directory / "pgdata"
    socket = directory / "socket"
    socket.mkdir(mode=0o700)
    run(["initdb", "-D", str(cluster), "-U", "postgres", "--auth=trust", "-E", "UTF8"], "Initialize recovery cluster")
    options = shlex.join(["-c", "listen_addresses=", "-k", str(socket), "-p", "5432"])
    control = ["pg_ctl", "-D", str(cluster), "-w"]
    try:
        run([*control, "-l", str(directory / "postgres.log"), "-o", options, "start"], "Start socket-only recovery cluster")
        yield Database(dict(PGHOST=str(socket), PGPORT="5432", PGDATABASE="postgres", PGUSER="postgres"))
    finally:
        if (cluster / "postmaster.pid").exists():
            run([*control, "-m", "immediate", "stop"], "Stop disposable recovery cluster")


def rehearsal(directory, manifest, indexes, bootstrap_sql, checks_sql):
    paths = prepare_restore(directory, indexes, directory)
    with disposable_database(directory) as target:
        target.psql(["--single-transaction", "--file", str(bootstrap_sql.resolve())], "Bootstrap recovery cluster")
        target.psql(restore_command(paths), "Restore data and schema into disposable cluster")
        with target.session() as query:
            query("SET search_path = pg_catalog; SET TIME ZONE 'UTC';")
            restored = inspect_database(query)
        if restored != {key: manifest[key] for key in restored}:
            raise BackupError("Restored row counts or migration versions differ from the captured snapshot.")
        target.psql([
            "--single-transaction", "--command", "SET TRANSACTION READ ONLY", "--file", str(checks_sql.resolve()),
        ], "Run recovery assertions")
    return restored


def decrypt(args, directory):
    """Verify, decrypt and stage a backup and its ordered restore SQL for a separately authorized operator."""
    output = args.output_dir
    if output.exists() or output.is_symlink() or not output.parent.is_dir():
        raise BackupError("Pass a new --output-dir inside an existing private directory.")
    manifest, indexes = extract_backup(args, directory)
    staged = directory / "staged"
    staged.mkdir(mode=0o700)
    prepare_restore(directory, indexes, staged)
    for name in (METADATA, *ARCHIVES):
        os.replace(directory / name, staged / name)
    output.mkdir(mode=0o700)
    for name in (METADATA, *ARCHIVES, *RESTORE_FILES):
        shutil.copyfile(staged / name, output / name)
    return manifest


def in_ci():
    return os.environ.get("GITHUB_ACTIONS") == "true" or os.environ.get("CI", "").lower() not in ("", "0", "false")


def parse_args(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)
    for command in ("capture", "verify", "rehearse", "decrypt"):
        subcommand = subcommands.add_parser(command)
        subcommand.add_argument("--environment", required=True)
        subcommand.add_argument("--project-ref", required=True)
        if command == "capture":
            subcommand.add_argument("--commit", required=True)
        else:
            subcommand.add_argument("--backup-id", required=True)
        if command in ("rehearse", "decrypt"):
            subcommand.add_argument("--identity-file", required=True, type=Path)
            # An operator-held copy of the object, checked against the SHA-256 in the backup ID.
            subcommand.add_argument("--encrypted-file", type=Path)
        if command == "rehearse":
            for name in ("bootstrap-sql", "checks-sql"):
                subcommand.add_argument(f"--{name}", required=True, type=Path)
        if command == "decrypt":
            subcommand.add_argument("--output-dir", required=True, type=Path)
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    try:
        if not ENVIRONMENT.fullmatch(args.environment) or not PROJECT_REF.fullmatch(args.project_ref):
            raise BackupError("Invalid deployment environment or Supabase project ref.")
        if args.command in ("rehearse", "decrypt") and in_ci():
            raise BackupError("Recovery commands use the long-lived recovery identity. Run them outside CI.")
        old_umask = os.umask(0o077)
        try:
            with tempfile.TemporaryDirectory(prefix="scs-backup-", dir="/tmp") as work:
                directory = Path(work)
                if args.command == "capture":
                    store = BackupStore(args.environment, args.project_ref)
                    head = run(["git", "-C", str(ROOT), "rev-parse", "HEAD"], "Read checkout commit", capture=True).strip()
                    if args.commit != head or not re.fullmatch(r"[a-f0-9]{40}", args.commit):
                        raise BackupError("Pass the full commit SHA of the checked-out release.")
                    database = Database.supabase(required_env("BACKUP_DATABASE_URL"), args.project_ref)
                    result = capture(args, database, store, directory)
                elif args.command == "verify":
                    store = BackupStore(args.environment, args.project_ref)
                    store.require_private_bucket()
                    store.download_verified(args.backup_id, directory / "downloaded.age")
                    result = args.backup_id
                elif args.command == "decrypt":
                    manifest = decrypt(args, directory)
                    result = json.dumps({
                        "backup_id": args.backup_id, "commit": manifest["commit"],
                        "captured_at": manifest["captured_at"], "output_dir": str(args.output_dir),
                        "restore_files": list(RESTORE_FILES),
                    })
                else:
                    manifest, indexes = extract_backup(args, directory)
                    restored = rehearsal(directory, manifest, indexes, args.bootstrap_sql, args.checks_sql)
                    result = json.dumps({"backup_id": args.backup_id, "commit": manifest["commit"], **restored})
        finally:
            os.umask(old_umask)
        print(result)
        return 0
    except BackupError as error:
        print(f"Database backup: {error}", file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError, TypeError, tarfile.TarError):
        print("Database backup failed while reading or writing backup data or metadata.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
