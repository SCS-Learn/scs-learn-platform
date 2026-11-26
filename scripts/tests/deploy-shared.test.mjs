import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { load as parseYaml } from 'js-yaml';
import { checkApplication, createCommand, deployShared, redact, resolveCandidate, safeSummary } from '../deploy-shared.mjs';

const sha = 'a'.repeat(40);
const newer = 'b'.repeat(40);
const baseline = '20261126000000';
const second = '20261127000000';
const candidate = 'dpl_123';
const previous = 'dpl_previous';
const repository = 'SCS-Learn/scs-learn-platform';
const targets = Object.fromEntries(['dev', 'staging', 'production'].map((name, index) => [name, {
  supabaseRef: String(index + 1).repeat(20),
  vercelTeamId: 'team_a',
  vercelProjectId: `prj_${name}`,
  appOrigin: `https://${name}.example.edu`,
}]));

function fixture(t, target = 'staging') {
  const root = mkdtempSync(join(tmpdir(), 'test-shared-deploy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'supabase', 'migrations'), { recursive: true });
  writeFileSync(join(root, 'supabase', 'migrations', `${baseline}_baseline.sql`), '-- baseline');
  writeFileSync(join(root, 'supabase', 'migrations', `${second}_change.sql`), '-- migration');
  const { supabaseRef, vercelProjectId } = targets[target];
  const steps = [];
  const requests = [];
  const state = { head: sha, history: baseline, approved: true, staging: true, alias: previous };
  const env = {
    DEPLOY_ENV: target,
    DEPLOY_COMMIT: sha,
    DEPLOY_TARGETS_JSON: JSON.stringify(targets),
    DEPLOY_DATABASE_URL: `postgresql://postgres.${supabaseRef}:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`,
    DEPLOY_DATABASE_CA_PEM: '-----BEGIN CERTIFICATE-----\nmock\n-----END CERTIFICATE-----',
    BACKUP_S3_BUCKET: 'isolated-backups',
    BACKUP_S3_BUCKET_OWNER: '123456789012',
    BACKUP_AGE_RECIPIENT: 'age1fixture',
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'scoped-access-key',
    AWS_SECRET_ACCESS_KEY: 'scoped-secret-key',
    VERCEL_TOKEN: 'vercel-secret',
    GH_TOKEN: 'github-secret',
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: repository,
    GITHUB_REPOSITORY_ID: '123',
    GITHUB_RUN_ID: '1',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_EVENT_NAME: target === 'dev' ? 'workflow_dispatch' : 'push',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_REF_PROTECTED: 'true',
    GITHUB_SHA: sha,
    GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/${target === 'dev' ? 'shared-dev' : 'shared-release'}.yml@refs/heads/main`,
  };
  for (const key of ['SMOKE_EMAIL', 'SMOKE_PASSWORD', 'SMOKE_COURSE_CODE', 'SMOKE_LESSON_ID',
    'SMOKE_MEDIA_LESSON_ID', 'SMOKE_CORRECT_OPTION', 'SMOKE_BUNDLE_DESTINATION_ID',
    'SMOKE_BUNDLE_VERSION', 'SMOKE_BUNDLE_SHA256']) env[key] = 'fixture';
  env.SMOKE_MEDIA_PATH = '/storage/v1/object/public/lesson-media/example/image.png';
  const deps = {
    cwd: root,
    pause: async () => {},
    command(name, args, options = {}) {
      if (name === 'git' && args[0] === 'rev-parse') return sha;
      if (name === 'git') return '';
      if (name === 'tar') {
        cpSync(join(root, 'supabase'), join(args[3], 'supabase'), { recursive: true });
        return '';
      }
      if (name === 'psql') {
        assert.equal(options.env.PGOPTIONS, '-c default_transaction_read_only=on');
        if (options.input.includes('public.course_bundle_status')) {
          steps.push('bundle');
          if (state.bundleQueryFailure) throw new Error('fixture DB diagnostic');
          return JSON.stringify(state.bundleMissing ? { state: 'missing' } : {
            state: 'installed',
            sha256: env.SMOKE_BUNDLE_SHA256,
            lessons: [{ id: env.SMOKE_LESSON_ID }, { id: env.SMOKE_MEDIA_LESSON_ID }],
            mediaPaths: ['example/image.png'],
          });
        }
        steps.push('pending');
        return state.history;
      }
      if (name === 'python3') {
        steps.push('backup');
        assert.deepEqual(args, ['scripts/db-backup.py', 'capture', '--environment', target, '--project-ref', supabaseRef, '--commit', sha]);
        assert.equal(options.env.BACKUP_DATABASE_URL, env.DEPLOY_DATABASE_URL);
        assert.ok(options.env.BACKUP_DATABASE_SSL_ROOT_CERT.endsWith('db-ca.pem'));
        assert.equal(options.summary, true);
        if (state.supersedeDuringBackup) state.head = newer;
        if (state.backupFailure) throw new Error(`backup ${state.backupFailure}`);
        return state.backupResult ?? `s3://isolated-backups/database-backups/${target}/${supabaseRef}/20261126T161413012345Z-${'1'.repeat(32)}-${'a'.repeat(64)}.age`;
      }
      if (name === 'supabase') {
        steps.push('migrate');
        assert.deepEqual(args.slice(0, 2), ['db', 'push']);
        assert.equal(args[2], `--db-url=${env.DEPLOY_DATABASE_URL}`);
        assert.ok(options.cwd.endsWith('/database'));
        assert.ok(options.env.PGSSLROOTCERT.endsWith('db-ca.pem'));
        assert.equal(options.summary, true);
        if (state.migrationFailure) throw new Error('migration failed');
        state.history = `${baseline}\n${second}`;
        return '';
      }
      if (name === 'vercel' && args[0] === 'deploy') {
        steps.push('upload');
        assert.ok(options.cwd.endsWith('/source'));
        assert.ok(args.includes('--skip-domain'));
        assert.ok(args.includes(`NEXT_PUBLIC_SUPABASE_URL=https://${supabaseRef}.supabase.co`));
        assert.ok(args.includes(`scsCommit=${sha}`));
        assert.equal(options.env.VERCEL_PROJECT_ID, vercelProjectId);
        assert.equal(options.env.DEPLOY_DATABASE_URL, undefined);
        if (state.supersedeDuringUpload) state.head = newer;
        if (state.buildFailure) throw Object.assign(new Error('vercel failed (exit 1).'), { summary: ['  | Build failed'] });
        if (state.aliasCandidateOnUpload) state.alias = candidate;
        return 'https://build-fixture.vercel.app';
      }
      if (name === 'vercel' && args[0] === 'promote') {
        steps.push(args[1] === candidate ? 'promote' : `rollback:${args[1]}`);
        assert.ok(args.includes('--yes'));
        assert.equal(options.summary, true);
        if (args[1] === candidate && state.promoteFailure) throw new Error('vercel failed (exit 1).');
        if (args[1] !== candidate && state.rollbackFailure) throw new Error('vercel failed (exit 1).');
        state.alias = args[1];
        return '';
      }
      if (name === 'node') {
        steps.push('smoke');
        assert.deepEqual(args, ['scripts/staging-smoke.mjs']);
        assert.equal(options.env.EXPECTED_APP_ORIGIN, targets.staging.appOrigin);
        assert.equal(options.env.NEXT_PUBLIC_SUPABASE_URL, `https://${supabaseRef}.supabase.co`);
        assert.equal(options.env.VERCEL_TOKEN, undefined);
        assert.equal(options.summary, true);
        if (state.smokeFailure) throw Object.assign(new Error('smoke failed'), { summary: [`  | leaked ${env.SMOKE_PASSWORD}`] });
        return '';
      }
      throw new Error(`Unexpected command ${name}`);
    },
    async json(url) {
      if (url.pathname.endsWith('/git/ref/heads/main')) return { object: { sha: state.head } };
      if (url.pathname.endsWith('/approvals')) return state.approved ? [{ state: 'approved', environments: [{ name: 'production' }] }] : [];
      if (url.pathname.endsWith('/attempts/1/jobs')) {
        return { jobs: [
          { name: 'Staging / Deploy and verify', head_sha: sha, conclusion: state.staging ? 'success' : 'failure' },
          { name: 'Production', head_sha: sha, conclusion: state.automatedProduction ? 'success' : 'skipped' },
        ] };
      }
      if (url.pathname.endsWith('/runs/1')) {
        return { id: 1, head_sha: sha, run_attempt: 1, path: '.github/workflows/shared-release.yml', event: 'push',
          head_branch: 'main', head_repository: { id: 123 }, status: 'completed', conclusion: 'success' };
      }
      if (url.pathname === `/v9/projects/${vercelProjectId}`) {
        steps.push('hosting');
        if (state.aliasChangesBeforePromotion && steps.filter(step => step === 'hosting').length === 2) state.alias = 'dpl_manual';
        return { id: state.project ?? vercelProjectId, accountId: 'team_a', link: state.link, autoAssignCustomDomains: state.autoAssign ?? false };
      }
      if (url.pathname.endsWith('/domains')) {
        return { domains: state.domains ?? [{ name: `${target}.example.edu`, projectId: vercelProjectId, verified: true }], pagination: {} };
      }
      if (url.pathname.endsWith('/env')) {
        return { envs: [{ key: 'NEXT_PUBLIC_SUPABASE_URL', target: ['production'], value: state.appSupabase ?? `https://${supabaseRef}.supabase.co` }] };
      }
      if (url.pathname === '/v7/deployments') {
        return { deployments: [{ uid: candidate, projectId: vercelProjectId, url: 'build-fixture.vercel.app',
          target: 'production', state: 'READY', meta: { scsCommit: state.badDeployment ? newer : sha } }] };
      }
      if (url.pathname.startsWith('/v4/aliases/')) {
        steps.push('target');
        return { alias: `${target}.example.edu`, projectId: vercelProjectId, deploymentId: state.aliasDeployment ?? state.alias };
      }
      throw new Error(`Unexpected API request ${url}`);
    },
    async http(url, init) {
      requests.push({ url: url.href, method: init.method, redirect: init.redirect, serving: state.alias });
      if (url.pathname === '/privacy') steps.push('https');
      assert.equal(url.origin, targets[target].appOrigin);
      if (state.alias === candidate && state.aliasChangesDuringCheck) state.alias = 'dpl_manual';
      if (state.alias === 'dpl_manual') return new Response('unavailable', { status: 503 });
      const unhealthy = state.alias === candidate && state.unhealthyCandidate;
      if (unhealthy || (state.alias === previous && state.unhealthyPrevious)) {
        return new Response('down', { status: 503, headers: { 'content-type': 'text/plain' } });
      }
      if (url.pathname === '/privacy') return new Response('<html></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
      if (url.pathname === '/api/autolab/sync') return Response.json({ error: 'Sign in required' }, { status: 401 });
      throw new Error(`Unexpected HTTPS request ${url}`);
    },
  };
  return { deps, env, state, steps, requests, run: () => deployShared(env, deps) };
}

test('candidate validation accepts only the caller for each target on protected main', (t) => {
  const { env } = fixture(t, 'dev');
  assert.equal(resolveCandidate('dev', newer, env), newer);
  assert.throws(() => resolveCandidate('dev', '', env), /full commit SHA/);
  assert.throws(() => resolveCandidate('prod', sha, env), /target/);
  assert.throws(() => resolveCandidate('production', sha, env), /caller/);
  assert.throws(() => resolveCandidate('dev', sha, { ...env, GITHUB_REF_PROTECTED: 'false' }), /protected main/);
});

test('staging builds an unaliased candidate before backup and migration, then promotes and checks the app', async (t) => {
  const { run, steps } = fixture(t);
  await run();
  assert.deepEqual(steps, ['hosting', 'pending', 'target', 'upload', 'target', 'backup', 'pending', 'migrate', 'pending', 'bundle',
    'hosting', 'target', 'promote', 'target', 'https', 'smoke', 'target']);
});

test('staging requires the active approved bundle before promoting the app', async (t) => {
  const { run, state, steps } = fixture(t);
  state.bundleMissing = true;
  await assert.rejects(run(), /^Error: staging smoke configuration failed: .*active approved course bundle/);
  assert.ok(steps.includes('bundle'));
  assert.ok(!steps.includes('promote') && !steps.includes('https') && !steps.includes('smoke'));
  assert.equal(state.alias, previous);
});

test('first staging run applies the initial migration and stops before hosting promotion when smoke settings are missing', async (t) => {
  const { env, run, state, steps } = fixture(t);
  delete env.SMOKE_LESSON_ID;
  await assert.rejects(run(), /staging smoke configuration failed: Missing SMOKE_LESSON_ID/);
  assert.ok(steps.includes('upload') && steps.includes('backup') && steps.includes('migrate'));
  assert.ok(!steps.includes('promote') && !steps.includes('https') && !steps.includes('smoke'));
  assert.equal(state.alias, previous);
});

test('staging reports a rejected bundle status query without disclosing database diagnostics', async (t) => {
  const { run, state, steps } = fixture(t);
  state.bundleQueryFailure = true;
  await assert.rejects(run(), (error) => {
    assert.match(error.message, /Check the staging destination marker and published bundle/);
    assert.doesNotMatch(`${error.message}\n${error.summary.join('\n')}`, /fixture DB diagnostic/);
    return true;
  });
  assert.ok(!steps.includes('promote') && !steps.includes('smoke'));
});

test('app-only skips backup and migration', async (t) => {
  const { run, state, steps } = fixture(t, 'production');
  state.history = `${baseline}\n${second}`;
  await run();
  assert.ok(steps.includes('promote'));
  assert.ok(!steps.includes('backup') && !steps.includes('migrate') && !steps.includes('smoke'));
});

test('shared dev migrates without a backup', async (t) => {
  const { env, run, steps } = fixture(t, 'dev');
  env.DEPLOY_DATABASE_URL = `postgresql://postgres:secret@db.${targets.dev.supabaseRef}.supabase.co:5432/postgres?sslmode=verify-full`;
  await run();
  assert.ok(steps.includes('migrate') && steps.includes('promote') && !steps.includes('backup'));
});

test('wrong database, hosting project, domain, or Supabase app configuration fails before writes', async (t) => {
  for (const change of [
    ({ env }) => { env.DEPLOY_DATABASE_URL = env.DEPLOY_DATABASE_URL.replace(targets.staging.supabaseRef, targets.production.supabaseRef); },
    ({ env }) => { env.DEPLOY_DATABASE_URL = env.DEPLOY_DATABASE_URL.replace(':5432', ':6543'); },
    ({ env }) => { env.DEPLOY_DATABASE_URL = env.DEPLOY_DATABASE_URL.replace('verify-full', 'require'); },
    ({ env }) => { env.DEPLOY_DATABASE_URL += '&hostaddr=10.0.0.1'; },
    ({ env }) => { env.BACKUP_DATABASE_URL = env.DEPLOY_DATABASE_URL.replace(targets.staging.supabaseRef, targets.production.supabaseRef); },
    ({ state }) => { state.project = targets.production.vercelProjectId; },
    ({ state }) => { state.link = { type: 'github' }; },
    ({ state }) => { state.autoAssign = true; },
    ({ state }) => { state.domains = [{ name: 'production.example.edu', verified: true }]; },
    ({ state }) => { state.appSupabase = `https://${targets.production.supabaseRef}.supabase.co`; },
  ]) {
    const input = fixture(t);
    change(input);
    await assert.rejects(input.run());
    assert.ok(input.steps.every(step => step === 'hosting'));
  }
});

test('capture failure or an unexpected backup receipt blocks migration and hosting promotion', async (t) => {
  for (const failure of ['dump', 'encrypt', 'upload', 'verify']) {
    const { run, state, steps } = fixture(t);
    state.backupFailure = failure;
    await assert.rejects(run(), new RegExp(`^Error: database backup failed: backup ${failure}`));
    assert.deepEqual(steps, ['hosting', 'pending', 'target', 'upload', 'target', 'backup']);
  }
  const { run, state, steps } = fixture(t);
  state.backupResult = 's3://wrong-bucket/staging/verified';
  await assert.rejects(run(), /backup receipt/);
  assert.deepEqual(steps, ['hosting', 'pending', 'target', 'upload', 'target', 'backup']);
});

test('a failed or misidentified candidate build stops before any database write', async (t) => {
  const build = fixture(t);
  build.state.buildFailure = true;
  await assert.rejects(build.run(), (error) => {
    assert.equal(error.message, 'candidate build failed: vercel failed (exit 1).');
    assert.deepEqual(error.summary, ['  | Build failed']);
    return true;
  });
  assert.deepEqual(build.steps, ['hosting', 'pending', 'target', 'upload']);
  const identity = fixture(t);
  identity.state.badDeployment = true;
  await assert.rejects(identity.run(), /candidate build failed: .*deployment identity/);
  assert.deepEqual(identity.steps, ['hosting', 'pending', 'target', 'upload']);
  const aliased = fixture(t);
  aliased.state.aliasCandidateOnUpload = true;
  await assert.rejects(aliased.run(), /assigned to the application domain before promotion/);
  assert.deepEqual(aliased.steps, ['hosting', 'pending', 'target', 'upload', 'target']);
});

test('a domain change between candidate build and promotion fails closed', async (t) => {
  const { run, state, steps } = fixture(t, 'production');
  state.history = `${baseline}\n${second}`;
  state.aliasChangesBeforePromotion = true;
  await assert.rejects(run(), /promotion preflight failed: The application domain changed during the release/);
  assert.ok(!steps.includes('promote') && !steps.some(step => step.startsWith('rollback')));
});

test('migration, alias verification, and smoke failures are reported by stage', async (t) => {
  const migration = fixture(t);
  migration.state.migrationFailure = true;
  await assert.rejects(migration.run(), /^Error: database migration failed: migration failed/);
  assert.ok(!migration.steps.includes('promote') && !migration.steps.includes('smoke'));
  const alias = fixture(t);
  alias.state.aliasDeployment = 'dpl_wrong';
  await assert.rejects(alias.run(), /candidate build failed|promotion/);
  assert.ok(!alias.steps.includes('smoke'));
  const smoke = fixture(t);
  smoke.state.smokeFailure = true;
  await assert.rejects(smoke.run(), (error) => {
    assert.match(error.message, /^post-promotion checks failed: smoke failed/);
    assert.ok(error.summary.includes('  | leaked [redacted]'));
    assert.doesNotMatch(error.summary.join('\n'), /fixture/);
    assert.ok(error.summary.some(line => /migrations from this release remain applied/.test(line)));
    return true;
  });
  assert.equal(smoke.steps.at(-1), 'smoke');
  assert.ok(!smoke.steps.some(step => step.startsWith('rollback')));
  assert.equal(smoke.state.alias, candidate);
});

test('every target runs read-only HTTPS checks against its origin after promotion; only staging runs smoke', async (t) => {
  for (const target of ['dev', 'staging', 'production']) {
    const input = fixture(t, target);
    input.state.history = `${baseline}\n${second}`;
    await input.run();
    const promoted = input.steps.indexOf('promote');
    assert.ok(promoted > 0 && input.steps.indexOf('https') > promoted);
    assert.deepEqual(input.requests.map(request => [request.url, request.method, request.redirect, request.serving]), [
      [`${targets[target].appOrigin}/privacy`, 'GET', 'manual', candidate],
      [`${targets[target].appOrigin}/api/autolab/sync`, 'GET', 'manual', candidate],
    ]);
    assert.equal(input.steps.includes('smoke'), target === 'staging');
    assert.equal(input.steps.includes('bundle'), target === 'staging');
  }
});

test('an app-only health failure restores the last known deployment without touching the database', async (t) => {
  for (const target of ['production', 'dev', 'staging']) {
    const input = fixture(t, target);
    input.state.history = `${baseline}\n${second}`;
    if (target === 'staging') input.state.smokeFailure = true;
    else input.state.unhealthyCandidate = true;
    await assert.rejects(input.run(), (error) => {
      assert.match(error.message, /^post-promotion checks failed: /);
      assert.ok(error.summary.some(line => line.includes(`serving the last known deployment ${previous} again`)));
      return true;
    });
    assert.equal(input.state.alias, previous);
    assert.ok(input.steps.includes(`rollback:${previous}`));
    assert.ok(!input.steps.includes('backup') && !input.steps.includes('migrate'));
    assert.equal(input.requests.at(-1).serving, previous);
  }
});

test('a failed promotion command rolls back app-only releases and reports a failed rollback', async (t) => {
  const promotion = fixture(t, 'production');
  promotion.state.history = `${baseline}\n${second}`;
  promotion.state.promoteFailure = true;
  await assert.rejects(promotion.run(), /^Error: promotion failed: vercel failed/);
  assert.equal(promotion.state.alias, previous);
  assert.ok(!promotion.steps.some(step => step.startsWith('rollback')), 'the alias never moved, so no promote is needed');
  const rollback = fixture(t, 'production');
  rollback.state.history = `${baseline}\n${second}`;
  rollback.state.unhealthyCandidate = true;
  rollback.state.rollbackFailure = true;
  await assert.rejects(rollback.run(), (error) => {
    assert.ok(error.summary.some(line => line.startsWith(`Automatic rollback to ${previous} did not complete: rollback failed`)));
    assert.ok(error.summary.some(line => /maintainer rollback procedure/.test(line)));
    return true;
  });
  assert.equal(rollback.state.alias, candidate);
});

test('a migrated release never rolls back automatically and names the last known deployment', async (t) => {
  const { run, state, steps } = fixture(t, 'production');
  state.unhealthyCandidate = true;
  await assert.rejects(run(), (error) => {
    assert.match(error.message, /^post-promotion checks failed: HTTPS application check: \/privacy returned HTTP 503/);
    assert.ok(error.summary.some(line => line.includes(`Last known production deployment before promotion: ${previous}`)));
    return true;
  });
  assert.ok(steps.includes('migrate'));
  assert.ok(!steps.some(step => step.startsWith('rollback')));
  assert.equal(state.alias, candidate);
});

test('an app-only rollback preserves an intervening deployment', async (t) => {
  const { run, state, steps } = fixture(t, 'production');
  state.history = `${baseline}\n${second}`;
  state.aliasChangesDuringCheck = true;
  await assert.rejects(run(), (error) => {
    assert.ok(error.summary.some(line => /serving a different deployment/.test(line)));
    return true;
  });
  assert.equal(state.alias, 'dpl_manual');
  assert.ok(!steps.some(step => step.startsWith('rollback')));
});

test('supersession after a healthy promotion fails without rolling back', async (t) => {
  const input = fixture(t, 'production');
  input.state.history = `${baseline}\n${second}`;
  const http = input.deps.http;
  input.deps.http = async (url, init) => {
    if (url.pathname === '/api/autolab/sync') input.state.head = newer;
    return http(url, init);
  };
  await assert.rejects(input.run(), /^Error: completion failed: The candidate is no longer current main/);
  assert.equal(input.state.alias, candidate);
  assert.ok(!input.steps.some(step => step.startsWith('rollback')));
});

test('HTTPS application checks require the expected statuses, types and bodies and retry briefly', async () => {
  const origin = 'https://app.example.edu';
  const ok = async (url) => url.pathname === '/privacy'
    ? new Response('<html></html>', { headers: { 'content-type': 'text/html' } })
    : Response.json({ error: 'Sign in required' }, { status: 401 });
  await checkApplication(origin, { http: ok, wait: async () => {} });
  let calls = 0;
  const flaky = async (url, init) => (calls += 1) < 3 ? Promise.reject(new Error('reset')) : ok(url, init);
  await checkApplication(origin, { http: flaky, wait: async () => {} });
  for (const [name, http] of [
    ['redirect', async () => new Response(null, { status: 307, headers: { location: 'https://elsewhere.example' } })],
    ['wrong type', async (url) => url.pathname === '/privacy' ? new Response('{}', { headers: { 'content-type': 'application/json' } }) : ok(url)],
    ['open api', async (url) => url.pathname === '/privacy' ? ok(url) : Response.json({}, { status: 200 })],
    ['bad body', async (url) => url.pathname === '/privacy' ? ok(url) : new Response('nope', { status: 401, headers: { 'content-type': 'application/json' } })],
  ]) {
    await assert.rejects(checkApplication(origin, { http, wait: async () => {}, attempts: 2 }), /HTTPS application check/, name);
  }
});

test('failure output is redacted, bounded and cannot issue workflow commands', async (t) => {
  const secrets = ['vercel-secret-token', 'p@ss word/123'];
  const text = [
    '\x1b[31mError\x1b[0m using vercel-secret-token',
    '::add-mask::x',
    `postgresql://postgres.abc:${encodeURIComponent('p@ss word/123')}@db.example:5432/postgres`,
    'Authorization: Bearer abc.def.ghi',
    'vercel deploy --token vercel-secret-token',
    'key AKIAABCDEFGHIJKLMNOP and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig',
    '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
  ].join('\n');
  const summary = safeSummary(text, secrets);
  const joined = summary.join('\n');
  for (const leaked of ['vercel-secret-token', 'p@ss', encodeURIComponent('p@ss word/123'), 'abc.def.ghi', 'AKIAABCDEFGHIJKLMNOP', 'eyJhbGci', 'MIIB', '\x1b']) {
    assert.ok(!joined.includes(leaked), leaked);
  }
  assert.ok(summary.every(line => line.startsWith('  | ')));
  assert.ok(summary.includes('  | ::add-mask::x'));
  assert.equal(safeSummary(Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n'), secrets).length, 15);
  assert.equal(safeSummary('x'.repeat(1000), secrets)[0].length, 4 + 240 + 3);
  assert.deepEqual(safeSummary('anything', ['short']), ['[tool output withheld: a configured secret is too short to redact reliably]']);
  assert.equal(redact('token=vercel-secret-token', secrets), 'token=[redacted]');

  const run = createCommand(secrets);
  const script = "console.error('failed with vercel-secret-token'); console.log('stdout line'); process.exit(3)";
  assert.throws(() => run(process.execPath, ['-e', script], { summary: true }), (error) => {
    assert.equal(error.message, `${process.execPath} failed (exit 3).`);
    assert.deepEqual(error.summary, ['  | failed with [redacted]', '  | stdout line']);
    return true;
  });
  assert.throws(() => run(process.execPath, ['-e', script]), (error) => error.summary === undefined);

  const { env, run: release, deps } = fixture(t);
  const original = deps.command;
  deps.command = (name, args, options) => {
    if (name === 'supabase') {
      throw Object.assign(new Error(`push to ${env.DEPLOY_DATABASE_URL} failed`), { summary: [`  | ${env.AWS_SECRET_ACCESS_KEY} secret`] });
    }
    return original(name, args, options);
  };
  await assert.rejects(release(), (error) => {
    const output = `${error.message}\n${error.summary.join('\n')}`;
    assert.match(error.message, /^database migration failed: push to \[redacted\] failed$/);
    assert.ok(!output.includes('secret') || output.includes('[redacted] secret'));
    assert.ok(!output.includes(env.AWS_SECRET_ACCESS_KEY) && !output.includes(env.DEPLOY_DATABASE_URL));
    return true;
  });
});

test('production requires successful same-run staging smoke and a fresh approval', async (t) => {
  for (const change of [
    ({ state }) => { state.approved = false; },
    ({ state }) => { state.staging = false; },
    ({ env }) => { env.GITHUB_RUN_ATTEMPT = '2'; },
    ({ env }) => { env.GITHUB_SHA = newer; },
  ]) {
    const input = fixture(t, 'production');
    change(input);
    await assert.rejects(input.run());
    assert.deepEqual(input.steps, []);
  }
});

test('production rejects supersession after approval, before backup, migration and promotion', async (t) => {
  const queued = fixture(t, 'production');
  queued.state.head = newer;
  await assert.rejects(queued.run(), /current main/);
  assert.deepEqual(queued.steps, []);
  const backup = fixture(t, 'production');
  backup.state.supersedeDuringBackup = true;
  await assert.rejects(backup.run(), /current main/);
  assert.ok(backup.steps.includes('upload') && !backup.steps.includes('migrate') && !backup.steps.includes('promote'));
  const uploaded = fixture(t, 'production');
  uploaded.state.history = `${baseline}\n${second}`;
  uploaded.state.supersedeDuringUpload = true;
  await assert.rejects(uploaded.run(), /current main/);
  assert.ok(uploaded.steps.includes('upload') && !uploaded.steps.includes('promote'));
});

test('migration history rejects a legacy schema or branch divergence before writing', async (t) => {
  for (const history of ['existing-app', second, `${baseline}\n20991126000000`]) {
    const { run, state, steps } = fixture(t);
    state.history = history;
    await assert.rejects(run(), /baseline adoption|canonical chain/);
    assert.deepEqual(steps, ['hosting', 'pending']);
  }
});

test('maintainer fallback uses the same release sequence with an approved SHA and a completed staging run', async (t) => {
  const { run, env, state, steps } = fixture(t, 'production');
  delete env.GITHUB_ACTIONS;
  env.DEPLOY_STAGING_RUN_ID = '1';
  env.DEPLOY_STAGING_RUN_ATTEMPT = '1';
  env.DEPLOY_APPROVED_SHA = newer;
  await assert.rejects(run(), /approval/);
  env.DEPLOY_APPROVED_SHA = sha;
  state.automatedProduction = true;
  await assert.rejects(run(), /automated production disabled/);
  state.automatedProduction = false;
  state.approved = false;
  await run();
  assert.ok(steps.includes('backup') && steps.includes('migrate') && steps.includes('promote'));
});

test('workflow templates enforce target validation, exact SHA promotion and staged activation', () => {
  const workflowDir = new URL('../../.github/workflows/', import.meta.url);
  const read = file => parseYaml(readFileSync(new URL(file, workflowDir), 'utf8'));
  const reusable = read('deploy-shared.yml');
  assert.deepEqual(Object.keys(reusable.on), ['workflow_call']);
  assert.deepEqual(Object.keys(reusable.on.workflow_call.inputs).sort(), ['commit_sha', 'target']);
  const deploy = reusable.jobs.deploy;
  assert.equal(deploy.name, 'Deploy and verify');
  assert.deepEqual(deploy.needs, ['validate', 'check']);
  const check = reusable.jobs.check;
  assert.equal(check.needs, 'validate');
  assert.equal(check.environment, undefined);
  assert.deepEqual(check.permissions, { contents: 'read' });
  assert.doesNotMatch(JSON.stringify(check), /secrets\.|vars\./);
  assert.equal(check.steps[0].with.ref, '${{ needs.validate.outputs.commit_sha }}');
  assert.deepEqual(check.steps.filter(step => step.run).map(step => step.run),
    ['npm ci --ignore-scripts --no-audit --no-fund', 'npm run test:deploy']);
  // Lifecycle scripts must never run in any job, and only the release step receives secrets.
  for (const [name, job] of Object.entries(reusable.jobs)) {
    assert.equal(job.steps.every(step => step.uses || step.run), true);
    for (const step of job.steps.filter(item => item.run)) {
      for (const install of step.run.match(/\bnpm (?:ci|install|i)\b[^\n]*/g) ?? []) {
        assert.match(install, /--ignore-scripts/, `${name}: ${install}`);
      }
      assert.doesNotMatch(step.run, /\b(?:npm (?:exec|rebuild|run(?!(?: -s)? test:deploy$))|npx (?!--no-install playwright install --with-deps chromium))/m, `${name}: ${step.run}`);
      if (step.run !== 'node scripts/deploy-shared.mjs deploy') assert.doesNotMatch(JSON.stringify(step), /secrets\./);
    }
  }
  assert.equal(deploy.environment, '${{ needs.validate.outputs.target }}');
  assert.deepEqual(deploy.concurrency, {
    group: 'shared-deploy-${{ needs.validate.outputs.target }}',
    'cancel-in-progress': false,
    queue: 'max',
  });
  for (const job of Object.values(reusable.jobs)) {
    for (const step of job.steps) {
      if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
    }
  }
  const releaseStep = deploy.steps.find(step => step.run === 'node scripts/deploy-shared.mjs deploy');
  for (const key of ['DEPLOY_ENV', 'DEPLOY_COMMIT', 'DEPLOY_TARGETS_JSON', 'GH_TOKEN', 'DEPLOY_DATABASE_URL',
    'DEPLOY_DATABASE_CA_PEM', 'VERCEL_TOKEN', 'BACKUP_S3_BUCKET', 'BACKUP_S3_BUCKET_OWNER',
    'BACKUP_AGE_RECIPIENT', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN', 'SMOKE_EMAIL', 'SMOKE_PASSWORD', 'SMOKE_COURSE_CODE', 'SMOKE_LESSON_ID',
    'SMOKE_MEDIA_LESSON_ID', 'SMOKE_CORRECT_OPTION', 'SMOKE_MEDIA_PATH', 'SMOKE_BUNDLE_DESTINATION_ID',
    'SMOKE_BUNDLE_VERSION', 'SMOKE_BUNDLE_SHA256']) {
    assert.ok(releaseStep.env[key], `Missing release step environment value ${key}`);
  }
  for (const file of ['shared-dev.yml', 'shared-release.yml']) assert.equal(existsSync(new URL(file, workflowDir)), false);
  const dev = read('shared-dev.yml.disabled');
  assert.deepEqual(Object.keys(dev.on), ['workflow_dispatch']);
  assert.match(dev.jobs.resolve.if, /github\.ref_protected/);
  assert.match(dev.jobs.resolve.steps[0].run, /gh api "repos\/\$GITHUB_REPOSITORY\/git\/ref\/heads\/main"/);
  assert.deepEqual(dev.jobs.dev.with, { target: 'dev', commit_sha: '${{ needs.resolve.outputs.commit_sha }}' });
  const release = read('shared-release.yml.disabled');
  assert.deepEqual(release.on, { push: { branches: ['main'] } });
  assert.equal(release.jobs.staging.name, 'Staging');
  assert.equal(release.jobs.production.name, 'Production');
  assert.equal(release.jobs.production.needs, 'staging');
  assert.match(release.jobs.production.if, /needs\.staging\.result == 'success'/);
  for (const target of ['staging', 'production']) {
    assert.deepEqual(release.jobs[target].with, { target, commit_sha: '${{ github.sha }}' });
  }
});
