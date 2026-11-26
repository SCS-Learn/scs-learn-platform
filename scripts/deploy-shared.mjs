import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { createVercelRelease } from './deploy-vercel.mjs';

const main = 'refs/heads/main';
const releaseWorkflow = '.github/workflows/shared-release.yml';
const devWorkflow = '.github/workflows/shared-dev.yml';
const environments = ['dev', 'staging', 'production'];
const shaPattern = /^[a-f0-9]{40}$/;
const baseline = '20261126000000_baseline.sql';

const historyQuery = String.raw`
SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS has_history \gset
\if :has_history
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
\endif
SELECT 'existing-app' WHERE EXISTS (
  SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'private') AND c.relkind IN ('r', 'p')
);
`;

function requireValue(env, key) {
  if (!env[key]) throw new Error(`Missing ${key}.`);
  return env[key];
}

function validateTarget(target) {
  if (!environments.includes(target)) throw new Error('Invalid shared deployment target.');
}

function validateSha(sha) {
  if (typeof sha !== 'string' || !shaPattern.test(sha)) throw new Error('Expected a full commit SHA.');
  return sha;
}

function readTargets(env) {
  let configured;
  try {
    configured = JSON.parse(env.DEPLOY_TARGETS_JSON);
  } catch {
    throw new Error('DEPLOY_TARGETS_JSON must contain the reviewed target registry.');
  }
  if (Object.keys(configured ?? {}).sort().join(',') !== [...environments].sort().join(',')) {
    throw new Error('The target registry must contain dev, staging and production.');
  }
  const targets = {};
  for (const name of environments) {
    const { supabaseRef, vercelTeamId, vercelProjectId, appOrigin } = configured[name] ?? {};
    let origin;
    try {
      origin = new URL(appOrigin);
    } catch {
      throw new Error(`Invalid app origin in target registry for ${name}.`);
    }
    if (origin.origin !== appOrigin || !/^https:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(appOrigin) ||
        !/^[a-z0-9]{20}$/.test(supabaseRef) || !/^team_[A-Za-z0-9]+$/.test(vercelTeamId) ||
        !/^prj_[A-Za-z0-9_]+$/.test(vercelProjectId)) {
      throw new Error(`Invalid deployment target registry entry for ${name}.`);
    }
    targets[name] = { supabaseRef, vercelTeamId, vercelProjectId, appOrigin, appHost: origin.hostname };
  }
  for (const key of ['supabaseRef', 'vercelProjectId', 'appOrigin']) {
    if (new Set(Object.values(targets).map(target => target[key])).size !== environments.length) {
      throw new Error(`Each deployment target must have a distinct ${key}.`);
    }
  }
  return targets;
}

function readDatabase(env, project) {
  const original = requireValue(env, 'DEPLOY_DATABASE_URL');
  if (env.BACKUP_DATABASE_URL && env.BACKUP_DATABASE_URL !== original) {
    throw new Error('BACKUP_DATABASE_URL must equal the deployment database URL.');
  }
  try {
    const url = new URL(original);
    const host = url.hostname;
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const direct = host === `db.${project}.supabase.co` && user === 'postgres';
    const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host) && user === `postgres.${project}`;
    if ((!direct && !pooler) || !['postgresql:', 'postgres:'].includes(url.protocol) ||
        !['', '5432'].includes(url.port) || url.pathname !== '/postgres' ||
        url.search !== '?sslmode=verify-full' || !password || /[\x00-\x1f\x7f]/.test(password) ||
        /[\x00-\x20\x7f#\\]/.test(original)) {
      throw new Error();
    }
    return { original, host, user, password };
  } catch {
    throw new Error('Database URL must identify the expected Supabase project on port 5432 with sslmode=verify-full.');
  }
}

const secretKeys = ['DEPLOY_DATABASE_URL', 'BACKUP_DATABASE_URL', 'DEPLOY_DATABASE_CA_PEM', 'VERCEL_TOKEN', 'GH_TOKEN',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'SMOKE_EMAIL', 'SMOKE_PASSWORD'];
const minimumSecretLength = 8;
const summaryLines = 15;

export function secretValues(env) {
  const values = secretKeys.map(key => env[key]).filter(Boolean);
  try {
    const url = new URL(env.DEPLOY_DATABASE_URL);
    if (url.password) values.push(url.password, decodeURIComponent(url.password));
  } catch {
    // An invalid URL is rejected by readDatabase; its literal value is already listed.
  }
  return [...new Set(values)];
}

// Removes configured secret values and common credential shapes from tool output.
export function redact(text, secrets = []) {
  let output = String(text ?? '');
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    for (const form of new Set([secret, encodeURIComponent(secret)])) output = output.split(form).join('[redacted]');
  }
  return output
    .replace(/-----BEGIN [A-Z ]+-----[\s\S]*?(?:-----END [A-Z ]+-----|$)/g, '[redacted-pem]')
    .replace(/\bpostgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgresql://[redacted]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]')
    .replace(/(--token(?:=|\s+))\S+/g, '$1[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[redacted-jwt]')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[redacted-aws-key]')
    .replace(/\b(?:vercel_|vcp_|ghp_|gho_|ghs_|github_pat_|sbp_)[A-Za-z0-9_]{12,}/g, '[redacted-token]');
}

// The last lines of tool output, redacted and neutralised so they cannot act as workflow commands.
export function safeSummary(text, secrets = []) {
  if (secrets.some(secret => secret.length < minimumSecretLength)) {
    return ['[tool output withheld: a configured secret is too short to redact reliably]'];
  }
  return redact(text, secrets)
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .split(/\r?\n|\r/)
    .map(line => line.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trimEnd())
    .filter(line => line.trim())
    .slice(-summaryLines)
    .map(line => `  | ${line.length > 240 ? `${line.slice(0, 240)}...` : line}`);
}

export function createCommand(secrets = []) {
  return function command(name, args, { cwd, env, input, summary = false } = {}) {
    const result = spawnSync(name, args, { cwd, env, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (result.status !== 0) {
      // Arguments are never printed. Output is shown only for tools opted in, and only redacted:
      // psql output may contain database diagnostics or smoke fixture data.
      const error = new Error(`${name} failed (${result.error?.code ?? result.signal ?? `exit ${result.status}`}).`);
      if (summary) error.summary = safeSummary(`${result.stderr ?? ''}\n${result.stdout ?? ''}`, secrets);
      throw error;
    }
    return result.stdout.trim();
  };
}

class StageError extends Error {
  constructor(stage, cause, summary = []) {
    super(`${stage} failed: ${cause.message}`);
    this.stage = stage;
    this.summary = [...(cause.summary ?? []), ...summary];
  }
}

async function stage(name, action) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof StageError) throw error;
    throw new StageError(name, error);
  }
}

const appChecks = [
  // Served on every application host, including hosts with marketing redirects.
  { path: '/privacy', status: 200, type: 'text/html' },
  // The signed-in proxy runs without a session and answers without touching learner data.
  { path: '/api/autolab/sync', status: 401, type: 'application/json', body: text => JSON.parse(text).error === 'Sign in required' },
];

// Read-only HTTPS checks against the promoted application origin. They never sign in or write fixture data.
export async function checkApplication(appOrigin, { http = fetch, wait = pause, attempts = 5 } = {}) {
  for (const check of appChecks) {
    let failure;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      failure = undefined;
      try {
        const response = await http(new URL(check.path, appOrigin), {
          method: 'GET', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15_000),
          headers: { Accept: `${check.type}, */*;q=0.1`, 'Cache-Control': 'no-cache' },
        });
        const text = await response.text();
        let bodyOk = true;
        try {
          bodyOk = !check.body || check.body(text);
        } catch {
          bodyOk = false;
        }
        if (response.status !== check.status) failure = `${check.path} returned HTTP ${response.status}`;
        else if (!(response.headers.get('content-type') ?? '').startsWith(check.type)) failure = `${check.path} returned an unexpected content type`;
        else if (!bodyOk) failure = `${check.path} returned an unexpected body`;
      } catch {
        failure = `${check.path} request failed`;
      }
      if (!failure) break;
      if (attempt < attempts - 1) await wait(3_000);
    }
    if (failure) throw new Error(`HTTPS application check: ${failure}.`);
  }
  console.log(`HTTPS application checks passed at ${appOrigin}.`);
}

async function requestJson(url, token) {
  const response = await fetch(url, {
    redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Cache-Control': 'no-cache',
      ...(url.hostname === 'api.github.com' ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}) },
  });
  if (!response.ok) throw new Error(`${url.hostname} ${url.pathname} returned HTTP ${response.status}.`);
  return response.json();
}

function githubApi(env, json) {
  const repository = requireValue(env, 'GITHUB_REPOSITORY');
  if (repository.toLowerCase() !== 'scs-learn/scs-learn-platform') throw new Error('Invalid deployment repository.');
  const token = requireValue(env, 'GH_TOKEN');
  return path => json(new URL(`https://api.github.com/repos/${repository}/${path}`), token);
}

export function resolveCandidate(target, suppliedSha, env) {
  validateTarget(target);
  if (env.GITHUB_REF !== main || env.GITHUB_REF_PROTECTED !== 'true') {
    throw new Error('Deployment requires protected main.');
  }
  const workflow = target === 'dev' ? devWorkflow : releaseWorkflow;
  const event = target === 'dev' ? 'workflow_dispatch' : 'push';
  if (env.GITHUB_EVENT_NAME !== event || env.GITHUB_WORKFLOW_REF !== `${env.GITHUB_REPOSITORY}/${workflow}@${main}`) {
    throw new Error('Invalid deployment workflow caller.');
  }
  const sha = validateSha(suppliedSha);
  if (target !== 'dev' && sha !== env.GITHUB_SHA) throw new Error('The candidate must equal the main push SHA.');
  return sha;
}

async function verifyProduction(env, api, sha) {
  const inActions = env.GITHUB_ACTIONS === 'true';
  const runId = inActions ? env.GITHUB_RUN_ID : env.DEPLOY_STAGING_RUN_ID;
  const attempt = inActions ? env.GITHUB_RUN_ATTEMPT : env.DEPLOY_STAGING_RUN_ATTEMPT;
  if (!/^[1-9]\d*$/.test(runId) || !/^[1-9]\d*$/.test(attempt) ||
      (inActions ? attempt !== '1' : env.DEPLOY_APPROVED_SHA !== sha)) {
    throw new Error('Production requires a fresh approval for the verified staging SHA.');
  }
  const runPath = `actions/runs/${runId}`;
  const run = await api(runPath);
  if (String(run.id) !== runId || run.path !== releaseWorkflow || run.event !== 'push' || run.head_branch !== 'main' ||
      run.head_sha !== sha || String(run.run_attempt) !== attempt ||
      String(run.head_repository?.id) !== env.GITHUB_REPOSITORY_ID ||
      (!inActions && (run.status !== 'completed' || run.conclusion !== 'success'))) {
    throw new Error('Production requires the matching main release run.');
  }
  const { jobs } = await api(`${runPath}/attempts/${attempt}/jobs?per_page=100`);
  const staging = jobs?.filter(job => job.name === 'Staging / Deploy and verify');
  if (staging?.length !== 1 || staging[0].head_sha !== sha || staging[0].conclusion !== 'success') {
    throw new Error('Production requires successful staging smoke for the identical commit.');
  }
  if (inActions) {
    const reviews = (await api(`${runPath}/approvals`)).filter(review =>
      review.environments?.some(environment => environment.name === 'production'));
    if (!reviews.some(review => review.state === 'approved') || reviews.some(review => review.state === 'rejected')) {
      throw new Error('Production is missing a GitHub environment approval.');
    }
  } else if (!jobs.some(job => job.name === 'Production' && job.conclusion === 'skipped') ||
             jobs.some(job => job.name.startsWith('Production / ') && job.conclusion !== 'skipped')) {
    throw new Error('Maintainer deployment requires a staging run with automated production disabled.');
  }
}

function migrationPlan(run, source, clientEnv) {
  const files = readdirSync(join(source, 'supabase', 'migrations')).sort();
  if (files[0] !== baseline || !files.every(file => /^\d{14}_[a-z0-9][a-z0-9_-]*\.sql$/.test(file))) {
    throw new Error('Expected the canonical Supabase migration chain.');
  }
  const versions = files.map(file => file.slice(0, 14));
  if (new Set(versions).size !== versions.length) throw new Error('Duplicate Supabase migration version.');
  const rows = run('psql', ['-XqAtw', '-v', 'ON_ERROR_STOP=1'], { env: clientEnv, input: historyQuery });
  const applied = rows ? rows.split('\n').filter(row => row !== 'existing-app') : [];
  if (applied.length === 0 && rows.includes('existing-app')) {
    throw new Error('Existing application schema requires reviewed baseline adoption.');
  }
  if (applied.some((version, index) => version !== versions[index])) {
    throw new Error('Remote migration history does not match a prefix of the canonical chain.');
  }
  return files.slice(applied.length);
}

function captureBackup(run, env, baseEnv, cwd, target, project, sha, database, cert) {
  const backupEnv = { ...baseEnv, BACKUP_DATABASE_URL: database, BACKUP_DATABASE_SSL_ROOT_CERT: cert,
    AWS_EC2_METADATA_DISABLED: 'true', AWS_CONFIG_FILE: '/dev/null', AWS_SHARED_CREDENTIALS_FILE: '/dev/null' };
  for (const key of ['BACKUP_S3_BUCKET', 'BACKUP_S3_BUCKET_OWNER', 'BACKUP_AGE_RECIPIENT',
    'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']) {
    backupEnv[key] = requireValue(env, key);
  }
  if (env.AWS_SESSION_TOKEN) backupEnv.AWS_SESSION_TOKEN = env.AWS_SESSION_TOKEN;
  const bucket = backupEnv.BACKUP_S3_BUCKET;
  const receipt = run('python3', ['scripts/db-backup.py', 'capture', '--environment', target, '--project-ref', project, '--commit', sha],
    { cwd, env: backupEnv, summary: true });
  const prefix = `s3://${bucket}/database-backups/${target}/${project}/`;
  if (!receipt.startsWith(prefix) || !/^\d{8}T\d{12}Z-[a-f0-9]{32}-[a-f0-9]{64}\.age$/.test(receipt.slice(prefix.length))) {
    throw new Error('Unexpected verified backup receipt.');
  }
  console.log(`Verified database backup ${receipt}`);
}

function verifyStagingBundle(run, env, smoke, database) {
  const variables = {
    origin: smoke.NEXT_PUBLIC_SUPABASE_URL,
    destination: requireValue(env, 'SMOKE_BUNDLE_DESTINATION_ID'),
    course: smoke.SMOKE_COURSE_CODE,
    version: requireValue(env, 'SMOKE_BUNDLE_VERSION'),
    digest: requireValue(env, 'SMOKE_BUNDLE_SHA256'),
  };
  const args = ['-XqAtw', '-v', 'ON_ERROR_STOP=1',
    ...Object.entries(variables).flatMap(([name, value]) => ['-v', `${name}=${value}`])];
  const input = "SELECT public.course_bundle_status('staging', :'origin', :'destination'::uuid, :'course', :'version', :'digest');";
  let bundle;
  try {
    bundle = JSON.parse(run('psql', args, { env: database, input }));
  } catch {
    throw new Error('Could not verify the staging bundle. Check the staging destination marker and published bundle.');
  }
  const lessonIds = new Set(bundle.lessons?.map(lesson => lesson.id));
  const mediaPaths = bundle.mediaPaths?.map(path => `/storage/v1/object/public/lesson-media/${path}`);
  if (bundle.state !== 'installed' || bundle.sha256 !== variables.digest ||
      !lessonIds.has(smoke.SMOKE_LESSON_ID) || !lessonIds.has(smoke.SMOKE_MEDIA_LESSON_ID) ||
      !mediaPaths?.includes(smoke.SMOKE_MEDIA_PATH)) {
    throw new Error('Staging smoke settings must match the active approved course bundle.');
  }
}

export async function deployShared(env, deps = {}) {
  const secrets = secretValues(env);
  try {
    await releaseShared(env, deps, secrets);
  } catch (error) {
    // Defence in depth: nothing that leaves the runner keeps a configured secret value.
    const safe = new Error(redact(error.message, secrets));
    safe.stage = error.stage;
    safe.summary = (error.summary ?? []).map(line => redact(line, secrets));
    throw safe;
  }
}

async function releaseShared(env, deps, secrets) {
  const { cwd = process.cwd(), command: run = createCommand(secrets), json = requestJson, pause: wait = pause, http = fetch } = deps;
  const target = env.DEPLOY_ENV;
  const inActions = env.GITHUB_ACTIONS === 'true';
  let sha;
  let api;

  async function assertCurrent() {
    if ((await api('git/ref/heads/main')).object?.sha !== sha) throw new Error('The candidate is no longer current main.');
  }

  await stage('candidate validation', async () => {
    validateTarget(target);
    if (!inActions && target !== 'production') throw new Error('Use the shared GitHub workflow for this target.');
    sha = inActions ? resolveCandidate(target, env.DEPLOY_COMMIT, env) : validateSha(env.DEPLOY_COMMIT);
    api = githubApi(env, json);
    if (target === 'production') await verifyProduction(env, api, sha);
    await assertCurrent();
  });

  const { config, database, ca, baseEnv, hosting } = await stage('configuration', () => {
    const targets = readTargets(env);
    const config = targets[target];
    const database = readDatabase(env, config.supabaseRef);
    const ca = requireValue(env, 'DEPLOY_DATABASE_CA_PEM');
    const baseEnv = { PATH: env.PATH ?? process.env.PATH, HOME: env.HOME ?? process.env.HOME, CI: 'true' };
    const hosting = createVercelRelease({ config, targets, target, sha, run, json, wait, baseEnv, token: requireValue(env, 'VERCEL_TOKEN') });
    if (run('git', ['rev-parse', 'HEAD'], { cwd, env: baseEnv }) !== sha) throw new Error('Checkout does not match the verified deployment SHA.');
    run('git', ['diff', '--quiet', 'HEAD', '--'], { cwd, env: baseEnv });
    return { config, database, ca, baseEnv, hosting };
  });
  const smokeEnv = { ...baseEnv, DEPLOY_ENV: target, EXPECTED_APP_ORIGIN: config.appOrigin,
    NEXT_PUBLIC_SUPABASE_URL: hosting.supabaseOrigin };
  const scratch = mkdtempSync(join(tmpdir(), 'scs-shared-release-'));
  try {
    const source = join(scratch, 'source');
    const archive = join(scratch, 'source.tar');
    const cert = join(scratch, 'db-ca.pem');
    mkdirSync(source);
    writeFileSync(cert, ca, { mode: 0o600 });
    await stage('source archive', () => {
      run('git', ['archive', '--format=tar', `--output=${archive}`, sha], { cwd, env: baseEnv });
      run('tar', ['-xf', archive, '--directory', source], { env: baseEnv });
    });

    const readOnlyDb = { ...baseEnv, PGHOST: database.host, PGPORT: '5432', PGDATABASE: 'postgres',
      PGUSER: database.user, PGPASSWORD: database.password, PGSSLMODE: 'verify-full', PGSSLROOTCERT: cert,
      PGGSSENCMODE: 'disable', PGCONNECT_TIMEOUT: '10', PGOPTIONS: '-c default_transaction_read_only=on' };
    const pending = await stage('preflight', async () => {
      await hosting.preflight();
      return migrationPlan(run, source, readOnlyDb);
    });

    // Build and identify the candidate before any database write. It gets no domain until promotion.
    const { deployment, lastKnown } = await stage('candidate build', async () => {
      await assertCurrent();
      const lastKnown = await hosting.currentDeployment();
      const deployment = await hosting.upload(source);
      const current = await hosting.currentDeployment();
      if (current === deployment) throw new Error('The candidate was assigned to the application domain before promotion.');
      if (current !== lastKnown) throw new Error('The application domain changed during the build.');
      console.log(`Built unaliased candidate ${deployment}. ${target} is serving ${lastKnown}.`);
      return { deployment, lastKnown };
    });

    if (pending.length) {
      console.log(`Pending migrations ${pending.join(', ')}`);
      const databaseWorkdir = join(scratch, 'database');
      cpSync(join(source, 'supabase'), join(databaseWorkdir, 'supabase'), { recursive: true });
      if (target !== 'dev') {
        await stage('database backup', async () => {
          await assertCurrent();
          captureBackup(run, env, baseEnv, cwd, target, config.supabaseRef, sha, database.original, cert);
        });
      }
      await stage('database migration', async () => {
        if (migrationPlan(run, source, readOnlyDb).join(',') !== pending.join(',')) {
          throw new Error('Pending migrations changed during preflight.');
        }
        await assertCurrent();
        run('supabase', ['db', 'push', `--db-url=${database.original}`, '--skip-vault', '--yes'],
          { cwd: databaseWorkdir, env: { ...baseEnv, PGSSLROOTCERT: cert, PGCONNECT_TIMEOUT: '10', SUPABASE_TELEMETRY_DISABLED: '1' }, summary: true });
        if (migrationPlan(run, source, readOnlyDb).length) throw new Error('Migrations are still pending after db push.');
      });
    } else {
      console.log('Database is current for this commit.');
    }

    if (target === 'staging') {
      await stage('staging smoke configuration', () => {
        for (const key of ['SMOKE_EMAIL', 'SMOKE_PASSWORD', 'SMOKE_COURSE_CODE', 'SMOKE_LESSON_ID',
          'SMOKE_MEDIA_LESSON_ID', 'SMOKE_CORRECT_OPTION', 'SMOKE_MEDIA_PATH']) {
          smokeEnv[key] = requireValue(env, key);
        }
        verifyStagingBundle(run, env, smokeEnv, readOnlyDb);
      });
    }

    await stage('promotion preflight', async () => {
      await hosting.preflight();
      await assertCurrent();
      if (await hosting.currentDeployment() !== lastKnown) throw new Error('The application domain changed during the release.');
    });
    console.log(`Last known ${target} deployment before promotion: ${lastKnown}.`);
    try {
      await stage('promotion', () => hosting.promote(deployment, source));
      await stage('post-promotion checks', async () => {
        await checkApplication(config.appOrigin, { http, wait });
        if (target === 'staging') {
          run('node', ['scripts/staging-smoke.mjs'], { cwd, env: smokeEnv, summary: true });
          console.log('Staging smoke passed.');
        }
        await hosting.verifyAlias(deployment);
      });
    } catch (error) {
      throw await recoverPromotion(error, { target, deployment, lastKnown, migrated: pending.length > 0, hosting, source, config, http, wait });
    }
    await stage('completion', assertCurrent);
    console.log(`Verified ${target} deployment of ${sha} at ${config.appOrigin}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// After a failed promotion or health check, restore the last known deployment only when this
// release changed nothing but the app. The database is never reverted automatically.
async function recoverPromotion(error, { target, deployment, lastKnown, migrated, hosting, source, config, http, wait }) {
  const failure = error instanceof StageError ? error : new StageError('promotion', error);
  if (migrated) {
    failure.summary.push(
      'Database migrations from this release remain applied. Automatic rollback is disabled after a migration and the database is never reverted automatically.',
      `Last known ${target} deployment before promotion: ${lastKnown}. Follow the maintainer rollback procedure in docs/shared-deployment.md.`,
    );
    return failure;
  }
  try {
    await stage('rollback', async () => {
      const current = await hosting.currentDeployment();
      if (current === deployment) await hosting.promote(lastKnown, source);
      else if (current !== lastKnown) throw new Error('The application domain is serving a different deployment.');
      await checkApplication(config.appOrigin, { http, wait });
      await hosting.verifyAlias(lastKnown);
    });
    failure.summary.push(`App-only release: ${target} is serving the last known deployment ${lastKnown} again and passed HTTPS checks. The database was not changed.`);
  } catch (rollbackError) {
    failure.summary.push(
      `Automatic rollback to ${lastKnown} did not complete: ${rollbackError.message}`,
      ...(rollbackError.summary ?? []),
      'Follow the maintainer rollback procedure in docs/shared-deployment.md.',
    );
  }
  return failure;
}

async function mainCommand(env, [mode, target, sha]) {
  if (mode === 'resolve') {
    const candidate = resolveCandidate(target, sha, env);
    if ((await githubApi(env, requestJson)('git/ref/heads/main')).object?.sha !== candidate) {
      throw new Error('The candidate is no longer current main.');
    }
    const registry = readTargets(env);
    appendFileSync(requireValue(env, 'GITHUB_OUTPUT'), `target=${target}\ncommit_sha=${candidate}\nregistry=${JSON.stringify(registry)}\n`);
    return;
  }
  if (mode !== 'deploy') throw new Error('Expected resolve or deploy.');
  await deployShared(env);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await mainCommand(process.env, process.argv.slice(2));
  } catch (error) {
    const secrets = secretValues(process.env);
    for (const line of [error.message, ...(error.summary ?? [])]) console.error(redact(line, secrets));
    process.exitCode = 1;
  }
}
