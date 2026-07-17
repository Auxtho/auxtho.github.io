const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildArtifact,
  findScriptSources,
} = require('../scripts/release/public-artifact.cjs');
const {
  validateGeneratedRelease,
  validateReleaseTemplate,
} = require('../scripts/verify-release-contract.cjs');

const root = path.resolve(__dirname, '..');
const LEGACY_SHA = '1'.repeat(40);
const SITE_SHA = 'a'.repeat(40);
const COMPATIBILITY = [LEGACY_SHA, SITE_SHA].sort();

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
    'package.json', 'scripts/release/BOOTSTRAP.md',
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

test('CI and deploy workflows bind pre-merge bootstrap, fresh package authorization, and same-job rollback', () => {
  const site = fs.readFileSync(path.join(root, '.github', 'workflows', 'site-ci.yml'), 'utf8');
  const deploy = fs.readFileSync(path.join(root, '.github', 'workflows', 'deploy-pages.yml'), 'utf8');
  assert.match(site, /name: Verify Site Contract/);
  assert.match(site, /assert-pages-bootstrap/);
  assert.match(site, /\.github\/workflows\/deploy-pages\.yml/);
  assert.equal((deploy.match(/capture-and-validate/g) || []).length, 2);
  assert.match(deploy, /APPROVED_ENVIRONMENT_REVIEWER_IDS/);
  assert.match(deploy, /PRODUCTION_VERIFY_FINAL_BACKEND_SHA/);
  assert.match(deploy, /artifact_name: github-pages-candidate/);
  assert.match(deploy, /artifact_name: github-pages-rollback/);
  assert.equal((deploy.match(/actions\/deploy-pages@[0-9a-f]{40}/g) || []).length, 2);
  assert.match(deploy, /id: final_backend_readback/);
  assert.match(deploy, /steps\.final_backend_readback\.outcome != 'success'/);
  assert.match(deploy, /BACKEND_FINALIZE_REQUIRED/);
  assert.match(deploy, /BACKEND_ROLLBACK_REQUIRED/);
  assert.match(deploy, /Keep the release failed after deterministic restoration/);
});

test('candidate artifact is deterministic, content-addressed, privacy-bounded, and migration-aware', () => {
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
    assert.equal(fs.existsSync(path.join(output, 'assets', 'app.js')), false);
    assert.equal(fs.existsSync(path.join(output, 'assets', 'tw-init.js')), false);
    assert.equal(fs.existsSync(path.join(output, 'assets', 'verify-2026-04-24b.js')), false);
    assert.equal(
      sha256(fs.readFileSync(path.join(output, 'assets', 'release-manifest.json'))),
      result.release.release_manifest.sha256,
    );
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
  for (const asset of manifest.assets) {
    const bytes = fs.readFileSync(path.join(root, ...asset.path.replace(/^\//, '').split('/')));
    assert.equal(sha256(bytes), asset.sha256);
  }
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
