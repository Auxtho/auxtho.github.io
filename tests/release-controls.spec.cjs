const assert = require('node:assert/strict');
const test = require('node:test');

const {
  EXACT_VERIFY_CHECK,
  GITHUB_ACTIONS_APP_ID,
  assertBindings,
  parseCurrentLiveReleaseResponse,
  validateBackendStatus,
  validatePlatformState,
  validateRulesets,
} = require('../scripts/release/platform-controls.cjs');
const {
  parseDigestManifest,
  resolveHttpsRedirect,
  validateRelease,
} = require('../scripts/release/verify-deployment.cjs');
const {
  createFinalizeSignal,
  createRollbackSignal,
} = require('../scripts/release/rollback-signal.cjs');

const L = '1'.repeat(40);
const S = 'a'.repeat(40);
const B = 'b'.repeat(40);
const F = 'f'.repeat(40);
const RL = 'c'.repeat(40);
const COMPATIBILITY = [L, S].sort();

function bindings(overrides = {}) {
  return {
    repository: 'auxtho/auxtho.github.io',
    siteContractMode: 'bootstrap',
    approvedSiteContractMode: 'bootstrap',
    sourceSha: S,
    approvedSha: S,
    compatibleShas: JSON.stringify(COMPATIBILITY),
    approvedCompatibleShas: JSON.stringify(COMPATIBILITY),
    rollbackSha: L,
    approvedRollbackSha: L,
    rollbackCompatibleShas: JSON.stringify([L]),
    approvedRollbackCompatibleShas: JSON.stringify([L]),
    backendBridgeSha: B,
    approvedBackendBridgeSha: B,
    finalBackendSha: F,
    approvedFinalBackendSha: F,
    rollbackBackendSha: RL,
    approvedRollbackBackendSha: RL,
    approvedReviewerIds: JSON.stringify([101]),
    ...overrides,
  };
}

function validBranchProtection() {
  return {
    required_status_checks: {
      strict: true,
      checks: [{ context: EXACT_VERIFY_CHECK, app_id: GITHUB_ACTIONS_APP_ID }],
    },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    enforce_admins: { enabled: true },
    required_pull_request_reviews: {
      bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
      required_approving_review_count: 1,
      dismiss_stale_reviews: true,
      require_last_push_approval: true,
    },
    required_conversation_resolution: { enabled: true },
  };
}

function snapshot() {
  return {
    repository: { full_name: 'auxtho/auxtho.github.io', default_branch: 'main' },
    pages: { build_type: 'workflow', https_enforced: true },
    environment: {
      name: 'github-pages',
      can_admins_bypass: false,
      protection_rules: [{
        type: 'required_reviewers',
        prevent_self_review: true,
        reviewers: [{ reviewer: { id: 101, login: 'approved-reviewer' } }],
      }],
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
    },
    deploymentBranchPolicies: { branch_policies: [{ name: 'main', type: 'branch' }] },
    branchProtection: validBranchProtection(),
    rulesets: [],
    checkRuns: {
      check_runs: [{
        name: EXACT_VERIFY_CHECK,
        app: { id: GITHUB_ACTIONS_APP_ID },
        head_sha: S,
        status: 'completed',
        conclusion: 'success',
      }],
    },
    rollbackDeployments: [{
      sha: L,
      environment: 'github-pages',
      statuses: [{ state: 'success' }],
    }],
    latestPagesBuild: { commit: L, status: 'built' },
    currentLiveRelease: { missing: true, status_code: 404 },
    currentBackendStatus: { status: 'operational', backend_source_sha: B, public_site_source_sha: L },
  };
}

function validRuleset() {
  return {
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [{ context: EXACT_VERIFY_CHECK, integration_id: GITHUB_ACTIONS_APP_ID }],
        },
      },
      {
        type: 'pull_request',
        parameters: {
          required_approving_review_count: 1,
          dismiss_stale_reviews_on_push: true,
          require_last_push_approval: true,
          required_review_thread_resolution: true,
        },
      },
    ],
  };
}

test('bootstrap authorization accepts only exact S with canonical [L,S], bridge B -> L, and legacy release 404 at L', () => {
  const approved = validatePlatformState(snapshot(), bindings());
  assert.equal(approved.sourceSha, S);
  assert.equal(approved.rollbackSha, L);
  assert.deepEqual(approved.compatible, COMPATIBILITY);
  assert.equal(approved.backendBridgeSha, B);
  assert.equal(approved.finalBackendSha, F);
});

test('candidate compatibility is exactly the canonical distinct legacy/candidate pair', () => {
  assert.throws(() => assertBindings(bindings({
    siteContractMode: 'bootstrap',
    approvedSiteContractMode: 'normal',
  })), /protected approved mode/);
  assert.throws(() => assertBindings(bindings({
    rollbackCompatibleShas: JSON.stringify([L, S].sort()),
    approvedRollbackCompatibleShas: JSON.stringify([L, S].sort()),
  })), /rollback compatibility/);
  assert.throws(() => assertBindings(bindings({
    compatibleShas: JSON.stringify([S]),
    approvedCompatibleShas: JSON.stringify([S]),
  })), /canonical sorted pair/);
  assert.throws(() => assertBindings(bindings({
    compatibleShas: JSON.stringify([...COMPATIBILITY].reverse()),
    approvedCompatibleShas: JSON.stringify([...COMPATIBILITY].reverse()),
  })), /canonical sorted pair/);
  assert.throws(() => assertBindings(bindings({ finalBackendSha: B, approvedFinalBackendSha: B })), /distinct/);
});

test('branch, environment, Pages HTTPS, live release, and backend controls fail closed independently', () => {
  const cases = [
    [(state) => { state.pages.https_enforced = false; }, /HTTPS enforcement/],
    [(state) => { state.pages.build_type = 'legacy'; }, /publishing source/],
    [(state) => { state.branchProtection.allow_force_pushes.enabled = true; }, /block force pushes/],
    [(state) => { state.branchProtection.allow_deletions.enabled = true; }, /block branch deletion/],
    [(state) => { state.branchProtection.enforce_admins.enabled = false; }, /administrators/],
    [(state) => { state.branchProtection.required_status_checks.checks[0].context = 'Other Check'; }, /strictly require/],
    [(state) => { state.branchProtection.required_pull_request_reviews.required_approving_review_count = 0; }, /independent approving review/],
    [(state) => { state.branchProtection.required_pull_request_reviews.dismiss_stale_reviews = false; }, /independent approving review/],
    [(state) => { state.branchProtection.required_pull_request_reviews.require_last_push_approval = false; }, /independent approving review/],
    [(state) => { state.branchProtection.required_conversation_resolution.enabled = false; }, /conversation resolution/],
    [(state) => { state.environment.can_admins_bypass = true; }, /administrator bypass/],
    [(state) => { state.environment.protection_rules[0].reviewers[0].reviewer.id = 102; }, /reviewer IDs/],
    [(state) => { state.deploymentBranchPolicies.branch_policies[0].name = 'release/*'; }, /exactly the main branch/],
    [(state) => { state.rollbackDeployments[0].sha = '2'.repeat(40); }, /latest successful/],
    [(state) => { state.latestPagesBuild.commit = '2'.repeat(40); }, /latest successful Pages build/],
    [(state) => { state.latestPagesBuild.status = 'building'; }, /latest successful Pages build/],
    [(state) => { state.currentLiveRelease = { source_sha: L }; }, /bootstrap mode requires/],
    [(state) => { state.currentLiveRelease.status_code = 500; }, /bootstrap mode requires/],
    [(state) => { delete state.currentBackendStatus.backend_source_sha; }, /exactly match/],
    [(state) => { state.currentBackendStatus.public_site_source_sha = S; }, /exactly match/],
  ];
  for (const [mutate, expected] of cases) {
    const state = snapshot();
    mutate(state);
    assert.throws(() => validatePlatformState(state, bindings()), expected);
  }

  assert.throws(() => validatePlatformState(snapshot(), bindings({
    siteContractMode: 'normal',
    approvedSiteContractMode: 'normal',
  })), /normal mode requires/);

  const normalState = snapshot();
  normalState.currentLiveRelease = { source_sha: L };
  assert.equal(validatePlatformState(normalState, bindings({
    siteContractMode: 'normal',
    approvedSiteContractMode: 'normal',
  })).siteContractMode, 'normal');

  const withPendingCurrentJob = snapshot();
  withPendingCurrentJob.rollbackDeployments.unshift({
    sha: S,
    environment: 'github-pages',
    statuses: [{ state: 'in_progress' }],
  });
  assert.equal(validatePlatformState(withPendingCurrentJob, bindings()).rollbackSha, L);
});

test('legacy release readback accepts exact 404 or valid JSON 200 and rejects every other status', () => {
  assert.deepEqual(parseCurrentLiveReleaseResponse('<html>missing</html>\n404'), {
    missing: true,
    status_code: 404,
  });
  assert.deepEqual(parseCurrentLiveReleaseResponse(`${JSON.stringify({ source_sha: L })}\n200`), {
    source_sha: L,
  });
  assert.throws(() => parseCurrentLiveReleaseResponse('redirect\n302'), /unexpected HTTP 302/);
  assert.throws(() => parseCurrentLiveReleaseResponse('not-json\n200'), /not valid JSON/);
  assert.throws(() => parseCurrentLiveReleaseResponse('missing-status'), /did not include an HTTP status/);
});

test('active no-bypass rulesets can supply exact deletion, force-push, and verify protections', () => {
  const state = snapshot();
  state.branchProtection = { missing: true };
  state.rulesets = [validRuleset()];
  assert.equal(validatePlatformState(state, bindings()).sourceSha, S);

  const bypassed = validRuleset();
  bypassed.bypass_actors = [{ actor_id: 1, actor_type: 'Team', bypass_mode: 'always' }];
  assert.throws(() => validateRulesets([bypassed]), /must not grant bypass actors/);

  const noReview = validRuleset();
  noReview.rules = noReview.rules.filter((rule) => rule.type !== 'pull_request');
  assert.throws(() => validateRulesets([noReview]), /independent review/);
});

test('backend status accepts bridge B -> L, final F -> S, and rollback RL -> L only exactly', () => {
  assert.doesNotThrow(() => validateBackendStatus(
    { status: 'operational', backend_source_sha: B, public_site_source_sha: L },
    L,
    B,
  ));
  assert.doesNotThrow(() => validateBackendStatus(
    { status: 'operational', backend_source_sha: F, public_site_source_sha: S },
    S,
    F,
  ));
  assert.doesNotThrow(() => validateBackendStatus(
    { status: 'operational', backend_source_sha: RL, public_site_source_sha: L },
    L,
    RL,
  ));
  assert.throws(() => validateBackendStatus(
    { status: 'operational', backend_source_sha: B, public_site_source_sha: S },
    L,
    B,
  ), /exactly match/);
});

test('postdeploy release validation accepts source S while bridge reports compatible L', () => {
  const transition = {
    bridge_reported_site_sha: L,
    final_reported_site_sha: S,
    rollback_reported_site_sha: L,
  };
  const release = {
    schema_version: 2,
    publication_mode: 'candidate',
    source_sha: S,
    previous_approved_source_sha: L,
    compatible_backend_site_shas: COMPATIBILITY,
    backend_site_sha_transition: transition,
    rollback_of_source_sha: null,
    release_manifest: { path: '/assets/release-manifest.json', sha256: 'd'.repeat(64) },
    privacy_manifest: { path: '/assets/proposal/evidence-manifest-20260716.json', sha256: 'e'.repeat(64) },
  };
  const provenance = { source_sha: S, previous_approved_source_sha: L };
  assert.doesNotThrow(() => validateRelease(release, provenance, {
    mode: 'candidate',
    sourceSha: S,
    backendReportedSiteSha: L,
    compatibleShas: COMPATIBILITY,
    rollbackOfSha: null,
  }));
  assert.throws(() => validateRelease(release, provenance, {
    mode: 'candidate',
    sourceSha: S,
    backendReportedSiteSha: '9'.repeat(40),
    compatibleShas: COMPATIBILITY,
    rollbackOfSha: null,
  }), /omits the backend-reported/);
});

test('HTTPS redirect resolver rejects every downgrade and unreviewed origin', () => {
  const allowed = ['https://auxtho.com', 'https://auxtho.github.io'];
  assert.equal(
    resolveHttpsRedirect(new URL('https://auxtho.com/verify.html'), '/verify.html', allowed).href,
    'https://auxtho.com/verify.html',
  );
  assert.throws(
    () => resolveHttpsRedirect(new URL('https://auxtho.com/'), 'http://auxtho.com/', allowed),
    /HTTP downgrade/,
  );
  assert.throws(
    () => resolveHttpsRedirect(new URL('https://auxtho.com/'), 'https://example.com/', allowed),
    /reviewed HTTPS origins/,
  );
});

test('digest parser and backend transition signals are exact and deterministic', () => {
  assert.deepEqual(parseDigestManifest(`${'d'.repeat(64)}  ./verify.html\n`), [
    { sha256: 'd'.repeat(64), relative: 'verify.html' },
  ]);
  assert.throws(() => parseDigestManifest(`${'d'.repeat(64)}  ./../secret\n`), /invalid digest/);

  const values = {
    candidateSiteSha: S,
    restoredSiteSha: L,
    candidateBackendSha: B,
    finalBackendSha: F,
    rollbackBackendSha: RL,
  };
  assert.deepEqual(createFinalizeSignal(values), {
    schema_version: 1,
    signal: 'BACKEND_FINALIZE_REQUIRED',
    published_site_sha: S,
    bridge_reported_site_sha: L,
    bridge_backend_sha: B,
    required_final_backend_sha: F,
    required_final_reported_site_sha: S,
    completion_condition: 'final backend status reports the published site SHA before the release succeeds',
  });
  assert.equal(createRollbackSignal(values).required_backend_rollback_sha, RL);
  assert.equal(createRollbackSignal(values).restored_site_sha, L);
});
