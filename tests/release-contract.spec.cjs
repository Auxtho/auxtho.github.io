const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const YAML = require('yaml');

const {
  buildArtifact,
  findImageSources,
  findScriptSources,
  findStylesheetSources,
} = require('../scripts/release/public-artifact.cjs');
const {
  validateGeneratedRelease,
  validateReleaseTemplate,
} = require('../scripts/verify-release-contract.cjs');
const {
  collectJavaScriptFiles,
  validateJavaScriptFiles,
} = require('../scripts/release/validate-js.cjs');
const { findBrokenImageSources } = require('../scripts/release/browser-readback.cjs');

const root = path.resolve(__dirname, '..');
const LEGACY_SHA = '1'.repeat(40);
const SITE_SHA = 'a'.repeat(40);
const COMPATIBILITY = [LEGACY_SHA, SITE_SHA].sort();
const ACTUAL_LEGACY_SHA = '4b2f476c741b771519745930a6ebf244cf5d6433';

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function copy(relative, targetRoot) {
  const source = path.join(root, ...relative.split('/'));
  const target = path.join(targetRoot, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, errorOnExist: true });
}

function createSourceFixture(targetRoot) {
  for (const relative of [
    '404.html', 'index.html', 'privacy.html', 'story.html', 'terms.html', 'verify.html',
    'CNAME', 'robots.txt', 'sitemap.xml', 'security/ardamire/index.html', 'assets',
    'package.json', 'scripts/release/BOOTSTRAP.md', 'scripts/release/public-files.json',
  ]) copy(relative, targetRoot);
}

test('legacy branch metadata remains an exact build-revision-only hold contract', () => {
  const template = fs.readFileSync(path.join(root, 'release.json'), 'utf8');
  assert.equal(validateReleaseTemplate(template), true);
  assert.deepEqual(
    validateGeneratedRelease(JSON.stringify({ source_sha: SITE_SHA }), SITE_SHA),
    { source_sha: SITE_SHA },
  );
  assert.throws(
    () => validateGeneratedRelease(JSON.stringify({ source_sha: LEGACY_SHA }), SITE_SHA),
    /does not match/,
  );
});

test('CI and deploy workflows bind exact static-site authorization and same-job rollback', () => {
  const site = fs.readFileSync(path.join(root, '.github', 'workflows', 'site-ci.yml'), 'utf8');
  const deploy = fs.readFileSync(path.join(root, '.github', 'workflows', 'deploy-pages.yml'), 'utf8');
  const platformControls = fs.readFileSync(
    path.join(root, 'scripts', 'release', 'platform-controls.cjs'),
    'utf8',
  );
  const deploymentVerifier = fs.readFileSync(
    path.join(root, 'scripts', 'release', 'verify-deployment.cjs'),
    'utf8',
  );
  const deployWorkflow = YAML.parse(deploy);
  const deploySteps = deployWorkflow.jobs.deploy_and_verify.steps;
  const candidateReadback = deploySteps.find((step) => step.id === 'candidate_readback');
  const rollbackReadback = deploySteps.find((step) => step.id === 'rollback_readback');
  assert.match(site, /name: Verify Site Contract/);
  assert.match(site, /assert-pages-bootstrap/);
  assert.match(site, /\.github\/workflows\/deploy-pages\.yml/);
  assert.equal((deploy.match(/capture-and-validate/g) || []).length, 3);
  assert.equal((deploy.match(/deployment: false/g) || []).length, 2);
  assert.match(deploy, /release_purpose:/);
  assert.match(deploy, /APPROVED_RELEASE_AUTHORITY_MODE/);
  assert.match(deploy, /APPROVED_ENVIRONMENT_REVIEWER_IDS/);
  assert.match(deploy, /APPROVED_SOLO_FOUNDER_ACTOR_ID/);
  assert.match(deploy, /RELEASE_TRIGGERING_ACTOR_LOGIN/);
  assert.match(deploy, /RELEASE_ACTOR_ID:\s+\$\{\{ github\.actor_id \}\}/);
  assert.match(deploy, /RELEASE_ACTOR_LOGIN:\s+\$\{\{ github\.actor \}\}/);
  assert.match(deploy, /RELEASE_EVENT_NAME:\s+\$\{\{ github\.event_name \}\}/);
  assert.match(deploy, /RELEASE_REF:\s+\$\{\{ github\.ref \}\}/);
  assert.match(deploy, /RELEASE_WORKFLOW_REF:\s+\$\{\{ github\.workflow_ref \}\}/);
  assert.match(deploy, /RELEASE_RUN_ATTEMPT:\s+\$\{\{ github\.run_attempt \}\}/);
  assert.match(deploy, /artifact_name: github-pages-candidate/);
  assert.match(deploy, /artifact_name: github-pages-rollback/);
  assert.match(
    deploy,
    /--legacy-bootstrap "\$\{\{ inputs\.rollback_sha == '4b2f476c741b771519745930a6ebf244cf5d6433' && 'true' \|\| 'false' \}\}"/,
  );
  assert.doesNotMatch(deploy, /--legacy-bootstrap "\$\{\{ inputs\.site_contract_mode/);
  assert.equal((deploy.match(/actions\/deploy-pages@[0-9a-f]{40}/g) || []).length, 2);
  assert.match(deploy, /id: candidate_readback/);
  assert.match(deploy, /id: rollback_readback/);
  assert.match(deploy, /EXPECTED_SITE_SHA:\s+\$\{\{ inputs\.approved_sha \}\}/);
  assert.match(candidateReadback.run, /--attempts 6(?:\n|$)/);
  assert.match(rollbackReadback.run, /--attempts 48(?:\n|$)/);
  assert.doesNotMatch(deploy, /BACKEND_FINALIZE_REQUIRED|BACKEND_ROLLBACK_REQUIRED/);
  assert.doesNotMatch(deploy, /BACKEND_(?:BRIDGE|FINAL|ROLLBACK)_SHA/);
  assert.doesNotMatch(deploy, /^\s*<<:/m);
  assert.match(deploy, /Keep the release failed after deterministic restoration/);
  assert.match(platformControls, /allowForbidden: true/);
  assert.match(platformControls, /Resource not accessible by integration/);
  assert.match(
    deploymentVerifier,
    /fetcher\(url, allowedOrigins, 5, \{\s*bypassCache: true,\s*deadlineAt,\s*now,\s*\}\)/,
  );
  assert.match(
    deploymentVerifier,
    /boundedRequestTimeoutMs\(requestOptions\);\s*const response = await requestOnce\(url, requestOptions\)/,
  );
  assert.match(deploymentVerifier, /timeout: timeoutMs/);
  assert.doesNotMatch(deploymentVerifier, /timeout: 30_000/);
  assert.doesNotMatch(deploymentVerifier, /bypassCache: variant ===/);
});

test('browser readback exempts only the inactive sample lightbox placeholder', () => {
  assert.deepEqual(findBrokenImageSources([
    {
      source: '',
      complete: true,
      naturalWidth: 0,
      descriptor: '#sample-lightbox-image',
      inactiveSampleLightboxPlaceholder: true,
    },
    {
      source: '',
      complete: true,
      naturalWidth: 0,
      descriptor: '#missing-image',
      inactiveSampleLightboxPlaceholder: false,
    },
    {
      source: '/assets/broken.png',
      complete: true,
      naturalWidth: 0,
      descriptor: '#broken-image',
      inactiveSampleLightboxPlaceholder: false,
    },
    {
      source: '/assets/loaded.png',
      complete: true,
      naturalWidth: 640,
      descriptor: '#loaded-image',
      inactiveSampleLightboxPlaceholder: false,
    },
  ]), [
    'missing-src:#missing-image',
    '/assets/broken.png',
  ]);
});

test('candidate artifact is deterministic, content-addressed, privacy-bounded, and rollback-aware', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxtho-release-contract-'));
  try {
    const source = path.join(temporary, 'source');
    const previous = path.join(temporary, 'previous');
    fs.mkdirSync(source);
    fs.mkdirSync(previous);
    createSourceFixture(source);
    createSourceFixture(previous);
    fs.writeFileSync(path.join(previous, 'assets', 'ld-org.json'), '{}\n');

    const output = path.join(temporary, 'site');
    const provenance = path.join(temporary, 'provenance');
    const result = buildArtifact({
      sourceRoot: source,
      previousSourceRoot: previous,
      outputRoot: output,
      provenanceRoot: provenance,
      sourceSha: SITE_SHA,
      previousSha: LEGACY_SHA,
      compatibleJson: JSON.stringify(COMPATIBILITY),
      mode: 'candidate',
      retiredManifestPath: path.join(root, 'scripts', 'release', 'retired-public-paths.json'),
      artifactName: 'github-pages-candidate',
      repository: 'auxtho/auxtho.github.io',
      runId: '123',
      runAttempt: '1',
    });

    assert.deepEqual(result.release.compatible_backend_site_shas, COMPATIBILITY);
    assert.deepEqual(result.release.backend_site_sha_transition, {
      bridge_reported_site_sha: LEGACY_SHA,
      final_reported_site_sha: SITE_SHA,
      rollback_reported_site_sha: LEGACY_SHA,
    });
    assert.equal(result.releaseManifest.evidence_boundaries.synthetic_only, true);
    assert.equal(result.releaseManifest.evidence_boundaries.customer_data_claimed, false);
    assert.equal(result.releaseManifest.privacy_manifest.path, '/assets/proposal/evidence-manifest-20260716.json');
    assert.ok(result.releaseManifest.removed_public_paths.includes('/assets/ld-org.json'));
    assert.ok(result.releaseManifest.non_public_source_paths.includes('/package.json'));
    assert.ok(result.releaseManifest.non_public_source_paths.includes('/scripts/release/BOOTSTRAP.md'));
    assert.ok(result.releaseManifest.must_be_absent_public_paths.length >= result.releaseManifest.removed_public_paths.length);

    for (const reference of result.releaseManifest.script_references) {
      assert.match(reference.url, /^\/assets\/[A-Za-z0-9._/-]+\.[0-9a-f]{64}\.js$/);
      assert.equal(reference.url.includes('?'), false);
      const bytes = fs.readFileSync(path.join(output, ...reference.url.slice(1).split('/')));
      assert.equal(sha256(bytes), reference.sha256);
      assert.equal(reference.url.includes(reference.sha256), true);
    }
    for (const reference of result.releaseManifest.stylesheet_references) {
      assert.match(reference.url, /^\/assets\/[A-Za-z0-9._/-]+\.css\?sha256=[0-9a-f]{64}$/);
      assert.equal(reference.content_addressed, true);
      const bytes = fs.readFileSync(path.join(output, ...reference.path.slice(1).split('/')));
      assert.equal(sha256(bytes), reference.sha256);
      assert.equal(reference.url.endsWith(reference.sha256), true);
    }
    for (const reference of result.releaseManifest.image_references) {
      assert.match(reference.url, /^\/assets\/[A-Za-z0-9._/-]+\.(?:png|svg)\?sha256=[0-9a-f]{64}$/);
      assert.equal(reference.content_addressed, true);
      const bytes = fs.readFileSync(path.join(output, ...reference.path.slice(1).split('/')));
      assert.equal(sha256(bytes), reference.sha256);
    }
    assert.equal(fs.existsSync(path.join(output, 'assets', 'app.js')), false);
    assert.equal(fs.existsSync(path.join(output, 'assets', 'tw-init.js')), false);
    assert.equal(fs.existsSync(path.join(output, 'assets', 'verify-2026-04-24b.js')), false);
    assert.equal(
      sha256(fs.readFileSync(path.join(output, 'assets', 'release-manifest.json'))),
      result.release.release_manifest.sha256,
    );
    assert.deepEqual(
      fs.readFileSync(path.join(provenance, 'robots.txt')),
      fs.readFileSync(path.join(output, 'robots.txt')),
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('candidate and non-legacy rollback artifacts reject non-canonical Windows or mixed public text bytes', () => {
  for (const fixture of [
    {
      name: 'CRLF stylesheet',
      relative: 'assets/custom.css',
      mutate: (text) => text.replace(/\n/g, '\r\n'),
    },
    {
      name: 'mixed-EOL script',
      relative: 'assets/tw-init.3a46d349f310cfb8aee19f2f69d6d2caf2393f7d975b1b386c5db6451f2a8dd5.js',
      mutate: (text) => text.replace('\n', '\r\n'),
    },
  ]) {
    for (const mode of ['candidate', 'rollback']) {
      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxtho-release-eol-'));
      try {
        const source = path.join(temporary, 'source');
        const previous = path.join(temporary, 'previous');
        fs.mkdirSync(source);
        fs.mkdirSync(previous);
        createSourceFixture(source);
        createSourceFixture(previous);
        const target = path.join(source, ...fixture.relative.split('/'));
        fs.writeFileSync(target, fixture.mutate(fs.readFileSync(target, 'utf8')), 'utf8');

        assert.throws(() => buildArtifact({
          sourceRoot: source,
          previousSourceRoot: previous,
          outputRoot: path.join(temporary, 'site'),
          provenanceRoot: path.join(temporary, 'provenance'),
          sourceSha: SITE_SHA,
          previousSha: mode === 'candidate' ? LEGACY_SHA : SITE_SHA,
          compatibleJson: JSON.stringify(mode === 'candidate' ? COMPATIBILITY : [SITE_SHA]),
          mode,
          rollbackOfSha: mode === 'rollback' ? LEGACY_SHA : undefined,
          retiredManifestPath: path.join(root, 'scripts', 'release', 'retired-public-paths.json'),
          artifactName: mode === 'candidate' ? 'github-pages-candidate' : 'github-pages-rollback',
          repository: 'auxtho/auxtho.github.io',
          runId: '123',
          runAttempt: '1',
        }), new RegExp(`public text file must use LF-only bytes: ${fixture.relative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${mode}: ${fixture.name}`);
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
      }
    }
  }
});

test('candidate artifact rejects unreviewed assets and non-UTF-8 public text encodings', () => {
  const fixtures = [
    {
      name: 'unreviewed JSON asset',
      relative: 'assets/unreviewed-private-record.json',
      bytes: Buffer.from('{"private":true}\n'),
      expected: /unreviewed public source path: assets\/unreviewed-private-record\.json/,
    },
    {
      name: 'unreviewed root HTML',
      relative: 'private-record.html',
      bytes: Buffer.from('<!doctype html><title>Private record</title>\n'),
      expected: /unreviewed public source path: private-record\.html/,
    },
    {
      name: 'UTF-16LE content-addressed script',
      relative: 'assets/app.eb0dad8c9eb83e2e9ec71879749daea7fcad30d3ffee6fdc69fc6aba18139665.js',
      bytes: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('window.test = true;\n', 'utf16le')]),
      expected: /public text file must not contain a byte-order mark/,
    },
    {
      name: 'NUL-bearing robots file',
      relative: 'robots.txt',
      bytes: Buffer.from('User\0-agent: *\n'),
      expected: /public text file must not contain NUL bytes/,
    },
    {
      name: 'invalid UTF-8 robots file',
      relative: 'robots.txt',
      bytes: Buffer.from([0x55, 0xff, 0x0a]),
      expected: /public text file must be valid UTF-8/,
    },
  ];

  for (const fixture of fixtures) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxtho-release-public-boundary-'));
    try {
      const source = path.join(temporary, 'source');
      const previous = path.join(temporary, 'previous');
      fs.mkdirSync(source);
      fs.mkdirSync(previous);
      createSourceFixture(source);
      createSourceFixture(previous);
      const target = path.join(source, ...fixture.relative.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, fixture.bytes);

      assert.throws(() => buildArtifact({
        sourceRoot: source,
        previousSourceRoot: previous,
        outputRoot: path.join(temporary, 'site'),
        provenanceRoot: path.join(temporary, 'provenance'),
        sourceSha: SITE_SHA,
        previousSha: LEGACY_SHA,
        compatibleJson: JSON.stringify(COMPATIBILITY),
        mode: 'candidate',
        retiredManifestPath: path.join(root, 'scripts', 'release', 'retired-public-paths.json'),
        artifactName: 'github-pages-candidate',
        repository: 'auxtho/auxtho.github.io',
        runId: '123',
        runAttempt: '1',
      }), fixture.expected, fixture.name);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
});

test('public file manifest rejects duplicate keys and non-canonical path aliases', () => {
  for (const fixture of [
    {
      name: 'duplicate paths key',
      mutate: (manifest) => `{"schema_version":1,"paths":${JSON.stringify(manifest.paths)},"paths":${JSON.stringify(manifest.paths)}}`,
      expected: /must use exact canonical JSON without duplicate or unknown keys/,
    },
    {
      name: 'percent-encoded alias',
      mutate: (manifest) => `${JSON.stringify({
        schema_version: 1,
        paths: manifest.paths.map((value) => value === '/assets/custom.css' ? '/assets/custom%2Ecss' : value),
      }, null, 2)}\n`,
      expected: /public file manifest path is not canonical/,
    },
  ]) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxtho-release-manifest-boundary-'));
    try {
      const source = path.join(temporary, 'source');
      const previous = path.join(temporary, 'previous');
      fs.mkdirSync(source);
      fs.mkdirSync(previous);
      createSourceFixture(source);
      createSourceFixture(previous);
      const manifestPath = path.join(source, 'scripts', 'release', 'public-files.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      fs.writeFileSync(manifestPath, fixture.mutate(manifest), 'utf8');

      assert.throws(() => buildArtifact({
        sourceRoot: source,
        previousSourceRoot: previous,
        outputRoot: path.join(temporary, 'site'),
        provenanceRoot: path.join(temporary, 'provenance'),
        sourceSha: SITE_SHA,
        previousSha: LEGACY_SHA,
        compatibleJson: JSON.stringify(COMPATIBILITY),
        mode: 'candidate',
        retiredManifestPath: path.join(root, 'scripts', 'release', 'retired-public-paths.json'),
        artifactName: 'github-pages-candidate',
        repository: 'auxtho/auxtho.github.io',
        runId: '123',
        runAttempt: '1',
      }), fixture.expected, fixture.name);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
});

test('JavaScript validation recursively rejects invalid nested public scripts', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxtho-js-recursion-'));
  try {
    const nested = path.join(temporary, 'nested');
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(temporary, 'valid.js'), 'globalThis.valid = true;\n');
    fs.writeFileSync(path.join(nested, 'invalid.js'), 'globalThis.invalid = ;\n');
    const files = collectJavaScriptFiles(temporary);
    assert.equal(files.length, 2);
    assert.throws(() => validateJavaScriptFiles(files), /SyntaxError|Unexpected token/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('candidate artifact rejects one-SHA and non-canonical migration compatibility', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxtho-release-order-'));
  try {
    const source = path.join(temporary, 'source');
    const previous = path.join(temporary, 'previous');
    fs.mkdirSync(source);
    fs.mkdirSync(previous);
    createSourceFixture(source);
    createSourceFixture(previous);
    const base = {
      sourceRoot: source,
      previousSourceRoot: previous,
      outputRoot: path.join(temporary, 'one-site'),
      provenanceRoot: path.join(temporary, 'one-provenance'),
      sourceSha: SITE_SHA,
      previousSha: LEGACY_SHA,
      compatibleJson: JSON.stringify([SITE_SHA]),
      mode: 'candidate',
      retiredManifestPath: path.join(root, 'scripts', 'release', 'retired-public-paths.json'),
      artifactName: 'github-pages-candidate',
      repository: 'auxtho/auxtho.github.io',
      runId: '123',
      runAttempt: '1',
    };
    assert.throws(() => buildArtifact(base), /canonical sorted legacy\/candidate SHA pair/);
    assert.throws(() => buildArtifact({
      ...base,
      outputRoot: path.join(temporary, 'reverse-site'),
      provenanceRoot: path.join(temporary, 'reverse-provenance'),
      compatibleJson: JSON.stringify([...COMPATIBILITY].reverse()),
    }), /canonical SHA sort order/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('rollback artifact preserves and hashes an approved legacy script URL exactly', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxtho-release-rollback-'));
  try {
    const source = path.join(temporary, 'source');
    const previous = path.join(temporary, 'previous');
    fs.mkdirSync(source);
    fs.mkdirSync(previous);
    createSourceFixture(source);
    createSourceFixture(previous);

    const indexPath = path.join(source, 'index.html');
    const index = fs.readFileSync(indexPath, 'utf8').replace(
      /(\/assets\/app\.[0-9a-f]{64}\.js)"/,
      '$1?legacy=approved"',
    );
    fs.writeFileSync(indexPath, index);

    const result = buildArtifact({
      sourceRoot: source,
      previousSourceRoot: previous,
      outputRoot: path.join(temporary, 'site'),
      provenanceRoot: path.join(temporary, 'provenance'),
      sourceSha: LEGACY_SHA,
      previousSha: LEGACY_SHA,
      compatibleJson: JSON.stringify([LEGACY_SHA]),
      mode: 'rollback',
      rollbackOfSha: SITE_SHA,
      retiredManifestPath: path.join(root, 'scripts', 'release', 'retired-public-paths.json'),
      artifactName: 'github-pages-rollback',
      repository: 'auxtho/auxtho.github.io',
      runId: '123',
      runAttempt: '1',
    });

    const legacyReference = result.releaseManifest.script_references.find(
      (reference) => reference.url.endsWith('?legacy=approved'),
    );
    assert.ok(legacyReference);
    assert.equal(legacyReference.content_addressed, false);
    assert.match(legacyReference.path, /^\/assets\/app\.[0-9a-f]{64}\.js$/);
    assert.equal(
      sha256(fs.readFileSync(path.join(source, ...legacyReference.path.slice(1).split('/')))),
      legacyReference.sha256,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('bootstrap rollback packages the actual approved legacy tree without inventing a candidate evidence manifest', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxtho-actual-legacy-rollback-'));
  try {
    const archive = path.join(temporary, 'legacy.tar');
    const source = path.join(temporary, 'legacy');
    const previous = path.join(temporary, 'previous');
    fs.mkdirSync(source);
    fs.mkdirSync(previous);
    createSourceFixture(previous);
    const archived = spawnSync('git', ['archive', '--format=tar', `--output=${archive}`, ACTUAL_LEGACY_SHA], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(archived.status, 0, archived.stderr);
    const extracted = spawnSync('tar', ['-xf', archive, '-C', source], { encoding: 'utf8', windowsHide: true });
    assert.equal(extracted.status, 0, extracted.stderr);
    assert.equal(fs.existsSync(path.join(source, 'assets', 'proposal', 'evidence-manifest-20260716.json')), false);

    const result = buildArtifact({
      sourceRoot: source,
      previousSourceRoot: previous,
      outputRoot: path.join(temporary, 'site'),
      provenanceRoot: path.join(temporary, 'provenance'),
      sourceSha: ACTUAL_LEGACY_SHA,
      previousSha: ACTUAL_LEGACY_SHA,
      compatibleJson: JSON.stringify([ACTUAL_LEGACY_SHA]),
      mode: 'rollback',
      rollbackOfSha: SITE_SHA,
      legacyBootstrap: true,
      retiredManifestPath: path.join(root, 'scripts', 'release', 'retired-public-paths.json'),
      artifactName: 'github-pages-rollback',
      repository: 'auxtho/auxtho.github.io',
      runId: '123',
      runAttempt: '1',
    });

    assert.equal(result.release.privacy_manifest.legacy_absent, true);
    assert.equal(result.releaseManifest.evidence_boundaries.reviewed_candidate_claims_present, false);
    assert.equal(fs.existsSync(path.join(temporary, 'site', 'assets', 'pdf', 'auxtho-core-overview-v2025.1.pdf')), true);
    assert.equal(fs.existsSync(path.join(temporary, 'site', 'archive', 'core', 'v2025.1', 'index.html')), true);
    assert.equal(fs.existsSync(path.join(temporary, 'site', 'core', 'index.html')), true);
    assert.equal(fs.existsSync(path.join(temporary, 'site', 'lineage', 'isp', 'index.html')), true);
    assert.equal(fs.existsSync(path.join(temporary, 'site', 'release.json')), true);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('every HTML script reference is query-free and bound to exact SHA-256 bytes', () => {
  const htmlFiles = [
    '404.html', 'index.html', 'privacy.html', 'terms.html', 'verify.html',
    'story.html', 'security/ardamire/index.html',
  ];
  const referenced = new Set();
  for (const relative of htmlFiles) {
    const document = fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
    for (const source of findScriptSources(document)) {
      assert.match(source, /^\/assets\/[A-Za-z0-9._/-]+\.([0-9a-f]{64})\.js$/);
      const expected = source.match(/\.([0-9a-f]{64})\.js$/)[1];
      const bytes = fs.readFileSync(path.join(root, ...source.slice(1).split('/')));
      assert.equal(sha256(bytes), expected);
      referenced.add(source);
    }
  }
  assert.equal(referenced.size, 3);
});

test('every candidate stylesheet URL carries the exact SHA-256 of its bytes', () => {
  const htmlFiles = [
    '404.html', 'index.html', 'privacy.html', 'story.html', 'terms.html', 'verify.html',
    'security/ardamire/index.html',
  ];
  for (const relative of htmlFiles) {
    const document = fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
    for (const source of findStylesheetSources(document)) {
      const match = source.match(/^(\/assets\/[A-Za-z0-9._/-]+\.css)\?sha256=([0-9a-f]{64})$/);
      assert.ok(match, `${relative} -> ${source}`);
      const bytes = fs.readFileSync(path.join(root, ...match[1].slice(1).split('/')));
      assert.equal(sha256(bytes), match[2]);
    }
  }
});

test('every candidate-rendered image URL carries the exact SHA-256 of its bytes', () => {
  const htmlFiles = ['404.html', 'index.html', 'privacy.html', 'terms.html', 'verify.html'];
  for (const relative of htmlFiles) {
    const document = fs.readFileSync(path.join(root, relative), 'utf8');
    for (const source of findImageSources(document)) {
      const match = source.match(/^(\/assets\/[A-Za-z0-9._/-]+\.(?:png|svg))\?sha256=([0-9a-f]{64})$/);
      assert.ok(match, `${relative} -> ${source}`);
      const bytes = fs.readFileSync(path.join(root, ...match[1].slice(1).split('/')));
      assert.equal(sha256(bytes), match[2]);
    }
  }
});

test('verifier production CSP has no loopback and local tests use same-origin API routing', () => {
  const verify = fs.readFileSync(path.join(root, 'verify.html'), 'utf8');
  const scriptPath = findScriptSources(verify).find((source) => /\/verify\./.test(source));
  const script = fs.readFileSync(path.join(root, ...scriptPath.slice(1).split('/')), 'utf8');
  const match = verify.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/i);
  assert.ok(match);
  assert.match(match[1], /connect-src 'self' https:\/\/api\.auxtho\.com;/);
  assert.doesNotMatch(match[1], /127\.0\.0\.1|localhost|http:/i);
  assert.match(script, /return window\.location\.origin/);
  assert.doesNotMatch(script, /http:\/\/127\.0\.0\.1:8000/);
});

test('public notice is explicitly non-contractual and preserves unresolved legal identity', () => {
  const terms = fs.readFileSync(path.join(root, 'terms.html'), 'utf8');
  assert.match(terms, /Public Site Notice/);
  assert.match(terms, /non-contractual notice/i);
  assert.match(terms, /registered legal entity, jurisdiction, and legal data-controller identity remain unresolved/i);
  assert.match(terms, /does not create legal duties/i);
  assert.doesNotMatch(terms, /Terms of Service|agree to be bound|binding terms/i);
});

test('public evidence manifest and homepage preserve synthetic and non-customer boundaries', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, 'assets', 'proposal', 'evidence-manifest-20260716.json'),
    'utf8',
  ));
  assert.match(index, /public evidence manifest/i);
  assert.match(index, /no customer data/i);
  assert.match(index, /synthetic/i);
  assert.equal(manifest.attestation_class, 'publisher_self_attestation');
  assert.equal(manifest.evidence_policy.live_telemetry_claimed, false);
  assert.equal(manifest.evidence_policy.operating_effectiveness_claimed, false);
  assert.equal(manifest.evidence_policy.production_readiness_claimed, false);
  const publicEvidenceText = [
    index,
    JSON.stringify(manifest),
    ...manifest.assets.map((asset) => fs.readFileSync(
      path.join(root, ...asset.sidecar.replace(/^\//, '').split('/')),
      'utf8',
    )),
  ].join('\n');
  assert.doesNotMatch(
    publicEvidenceText,
    /OverviewView|DashboardMetricCards|source-bound|network-isolated|capture harness|intercepted_external/i,
  );
  for (const asset of manifest.assets) {
    const bytes = fs.readFileSync(path.join(root, ...asset.path.replace(/^\//, '').split('/')));
    assert.equal(sha256(bytes), asset.sha256);
    assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], asset.dimensions_px);
    assert.ok(asset.dimensions_px[0] <= 1920, `${asset.path} exceeds the public width limit`);
  }
  const appAsset = manifest.assets.find((asset) => asset.surface === 'Auxtho App');
  assert.equal(appAsset.public_derivative, true);
});

test('retired path manifest enumerates the full historical public surface class', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'release', 'retired-public-paths.json'), 'utf8'));
  assert.equal(manifest.schema_version, 1);
  assert.ok(manifest.paths.length >= 35);
  for (const required of [
    '/assets/ld-org.json',
    '/assets/verify.js',
    '/archive/core/v2025.1/',
    '/core/',
    '/lineage/isp/',
    '/package.json',
    '/src/build-core-overview.js',
  ]) assert.ok(manifest.paths.includes(required), required);
  assert.equal(new Set(manifest.paths).size, manifest.paths.length);
});
