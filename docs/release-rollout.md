# Environment rollout

Before merging the environment deployment changes, confirm that main includes the course-fetch optimization and RLS changes used to build the database baseline.

## Local release checks

- Install the locked dependencies with `npm ci`. Run `npm run build` using an isolated build profile. A loopback Supabase URL and dummy anon key suffice for the build itself.
- Run `npm run test:lti`, `npm run test:quiz`, `npm run test:dev`, `npm run test:rls`, `npm run test:deploy`, `npm run test:course-bundles`, and `npm run test:course-bundles:db`.
- Run `npm run test:backup` with the dependencies in the [backup and recovery runbook](database-backup-recovery.md).
- Install Chromium with `npx --no-install playwright install chromium` and run `npm run test:staging-smoke` to rehearse the smoke script against browser fixtures.
- In disposable infrastructure, replay the full migration chain from scratch, run the RLS and course import tests, and check a second migration pass for zero pending versions.
- Confirm workflow failure paths for mismatched destinations, backup capture/upload/verification failures, failed staging migrations, failed smoke checks, stale releases, and production waiting on approval.

## Confirm the deployment destinations

Use the [shared deployment guide](shared-deployment.md) to configure the GitHub Environments and Vercel projects. The checked-in workflow callers are disabled until maintainers complete these checks.

- Confirm distinct Supabase project refs for shared dev, staging, production, and restricted recovery. Record the approved hosted origins in the repository with review from the maintainers responsible for them.
- Confirm the hosting provider account, project IDs, canonical app origins, and environment bindings. Confirm production release credentials and disable any provider-driven publishing that could skip the database gate.
- Confirm the GitHub plan and availability of required reviewers on production. Configure branch and environment restrictions and the required approval. If required reviewers are unavailable, establish the documented maintainer-controlled release path before adding production credentials.
- Establish separate private stores and access for database backups and published course bundles. Record backup retention, encryption key custody, access roles, and restore responsibilities.
- Approve one starter course, review the exported content and files, and publish an immutable bundle version. Prepare a staging-only learner account with access to that bundle.

## Verify the separate Storage object backup

Before enabling migrations for staging or production, verify an independent backup of that project's Storage files and restore from it into the restricted recovery target. Record the source project, capture time, bucket and object paths, object versions, sizes, and checksums. Compare the restored inventory to the backup and verify representative downloads through Storage. Keep this evidence with the recovery rehearsal and document how to reconcile changes made between the database and object captures.

Keep the object backup outside Supabase and outside the developer bundle registry. Give recovery operators independent access and configure retention to cover the database recovery window. Establish recurring verification and record who can pause migration releases if the separate object backup falls outside that window.

Use the [Storage recovery checklist](database-backup-recovery.md#storage-objects-and-platform-settings) to record the backup and restore evidence.

## Stage the release

1. Enable shared dev after verifying the shared project and hosting binding. Dispatch from main and verify that the deployed commit matches main.
2. Follow the [backup and recovery runbook](database-backup-recovery.md) to rehearse recovery in a restricted target using staging-equivalent PostgreSQL, Auth, Storage metadata, migration history, and object access. Run the failure cases before enabling the staging migration gate.
3. Enable the staging caller with production disabled after the recovery rehearsal and target checks. The release builds a Vercel candidate without assigning the staging domain. If staging needs the bundle migration, the first release then verifies a fresh backup and applies the pending migrations. The run stops before promotion while the pinned bundle and smoke settings are missing.
4. Import the pinned bundle using the maintainer path in the [course bundle guide](course-bundles.md). Record the bundle reference, resulting course code and two lesson IDs. Use a topic lesson with an image from staging Storage and an assessment lesson with one deterministic multiple-choice question and no variants.
5. Configure the staging GitHub Environment using the smoke settings in the [shared deployment guide](shared-deployment.md), including the bundle version, digest, destination marker, lesson IDs, and media path. Store the staging learner credentials as secrets. Rerun staging for the current main commit.
6. After promotion, verify the staging alias and HTTPS checks. The staging smoke check signs in through the app, verifies a rendered image served by staging Storage, submits the quiz through the app, and confirms a new graded result through the learner lesson endpoint. It updates the staging learner’s existing answer on repeat runs.
7. To change a fixture that already has quiz attempts, publish a new course generation and update the staging pin. Keep the previous course and attempts for comparison. [Smoke fixture upgrade procedure](course-bundles.md#upgrading-the-staging-smoke-fixture)

## Approve the first production release

1. Follow the [database migration guide](../supabase/README.md) to compare production schema and migration history read-only against the canonical chain and resolve any differences explicitly. Have a maintainer record the verified baseline as applied.
2. Complete the production recovery rehearsal and record backup verification, restoration, and the checks of database rows, migration history, and Storage dependencies.
3. Confirm production cannot release through hosting auto-deploy. Approve the exact staging-verified SHA. Verify that production remains untouched before approval and that a stale approval cannot publish over a newer release.
4. Confirm the release record contains the verified backup ID if migrations ran, the applied versions, the deployed commit, and the target check result.
