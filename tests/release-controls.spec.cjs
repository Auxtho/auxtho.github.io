const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { performance } = require('node:perf_hooks');
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
  boundedRequestTimeoutMs,
  isManagedRobotsOverlay,
  parseDigestManifest,
  requestOnce,
  relativeFromManifestPublicPath,
  resolveHttpsRedirect,
  validateRelease,
  waitForExpectedPublicFile,
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
  state.branchProtection = { missing: true, forbidden: true };
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
  assert.deepEqual(parseDigestManifest(
    `${'d'.repeat(64)}  ./verify.html\n${'e'.repeat(64)}  ./archive/index fix 011226.html\n`,
  ), [
    { sha256: 'd'.repeat(64), relative: 'verify.html' },
    { sha256: 'e'.repeat(64), relative: 'archive/index fix 011226.html' },
  ]);
  assert.throws(() => parseDigestManifest(`${'d'.repeat(64)}  ./../secret\n`), /invalid digest/);
  assert.throws(() => parseDigestManifest(`${'d'.repeat(64)}  ./archive/ trailing.html \n`), /invalid digest/);

});

test('manifest public paths decode canonical encoded HTML paths for rollback readback', () => {
  assert.equal(
    relativeFromManifestPublicPath('/archive/index%20fix%20011226.html'),
    'archive/index fix 011226.html',
  );
  assert.equal(relativeFromManifestPublicPath('/verify.html'), 'verify.html');
  assert.throws(() => relativeFromManifestPublicPath('/archive/%2e%2e/secret.html'), /not canonical/);
  assert.throws(() => relativeFromManifestPublicPath('/archive/index%2ffix.html'), /not canonical/);
  assert.throws(() => relativeFromManifestPublicPath('/archive/%ZZ.html'), /encoding/);
  assert.throws(() => relativeFromManifestPublicPath('/archive/a%5Cb.html'), /not canonical/);
  assert.throws(() => relativeFromManifestPublicPath('/archive/a%00b.html'), /not canonical/);
  assert.throws(() => relativeFromManifestPublicPath('/archive/a%09b.html'), /not canonical/);
  assert.throws(() => relativeFromManifestPublicPath('/archive/a%3Ab.html'), /not canonical/);
  assert.throws(() => relativeFromManifestPublicPath('/archive/a%25b.html'), /not canonical/);
  assert.throws(() => relativeFromManifestPublicPath('/%20archive/index.html'), /not canonical/);
  assert.throws(() => relativeFromManifestPublicPath('/archive/index.html%20'), /not canonical/);
});

test('managed robots overlay preserves the exact reviewed source and no-training policy', () => {
  const expected = Buffer.from('User-agent: *\nAllow: /\nSitemap: https://auxtho.com/sitemap.xml\n');
  const prefix = Buffer.from([
    '# Cloudflare content-signal notice',
    '',
    '# BEGIN Cloudflare Managed content',
    '',
    'Content-Signal: search=yes,ai-train=no,use=reference',
    'User-agent: *',
    'Content-Signal: search=yes,ai-train=no,use=reference',
    'Allow: /',
    '',
    'User-agent: Amazonbot',
    'Disallow: /',
    '',
    'User-agent: Applebot-Extended',
    'Disallow: /',
    '',
    'User-agent: Bytespider',
    'Disallow: /',
    '',
    'User-agent: CCBot',
    'Disallow: /',
    '',
    'User-agent: ClaudeBot',
    'Disallow: /',
    '',
    'User-agent: CloudflareBrowserRenderingCrawler',
    'Disallow: /',
    '',
    'User-agent: Google-Extended',
    'Disallow: /',
    '',
    'User-agent: GPTBot',
    'Disallow: /',
    '',
    'User-agent: meta-externalagent',
    'Disallow: /',
    '',
    '# END Cloudflare Managed Content',
    '',
    '',
  ].join('\n'));
  const response = {
    url: new URL('https://auxtho.com/robots.txt?cache_bust=test'),
    headers: {
      server: 'cloudflare',
      'cf-ray': 'a1ccea65eef92f4b-LAX',
      'content-type': 'text/plain; charset=utf-8',
    },
    body: Buffer.concat([prefix, expected]),
  };
  assert.equal(isManagedRobotsOverlay(response, expected), false);
  const exactPrefix = Buffer.from(prefix.toString('utf8').replace(
    'Content-Signal: search=yes,ai-train=no,use=reference\nUser-agent: *\n',
    'User-agent: *\n',
  ));
  const exactResponse = { ...response, body: Buffer.concat([exactPrefix, expected]) };
  assert.equal(isManagedRobotsOverlay(exactResponse, expected), true);
  assert.equal(isManagedRobotsOverlay(exactResponse, Buffer.from('User-agent: *\nDisallow: /\n')), false);
  assert.equal(isManagedRobotsOverlay({
    ...exactResponse,
    body: Buffer.concat([Buffer.from(exactPrefix.toString('utf8').replace('ai-train=no', 'ai-train=yes')), expected]),
  }, expected), false);
  assert.equal(isManagedRobotsOverlay({
    ...exactResponse,
    body: Buffer.concat([
      Buffer.from(exactPrefix.toString('utf8').replace('ai-train=no', 'ai-train=no,ai-train=yes')),
      expected,
    ]),
  }, expected), false);
  assert.equal(isManagedRobotsOverlay({
    ...exactResponse,
    body: Buffer.concat([Buffer.from(`Disallow: /private\n${exactPrefix.toString('utf8')}`), expected]),
  }, expected), false);
  assert.equal(isManagedRobotsOverlay({
    ...exactResponse,
    headers: { ...exactResponse.headers, server: 'cloudflare-proxy' },
  }, expected), false);
  assert.equal(isManagedRobotsOverlay({
    ...exactResponse,
    headers: { server: 'cloudflare', 'content-type': 'text/plain' },
  }, expected), false);
  assert.equal(isManagedRobotsOverlay({
    ...exactResponse,
    url: new URL('https://auxtho.com/assets/not-robots.css'),
  }, expected), false);
});

test('public file readback retries bounded stale bytes before accepting the exact artifact', async () => {
  const expected = Buffer.from('reviewed artifact bytes\n');
  const stale = Buffer.from('stale edge bytes\n');
  const expectedHash = crypto.createHash('sha256').update(expected).digest('hex');
  let calls = 0;
  const result = await waitForExpectedPublicFile({
    url: new URL('https://auxtho.com/assets/example.css'),
    allowedOrigins: ['https://auxtho.com'],
    expectedHash,
    attempts: 2,
    statusMessage: 'public path returned',
    mismatchMessage: 'public byte mismatch',
    fetcher: async () => {
      calls += 1;
      return { status: 200, headers: {}, body: calls === 1 ? stale : expected, chain: [] };
    },
    sleeper: async () => {},
  });
  assert.equal(calls, 2);
  assert.equal(result.attempt, 2);
  assert.equal(result.actualHash, expectedHash);
  assert.equal(result.edgeTransform, null);
});

test('public file readback rejects unbounded attempts and preserves failed observations', async () => {
  const expected = Buffer.from('reviewed artifact bytes\n');
  const stale = Buffer.from('stale edge bytes\n');
  const expectedHash = crypto.createHash('sha256').update(expected).digest('hex');
  const base = {
    url: new URL('https://auxtho.com/assets/example.css'),
    allowedOrigins: ['https://auxtho.com'],
    expectedHash,
    statusMessage: 'public path returned',
    mismatchMessage: 'public byte mismatch',
    fetcher: async () => ({ status: 200, headers: {}, body: stale, chain: [] }),
    sleeper: async () => {},
  };
  await assert.rejects(
    waitForExpectedPublicFile({ ...base, attempts: Infinity }),
    /readback attempts must be an integer from 1 to 48/,
  );
  await assert.rejects(
    waitForExpectedPublicFile({ ...base, attempts: 2 }),
    (error) => {
      assert.match(error.message, /public byte mismatch/);
      assert.equal(error.readbackObservations.length, 2);
      assert.deepEqual(error.readbackObservations.map((item) => item.status), [200, 200]);
      assert.deepEqual(error.readbackObservations.map((item) => item.actual_sha256), [
        crypto.createHash('sha256').update(stale).digest('hex'),
        crypto.createHash('sha256').update(stale).digest('hex'),
      ]);
      return true;
    },
  );
});

test('readback deadline rejects late exact bytes and constrains each HTTPS request', async () => {
  assert.equal(boundedRequestTimeoutMs({ deadlineAt: 1000, now: () => 250 }), 750);
  assert.equal(boundedRequestTimeoutMs({ deadlineAt: 100000, now: () => 0 }), 30000);
  assert.throws(
    () => boundedRequestTimeoutMs({ deadlineAt: 1000, now: () => 1000 }),
    /HTTPS readback deadline exceeded/,
  );

  const expected = Buffer.from('reviewed artifact bytes\n');
  const expectedHash = crypto.createHash('sha256').update(expected).digest('hex');
  let now = 0;
  await assert.rejects(
    waitForExpectedPublicFile({
      url: new URL('https://auxtho.com/assets/example.css'),
      allowedOrigins: ['https://auxtho.com'],
      expectedHash,
      attempts: 2,
      statusMessage: 'public path returned',
      mismatchMessage: 'public byte mismatch',
      fetcher: async () => {
        now = 600001;
        return { status: 200, headers: {}, body: expected, chain: [] };
      },
      sleeper: async () => {},
      now: () => now,
    }),
    (error) => {
      assert.match(error.message, /public file readback deadline exceeded/);
      assert.equal(error.readbackObservations.length, 1);
      assert.equal(error.readbackObservations[0].deadline_exceeded, true);
      assert.equal(error.readbackObservations[0].actual_sha256, expectedHash);
      return true;
    },
  );
});

test('absolute HTTPS deadline destroys a response that keeps trickling data', async () => {
  let chunks = 0;
  let destroyed = false;
  await assert.rejects(
    requestOnce(new URL('https://auxtho.com/robots.txt'), {
      deadlineAt: performance.now() + 80,
      requestFactory: (_url, _options, onResponse) => {
        const request = new EventEmitter();
        let interval;
        request.end = () => {
          const response = new EventEmitter();
          response.statusCode = 200;
          response.headers = { server: 'cloudflare' };
          onResponse(response);
          interval = setInterval(() => {
            chunks += 1;
            response.emit('data', Buffer.from('x'));
          }, 5);
        };
        request.destroy = (error) => {
          destroyed = true;
          clearInterval(interval);
          request.emit('error', error);
        };
        return request;
      },
    }),
    /HTTPS readback absolute deadline exceeded/,
  );
  assert.equal(destroyed, true);
  assert.ok(chunks > 1);
});
