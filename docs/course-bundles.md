# Course bundles

A bundle carries one course's learning content into an isolated development database. Use a specific `COURSE@version` and the SHA-256 of its approved manifest. The manifest records the required migration, the content checksum, media sizes and checksums, and the full list of external URLs. Bundle files can contain quiz answer keys, unpublished teaching material and licensed media. Keep the registry, review directories and pulled copies in restricted storage outside the repository.

The maintainer publishes versions to a private filesystem registry. Put the registry on an approved, access-controlled volume, with backups and maintainer-only write access. Developers with course approval can use a read-only mount or a privately transferred registry copy. The registry layout is `registry/COURSE/version/`. Each command that creates a version or a pulled copy uses an exclusive directory creation. Readers check the manifest against the SHA-256 provided through the trusted approval channel, then verify the payload and all media. Use a new version for every approved change.

## Maintainer export and review

1. Obtain approval for the specific source project and course. Add the exact HTTPS source and course code to `approvedSources` in [maintainer-policy.mjs](../scripts/course-bundles/maintainer-policy.mjs). The lists ship empty.
2. Apply the [canonical migration chain](../supabase/README.md) through `20261126010000` on the authorized source. Have the source DBA generate a distinct random 32-byte token for this course and add the course code and the SHA-256 of the **64-character hex token string** to `private.course_bundle_export_allowlist (code, token_sha256)`. Use the secured operator session and bind parameters for provisioning. Remove the allowlist entry when the export approval expires.
3. Use a private source profile containing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (an anon JWT or publishable key), and `COURSE_BUNDLE_EXPORT_TOKEN`. The export uses a read-only course-scoped RPC and reads only explicitly referenced public Storage objects. It copies no instructor profiles, enrollment/activity, signup records, credentials, Drive identifiers or external integration settings. Courses with external activity lessons or links fail the export. Use an approved course with self-contained lessons for the bundle.
4. Create a private parent directory and export to a new staging directory inside it. Save the reviewed SHA-256 from the JSON output.

   ```sh
   npm run course:bundle:maintain -- export COURSE@v1 \
     --env-file "$BUNDLE_SOURCE_PROFILE" --out "$BUNDLE_REVIEW_DIR"
   npm run course:bundle -- validate COURSE@v1 --bundle "$BUNDLE_REVIEW_DIR"
   ```

5. Review `content.json` and every file in the manifest. Verify the title, unit and lesson order, publication flags, questions and answer keys. Open media safely and inspect visible content, captions, audio, embedded file contents and metadata for learner or staff identities, private links, signing tokens and credentials. Confirm the redistribution rights and approval for **anonymous public access** to each copied media object in the destination's existing `lesson-media` bucket. Check each remaining external URL for privacy, access and redistribution expectations. Automated validation rejects common secret and identity formats, active HTML, signed and unportable links, unsupported media types, invalid references and modified bytes. Human review is required for names in prose, image and PDF content, and media rights.
6. Approve only the SHA-256 of the exact reviewed staging files. Keep the pinned identifier, digest and approval in the trusted maintainer channel. If anything needs redaction or a portable media replacement, resolve it in approved content and run a new export and review.

   ```sh
   npm run course:bundle:maintain -- approve COURSE@v1 \
     --staging "$BUNDLE_REVIEW_DIR" --registry "$BUNDLE_REGISTRY" --sha256 "$BUNDLE_SHA256" \
     --content-reviewed --media-reviewed --privacy-reviewed
   ```

Portable media uses source `lesson-media` public URLs. Export replaces references in lesson and block HTML, rendered slide URLs, videos, attachments and question content with bundle references. Relative links, inline data and signed or private URLs require source cleanup. Clean public HTTPS links can remain external after explicit review. The exporter never fetches those links.

## Destination setup

Apply migrations through `20261126020000` on the isolated destination first. The tools refuse a destination without the replacement guards from that migration. A DBA must provision one row in `private.course_bundle_destination` with an independent UUID, the exact API origin, the correct environment and the UUID of the destination-owned instructor. Use a synthetic or authorized staging instructor. Each newly imported course is owned by that instructor and keeps the same course UUID and instructor through replacements.

For shared development or staging, independently verify the Supabase project and confirm it is isolated and approved for synthetic or reviewed content. Add its exact HTTPS project origin, environment (`shared-dev` or `staging`) and the provisioned UUID to `approvedDestinations` in the reviewed policy file. Keep the approval in source control. A profile supplies only the API origin and service-role key. The maintainer path requires both the reviewed origin and the matching database marker before upload. Production and unapproved origins are refused.

Developers use the app's guarded `.env.dev` or `.env.dev.personal` profile, including `SUPABASE_SERVICE_ROLE_KEY`. The developer path accepts loopback and maintainer-allowlisted personal origins. The matching marker environment is `local` for loopback and `personal` for personal projects. Developer credentials and profile names cannot approve an origin or grant access to the shared maintainer path.

## Pull, install and verify

For the common developer path, set `COURSE_BUNDLE_REGISTRY` to the private read-only registry directory and `COURSE_BUNDLE_DESTINATION_ID` to the provisioned marker UUID in the selected profile. Set `COURSE_BUNDLE_MANIFEST_SHA256` to the approved digest for your starter course or supply `--sha256` for another version.

```sh
npm run data:pull -- --bundle COURSE@v1 --env-file .env.dev.personal
```

This reads the approved registry version and imports it directly into the selected development project. Omit `--env-file` to use `.env.dev`. To replace a managed version, pass the current version with `--replace` and pin the new digest.

Use the SHA-256 received with the approval. The pull destination should be a new directory inside a private parent.

```sh
npm run course:bundle -- pull COURSE@v1 \
  --registry "$BUNDLE_REGISTRY" --out "$BUNDLE_LOCAL_DIR" --sha256 "$BUNDLE_SHA256"
npm run course:bundle -- import COURSE@v1 --env-file .env.dev \
  --bundle "$BUNDLE_LOCAL_DIR" --sha256 "$BUNDLE_SHA256" --destination "$BUNDLE_DESTINATION_ID"
npm run course:bundle -- status COURSE@v1 --env-file .env.dev \
  --sha256 "$BUNDLE_SHA256" --destination "$BUNDLE_DESTINATION_ID"
```

The separate maintainer commands run against an independently approved hosted destination and a pinned private registry version.

```sh
npm run course:bundle:maintain -- publish COURSE@v1 \
  --env-file "$BUNDLE_DESTINATION_PROFILE" --registry "$BUNDLE_REGISTRY" --sha256 "$BUNDLE_SHA256"
npm run course:bundle:maintain -- status COURSE@v1 \
  --env-file "$BUNDLE_DESTINATION_PROFILE" --sha256 "$BUNDLE_SHA256"
```

Both installation commands validate the candidate in a rolled-back database transaction before any upload. Media is uploaded through the Storage API with upsert disabled. Its anonymous download must match the reviewed bytes before publication. The final database transaction revalidates and publishes the full candidate graph, along with its ownership and version record. Status checks the exact active pin, graph, and media paths, and prints `courseId`, `lessons` with destination IDs and codes, and `mediaPaths`.

To replace a bundle, run `import` or `publish` with the new pin and digest and add `--replace v1`, naming the currently active version. A repeated install of the active, unchanged version verifies existing media and leaves the database and Storage unchanged. A different digest under a published version, an unmanaged course or content collision, or a stale expected version fails. A failed publication leaves the previous course and its media usable. A new version's previously uploaded bytes can be reused on retry. Storage paths for older and failed versions remain in place for investigation and recovery.

### Replacement guards

A replacement deletes the active version's rows and inserts the new graph under new row IDs. It runs only when nothing would be lost, and otherwise fails with the previous version still installed:

| Refusal | Meaning and next step |
| --- | --- |
| `bundle_published_content_changed` | The live course no longer matches the graph recorded when the active version was published. `status` reports the same error. Find out who changed it. Revert the change to restore the pin, or keep the course and publish a new course code. |
| `bundle_ownership_changed` | Rows were added to or removed from the managed course. Handle as above. |
| `bundle_replacement_has_activity_or_external_references` | A row outside the managed graph references it, such as a quiz submission, response, lesson completion, LTI or Autolab link, or a block or attachment from elsewhere. The check reads every foreign key into the content tables from the catalog, so tables added later are covered. Keep the course and publish the update under a new course code. |
| `bundle_destination_busy` | Another publication of the course, or a learner or app write, held a lock for 5 seconds. Nothing changed. Retry later. |

Replacement is for courses with no activity, such as a fixture corrected before its first smoke run. Each published version is immutable and keeps its own record. Correct a course with history by publishing a new course code and moving its users to it. The previous staging course and its attempts remain available.

### Read-only staging content

After `20261126020000`, staging protects imported content from editor and API mutations. This covers the course's code, title, department, track and owner, and its units, lessons, question groups, blocks, attachments and questions. Use `course_bundle_publish` for those writes. The app can still update the course's student count and Drive import lease, and learners can still write progress.

Developers can edit imports in local, personal, and shared dev. Status and replacement still verify the full pinned graph. To preserve development edits, keep the course and publish the update under a new code. To restore the pin, revert the changes before replacing the course.

### Locks and concurrency

Publication takes a per-course advisory lock, then row locks on the course and the active version's content. `course_bundle_publish` and `course_bundle_status` run with `lock_timeout = 5s`, so publication fails with `bundle_destination_busy`, and status fails with a lock timeout error, instead of queueing. Readers keep seeing the committed version while a publication is in progress. A learner write that references the content being replaced waits until the publication finishes. If the publication commits, the write fails because its lesson no longer exists, and the learner must reload. If the learner write commits first, the replacement refuses. Two publications of one course run one at a time. A retry of a committed publication returns the installed result.

Migration `20261126020000` sets `lock_timeout = 5s` for its own transaction because creating triggers briefly blocks writes to the content tables. If it times out, the whole migration rolls back, and the release run stops before app deployment. Rerun it when content edits are quiet.

## Synthetic smoke fixture

Generate a private review directory for the built-in fixture with no live data.

```sh
node scripts/course-bundles/synthetic.mjs "$BUNDLE_REVIEW_DIR"
```

This creates `BUNDLE_SMOKE@v1` and prints its manifest SHA-256. Its digest does not change with tooling updates. Follow the review and approval steps, then pull and import it locally. For a disposable local Supabase instance, a SQL administrator can create the fixture owner and destination marker with the following values. Match the origin to the local API origin in the selected dev profile.

```sql
insert into public.instructors (id, name, initials)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Synthetic Bundle Owner', 'SB');

insert into private.course_bundle_destination (id, environment, origin, instructor_id)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'local', 'http://127.0.0.1:54321',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
```

Set `BUNDLE_DESTINATION_ID` to the local marker UUID and use the selected environment's `status BUNDLE_SMOKE@v1` command. Verify the exact SHA-256, the lesson codes `TOPIC` and `ASSESSMENT`, and the single PNG path. The fixture creates no users. With a separately provisioned learner, load `/student/BUNDLE_SMOKE/learn?lesson=<topic ID>` and verify the image and attachment. Fetch `<destination origin>/storage/v1/object/public/lesson-media/<media path>` without credentials and compare the bytes to the manifest. Open the assessment using its lesson ID, answer **4** to “What is 2 + 2?”, and verify the score. This fixture uses one multiple-choice question with an empty variant pool.

### Upgrading the staging smoke fixture

Every staging smoke run submits the assessment, so the installed fixture has learner history after its first run and cannot be replaced. Each fixture change is a new generation with its own course code: `BUNDLE_SMOKE`, then `BUNDLE_SMOKE_2`, `BUNDLE_SMOKE_3` and so on. Generations keep the same lesson codes and content shape. Their row IDs never overlap.

1. Generate the next generation into a new private review directory, then review and approve it like any bundle.

   ```sh
   node scripts/course-bundles/synthetic.mjs "$BUNDLE_REVIEW_DIR" BUNDLE_SMOKE_2@v1
   ```

2. Publish it to staging **without** `--replace`. It installs as a new course next to the previous generation, which keeps its attempts and stays read-only at its pin.
3. Run maintainer `status BUNDLE_SMOKE_2@v1` and record `courseId`, the `TOPIC` and `ASSESSMENT` lesson IDs, and the media path.
4. Give the staging learner the same access to the new course as to the previous one.
5. Update the staging GitHub Environment variables together: `SMOKE_COURSE_CODE`, `SMOKE_LESSON_ID`, `SMOKE_MEDIA_LESSON_ID`, `SMOKE_MEDIA_PATH`, `SMOKE_BUNDLE_VERSION` and `SMOKE_BUNDLE_SHA256`. The staging runner refuses settings that do not match the active pin. Rerun staging with production disabled.
6. Keep the previous generation installed with its attempts. Neither the tools nor the app can delete a managed course.

`--replace` within one fixture course is only for correcting a generation that no smoke run has used yet.

## Local verification and npm wiring

```sh
npm run test:course-bundles
npm run test:course-bundles:db
```

The SQL checks use disposable Postgres and Auth and Storage metadata stand-ins. `concurrency.sql` opens a second session through the `dblink` extension (included in standard PostgreSQL contrib packages, such as Homebrew's). It commits synthetic fixtures, races publications against each other and against learner writes, then removes the fixtures. It waits on three 5-second lock timeouts. `checks.sql` runs in one rolled-back transaction and covers the read-only guard, edited-graph refusals, catalog-based reference detection and a second course generation. The Node fixture exercises the HTTP request sequence with simulated Supabase responses. A local Supabase stack or an approved staging smoke run is needed to exercise the actual Storage and PostgREST services.

The developer and maintainer scripts are also available through `npm run course:bundle --` and `npm run course:bundle:maintain --`.
