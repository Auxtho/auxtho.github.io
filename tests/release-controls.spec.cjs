const assert = require('node:assert/strict');
const test = require('node:test');

const {
  EXACT_VERIFY_CHECK,
  GITHUB_ACTIONS_APP_ID,
  assertBindings,
  parseCurrentLiveReleaseResponse,
  validatePlatformState,
  validateRulesets,
} = require('../scripts/release/platform-controls.cjs');
const {
  parseDigestManifest,
  resolveHttpsRedirect,
  validateRelease,
} = require('../scripts/release/verify-deployment.cjs');
const L = '1'.repeat(40);
const S = 'a'.repeat(40);
const COMPATIBILITY = [L, S].sort();

function bindings(overrides = {}) {
  return {
    repository: 'auxtho/auxtho.github.io',
    siteContractMode: 'bootstrap',
    approvedSiteContractMode: 'bootstrap',
    sourceSha: S,
    approvedSha: S,
    rollbackSha: L,
    approvedRollbackSha: L,
    releaseAuthorityMode: 'independent_review',
    approvedReleaseAuthorityMode: 'independent_review',
    approvedReviewerIds: JSON.stringify([101]),
    approvedSoloFounderActorId: '',
    approvedSoloFounderActorLogin: '',
    releaseActorId: '202',
    releaseActorLogin: 'release-operator',
    releaseTriggeringActorLogin: 'release-operator',
    releaseEventName: 'workflow_dispatch',
    releaseRef: 'refs/heads/main',
    releaseWorkflowRef: 'Auxtho/auxtho.github.io/.github/workflows/deploy-pages.yml@refs/heads/main',
    releaseRunId: '303',
    releaseRunAttempt: '1',
    releasePurpose: 'bootstrap-migration',
    ...overrides,
  };
}

function soloBindings(overrides = {}) {
  return bindings({
    releaseAuthorityMode: 'solo_founder',
    approvedReleaseAuthorityMode: 'solo_founder',
    approvedReviewerIds: JSON.stringify([]),
    approvedSoloFounderActorId: '230734665',
    approvedSoloFounderActorLogin: 'AuxthoAdmin',
    releaseActorId: '230734665',
    releaseActorLogin: 'AuxthoAdmin',
    releaseTriggeringActorLogin: 'AuxthoAdmin',
    ...overrides,
  });
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

function soloSnapshot() {
  const state = snapshot();
  state.environment.protection_rules = [];
  state.branchProtection.required_pull_request_reviews.required_approving_review_count = 0;
  state.branchProtection.required_pull_request_reviews.require_last_push_approval = false;
  return state;
}

function validSoloRuleset() {
  const ruleset = validRuleset();
  const pullRequest = ruleset.rules.find((rule) => rule.type === 'pull_request');
  pullRequest.parameters.required_approving_review_count = 0;
  pullRequest.parameters.require_last_push_approval = false;
  return ruleset;
}

test('bootstrap authorization accepts exact candidate and rollback site SHAs with legacy release 404 at L', () => {
  const approved = validatePlatformState(snapshot(), bindings());
  assert.equal(approved.sourceSha, S);
  assert.equal(approved.rollbackSha, L);
});

test('candidate and rollback site identities are exact, protected, and distinct', () => {
  assert.throws(() => assertBindings(bindings({
    siteContractMode: 'bootstrap',
    approvedSiteContractMode: 'normal',
  })), /protected approved mode/);
  assert.throws(() => assertBindings(bindings({
    rollbackSha: S,
    approvedRollbackSha: S,
  })), /distinct/);
  assert.throws(() => assertBindings(bindings({ approvedSha: L })), /approved SHA/);
});

test('solo-founder authorization binds exact actor, dispatch context, PR controls, and no fake reviewer', () => {
  const approved = validatePlatformState(soloSnapshot(), soloBindings());
  assert.equal(approved.releaseAuthorization.mode, 'solo_founder');
  assert.equal(approved.releaseAuthorization.actor_id, 230734665);
  assert.equal(approved.releaseAuthorization.actor_login, 'AuxthoAdmin');
  assert.equal(approved.releaseAuthorization.purpose, 'bootstrap-migration');
  assert.deepEqual(approved.approvedReviewerIds, []);

  const cases = [
    [{ releaseActorId: '230734666' }, /founder identity/],
    [{ releaseActorLogin: 'OtherAdmin' }, /founder identity/],
    [{ releaseTriggeringActorLogin: 'OtherAdmin' }, /founder identity/],
    [{ releaseEventName: 'push' }, /workflow_dispatch/],
    [{ releaseRef: 'refs/heads/release' }, /refs\/heads\/main/],
    [{ releaseWorkflowRef: 'Auxtho/auxtho.github.io/.github/workflows/other.yml@refs/heads/main' }, /deploy-pages/],
    [{ approvedReviewerIds: JSON.stringify([101]) }, /must not simulate/],
    [{ releasePurpose: 'ghp_secret-like-value' }, /release purpose/],
    [{ releasePurpose: 'approved-site-release' }, /protected site contract mode/],
    [{ releaseRunAttempt: '2' }, /reruns are not release authorizations/],
  ];
  for (const [overrides, expected] of cases) {
    assert.throws(() => validatePlatformState(soloSnapshot(), soloBindings(overrides)), expected);
  }

  const fakeReviewer = soloSnapshot();
  fakeReviewer.environment.protection_rules = snapshot().environment.protection_rules;
  assert.throws(
    () => validatePlatformState(fakeReviewer, soloBindings()),
    /must not contain a simulated required-reviewer rule/,
  );
});

test('branch, environment, Pages HTTPS, and live release controls fail closed independently', () => {
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
  ];
  for (const [mutate, expected] of cases) {
    const state = snapshot();
    mutate(state);
    assert.throws(() => validatePlatformState(state, bindings()), expected);
  }

  assert.throws(() => validatePlatformState(snapshot(), bindings({
    siteContractMode: 'normal',
    approvedSiteContractMode: 'normal',
    releasePurpose: 'approved-site-release',
  })), /normal mode requires/);

  const normalState = snapshot();
  normalState.currentLiveRelease = { source_sha: L };
  assert.equal(validatePlatformState(normalState, bindings({
    siteContractMode: 'normal',
    approvedSiteContractMode: 'normal',
    releasePurpose: 'approved-site-release',
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

  const soloState = soloSnapshot();
  soloState.branchProtection = { missing: true };
  soloState.rulesets = [validSoloRuleset()];
  assert.equal(validatePlatformState(soloState, soloBindings()).sourceSha, S);

  const fakeSoloApproval = validSoloRuleset();
  fakeSoloApproval.rules.find((rule) => rule.type === 'pull_request')
    .parameters.required_approving_review_count = 1;
  assert.throws(
    () => validateRulesets([fakeSoloApproval], 'solo_founder'),
    /without simulated approvals/,
  );

  const wildcardExcluded = validSoloRuleset();
  wildcardExcluded.conditions.ref_name.exclude = ['refs/heads/ma*'];
  assert.equal(validateRulesets([wildcardExcluded], 'solo_founder'), false);
});

test('postdeploy release validation accepts exact static candidate history metadata', () => {
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
    compatibleShas: COMPATIBILITY,
    rollbackOfSha: null,
  }));
  assert.throws(() => validateRelease(release, provenance, {
    mode: 'candidate',
    sourceSha: S,
    compatibleShas: [...COMPATIBILITY].reverse(),
    rollbackOfSha: null,
  }), /compatible backend site SHA list mismatch/);
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

test('digest parser is exact and deterministic', () => {
  assert.deepEqual(parseDigestManifest(`${'d'.repeat(64)}  ./verify.html\n`), [
    { sha256: 'd'.repeat(64), relative: 'verify.html' },
  ]);
  assert.throws(() => parseDigestManifest(`${'d'.repeat(64)}  ./../secret\n`), /invalid digest/);

});
