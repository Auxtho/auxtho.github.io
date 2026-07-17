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

function readNormalizedPublicBytes(relativePath) {
  const worktreeBytes = fs.readFileSync(path.join(root, relativePath));
  return Buffer.from(worktreeBytes.toString('utf8').replace(/\r\n/g, '\n'));
}

test('committed legacy Pages metadata remains the exact fail-closed build revision template', () => {
  const releaseTemplate = fs.readFileSync(path.join(root, 'release.json'), 'utf8');
  assert.equal(validateReleaseTemplate(releaseTemplate), true);
});

test('legacy Pages metadata validator accepts only the exact expected SHA', () => {
  assert.deepEqual(
    validateGeneratedRelease(JSON.stringify({ source_sha: SOURCE_SHA }), SOURCE_SHA),
    { source_sha: SOURCE_SHA },
  );
});

test('legacy Pages metadata validator rejects weak or ambiguous bindings', () => {
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

test('site CI validates pushes but packages only a manually requested exact SHA behind future platform controls', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'site-ci.yml'), 'utf8');
  const attributes = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
  assert.equal((workflow.match(/- "_config\.yml"/g) || []).length, 2);
  assert.equal((workflow.match(/- "tailwind\.config\.js"/g) || []).length, 2);
  assert.equal((workflow.match(/- "\.gitattributes"/g) || []).length, 2);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /approved_sha:[\s\S]*required: true[\s\S]*type: string/);
  assert.match(workflow, /compatible_backend_site_shas:[\s\S]*required: true[\s\S]*type: string/);
  assert.match(workflow, /authorize_release:[\s\S]*environment:[\s\S]*name: github-pages/);
  assert.match(workflow, /REQUESTED_SITE_SHA: \$\{\{ inputs\.approved_sha \}\}/);
  assert.match(workflow, /APPROVED_SITE_SHA: \$\{\{ vars\.PRODUCTION_VERIFY_SITE_APPROVED_SHA \}\}/);
  assert.match(workflow, /REQUESTED_COMPATIBLE_BACKEND_SITE_SHAS: \$\{\{ inputs\.compatible_backend_site_shas \}\}/);
  assert.match(workflow, /APPROVED_COMPATIBLE_BACKEND_SITE_SHAS: \$\{\{ vars\.PRODUCTION_VERIFY_COMPATIBLE_BACKEND_SITE_SHAS \}\}/);
  assert.match(workflow, /test "\$\{GITHUB_SHA\}" = "\$\{REQUESTED_SITE_SHA\}"/);
  assert.match(workflow, /test "\$\{REQUESTED_SITE_SHA\}" = "\$\{APPROVED_SITE_SHA\}"/);
  assert.match(workflow, /requested compatible_backend_site_shas does not exactly match the protected environment allowlist/);
  assert.match(workflow, /parsed\.length < 1 \|\| parsed\.length > 2/);
  assert.match(workflow, /new Set\(parsed\)\.size !== parsed\.length/);
  assert.match(workflow, /parsed\.includes\(process\.env\.GITHUB_SHA\)/);
  assert.match(workflow, /pages: read/);
  assert.match(workflow, /gh api "repos\/\$GITHUB_REPOSITORY\/pages" --jq '\.build_type'/);
  assert.match(workflow, /HOLD: Pages publishing source is legacy/);
  assert.match(workflow, /if test "\$pages_build_type" != "workflow"/);
  assert.match(workflow, /Merely naming[\s\S]*github-pages environment is not evidence of approval/);
  assert.doesNotMatch(workflow, /approval from the github-pages environment/i);
  assert.match(workflow, /gh api "repos\/\$GITHUB_REPOSITORY\/environments\/github-pages"/);
  assert.match(workflow, /rule\.type === 'required_reviewers'/);
  assert.match(workflow, /reviewerRule\.reviewers\.length < 1/);
  assert.match(workflow, /environment\.can_admins_bypass !== false/);
  assert.match(workflow, /github-pages must disable administrator bypass/);
  assert.match(workflow, /reviewerRule\.prevent_self_review !== true/);
  assert.match(workflow, /github-pages must prevent self-review/);
  assert.match(workflow, /git ls-files --error-unmatch -- assets\/style\.css/);
  assert.match(workflow, /git diff --exit-code/);
  assert.match(workflow, /git check-attr --stdin -z export-ignore export-subst/);
  assert.match(workflow, /archive export attributes are forbidden/);
  assert.match(workflow, /git archive --format=tar "\$\{SOURCE_SHA\}" \| tar -xf - -C _release_source/);
  assert.doesNotMatch(workflow, /jekyll-build-pages/);
  assert.match(workflow, /Stage only explicit public paths from exact committed bytes/);
  assert.match(workflow, /find _release_source -maxdepth 1 -type f -name '\*\.html'/);
  assert.match(workflow, /for path in CNAME robots\.txt sitemap\.xml/);
  assert.match(workflow, /for path in security\/ardamire\/index\.html/);
  assert.match(workflow, /cp -a _release_source\/assets _site\/assets/);
  assert.match(workflow, /if test -e _release_source\/assets\/ld-org\.json/);
  assert.match(workflow, /assets\/ld-org\.json is retired while the legal entity is unresolved/);
  assert.match(workflow, /unreviewed public asset type/);
  assert.match(workflow, /\*\.css\|\*\.js\|\*\.json\|\*\.png\|\*\.svg/);
  assert.match(workflow, /EXPECTED_FILE_COUNT/);
  assert.match(workflow, /find _site -type f \| wc -l/);
  assert.match(workflow, /JSON\.stringify\(\{ source_sha: process\.env\.SOURCE_SHA, compatible_backend_site_shas: compatible \}\)/);
  assert.match(workflow, /release metadata must contain only source_sha and compatible_backend_site_shas/);
  assert.match(workflow, /compatible_backend_site_shas must include source_sha/);
  assert.match(workflow, /diff -qr _release_source\/assets _site\/assets/);
  assert.doesNotMatch(workflow, /verify-release-contract\.cjs _site\/release\.json/);
  assert.match(workflow, /site-release-provenance\/public-files-sha256\.txt/);
  assert.match(workflow, /site-release-provenance\/provenance\.json/);
  assert.match(workflow, /digest_algorithm: 'sha256'/);
  assert.match(workflow, /public file attestation subject count must be between 1 and 1024/);
  assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
  assert.equal((workflow.match(/retention-days: 90/g) || []).length, 2);
  assert.match(workflow, /actions\/attest@f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6/);
  assert.match(workflow, /subject-checksums: site-release-provenance\/public-files-sha256\.txt/);
  assert.match(workflow, /signed record is not limited to the 90-day workflow artifact/);
  assert.match(workflow, /attestations: write/);
  assert.match(workflow, /artifact-metadata: write/);
  assert.equal((workflow.match(/node-version: 22\.17\.0/g) || []).length, 3);
  assert.equal((workflow.match(/runs-on: ubuntu-24\.04/g) || []).length, 5);
  assert.doesNotMatch(workflow, /ubuntu-latest/);
  assert.match(workflow, /actions\/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b/);
  assert.match(workflow, /package:[\s\S]*if: github\.event_name == 'workflow_dispatch'[\s\S]*needs: \[verify, authorize_release\]/);
  assert.match(workflow, /deploy:[\s\S]*needs: package/);
  assert.match(workflow, /actions\/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e/);
  assert.match(workflow, /post_deploy_verify:[\s\S]*needs: deploy/);
  assert.match(workflow, /actions\/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093/);
  assert.match(workflow, /EXPECTED_PAGES_DEPLOYMENT_ORIGINS/);
  assert.match(workflow, /Pages deployment URL is not an exact reviewed HTTPS origin/);
  assert.match(workflow, /release\.json\?cache_bust=\$\{cache_bust\}/);
  assert.match(workflow, /deployed\.source_sha !== process\.env\.EXPECTED_SITE_SHA/);
  assert.match(workflow, /deployed compatibility allowlist mismatch/);
  assert.match(workflow, /deployed release identity was not confirmed after six bounded attempts/);
  assert.match(workflow, /Read back and hash every deployed public HTML, JavaScript, and release byte/);
  assert.match(workflow, /critical-public-files\.tsv/);
  assert.match(workflow, /relative\.endsWith\('\.html'\) \|\| relative\.endsWith\('\.js'\) \|\| relative === 'release\.json'/);
  assert.match(workflow, /security\/ardamire\/index\.html/);
  assert.match(workflow, /assets\/verify-2026-04-24b\.js/);
  assert.match(workflow, /deployed public byte mismatch/);
  assert.match(workflow, /retired assets\/ld-org\.json is still publicly retrievable/);
  assert.match(workflow, /404\|410/);
  assert.match(workflow, /--proto '=https'[\s\S]*--tlsv1\.2/);
  assert.match(workflow, /requireHeader\('cf-ray',/);
  assert.match(workflow, /requireHeader\('server', \/cloudflare\/i\)/);
  assert.match(workflow, /requireHeader\('strict-transport-security',/);
  assert.match(workflow, /requireHeader\('x-content-type-options',/);
  assert.match(workflow, /requireHeader\('content-security-policy',[\s\S]*frame-ancestors/);
  assert.match(workflow, /Run bounded read-only verifier browser smoke after deploy[\s\S]*npm run test:verify:deployed/);
  const preDeployJobs = workflow.slice(0, workflow.indexOf('\n  deploy:'));
  assert.doesNotMatch(preDeployJobs, /test:verify:deployed/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(attributes, /^\* text=auto eol=lf$/m);
  assert.match(attributes, /^\* -export-ignore -export-subst$/m);
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
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, asset.path.replace(/^\//, ''))))
        .digest('hex'),
      asset.sha256,
    );
    assert.equal(
      crypto
        .createHash('sha256')
        .update(readNormalizedPublicBytes(asset.sidecar.replace(/^\//, '')))
        .digest('hex'),
      asset.sidecar_sha256,
    );
  }
});

test('public evidence distinguishes intercepted attempts from completed egress', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'proposal', 'evidence-manifest-20260716.json'), 'utf8'));
  const appSidecar = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'proposal', 'app-overview-synthetic-replay-20260716.json'), 'utf8'));
  const consoleSidecar = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'proposal', 'console-synthetic-workflow-replay-20260716.json'), 'utf8'));

  assert.match(index, /no external request completed/i);
  assert.doesNotMatch(index, /no external network requests/i);
  assert.equal(appSidecar.external_network_egress_requests, 0);
  assert.equal(appSidecar.intercepted_external_dependency_request_count, 1);
  assert.match(appSidecar.observed_request_boundary, /attempted, intercepted locally/i);
  assert.equal(consoleSidecar.external_network_egress_requests, 0);
  assert.equal(consoleSidecar.intercepted_external_dependency_requests.length, 1);
  assert.equal(manifest.assets.every((asset) => asset.validation.some((entry) => /external request completions: zero/i.test(entry))), true);
});

test('homepage JSON-LD is inline, claim-bounded, and does not publish an Organization entity', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'site-ci.yml'), 'utf8');
  assert.doesNotMatch(index, /<script[^>]+type="application\/ld\+json"[^>]+src=/i);
  const match = index.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/i);
  assert.ok(match);
  const metadata = JSON.parse(match[1]);
  assert.equal(metadata['@type'], 'WebSite');
  assert.equal(metadata.url, 'https://auxtho.com/');
  assert.doesNotMatch(JSON.stringify(metadata), /governance os|enterprise compliance|regulatory approval/i);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'ld-org.json')), false);
  assert.match(workflow, /if test -e _release_source\/assets\/ld-org\.json/);
  assert.doesNotMatch(index, /"@type"\s*:\s*"Organization"/i);
});

test('verifier meta CSP is deny-by-default for supported directives while frame blocking remains response-header-only', () => {
  const verify = fs.readFileSync(path.join(root, 'verify.html'), 'utf8');
  const match = verify.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/i);
  assert.ok(match);
  const policy = match[1];
  for (const directive of [
    "default-src 'none'",
    "script-src 'self'",
    "connect-src 'self' https://api.auxtho.com http://127.0.0.1:8000",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
  ]) {
    assert.match(policy, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(policy, /frame-ancestors/i);
  assert.doesNotMatch(policy, /unsafe-eval|unsafe-inline|\*/i);
});

test('privacy sitemap entry is dated July 17, 2026', () => {
  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  const privacyEntry = sitemap.match(/<url>\s*<loc>https:\/\/auxtho\.com\/privacy\.html<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/);
  assert.ok(privacyEntry);
  assert.equal(privacyEntry[1], '2026-07-17');
});

test('verifier copy declares legacy 16-character bindings retired without weakening the 64-character path', () => {
  const verify = fs.readFileSync(path.join(root, 'verify.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'assets', 'verify-2026-04-24b.js'), 'utf8');
  assert.match(verify, /Legacy 16-character artifact bindings were retired on July 17, 2026/);
  assert.match(verify, /Legacy fragment-form or query-form QR links open only a local tombstone/);
  assert.match(verify, /Record Binding Checksum \(64-character SHA-256\)/);
  assert.doesNotMatch(verify, /truncated SHA-256/i);
  assert.match(script, /\[0-9a-fA-F\]\{16\}/);
  assert.match(script, /\[0-9a-fA-F\]\{64\}/);
  assert.match(script, /Legacy Binding Retired/);
});

test('public privacy notice identifies the operator contact and holds regulated sharing', () => {
  const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
  assert.match(privacy, /Jin Sung as Founder &amp; Architect/);
  assert.match(privacy, /External regulated or personal-data sharing remains HOLD/);
  assert.match(privacy, /registered contracting-entity name/);
  assert.match(privacy, /legal data-controller identity/);
  assert.match(privacy, /do not resolve that legal gap or prove continuous operating effectiveness/);
  assert.match(privacy, /old query-form 16-character binding/);
  assert.match(privacy, /starts no readiness or comparison API request/);
  assert.match(privacy, /hello@auxtho\.com/);
});

test('retired story and security URLs publish claim-free tombstones', () => {
  for (const relativePath of ['story.html', path.join('security', 'ardamire', 'index.html')]) {
    const document = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.match(document, /This .*URL is retired/i);
    assert.match(document, /not current/i);
    assert.match(document, /noindex,nofollow,noarchive/i);
    assert.doesNotMatch(document, /certified|bank-grade|production-ready|customer success/i);
  }
});
