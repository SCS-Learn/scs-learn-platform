const supabaseUrlKey = 'NEXT_PUBLIC_SUPABASE_URL';
const deploymentPattern = /^dpl_[A-Za-z0-9]+$/;

export function createVercelRelease({ config, targets, target, sha, run, json, wait, baseEnv, token }) {
  const { vercelTeamId: team, vercelProjectId: projectId, appHost, supabaseRef } = config;
  const supabaseOrigin = `https://${supabaseRef}.supabase.co`;
  const commandEnv = { ...baseEnv, VERCEL_PROJECT_ID: projectId, VERCEL_ORG_ID: team, VERCEL_TELEMETRY_DISABLED: '1' };

  function api(path, params = {}) {
    const url = new URL(path, 'https://api.vercel.com');
    url.search = new URLSearchParams({ teamId: team, ...params });
    return json(url, token);
  }

  async function preflight() {
    const project = await api(`/v9/projects/${projectId}`);
    if (project.id !== projectId || project.accountId !== team || project.paused || project.rollingRelease ||
        (project.rootDirectory && project.rootDirectory !== '.')) {
      throw new Error('Vercel project does not match the deployment target or is unavailable.');
    }
    if (project.link || project.deployHooks?.length || project.autoAssignCustomDomains !== false) {
      throw new Error('Disconnect native Git deployment and deploy hooks, and disable automatic production domain assignment.');
    }
    const { domains, pagination } = await api(`/v9/projects/${projectId}/domains`, { limit: '100' });
    const assignedDomain = domains?.find(domain => domain.name === appHost);
    const otherAppHosts = Object.entries(targets).filter(([name]) => name !== target).map(([, item]) => item.appHost);
    if (assignedDomain?.verified !== true || assignedDomain.projectId !== projectId || assignedDomain.gitBranch ||
        assignedDomain.customEnvironmentId || assignedDomain.redirect || pagination?.next ||
        domains.some(domain => otherAppHosts.includes(domain.name))) {
      throw new Error('Vercel domains do not match the deployment target.');
    }
    const { envs } = await api(`/v10/projects/${projectId}/env`, { target: 'production' });
    const origins = envs?.filter(row => row.key === supabaseUrlKey && row.target?.includes('production'));
    if (origins?.length !== 1 || origins[0].gitBranch || origins[0].value !== supabaseOrigin) {
      throw new Error('Vercel app Supabase URL does not match the deployment target.');
    }
  }

  // Builds a production-target deployment without assigning any domain to it.
  async function upload(cwd) {
    const originAssignment = `${supabaseUrlKey}=${supabaseOrigin}`;
    const url = run('vercel', ['deploy', '--yes', '--project', projectId, '--prod', '--skip-domain',
      '--scope', team, '--token', token, '--build-env', originAssignment, '--env', originAssignment, '--meta', `scsCommit=${sha}`],
    { cwd, env: commandEnv, summary: true });
    const hostname = /^https:\/\/([a-z0-9-]+\.vercel\.app)\/?$/.exec(url)?.[1];
    if (!hostname) throw new Error('Vercel did not return an unaliased deployment URL.');
    const { deployments } = await api('/v7/deployments', { projectId, target: 'production', limit: '50' });
    const deployment = deployments?.find(item => item.url === hostname);
    if (deployment?.projectId !== projectId || deployment.state !== 'READY' || deployment.target !== 'production' ||
        deployment.meta?.scsCommit !== sha || !deploymentPattern.test(deployment.uid)) {
      throw new Error('Vercel deployment identity does not match the candidate and target.');
    }
    return deployment.uid;
  }

  // The deployment currently serving the target's application host.
  async function currentDeployment() {
    const alias = await api(`/v4/aliases/${appHost}`);
    if (alias.alias !== appHost || alias.projectId !== projectId || alias.redirect || !deploymentPattern.test(alias.deploymentId ?? '')) {
      throw new Error('Vercel domain is not assigned to the expected project deployment.');
    }
    return alias.deploymentId;
  }

  async function verifyAlias(deployment) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (await currentDeployment() === deployment) return;
      if (attempt < 5) await wait(2_000);
    }
    throw new Error('Vercel domain did not switch to the verified deployment.');
  }

  async function promote(deployment, cwd) {
    if (!deploymentPattern.test(deployment ?? '')) throw new Error('Invalid Vercel deployment ID.');
    run('vercel', ['promote', deployment, '--yes', '--scope', team, '--token', token], { cwd, env: commandEnv, summary: true });
    await verifyAlias(deployment);
  }

  return { supabaseOrigin, preflight, upload, currentDeployment, promote, verifyAlias };
}
