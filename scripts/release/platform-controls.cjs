const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const EXACT_VERIFY_CHECK = 'Verify Site Contract';
const GITHUB_ACTIONS_APP_ID = 15368;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const AUTHORITY_MODES = new Set(['independent_review', 'solo_founder']);
const RELEASE_PURPOSES = new Set(['bootstrap-migration', 'approved-site-release']);

function fail(message) {
  throw new Error(`HOLD: ${message}`);
}

function assertSha(name, value) {
  if (typeof value !== 'string' || !SHA_PATTERN.test(value)) fail(`${name} must be an exact lowercase 40-character SHA`);
  return value;
}

function parseShaList(name, value) {
  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    fail(`${name} must be valid JSON`);
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 2) {
    fail(`${name} must contain one or two SHAs`);
  }
  parsed.forEach((sha) => assertSha(`${name} entry`, sha));
  if (new Set(parsed).size !== parsed.length) fail(`${name} must not contain duplicate SHAs`);
  return parsed;
}

function parseReviewerIds(value) {
  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    fail('approved environment reviewer IDs must be valid JSON');
  }
  if (!Array.isArray(parsed) || parsed.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    fail('approved environment reviewer IDs must be a JSON array of positive integers');
  }
  if (new Set(parsed).size !== parsed.length) fail('approved environment reviewer IDs must not contain duplicates');
  return [...parsed].sort((left, right) => left - right);
}

function parsePositiveInteger(name, value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) fail(`${name} must be a positive integer`);
  return parsed;
}

function parseActorLogin(name, value) {
  const parsed = String(value || '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(parsed)) fail(`${name} must be an exact GitHub login`);
  return parsed;
}

function parseReleasePurpose(value, siteContractMode) {
  const parsed = String(value || '');
  if (!RELEASE_PURPOSES.has(parsed)) {
    fail('release purpose must be bootstrap-migration or approved-site-release');
  }
  if (
    siteContractMode === 'bootstrap' && parsed !== 'bootstrap-migration'
    || siteContractMode === 'normal' && parsed !== 'approved-site-release'
  ) {
    fail('release purpose must exactly match the protected site contract mode');
  }
  return parsed;
}

function parseReleaseAuthorization(bindings, approvedReviewerIds, siteContractMode) {
  const mode = String(bindings.releaseAuthorityMode || '');
  const approvedMode = String(bindings.approvedReleaseAuthorityMode || '');
  if (!AUTHORITY_MODES.has(mode) || mode !== approvedMode) {
    fail('release authority mode must exactly match independent_review or solo_founder');
  }

  const actorId = parsePositiveInteger('release actor ID', bindings.releaseActorId);
  const actorLogin = parseActorLogin('release actor login', bindings.releaseActorLogin);
  const triggeringActorLogin = parseActorLogin(
    'release triggering actor login',
    bindings.releaseTriggeringActorLogin,
  );
  const eventName = String(bindings.releaseEventName || '');
  const ref = String(bindings.releaseRef || '');
  const workflowRef = String(bindings.releaseWorkflowRef || '');
  const runId = parsePositiveInteger('release run ID', bindings.releaseRunId);
  const runAttempt = parsePositiveInteger('release run attempt', bindings.releaseRunAttempt);
  const purpose = parseReleasePurpose(bindings.releasePurpose, siteContractMode);
  if (eventName !== 'workflow_dispatch') fail('site release must originate from workflow_dispatch');
  if (ref !== 'refs/heads/main') fail('site release must be dispatched from refs/heads/main');
  if (!workflowRef.toLowerCase().endsWith('/.github/workflows/deploy-pages.yml@refs/heads/main')) {
    fail('site release must use deploy-pages.yml from refs/heads/main');
  }
  if (runAttempt !== 1) fail('workflow reruns are not release authorizations; dispatch a fresh run');

  let founderActorId = null;
  let founderActorLogin = null;
  if (mode === 'independent_review') {
    if (approvedReviewerIds.length < 1) fail('independent_review requires at least one approved reviewer');
  } else {
    if (approvedReviewerIds.length !== 0) fail('solo_founder must not simulate independent environment reviewers');
    founderActorId = parsePositiveInteger('approved solo founder actor ID', bindings.approvedSoloFounderActorId);
    founderActorLogin = parseActorLogin(
      'approved solo founder actor login',
      bindings.approvedSoloFounderActorLogin,
    );
    if (
      actorId !== founderActorId
      || actorLogin !== founderActorLogin
      || triggeringActorLogin !== founderActorLogin
    ) {
      fail('solo_founder dispatch actor does not exactly match the protected founder identity');
    }
  }

  return {
    mode,
    actor_id: actorId,
    actor_login: actorLogin,
    triggering_actor_login: triggeringActorLogin,
    founder_actor_id: founderActorId,
    founder_actor_login: founderActorLogin,
    event_name: eventName,
    ref,
    workflow_ref: workflowRef,
    run_id: runId,
    run_attempt: runAttempt,
    purpose,
  };
}

function assertBindings(bindings) {
  const siteContractMode = String(bindings.siteContractMode || '');
  const approvedSiteContractMode = String(bindings.approvedSiteContractMode || '');
  if (!['bootstrap', 'normal'].includes(siteContractMode)) {
    fail('requested site contract mode must be bootstrap or normal');
  }
  if (siteContractMode !== approvedSiteContractMode) {
    fail('requested site contract mode does not exactly match the protected approved mode');
  }
  const sourceSha = assertSha('requested site SHA', bindings.sourceSha);
  const approvedSha = assertSha('approved site SHA', bindings.approvedSha);
  if (sourceSha !== approvedSha) fail('requested site SHA does not exactly match the protected approved SHA');

  const compatible = parseShaList('requested compatible backend site SHAs', bindings.compatibleShas);
  const approvedCompatible = parseShaList('approved compatible backend site SHAs', bindings.approvedCompatibleShas);
  if (JSON.stringify(compatible) !== JSON.stringify(approvedCompatible)) {
    fail('requested compatible backend site SHAs do not exactly match the protected approved list');
  }
  if (!compatible.includes(sourceSha)) fail('compatible backend site SHAs must include the requested site SHA');

  const rollbackSha = assertSha('requested rollback site SHA', bindings.rollbackSha);
  const approvedRollbackSha = assertSha('approved rollback site SHA', bindings.approvedRollbackSha);
  if (rollbackSha !== approvedRollbackSha || rollbackSha === sourceSha) {
    fail('rollback site SHA must exactly match a distinct protected previously approved SHA');
  }
  const canonicalMigrationPair = [rollbackSha, sourceSha].sort();
  if (JSON.stringify(compatible) !== JSON.stringify(canonicalMigrationPair)) {
    fail('candidate compatibility must be the canonical sorted pair of legacy and candidate site SHAs');
  }
  const rollbackCompatible = parseShaList('requested rollback compatible backend site SHAs', bindings.rollbackCompatibleShas);
  const approvedRollbackCompatible = parseShaList(
    'approved rollback compatible backend site SHAs',
    bindings.approvedRollbackCompatibleShas,
  );
  if (JSON.stringify(rollbackCompatible) !== JSON.stringify(approvedRollbackCompatible)) {
    fail('requested rollback compatibility does not exactly match the protected approved list');
  }
  if (JSON.stringify(rollbackCompatible) !== JSON.stringify([...rollbackCompatible].sort())) {
    fail('rollback compatibility must be canonical SHA sort order');
  }
  if (!rollbackCompatible.includes(rollbackSha)) fail('rollback compatibility must include the rollback site SHA');
  if (JSON.stringify(rollbackCompatible) !== JSON.stringify([rollbackSha])) {
    fail('rollback compatibility must contain only the rollback site SHA');
  }

  const backendBridgeSha = assertSha('requested backend bridge SHA', bindings.backendBridgeSha);
  if (backendBridgeSha !== assertSha('approved backend bridge SHA', bindings.approvedBackendBridgeSha)) {
    fail('requested backend bridge SHA does not exactly match the protected approved SHA');
  }
  const rollbackBackendSha = assertSha('requested rollback backend SHA', bindings.rollbackBackendSha);
  if (rollbackBackendSha !== assertSha('approved rollback backend SHA', bindings.approvedRollbackBackendSha)) {
    fail('requested rollback backend SHA does not exactly match the protected approved SHA');
  }
  const finalBackendSha = assertSha('requested final backend SHA', bindings.finalBackendSha);
  if (finalBackendSha !== assertSha('approved final backend SHA', bindings.approvedFinalBackendSha)) {
    fail('requested final backend SHA does not exactly match the protected approved SHA');
  }
  if (finalBackendSha === backendBridgeSha) fail('final backend SHA must be distinct from the migration bridge SHA');

  const approvedReviewerIds = parseReviewerIds(bindings.approvedReviewerIds);
  const releaseAuthorization = parseReleaseAuthorization(bindings, approvedReviewerIds, siteContractMode);

  return {
    siteContractMode,
    sourceSha,
    compatible,
    rollbackSha,
    rollbackCompatible,
    backendBridgeSha,
    rollbackBackendSha,
    finalBackendSha,
    approvedReviewerIds,
    releaseAuthorization,
  };
}

function hasExactRequiredCheck(requiredStatusChecks) {
  if (!requiredStatusChecks || requiredStatusChecks.strict !== true) return false;
  const checks = Array.isArray(requiredStatusChecks.checks) ? requiredStatusChecks.checks : [];
  return checks.some((check) => (
    check
    && check.context === EXACT_VERIFY_CHECK
    && Number(check.app_id) === GITHUB_ACTIONS_APP_ID
  ));
}

function listIsEmpty(value) {
  return !value || !Array.isArray(value.users) && !Array.isArray(value.teams) && !Array.isArray(value.apps)
    ? true
    : [value.users, value.teams, value.apps].every((items) => !Array.isArray(items) || items.length === 0);
}

function validateBranchProtection(protection, authorityMode = 'independent_review') {
  if (!protection || protection.missing === true) return false;
  if (!hasExactRequiredCheck(protection.required_status_checks)) {
    fail(`branch protection must strictly require ${EXACT_VERIFY_CHECK} from GitHub Actions`);
  }
  if (protection.allow_force_pushes?.enabled !== false) fail('branch protection must block force pushes');
  if (protection.allow_deletions?.enabled !== false) fail('branch protection must block branch deletion');
  if (protection.enforce_admins?.enabled !== true) fail('branch protection must enforce controls for administrators');
  const reviewBypass = protection.required_pull_request_reviews?.bypass_pull_request_allowances;
  if (!listIsEmpty(reviewBypass)) fail('branch protection must not grant pull-request bypass allowances');
  const reviews = protection.required_pull_request_reviews;
  if (authorityMode === 'independent_review') {
    if (
      Number(reviews?.required_approving_review_count) < 1
      || reviews?.dismiss_stale_reviews !== true
      || reviews?.require_last_push_approval !== true
    ) {
      fail('branch protection must require an independent approving review after the latest push');
    }
  } else if (
    Number(reviews?.required_approving_review_count) !== 0
    || reviews?.dismiss_stale_reviews !== true
    || reviews?.require_last_push_approval !== false
  ) {
    fail('solo-founder branch protection must require PRs without simulated approvals');
  }
  if (protection.required_conversation_resolution?.enabled !== true) {
    fail('branch protection must require conversation resolution');
  }
  return true;
}

function rulesetAppliesToMain(ruleset) {
  if (!ruleset || ruleset.target !== 'branch' || ruleset.enforcement !== 'active') return false;
  const refName = ruleset.conditions?.ref_name;
  const includes = Array.isArray(refName?.include) ? refName.include : [];
  const excludes = Array.isArray(refName?.exclude) ? refName.exclude : [];
  const mainNames = new Set(['refs/heads/main', '~DEFAULT_BRANCH']);
  return includes.length === 1 && mainNames.has(includes[0]) && excludes.length === 0;
}

function validateRulesets(rulesets, authorityMode = 'independent_review') {
  const applicable = (Array.isArray(rulesets) ? rulesets : []).filter(rulesetAppliesToMain);
  if (applicable.length === 0) return false;
  if (applicable.some((ruleset) => Array.isArray(ruleset.bypass_actors) && ruleset.bypass_actors.length > 0)) {
    fail('active main-branch rulesets must not grant bypass actors');
  }

  const rules = applicable.flatMap((ruleset) => Array.isArray(ruleset.rules) ? ruleset.rules : []);
  const types = new Set(rules.map((rule) => rule?.type));
  if (!types.has('deletion')) fail('active main-branch rulesets must block deletion');
  if (!types.has('non_fast_forward')) fail('active main-branch rulesets must block force pushes');
  const statusRules = rules.filter((rule) => rule?.type === 'required_status_checks');
  const exactCheckRequired = statusRules.some((rule) => (
    rule.parameters?.strict_required_status_checks_policy === true
    && Array.isArray(rule.parameters?.required_status_checks)
    && rule.parameters.required_status_checks.some((check) => (
      check.context === EXACT_VERIFY_CHECK
      && Number(check.integration_id) === GITHUB_ACTIONS_APP_ID
    ))
  ));
  if (!exactCheckRequired) fail(`active main-branch rulesets must strictly require ${EXACT_VERIFY_CHECK} from GitHub Actions`);
  const pullRequestRules = rules.filter((rule) => rule?.type === 'pull_request');
  const validPullRequestRule = authorityMode === 'independent_review'
    ? pullRequestRules.some((rule) => (
      Number(rule.parameters?.required_approving_review_count) >= 1
      && rule.parameters?.dismiss_stale_reviews_on_push === true
      && rule.parameters?.require_last_push_approval === true
      && rule.parameters?.required_review_thread_resolution === true
    ))
    : pullRequestRules.some((rule) => (
      Number(rule.parameters?.required_approving_review_count) === 0
      && rule.parameters?.dismiss_stale_reviews_on_push === true
      && rule.parameters?.require_last_push_approval === false
      && rule.parameters?.required_review_thread_resolution === true
    ));
  if (!validPullRequestRule) {
    fail(authorityMode === 'independent_review'
      ? 'active main-branch rulesets must require independent review after the latest push and thread resolution'
      : 'solo-founder rulesets must require PRs, exact checks, and thread resolution without simulated approvals');
  }
  return true;
}

function validateEnvironment(environment, branchPolicies, approvedReviewerIds, authorityMode) {
  if (!environment || environment.name !== 'github-pages') fail('github-pages environment state is missing');
  if (environment.can_admins_bypass !== false) fail('github-pages must disable administrator bypass');
  const rules = Array.isArray(environment.protection_rules) ? environment.protection_rules : [];
  const reviewerRule = rules.find((rule) => rule?.type === 'required_reviewers');
  if (authorityMode === 'independent_review') {
    if (!reviewerRule || reviewerRule.prevent_self_review !== true) {
      fail('github-pages must require reviewers and prevent self-review');
    }
    const actualReviewerIds = (Array.isArray(reviewerRule.reviewers) ? reviewerRule.reviewers : [])
      .map((entry) => Number(entry?.reviewer?.id))
      .filter(Number.isSafeInteger)
      .sort((left, right) => left - right);
    if (JSON.stringify(actualReviewerIds) !== JSON.stringify(approvedReviewerIds)) {
      fail('github-pages reviewer IDs do not exactly match the protected approved reviewer list');
    }
  } else if (reviewerRule) {
    fail('solo_founder environment must not contain a simulated required-reviewer rule');
  }

  const deploymentPolicy = environment.deployment_branch_policy;
  if (deploymentPolicy?.protected_branches !== false || deploymentPolicy?.custom_branch_policies !== true) {
    fail('github-pages deployment policy must use exact custom branch policies');
  }
  const policies = Array.isArray(branchPolicies?.branch_policies) ? branchPolicies.branch_policies : [];
  if (policies.length !== 1 || policies[0]?.name !== 'main' || policies[0]?.type !== 'branch') {
    fail('github-pages deployment policy must allow exactly the main branch and no tags or patterns');
  }
}

function validateSuccessfulCheck(checkRuns, sourceSha) {
  const matching = (Array.isArray(checkRuns?.check_runs) ? checkRuns.check_runs : []).filter((check) => (
    check?.name === EXACT_VERIFY_CHECK
    && Number(check?.app?.id) === GITHUB_ACTIONS_APP_ID
    && check?.head_sha === sourceSha
    && check?.status === 'completed'
    && check?.conclusion === 'success'
  ));
  if (matching.length < 1) fail(`source SHA has no successful exact ${EXACT_VERIFY_CHECK} GitHub Actions check`);
}

function validateRollbackDeployment(deployments, rollbackSha) {
  const successful = (Array.isArray(deployments) ? deployments : []).filter((deployment) => (
    deployment?.environment === 'github-pages'
    && Array.isArray(deployment?.statuses)
    && deployment.statuses.some((status) => status?.state === 'success')
  ));
  const latest = successful[0] || null;
  if (
    latest?.sha !== rollbackSha
  ) {
    fail('rollback SHA must be the latest successful github-pages deployment');
  }
}

function validateLatestPagesBuild(latestPagesBuild, rollbackSha) {
  if (latestPagesBuild?.commit !== rollbackSha || latestPagesBuild?.status !== 'built') {
    fail('latest successful Pages build must exactly match the rollback SHA');
  }
}

function validateBackendStatus(status, expectedSiteSha, expectedBackendSha) {
  if (
    status?.status !== 'operational'
    || status?.public_site_source_sha !== expectedSiteSha
    || status?.backend_source_sha !== expectedBackendSha
  ) {
    fail('backend bridge status must be operational and exactly match the approved backend and site SHAs');
  }
}

function validatePlatformState(snapshot, bindings) {
  const approved = assertBindings(bindings);
  if (snapshot?.repository?.full_name !== bindings.repository || snapshot?.repository?.default_branch !== 'main') {
    fail('repository identity or default branch is not exact');
  }
  if (snapshot?.pages?.build_type !== 'workflow') fail('Pages publishing source must be GitHub Actions workflow');
  if (snapshot?.pages?.https_enforced !== true) fail('GitHub Pages HTTPS enforcement must be enabled');
  validateEnvironment(
    snapshot.environment,
    snapshot.deploymentBranchPolicies,
    approved.approvedReviewerIds,
    approved.releaseAuthorization.mode,
  );

  const branchProtectionPresent = validateBranchProtection(
    snapshot.branchProtection,
    approved.releaseAuthorization.mode,
  );
  const rulesetsPresent = validateRulesets(snapshot.rulesets, approved.releaseAuthorization.mode);
  if (!branchProtectionPresent && !rulesetsPresent) {
    fail('main must be protected by branch protection or active rulesets');
  }
  validateSuccessfulCheck(snapshot.checkRuns, approved.sourceSha);
  validateRollbackDeployment(snapshot.rollbackDeployments, approved.rollbackSha);
  validateLatestPagesBuild(snapshot.latestPagesBuild, approved.rollbackSha);
  if (approved.siteContractMode === 'bootstrap') {
    if (
      snapshot?.currentLiveRelease?.missing !== true
      || snapshot?.currentLiveRelease?.status_code !== 404
      || Object.prototype.hasOwnProperty.call(snapshot.currentLiveRelease, 'source_sha')
    ) {
      fail('bootstrap mode requires the reviewed legacy site to return release.json 404');
    }
  } else if (
    snapshot?.currentLiveRelease?.missing === true
    || snapshot?.currentLiveRelease?.source_sha !== approved.rollbackSha
  ) {
    fail('normal mode requires release.json to exactly match the rollback SHA');
  }
  validateBackendStatus(snapshot.currentBackendStatus, approved.rollbackSha, approved.backendBridgeSha);
  return approved;
}

function ghApi(endpoint, { allowMissing = false } = {}) {
  const result = spawnSync('gh', ['api', endpoint], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    if (allowMissing && /404|Not Found/i.test(`${result.stderr}\n${result.stdout}`)) return { missing: true };
    fail(`read-only GitHub API request failed for ${endpoint}: ${(result.stderr || result.stdout).trim()}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(`GitHub API returned invalid JSON for ${endpoint}`);
  }
}

function readExactJsonUrl(url, label) {
  const result = spawnSync('curl', [
    '--fail', '--silent', '--show-error',
    '--proto', '=https', '--tlsv1.2',
    '--connect-timeout', '10', '--max-time', '30', '--max-redirs', '0',
    '--header', 'Accept-Encoding: identity',
    url,
  ], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) fail(`${label} readback failed without redirects: ${result.stderr.trim()}`);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    if (/^HOLD:/.test(error.message)) throw error;
    fail(`${label} is not valid JSON`);
  }
}

function readCurrentLiveRelease(publicOrigin, cacheToken) {
  if (publicOrigin !== 'https://auxtho.com') fail('public site origin must be exactly https://auxtho.com');
  const url = `${publicOrigin}/release.json?authorization_cache_bust=${encodeURIComponent(cacheToken)}`;
  const result = spawnSync('curl', [
    '--silent', '--show-error',
    '--proto', '=https', '--tlsv1.2',
    '--connect-timeout', '10', '--max-time', '30', '--max-redirs', '0',
    '--header', 'Accept-Encoding: identity',
    '--write-out', '\n%{http_code}',
    url,
  ], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) fail(`current live release.json readback failed without redirects: ${result.stderr.trim()}`);
  return parseCurrentLiveReleaseResponse(result.stdout);
}

function parseCurrentLiveReleaseResponse(rawResponse) {
  const separator = String(rawResponse || '').lastIndexOf('\n');
  if (separator < 0) fail('current live release.json response did not include an HTTP status');
  const body = rawResponse.slice(0, separator);
  const statusCode = Number(rawResponse.slice(separator + 1).trim());
  if (statusCode === 404) return { missing: true, status_code: 404 };
  if (statusCode !== 200) fail(`current live release.json returned unexpected HTTP ${statusCode}`);
  let release;
  try {
    release = JSON.parse(body);
  } catch {
    fail('current live release.json is not valid JSON');
  }
  assertSha('current live release source SHA', release?.source_sha);
  return release;
}

function readCurrentBackendStatus(cacheToken) {
  return readExactJsonUrl(
    `https://api.auxtho.com/api/verify/status?authorization_cache_bust=${encodeURIComponent(cacheToken)}`,
    'backend bridge status',
  );
}

function capturePlatformState({ repository, sourceSha, rollbackSha, publicOrigin }) {
  assertSha('source SHA', sourceSha);
  assertSha('rollback SHA', rollbackSha);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) fail('repository name is invalid');

  const rulesetList = ghApi(`repos/${repository}/rulesets?includes_parents=true`);
  const rulesets = (Array.isArray(rulesetList) ? rulesetList : []).map((ruleset) => (
    ghApi(`repos/${repository}/rulesets/${ruleset.id}?includes_parents=true`)
  ));
  const deployments = ghApi(`repos/${repository}/deployments?environment=github-pages&per_page=100`);
  const rollbackDeployments = (Array.isArray(deployments) ? deployments : []).map((deployment) => ({
    ...deployment,
    statuses: ghApi(`repos/${repository}/deployments/${deployment.id}/statuses?per_page=100`),
  }));

  return {
    schema_version: 1,
    repository: ghApi(`repos/${repository}`),
    pages: ghApi(`repos/${repository}/pages`),
    environment: ghApi(`repos/${repository}/environments/github-pages`),
    deploymentBranchPolicies: ghApi(
      `repos/${repository}/environments/github-pages/deployment-branch-policies?per_page=100`,
    ),
    branchProtection: ghApi(`repos/${repository}/branches/main/protection`, { allowMissing: true }),
    rulesets,
    checkRuns: ghApi(`repos/${repository}/commits/${sourceSha}/check-runs?per_page=100`),
    latestPagesBuild: ghApi(`repos/${repository}/pages/builds/latest`),
    rollbackDeployments,
    currentLiveRelease: readCurrentLiveRelease(publicOrigin, `${sourceSha}-${process.env.GITHUB_RUN_ID || 'local'}`),
    currentBackendStatus: readCurrentBackendStatus(`${sourceSha}-${process.env.GITHUB_RUN_ID || 'local'}`),
  };
}

function bindingsFromEnvironment() {
  return {
    repository: process.env.GITHUB_REPOSITORY,
    siteContractMode: process.env.REQUESTED_SITE_CONTRACT_MODE,
    approvedSiteContractMode: process.env.APPROVED_SITE_CONTRACT_MODE,
    sourceSha: process.env.REQUESTED_SITE_SHA,
    approvedSha: process.env.APPROVED_SITE_SHA,
    compatibleShas: process.env.REQUESTED_COMPATIBLE_BACKEND_SITE_SHAS,
    approvedCompatibleShas: process.env.APPROVED_COMPATIBLE_BACKEND_SITE_SHAS,
    rollbackSha: process.env.REQUESTED_ROLLBACK_SITE_SHA,
    approvedRollbackSha: process.env.APPROVED_ROLLBACK_SITE_SHA,
    rollbackCompatibleShas: process.env.REQUESTED_ROLLBACK_COMPATIBLE_BACKEND_SITE_SHAS,
    approvedRollbackCompatibleShas: process.env.APPROVED_ROLLBACK_COMPATIBLE_BACKEND_SITE_SHAS,
    approvedReviewerIds: process.env.APPROVED_ENVIRONMENT_REVIEWER_IDS,
    releaseAuthorityMode: process.env.APPROVED_RELEASE_AUTHORITY_MODE,
    approvedReleaseAuthorityMode: process.env.APPROVED_RELEASE_AUTHORITY_MODE,
    approvedSoloFounderActorId: process.env.APPROVED_SOLO_FOUNDER_ACTOR_ID,
    approvedSoloFounderActorLogin: process.env.APPROVED_SOLO_FOUNDER_ACTOR_LOGIN,
    releaseActorId: process.env.RELEASE_ACTOR_ID,
    releaseActorLogin: process.env.RELEASE_ACTOR_LOGIN,
    releaseTriggeringActorLogin: process.env.RELEASE_TRIGGERING_ACTOR_LOGIN,
    releaseEventName: process.env.RELEASE_EVENT_NAME,
    releaseRef: process.env.RELEASE_REF,
    releaseWorkflowRef: process.env.RELEASE_WORKFLOW_REF,
    releaseRunId: process.env.RELEASE_RUN_ID,
    releaseRunAttempt: process.env.RELEASE_RUN_ATTEMPT,
    releasePurpose: process.env.REQUESTED_RELEASE_PURPOSE,
    publicOrigin: process.env.PUBLIC_SITE_ORIGIN,
    backendBridgeSha: process.env.REQUESTED_BACKEND_BRIDGE_SHA,
    approvedBackendBridgeSha: process.env.APPROVED_BACKEND_BRIDGE_SHA,
    rollbackBackendSha: process.env.REQUESTED_ROLLBACK_BACKEND_SHA,
    approvedRollbackBackendSha: process.env.APPROVED_ROLLBACK_BACKEND_SHA,
    finalBackendSha: process.env.REQUESTED_FINAL_BACKEND_SHA,
    approvedFinalBackendSha: process.env.APPROVED_FINAL_BACKEND_SHA,
  };
}

function run(argv) {
  if (argv[0] === 'assert-pages-bootstrap' && argv.length === 2) {
    const repository = process.env.GITHUB_REPOSITORY;
    const pages = ghApi(`repos/${repository}/pages`);
    if (pages?.build_type !== 'workflow') fail('Pages build_type must be workflow before the site PR can merge');
    if (pages?.https_enforced !== true) fail('Pages HTTPS enforcement must be enabled before the site PR can merge');
    const outputPath = path.resolve(argv[1]);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify({ repository, pages }, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write('pages-bootstrap build_type=workflow https_enforced=true\n');
    return;
  }
  if (argv[0] !== 'capture-and-validate' || argv.length !== 2) {
    fail('usage: platform-controls.cjs <assert-pages-bootstrap|capture-and-validate> <snapshot-output.json>');
  }
  const bindings = bindingsFromEnvironment();
  const approved = assertBindings(bindings);
  const snapshot = capturePlatformState({
    repository: bindings.repository,
    sourceSha: bindings.sourceSha,
    rollbackSha: bindings.rollbackSha,
    publicOrigin: bindings.publicOrigin,
  });
  snapshot.releaseAuthorization = approved.releaseAuthorization;
  validatePlatformState(snapshot, bindings);
  const outputPath = path.resolve(argv[1]);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`platform-controls authorized source=${bindings.sourceSha} rollback=${bindings.rollbackSha}\n`);
}

if (require.main === module) {
  try {
    run(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  EXACT_VERIFY_CHECK,
  GITHUB_ACTIONS_APP_ID,
  assertBindings,
  capturePlatformState,
  parseCurrentLiveReleaseResponse,
  validateBranchProtection,
  validateBackendStatus,
  validateLatestPagesBuild,
  validatePlatformState,
  validateRulesets,
};
