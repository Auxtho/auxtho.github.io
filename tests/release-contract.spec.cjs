const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const {
  validateGeneratedRelease,
  validateReleaseTemplate,
  validateSourceSha,
} = require('../scripts/verify-release-contract.cjs');

const root = path.resolve(__dirname, '..');
const SOURCE_SHA = 'a'.repeat(40);

test('committed release metadata is the exact build revision template', () => {
  const releaseTemplate = fs.readFileSync(path.join(root, 'release.json'), 'utf8');
  assert.equal(validateReleaseTemplate(releaseTemplate), true);
});

test('generated release metadata accepts only the exact expected SHA', () => {
  assert.deepEqual(
    validateGeneratedRelease(JSON.stringify({ source_sha: SOURCE_SHA }), SOURCE_SHA),
    { source_sha: SOURCE_SHA },
  );
});

test('generated release metadata rejects weak or ambiguous bindings', () => {
  const invalidCases = [
    [JSON.stringify({ source_sha: 'b'.repeat(40) }), SOURCE_SHA, /does not match/],
    [JSON.stringify({}), SOURCE_SHA, /only source_sha/],
    [JSON.stringify({ source_sha: SOURCE_SHA, extra: true }), SOURCE_SHA, /only source_sha/],
    [JSON.stringify([SOURCE_SHA]), SOURCE_SHA, /JSON object/],
    ['not-json', SOURCE_SHA, /valid JSON/],
  ];
  for (const [document, expectedSha, expectedError] of invalidCases) {
    assert.throws(() => validateGeneratedRelease(document, expectedSha), expectedError);
  }
  assert.throws(() => validateSourceSha(SOURCE_SHA.toUpperCase()), /40 lowercase hexadecimal/);
  assert.throws(() => validateSourceSha(SOURCE_SHA.slice(1)), /40 lowercase hexadecimal/);
});

test('site CI covers generators and binds manual Pages release to verified output', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'site-ci.yml'), 'utf8');
  assert.equal((workflow.match(/- "_config\.yml"/g) || []).length, 2);
  assert.equal((workflow.match(/- "tailwind\.config\.js"/g) || []).length, 2);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /APPROVED_SITE_SHA: \$\{\{ vars\.PRODUCTION_VERIFY_SITE_APPROVED_SHA \}\}/);
  assert.match(workflow, /test "\$\{GITHUB_SHA\}" = "\$\{APPROVED_SITE_SHA\}"/);
  assert.match(workflow, /pages: read/);
  assert.match(workflow, /gh api "repos\/\$GITHUB_REPOSITORY\/pages" --jq '\.build_type'/);
  assert.match(workflow, /test "\$pages_build_type" = "workflow"/);
  assert.match(workflow, /git ls-files --error-unmatch -- assets\/style\.css/);
  assert.match(workflow, /git diff --exit-code/);
  assert.match(workflow, /git archive --format=tar "\$\{SOURCE_SHA\}" \| tar -xf - -C _release_source/);
  assert.doesNotMatch(workflow, /jekyll-build-pages/);
  assert.match(workflow, /Stage only explicit public paths from exact committed bytes/);
  assert.match(workflow, /find _release_source -maxdepth 1 -type f -name '\*\.html'/);
  assert.match(workflow, /for path in CNAME robots\.txt sitemap\.xml/);
  assert.match(workflow, /cp -a _release_source\/assets _site\/assets/);
  assert.match(workflow, /unreviewed public asset type/);
  assert.match(workflow, /\*\.css\|\*\.js\|\*\.json\|\*\.png\|\*\.svg/);
  assert.match(workflow, /EXPECTED_FILE_COUNT/);
  assert.match(workflow, /find _site -type f \| wc -l/);
  assert.match(workflow, /printf '\{"source_sha":"%s"\}\\n'/);
  assert.match(workflow, /diff -qr _release_source\/assets _site\/assets/);
  assert.match(workflow, /verify-release-contract\.cjs _site\/release\.json "\$\{SOURCE_SHA\}"/);
  assert.equal((workflow.match(/node-version: 22\.17\.0/g) || []).length, 2);
  assert.equal((workflow.match(/runs-on: ubuntu-24\.04/g) || []).length, 3);
  assert.doesNotMatch(workflow, /ubuntu-latest/);
  assert.match(workflow, /actions\/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b/);
  assert.match(workflow, /package:[\s\S]*needs: verify/);
  assert.match(workflow, /deploy:[\s\S]*needs: package/);
  assert.match(workflow, /actions\/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
});

test('public evidence manifest is an explicit publisher self-attestation bound to exact bytes', () => {
  const manifestPath = path.join(root, 'assets', 'proposal', 'evidence-manifest-20260716.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(manifest.attestation_class, 'publisher_self_attestation');
  assert.match(manifest.attestation_limit, /not an independently reproducible build/i);
  assert.equal(manifest.evidence_policy.live_telemetry_claimed, false);
  assert.equal(manifest.evidence_policy.operating_effectiveness_claimed, false);
  assert.equal(manifest.evidence_policy.production_readiness_claimed, false);
  assert.ok(Array.isArray(manifest.assets) && manifest.assets.length > 0);
  const publicPaths = new Set();

  for (const asset of manifest.assets) {
    assert.equal(asset.provenance_class, 'publisher_self_attestation');
    assert.equal(asset.sha256_basis, 'raw file bytes');
    assert.equal(asset.source_revision, null);
    assert.equal(asset.media_type, 'image/png');
    assert.ok(Array.isArray(asset.dimensions_px) && asset.dimensions_px.length === 2);
    assert.ok(asset.dimensions_px.every((value) => Number.isInteger(value) && value > 0));
    assert.equal(publicPaths.has(asset.path), false);
    publicPaths.add(asset.path);
    for (const publicPath of [asset.path, asset.sidecar]) {
      assert.equal(publicPath.startsWith('/assets/proposal/'), true);
      assert.equal(publicPath.includes('..'), false);
    }
    const assetPath = path.resolve(root, asset.path.replace(/^\//, ''));
    const sidecarPath = path.resolve(root, asset.sidecar.replace(/^\//, ''));
    assert.equal(assetPath.startsWith(path.resolve(root) + path.sep), true);
    assert.equal(sidecarPath.startsWith(path.resolve(root) + path.sep), true);
    assert.equal(fs.existsSync(assetPath), true);
    assert.equal(fs.existsSync(sidecarPath), true);
    assert.equal(
      crypto.createHash('sha256').update(fs.readFileSync(assetPath)).digest('hex'),
      asset.sha256,
    );
    assert.equal(
      crypto.createHash('sha256').update(fs.readFileSync(sidecarPath)).digest('hex'),
      asset.sidecar_sha256,
    );
  }
});
