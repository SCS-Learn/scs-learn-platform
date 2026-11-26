# Shared deployments

The reusable GitHub workflow takes `target` and `commit_sha`. The committed
dev and release callers have the `.yml.disabled` extension, so GitHub registers
neither the dev dispatch nor the release push trigger. Leave them disabled until
the maintainers verify the rollout settings below. Each target gets its own
Supabase project, Vercel project and application origin.

## Hosting and cutover

The public repository lists `scs-learn-platform.vercel.app` as its site. That
origin and `learn.cs.cmu.edu` returned `server: Vercel` headers. The latter
currently redirects the marketing root to CMU's main site. Identify the
application origin in the Vercel dashboard before assigning it to production.
Public responses establish the provider. A maintainer must still confirm the
team and project IDs, domains, credentials and native deployment settings.
[Repository](https://github.com/SCS-Learn/scs-learn-platform)

1. In Vercel, inventory the live project and any project that can assign its
   production domains. Confirm the Next.js root is the repository root and
   use one Vercel project per shared target, each with its own Production
   settings. Associate each HTTPS app host with the corresponding project's
   production deployment. Confirm the staging origin is accessible to the
   smoke browser and that any other domains on the project are intended.
2. Disconnect the Git repository in each Vercel project's Git settings, remove
   deploy hooks, disable automatic production domain assignment and disable
   Rolling Releases. Check for other CI integrations, stale automation tokens
   and alternate projects or provider paths that can publish to production.
   Disconnect or revoke those paths before enabling GitHub deployments. The
   runtime refuses a project with a native Git link, deploy hooks or automatic
   domain assignment, and uploads without assigning a production domain.
   [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration)
   [Vercel CLI deployment and promotion](https://vercel.com/docs/cli/deploying-from-cli)
3. Configure each Vercel project's Production `NEXT_PUBLIC_SUPABASE_URL` as a
   plaintext configuration value of `https://<project-ref>.supabase.co` and
   configure that same Supabase project's application keys. Confirm each
   Vercel identity can deploy and promote only its intended project. If token
   permissions can only be scoped by team, isolate production in a separate
   team or use a production-only account with project-level access. Scope all
   Supabase migration and backup credentials to their corresponding target.
   [Vercel environment variables](https://vercel.com/docs/environment-variables)
4. For existing hosted databases, complete the [read-only schema and history
   parity review](../supabase/README.md#read-only-production-parity-before-baseline-adoption)
   and obtain separate approval for baseline adoption. Verify clients can use
   the target's direct or session pooler endpoint with `verify-full` and its
   trusted CA. If the project uses the shared pooler, confirm Supabase SSL
   enforcement covers its connection to PostgreSQL too.
   [Supabase Postgres SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement)

## GitHub configuration

Protect `main` with reviewed changes, disallow force pushes and require review
of workflow and deployment script changes. Limit `dev`, `staging` and
`production` GitHub environments to deployments from `main`. Give `production`
required reviewers, prevent self-review and disable administrator bypass. Keep
provider credentials at environment scope. The production runner checks the
GitHub review record after the environment gates the job. Install and verify
these protections before configuring deployment credentials.
[Manage deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
[Review deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments)
[Reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)

Set the repository Actions variable `DEPLOY_TARGETS_JSON` to a JSON object with
`dev`, `staging` and `production` keys. Each entry has `supabaseRef`,
`vercelTeamId`, `vercelProjectId` and `appOrigin`. Use account and project IDs
from the dashboards. Supply HTTPS origins without a trailing slash. The
application hosts, Vercel project IDs and Supabase refs must be distinct across
targets. The unprivileged workflow job resolves and validates this registry.

A second unprivileged job checks out the candidate SHA, installs the locked
dependencies with `npm ci --ignore-scripts` and runs the deployment runner
tests. It has no GitHub environment, secrets or write permissions. The
credentialed deploy job starts only after both jobs succeed. No npm lifecycle
script runs in any job: the global Supabase and Vercel CLI installs and the
staging smoke install all pass `--ignore-scripts`. Neither CLI version nor the
Playwright packages use an install script. The Playwright browser is downloaded
by its explicit `playwright install` command.

| Scope | Environment secrets | Environment variables |
| --- | --- | --- |
| Each GitHub environment | `DEPLOY_DATABASE_URL`, `DEPLOY_DATABASE_CA_PEM`, `VERCEL_TOKEN` | |
| Staging and production backups | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` for temporary credentials | `AWS_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_BUCKET_OWNER`, `BACKUP_AGE_RECIPIENT` |
| Staging smoke | `SMOKE_EMAIL`, `SMOKE_PASSWORD` | `SMOKE_COURSE_CODE`, `SMOKE_LESSON_ID`, `SMOKE_MEDIA_LESSON_ID`, `SMOKE_CORRECT_OPTION`, `SMOKE_MEDIA_PATH`, `SMOKE_BUNDLE_DESTINATION_ID`, `SMOKE_BUNDLE_VERSION`, `SMOKE_BUNDLE_SHA256` |

`DEPLOY_DATABASE_URL` is a percent-encoded PostgreSQL URI targeting database
`postgres` on port 5432 with `?sslmode=verify-full`. Use `postgres` as the direct
connection user, or `postgres.<project-ref>` for the session pooler. Set
`DEPLOY_DATABASE_CA_PEM` to the PEM trust certificate for that endpoint. The
same URL and certificate are used for the pending check, Supabase CLI and backup.
Use private S3 storage with the target-scoped IAM permissions in the
[backup procedure](database-backup-recovery.md). The age recipient is public.
Keep the recovery identity with its authorized custodian. Confirm the hosted
PostgreSQL versions are supported by the runner's PostgreSQL 17 clients and
update the runner pin before onboarding a newer database. For smoke, provision a staging-only learner, an
assessment lesson with the expected quiz answer and a media lesson with the
specified public Storage image path.
Use the [maintainer bundle status command](course-bundles.md#pull-install-and-verify)
to get both lesson IDs and the Storage object path. The staging runner verifies
that these values match the active bundle before deploying the app. If the
first staging run applies the new bundle migration, it builds the unaliased
candidate, backs up and migrates the database, then stops before promotion
while the approved bundle is being provisioned. The staging domain keeps
serving the previous deployment. Complete the
staging import and smoke configuration, then rerun staging with production
disabled. Use a subsequent reviewed release for the first production promotion.
For a fixture with submissions, follow the [smoke fixture upgrade procedure](course-bundles.md#upgrading-the-staging-smoke-fixture) to publish a new course generation and update the staging pin.

After maintainer confirmation, enable `shared-dev.yml` and/or
`shared-release.yml` by removing the `.disabled` suffix in a reviewed change.
Update the corresponding disabled-file assertions in
[`scripts/tests/deploy-shared.test.mjs`](../scripts/tests/deploy-shared.test.mjs)
as part of activation. Set the repository Actions variable
`SHARED_DEPLOYMENTS_ENABLED` to `true` to permit shared dev and staging. Keep
`SHARED_PRODUCTION_ENABLED` unset until staging rehearsal and GitHub approval
are verified. Only then set it to `true` for normal production promotion.

## Release sequence

Dev dispatch resolves the current protected `main` SHA with no operator-supplied
commit. A push to protected `main` stages the triggering SHA. Production uses
the same SHA from the same release run, after staging migration, hosting target
verification and staging smoke succeed, and after GitHub environment review.
Approve only the first attempt of a current release. GitHub approval history
is run-scoped, so an automated production rerun requires a new release run from
a new reviewed `main` commit. Dev and staging can be rerun while their candidate
is current. Reject stale review requests so the current candidate can advance.
[GitHub review history API](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run)

Each environment-bound job holds a target-specific concurrency slot through
its last check. The job sets `queue: max` with `cancel-in-progress: false`.
GitHub documents this job-level option for GitHub.com: up to 100 jobs can wait
in the group, later ones are canceled, and queued jobs start in arrival order
without a guarantee. GitHub rejects `queue: max` combined with
`cancel-in-progress: true`. GitHub Enterprise Server 3.19 documents no `queue`
key. The ordering is not relied upon. The runner checks the protected `main`
tip after obtaining the slot, before the candidate build, backup, migration
and promotion, and at completion. A newer `main` commit stops an older
candidate at the next check, even if GitHub starts it out of order. A write
already accepted by a provider may complete. The next candidate rechecks
database history and takes its own backup if it has pending migrations.
[GitHub Actions concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
[Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
[Actions limits](https://docs.github.com/en/actions/reference/limits)

The runner validates the Supabase endpoint and Vercel team, project, domains and
application Supabase origin. It reads migration history in a read-only session
and requires it to match the committed chain. It records the deployment
currently serving the target domain, then builds the candidate from a clean
Git archive of the verified SHA as a production Vercel deployment with no
domain assigned. It requires the ready deployment's SHA metadata to match
and checks that the app domain still serves the recorded deployment. A
failed build stops the release before any database write.

If migrations are pending, staging and production capture a fresh encrypted
backup, decrypt its S3 readback with the capture-only key, and read both
PostgreSQL archives before applying them. Shared dev applies
pending migrations without a backup. An app-only release skips both backup and
migration. Staging then verifies the smoke settings against the active bundle.
Before promotion the runner repeats the hosting preflight and requires the
domain to still serve the last known deployment. It promotes the candidate and
checks the target alias.

After promotion every target, including production, gets read-only HTTPS
checks against its configured origin. `GET /privacy` must return HTML with
status 200. `GET /api/autolab/sync` without a session must return the proxy's
JSON 401. These requests do not follow redirects, sign in or write data. An
origin that redirects these paths elsewhere fails the check, so remove the
`learn.cs.cmu.edu` landing redirect in `next.config.ts` before using that host
as an application origin. Only staging then runs its smoke suite, which signs
in and writes a quiz submission for the staging learner. Every target checks
the alias again before reporting success. The alias check through the Vercel API
identifies the promoted deployment. The HTTPS checks show the origin serves a
working app.

### Failure output and rollback

Failures name their stage, such as `candidate build failed`,
`database migration failed` or `post-promotion checks failed`. For the Vercel
CLI, Supabase CLI, backup script and staging smoke, the log includes the last
15 lines of tool output. Configured secret values, database URLs, bearer
tokens, `--token` arguments, JWTs, AWS access key IDs and PEM blocks are
redacted, and each line is prefixed so it cannot act as a workflow command.
If any configured secret is shorter than 8 characters, tool output is withheld.
The `psql` and `git` output is never shown, because it can contain database
diagnostics or smoke fixture data. GitHub also masks registered secrets. The
runner's redaction covers the maintainer fallback runner, where no masking
applies.

If promotion or a post-promotion check fails in an app-only release, the runner
rolls back when the target serves the failed candidate. It preserves any
intervening deployment and reports the change. After rollback it checks the
alias and repeats the HTTPS checks. The log records the outcome. The
database is never reverted automatically. If the release applied migrations,
the runner does not roll back. The log names the last known deployment and
the release fails. A newer `main` commit found at the final check does not
trigger rollback; that commit deploys next.

Maintainer rollback after a migration:

1. Keep production promotion disabled for later releases. Record the failed
   run, the last known deployment and the verified backup receipt.
2. Inspect the database history and the applied migrations. Decide whether
   the last known deployment works with the migrated schema. Only
   backward-compatible migrations make an app-only rollback safe.
3. If it is compatible, run
   `vercel promote <last-known-deployment> --yes --scope <team-id>` with the
   target's Vercel credential. Verify the alias and the HTTPS checks.
4. If it is not compatible, fix forward with a reviewed `main` commit, or
   restore the database by following the
   [backup and recovery procedure](database-backup-recovery.md) with its
   separate approval. The deployment workflow never restores data.

Investigate any failed step before attempting a release again. An unpromoted
candidate deployment stays in Vercel without a domain and can be ignored. A
staging build, migration, target verification, HTTPS check or smoke failure
blocks production.

## Maintainer approval fallback

If the repository plan or policy cannot enforce GitHub required reviewers, keep
`SHARED_PRODUCTION_ENABLED` unset and production deployment credentials out of
GitHub Actions. Use a designated maintainer-controlled Linux runner as the only
production release writer. Keep Vercel's native deployment paths disconnected
and use the same verified target registry and tool versions as the workflow.
[GitHub environment approval availability](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments)

An authorized reviewer records approval of the full `main` SHA, the successful
staging release run and attempt, and the production target in the release record.
The releasing maintainer checks the record before obtaining the production
credentials. Check out the approved SHA in a clean checkout on the designated
runner. Do not run `npm ci` or `npm install` for this release: the release
script uses only Node.js built-ins. Supply the production settings from the credential store and supply a
GitHub token with read access to the repository and Actions. Set these local
values from the approved release record and the repository's numeric ID.

```sh
export GITHUB_REPOSITORY=SCS-Learn/scs-learn-platform
export GITHUB_REPOSITORY_ID='<numeric-repository-id>'
export DEPLOY_ENV=production
export DEPLOY_COMMIT='<verified-full-sha>'
export DEPLOY_APPROVED_SHA='<reviewer-approved-full-sha>'
export DEPLOY_STAGING_RUN_ID='<successful-release-run-id>'
export DEPLOY_STAGING_RUN_ATTEMPT='<successful-release-attempt>'
flock --nonblock /var/lock/scs-learn-production.lock node scripts/deploy-shared.mjs deploy
```

Use the same lock path for every operator on the designated runner. Keep
production credentials restricted to that release path. The script checks the
completed staging run, its SHA and that automated production was skipped before
starting the same preflight, pending check, candidate build, backup,
migration, promotion, HTTPS checks and rollback rules. Record the deployment
SHA, result, Vercel target, last known deployment and backup receipt when one
was required.
