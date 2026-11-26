"""Local end-to-end rehearsal using real PostgreSQL, age, and AWS CLI binaries."""

import base64
from contextlib import redirect_stderr, redirect_stdout
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import os
from pathlib import Path
import re
import runpy
import stat
import subprocess
import tempfile
from threading import Thread
import unittest
from unittest.mock import patch
from urllib.parse import quote, urlsplit


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BACKUP = runpy.run_path(str(ROOT / "scripts/db-backup.py"))
Database = BACKUP["Database"]
BackupStore = BACKUP["BackupStore"]
BackupError = BACKUP["BackupError"]
main = BACKUP["main"]
real_run = BACKUP["run"]
disposable_database = BACKUP["disposable_database"]
PROJECT = "abcdefghijklmnopqrst"
OTHER_PROJECT = "zyxwvutsrqponmlkjihg"
BUCKET = "scs-backup-fixture"
OWNER = "123456789012"
RESTORE_FILES = BACKUP["RESTORE_FILES"]
VERIFIED_FILES = ("manifest.json", "application.dump", "managed.dump")


def doc_block(name):
    """Return a shell block from the recovery guide, so the documented operator steps are the tested ones."""
    text = (ROOT / "docs/database-backup-recovery.md").read_text(encoding="utf-8")
    (block,) = re.findall(rf"<!-- tested: {name} -->\n```sh\n(.*?)```", text, re.S)
    return block


def stanza_count(data):
    header = data.split(b"\n---", 1)[0]
    return sum(line.startswith(b"-> X25519 ") for line in header.splitlines())


class S3Fixture(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def reply(self, status, body=b""):
        self.send_response(status)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.server.requests.append(("GET", self.path))
        if self.headers.get("x-amz-expected-bucket-owner") != OWNER:
            self.reply(403)
        elif urlsplit(self.path).query == "publicAccessBlock":
            restriction = b"false" if self.server.failure == "public" else b"true"
            flags = (b"BlockPublicAcls", b"IgnorePublicAcls", b"BlockPublicPolicy", b"RestrictPublicBuckets")
            xml = b"".join(b"<" + flag + b">" + restriction + b"</" + flag + b">" for flag in flags)
            self.reply(200, b"<PublicAccessBlockConfiguration>" + xml + b"</PublicAccessBlockConfiguration>")
        elif self.server.failure == "get" or self.path not in self.server.objects:
            self.reply(404)
        else:
            data = self.server.objects[self.path]
            self.reply(200, b"corrupt" if self.server.failure == "corrupt" else data)

    def do_PUT(self):
        self.server.requests.append(("PUT", self.path))
        if (
            self.server.failure == "put" or self.headers.get("x-amz-expected-bucket-owner") != OWNER
            or self.headers.get("x-amz-server-side-encryption") != "AES256"
        ):
            self.reply(403)
            return
        if self.path in self.server.objects or self.headers.get("If-None-Match") != "*":
            self.reply(412)
            return
        data = self.rfile.read(int(self.headers["Content-Length"]))
        if self.headers.get("x-amz-checksum-sha256") != base64.b64encode(hashlib.sha256(data).digest()).decode("ascii"):
            self.reply(400)
            return
        self.server.objects[self.path] = data
        self.reply(200)


class BackupIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture = tempfile.TemporaryDirectory(prefix="scs-backup-source-", dir="/tmp")
        cls.addClassCleanup(fixture.cleanup)
        directory = Path(fixture.name)
        cls.identity = directory / "recovery-key.txt"
        subprocess.run(["age-keygen", "-o", str(cls.identity)], check=True, stderr=subprocess.DEVNULL)
        recipient = subprocess.check_output(["age-keygen", "-y", str(cls.identity)], text=True).strip()
        cls.other_identity = directory / "other-key.txt"
        subprocess.run(["age-keygen", "-o", str(cls.other_identity)], check=True, stderr=subprocess.DEVNULL)
        cls.other_recipient = subprocess.check_output(
            ["age-keygen", "-y", str(cls.other_identity)], text=True).strip()
        cls.commit = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True).strip()

        # Clear inherited AWS and PostgreSQL credentials. The test can reach only the loopback S3 fixture.
        env = patch.dict(os.environ, {
            "PATH": os.environ["PATH"], "HOME": fixture.name, "LC_ALL": "C",
            "AWS_ACCESS_KEY_ID": "fixture-key", "AWS_SECRET_ACCESS_KEY": "fixture-secret",
            "AWS_DEFAULT_REGION": "us-east-1", "AWS_EC2_METADATA_DISABLED": "true", "AWS_MAX_ATTEMPTS": "1",
            "BACKUP_S3_BUCKET": BUCKET, "BACKUP_S3_BUCKET_OWNER": OWNER, "BACKUP_AGE_RECIPIENT": recipient,
            "BACKUP_DATABASE_URL": f"postgresql://postgres:fixture@db.{PROJECT}.supabase.co:5432/postgres",
        }, clear=True)
        env.start()
        cls.addClassCleanup(env.stop)

        server = ThreadingHTTPServer(("127.0.0.1", 0), S3Fixture)
        server.objects, server.requests, server.failure = {}, [], None
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        cls.addClassCleanup(server.server_close)
        cls.addClassCleanup(thread.join)
        cls.addClassCleanup(server.shutdown)
        cls.server = server
        cls.endpoint = f"http://127.0.0.1:{server.server_port}"

        class LocalStore(BackupStore):
            def __init__(self, environment, project_ref):
                super().__init__(environment, project_ref)
                self.env.update(AWS_IGNORE_CONFIGURED_ENDPOINT_URLS="false",
                                AWS_ENDPOINT_URL_S3=f"http://127.0.0.1:{server.server_port}")

        local_store = patch.dict(main.__globals__, {"BackupStore": LocalStore})
        local_store.start()
        cls.addClassCleanup(local_store.stop)
        source = disposable_database(directory)
        cls.source = source.__enter__()
        cls.addClassCleanup(source.__exit__, None, None, None)
        cls.source.psql(["-f", str(HERE / "platform.sql"), "-f", str(HERE / "source.sql")], "Load source fixtures")

    def setUp(self):
        self.server.requests.clear()
        self.server.objects.clear()
        self.server.failure = None

    def cli(self, command, *arguments, project=PROJECT):
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            result = main([command, "--environment", "preview", "--project-ref", project, *arguments])
        return result, stdout.getvalue(), stderr.getvalue()

    def capture(self):
        with patch.object(Database, "supabase", return_value=self.source):
            return self.cli("capture", "--commit", self.commit)

    def test_capture_verify_and_rehearse_with_concurrent_writes(self):
        real_dump = self.source.dump
        wrote_later = False

        def concurrent_dump(*args):
            nonlocal wrote_later
            if not wrote_later:
                self.source.psql(["-c", """
                    INSERT INTO auth.users VALUES ('cccccccc-0000-0000-0000-000000000003', 'later@example.test');
                    INSERT INTO public.courses VALUES (2, 'Later write', 'cccccccc-0000-0000-0000-000000000003');
                    INSERT INTO supabase_migrations.schema_migrations VALUES ('20260731000001', 'later', ARRAY['select 2']);
                """], "Commit later source writes")
                wrote_later = True
            real_dump(*args)

        one_time_keys = []

        def record_run(command, stage, **options):
            if stage == "Create one-time readback key":
                one_time_keys.append(Path(command[command.index("--output") + 1]))
            if stage == "Decrypt backup":
                self.assertEqual(command[command.index("--identity") + 1], str(one_time_keys[0]))
            return real_run(command, stage, **options)

        with patch.object(self.source, "dump", side_effect=concurrent_dump), \
                patch.dict(main.__globals__, {"run": record_run}):
            status, stdout, stderr = self.capture()
        self.assertEqual((status, stderr), (0, ""), stderr)
        (backup_id,) = stdout.splitlines()
        self.assertTrue(wrote_later)
        self.assertEqual(len(self.server.objects), 1)
        self.assertEqual([method for method, _ in self.server.requests], ["GET", "PUT", "GET"])
        (one_time_key,) = one_time_keys
        self.assertTrue(str(one_time_key).startswith("/tmp/scs-backup-"))
        self.assertFalse(one_time_key.parent.parent.exists())
        data = next(iter(self.server.objects.values()))
        self.assertTrue(data.startswith(b"age-encryption.org/v1\n"))
        self.assertEqual(stanza_count(data), 2)
        self.assertIn(hashlib.sha256(data).hexdigest(), backup_id)
        self.assertNotIn(b"synthetic@example.test", data)
        self.assertEqual(self.cli("verify", "--backup-id", backup_id), (0, stdout, ""))
        self.assertEqual(self.cli("verify", "--backup-id", backup_id, project=OTHER_PROJECT)[0], 1)
        restored_status, restored_output, restored_error = self.cli(
            "rehearse", "--backup-id", backup_id, "--identity-file", str(self.identity),
            "--bootstrap-sql", str(HERE / "platform.sql"), "--checks-sql", str(HERE / "checks.sql"),
        )
        self.assertEqual((restored_status, restored_error), (0, ""), restored_error)
        restored = json.loads(restored_output)
        self.assertRegex(restored.pop("migration_history_sha256"), r"^[a-f0-9]{64}$")
        self.assertEqual(restored, {
            "backup_id": backup_id, "commit": self.commit, "migration_history_present": True,
            "migration_versions": ["20260731000000"],
            "row_counts": {"auth.users": 1, "auth.identities": 1, "storage.buckets": 1,
                           "storage.objects": 1, "public.courses": 1},
        })
        self.assertEqual(self.source.psql(["-Atc", "SELECT count(*) FROM public.courses"], "Check later writes").strip(), "2")

    def test_first_release_backup_preserves_absent_history(self):
        with tempfile.TemporaryDirectory(prefix="scs-backup-empty-", dir="/tmp") as temporary:
            directory = Path(temporary)
            assertions = directory / "assertions.sql"
            assertions.write_text("""
                DO $$ BEGIN
                    IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
                        RAISE EXCEPTION 'Unexpected migration history table';
                    END IF;
                END $$;
            """, encoding="utf-8")
            with disposable_database(directory) as empty_source:
                empty_source.psql(["-f", str(HERE / "platform.sql")], "Load managed schema only")
                with patch.object(Database, "supabase", return_value=empty_source):
                    status, stdout, stderr = self.cli("capture", "--commit", self.commit)
                self.assertEqual((status, stderr), (0, ""), stderr)
            status, stdout, stderr = self.cli(
                "rehearse", "--backup-id", stdout.strip(), "--identity-file", str(self.identity),
                "--bootstrap-sql", str(HERE / "platform.sql"), "--checks-sql", str(assertions),
            )
            self.assertEqual((status, stderr), (0, ""), stderr)
            restored = json.loads(stdout)
            self.assertEqual((restored["migration_history_present"], restored["migration_versions"],
                              restored["migration_history_sha256"]), (False, [], None))

    def test_capture_upload_or_verification_failure_never_allows_migration(self):
        for failure, message, wants_upload in (
            ("capture", "Capture managed.dump failed", False),
            ("put", "S3 put-object failed", True),
            ("get", "S3 get-object failed", True),
            ("corrupt", "Downloaded backup checksum differs", True),
            ("public", "Enable all four S3 Block Public Access", False),
        ):
            with self.subTest(failure=failure):
                self.server.failure = failure
                self.server.requests.clear()
                real_dump = self.source.dump

                def dump_or_fail(snapshot, schemas, path, *args):
                    if failure == "capture" and path.name == "managed.dump":
                        snapshot = "invalid-exported-snapshot"
                    real_dump(snapshot, schemas, path, *args)

                with patch.object(self.source, "dump", side_effect=dump_or_fail):
                    result, stdout, stderr = self.capture()
                migration = []
                if result == 0 and stdout.strip():
                    migration.append("called")
                self.assertEqual((result, stdout, migration), (1, "", []))
                self.assertIn(message, stderr)
                self.assertEqual(any(method == "PUT" for method, _ in self.server.requests), wants_upload)

    def test_unreadable_stored_backup_never_allows_migration(self):
        """Archives and ciphertext are proven from the downloaded copy, after upload and before the receipt."""

        def truncate_tail(path):
            data = path.read_bytes()
            path.write_bytes(data[:-8])

        def replace_with_junk(path):
            path.write_bytes(b"PGDMP" + bytes(100))

        cases = (
            ("truncated application data", "application.dump", truncate_tail, None,
             "Read application.dump data stream failed"),
            ("invalid managed archive", "managed.dump", replace_with_junk, None, "Read managed.dump index failed"),
            ("readback recipient dropped", None, None, "drop",
             "exactly the recovery and one-time readback recipients"),
            ("foreign second recipient", None, None, "foreign", "Decrypt backup failed"),
        )
        for name, archive, damage, encryption, message in cases:
            with self.subTest(case=name):
                self.server.requests.clear()
                real_dump = self.source.dump

                def damaged_dump(snapshot, schemas, path, *args):
                    real_dump(snapshot, schemas, path, *args)
                    if path.name == archive:
                        damage(path)

                def tampered_run(command, stage, **options):
                    if stage == "Encrypt backup" and encryption:
                        second = command.index("--recipient", command.index("--recipient") + 1)
                        if encryption == "drop":
                            del command[second:second + 2]
                        else:
                            command[second + 1] = self.other_recipient
                    return real_run(command, stage, **options)

                with patch.object(self.source, "dump", side_effect=damaged_dump), \
                        patch.dict(main.__globals__, {"run": tampered_run}):
                    result, stdout, stderr = self.capture()
                migration = ["called"] if result == 0 and stdout.strip() else []
                self.assertEqual((result, stdout, migration), (1, "", []))
                self.assertIn(message, stderr)
                self.assertEqual([method for method, _ in self.server.requests], ["GET", "PUT", "GET"])

    def test_operator_decrypt_and_documented_restore_into_bootstrapped_target(self):
        status, stdout, stderr = self.capture()
        self.assertEqual((status, stderr), (0, ""), stderr)
        backup_id = stdout.strip()
        ciphertext = next(iter(self.server.objects.values()))
        with tempfile.TemporaryDirectory(prefix="scs-backup-op-", dir="/tmp") as temporary:
            directory = Path(temporary)
            output = directory / "restore"
            decrypt = ("decrypt", "--backup-id", backup_id, "--identity-file", str(self.identity))
            status, stdout, stderr = self.cli(*decrypt, "--output-dir", str(output))
            self.assertEqual((status, stderr), (0, ""), stderr)
            result = json.loads(stdout)
            self.assertEqual((result["backup_id"], result["commit"], result["output_dir"], result["restore_files"]),
                             (backup_id, self.commit, str(output), list(RESTORE_FILES)))
            self.assertEqual(sorted(path.name for path in output.iterdir()), sorted((*VERIFIED_FILES, *RESTORE_FILES)))
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o700)
            self.assertTrue(all(stat.S_IMODE(path.stat().st_mode) == 0o600 for path in output.iterdir()))

            status, _, stderr = self.cli(*decrypt, "--output-dir", str(output))
            self.assertEqual(status, 1)
            self.assertIn("new --output-dir", stderr)

            # An operator-held copy needs no S3 access or settings, only the receipt's digest.
            copy = directory / "copy.age"
            copy.write_bytes(ciphertext)
            self.server.requests.clear()
            with patch.dict(os.environ):
                del os.environ["BACKUP_S3_BUCKET"], os.environ["BACKUP_S3_BUCKET_OWNER"]
                status, _, stderr = self.cli(*decrypt, "--encrypted-file", str(copy), "--output-dir",
                                             str(directory / "local"))
            self.assertEqual((status, stderr, self.server.requests), (0, "", []), stderr)
            for name in VERIFIED_FILES:
                self.assertEqual((directory / "local" / name).read_bytes(), (output / name).read_bytes())

            copy.write_bytes(ciphertext[:-1] + bytes([ciphertext[-1] ^ 1]))
            for arguments, message in (
                (("--encrypted-file", str(copy)), "checksum differs"),
                (("--identity-file", str(self.other_identity)), "Decrypt backup failed"),
            ):
                with self.subTest(failure=message):
                    status, stdout, stderr = self.cli(*decrypt, *arguments, "--output-dir", str(directory / "failed"))
                    self.assertEqual((status, stdout), (1, ""))
                    self.assertIn(message, stderr)
                    self.assertFalse((directory / "failed").exists())

            self.server.requests.clear()
            for variable in ({"CI": "true"}, {"GITHUB_ACTIONS": "true"}):
                with patch.dict(os.environ, variable):
                    status, _, stderr = self.cli(*decrypt, "--output-dir", str(directory / "ci"))
                    self.assertEqual(status, 1)
                    self.assertIn("outside CI", stderr)
            self.assertEqual(self.server.requests, [])

            # The documented script-independent procedure reaches the same verified files.
            manual = directory / "manual"
            completed = subprocess.run(
                ["bash", "-c", doc_block("operator-decrypt")], capture_output=True, text=True,
                env=dict(os.environ, BACKUP_ID=backup_id, BACKUP_S3_BUCKET_OWNER=OWNER,
                         RECOVERY_AGE_IDENTITY=str(self.identity), RECOVERY_DIR=str(manual),
                         AWS_ENDPOINT_URL_S3=self.endpoint),
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertTrue(completed.stdout.startswith(self.commit + " "), completed.stdout)
            self.assertEqual(sorted(path.name for path in manual.iterdir()), sorted(("backup.age", *VERIFIED_FILES)))
            for name in VERIFIED_FILES:
                self.assertEqual((manual / name).read_bytes(), (output / name).read_bytes())

            # The documented restore applies decrypt output to a target that has only the platform bootstrap.
            target_root = directory / "target"
            target_root.mkdir()
            with disposable_database(target_root) as target:
                target.psql(["-f", str(HERE / "platform.sql")], "Bootstrap target")
                completed = subprocess.run(
                    ["bash", "-c", doc_block("operator-restore")], capture_output=True, text=True,
                    env=dict(os.environ, RESTORE_DIR=str(output),
                             RECOVERY_CHECKS_SQL=str(HERE / "recovery-checks.sql"),
                             RECOVERY_DATABASE_URL="postgresql:///postgres?user=postgres&port=5432&host="
                             + quote(target.env["PGHOST"], safe="")),
                )
                self.assertEqual(completed.returncode, 0, completed.stderr)
                restored = target.psql(["-Atc", """
                    SELECT (SELECT count(*) FROM public.course_notes), (SELECT count(*) FROM auth.identities),
                           (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'lesson_media'),
                           (SELECT count(*) FROM pg_trigger WHERE tgname = 'scs_log_user'),
                           (SELECT version FROM auth.schema_migrations)
                """], "Inspect target")
                self.assertEqual(restored.strip(), "2|1|1|1|platform-bootstrap")

    def test_recovery_checks_reject_orphaned_managed_rows(self):
        with tempfile.TemporaryDirectory(prefix="scs-backup-orphan-", dir="/tmp") as temporary:
            with disposable_database(Path(temporary)) as source:
                source.psql([
                    "-f", str(HERE / "platform.sql"), "-f", str(HERE / "source.sql"),
                    "-c", "SET session_replication_role = replica",
                    "-c", "INSERT INTO auth.identities VALUES "
                          "('dddddddd-0000-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000005', 'email')",
                ], "Load source with an orphaned identity")
                with patch.object(Database, "supabase", return_value=source):
                    status, stdout, stderr = self.cli("capture", "--commit", self.commit)
                self.assertEqual((status, stderr), (0, ""), stderr)
            status, _, stderr = self.cli(
                "rehearse", "--backup-id", stdout.strip(), "--identity-file", str(self.identity),
                "--bootstrap-sql", str(HERE / "platform.sql"), "--checks-sql", str(HERE / "recovery-checks.sql"),
            )
            self.assertEqual(status, 1)
            self.assertIn("Run recovery assertions failed", stderr)

    def test_project_mismatch_rejected_before_storage_and_database(self):
        result, stdout, stderr = self.cli("capture", "--commit", self.commit, project=OTHER_PROJECT)
        self.assertEqual((result, stdout, self.server.requests), (1, "", []))
        self.assertIn("expected Supabase project", stderr)


class TargetValidationTest(unittest.TestCase):
    def test_direct_and_session_pooler_bind_expected_routing(self):
        for host, user in ((f"db.{PROJECT}.supabase.co", "postgres"),
                           ("aws-0-us-east-1.pooler.supabase.com", f"postgres.{PROJECT}")):
            with patch.dict(os.environ, {"PGHOSTADDR": "127.0.0.1", "PGSERVICE": "other", "PGSSLMODE": "disable"}):
                target = Database.supabase(f"postgresql://{user}:a%40b@{host}:5432/postgres?sslmode=require", PROJECT)
            self.assertEqual((target.env["PGHOST"], target.env["PGPORT"], target.env["PGUSER"]), (host, "5432", user))
            self.assertEqual((target.env["PGSSLMODE"], target.env["PGPASSWORD"]), ("verify-full", "a@b"))
            self.assertNotIn("PGHOSTADDR", target.env)
            self.assertNotIn("PGSERVICE", target.env)

    def test_url_without_query_string_keeps_verified_tls(self):
        for suffix in ("", "?"):
            for port in ("", ":5432"):
                with self.subTest(suffix=suffix, port=port), patch.dict(os.environ, {"PGSSLMODE": "disable"}):
                    target = Database.supabase(
                        f"postgresql://postgres:p%3Fw@db.{PROJECT}.supabase.co{port}/postgres{suffix}", PROJECT)
                    self.assertEqual((target.env["PGHOST"], target.env["PGPASSWORD"]),
                                     (f"db.{PROJECT}.supabase.co", "p?w"))
                    self.assertEqual((target.env["PGSSLMODE"], target.env["PGSSLROOTCERT"]), ("verify-full", "system"))

    def test_rejects_non_session_endpoints_and_connection_overrides(self):
        for url in (
            f"postgresql://postgres:x@db.{OTHER_PROJECT}.supabase.co:5432/postgres",
            f"postgresql://postgres.{OTHER_PROJECT}:x@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
            f"postgresql://postgres.{PROJECT}:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
            f"postgresql://postgres:x@db.{PROJECT}.supabase.co:5432/postgres?hostaddr=127.0.0.1",
            f"postgresql://postgres:x@db.{PROJECT}.supabase.co:5432/postgres?sslmode=disable",
            f"postgresql://postgres:x@db.{PROJECT}.supabase.co:5432/postgres?sslmode=prefer",
            f"postgresql://postgres:x@db.{PROJECT}.supabase.co:5432/postgres?sslmode=",
            f"postgresql://postgres:x@db.{PROJECT}.supabase.co:5432/postgres?hostaddr=",
            f"postgresql://postgres:x@db.{PROJECT}.supabase.co:5432/postgres?&",
            f"postgresql://postgres:x@db.{PROJECT}.supabase.co:5432/postgres?sslmode=require&sslmode=verify-full",
            f"postgresql://postgres:x@db.{PROJECT}.supabase.co:5432/other",
            "postgresql://postgres:x@127.0.0.1:5432/postgres",
        ):
            with self.subTest(url=url), self.assertRaisesRegex(BackupError, "expected Supabase project"):
                Database.supabase(url, PROJECT)


if __name__ == "__main__":
    unittest.main(verbosity=2)
