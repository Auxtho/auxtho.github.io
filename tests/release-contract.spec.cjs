const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const parse5 = require('parse5');
const YAML = require('yaml');

const {
  buildArtifact,
  findImageSources,
  findMediaSources,
  findScriptSources,
  findStylesheetSources,
  isApprovedHistoricalRollbackEvidence,
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
const {
  validateReleaseManifestIdentity,
} = require('../scripts/release/verify-deployment.cjs');

const root = path.resolve(__dirname, '..');
const gitRoot = path.resolve(
  process.env.AUXTHO_PUBLIC_VERIFY_GIT_ROOT || root,
);
const LEGACY_SHA = '1'.repeat(40);
const SITE_SHA = 'a'.repeat(40);
const COMPATIBILITY = [LEGACY_SHA, SITE_SHA].sort();
const ACTUAL_LEGACY_SHA = '4b2f476c741b771519745930a6ebf244cf5d6433';
const CURRENT_LIVE_SHA = '784ec29c658ed08ebccfcb3a107d3c7556262d96';
const CURRENT_LIVE_EVIDENCE_SHA = 'dc5e5b15347e11b2e3da85df585c0d5b1ab414f37e63b3ce617cced98787e3ec';
const CURRENT_MARKETING_LIVE_SHA = '4cce39436434f6815bf0c8610596396686c31cef';

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

const PNG_CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return crc >>> 0;
});

function pngCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = PNG_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function insertPngChunkBeforeIend(bytes, type, data) {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const chunkType = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    if (chunkType === 'IEND') {
      return Buffer.concat([bytes.subarray(0, offset), pngChunk(type, data), bytes.subarray(offset)]);
    }
    offset += 12 + length;
  }
  throw new Error('fixture PNG is missing IEND');
}

function rewriteEvidenceImageAndSidecar(source, manifest, assetIndex, imageBytes) {
  const asset = manifest.assets[assetIndex];
  const previousImageSha = asset.sha256;
  const imagePath = path.join(source, ...asset.path.slice(1).split('/'));
  const sidecarPath = path.join(source, ...asset.sidecar.slice(1).split('/'));
  fs.writeFileSync(imagePath, imageBytes);
  asset.sha256 = sha256(imageBytes);
  const previousReference = `${asset.path}?sha256=${previousImageSha}`;
  const nextReference = `${asset.path}?sha256=${asset.sha256}`;
  for (const relative of ['index.html', 'evidence-notes.html']) {
    const htmlPath = path.join(source, relative);
    const html = fs.readFileSync(htmlPath, 'utf8');
    fs.writeFileSync(htmlPath, html.split(previousReference).join(nextReference));
  }
  const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
  sidecar.sha256 = asset.sha256;
  fs.writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
  asset.sidecar_sha256 = sha256(fs.readFileSync(sidecarPath));
}

function copy(relative, targetRoot) {
  const source = path.join(root, ...relative.split('/'));
  const target = path.join(targetRoot, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, errorOnExist: true });
}

function createSourceFixture(targetRoot) {
  for (const relative of [
    '404.html', 'evidence-notes.html', 'index.html', 'privacy.html', 'story.html', 'terms.html',
    'CNAME', 'robots.txt', 'sitemap.xml', 'lineage/isp/index.html',
    'proof/release-core/index.html', 'proof/release-core/transcript/index.html',
    'proof/singapore-source-review/index.html',
    'security/ardamire/index.html', 'assets',
    'package.json', 'scripts/release/BOOTSTRAP.md', 'scripts/release/public-files.json',
  ]) copy(relative, targetRoot);
}

function materializeExactGitTree(commitSha, targetRoot) {
  const listed = spawnSync(
    'git',
    ['ls-tree', '-rz', '--full-tree', commitSha],
    { cwd: gitRoot, encoding: null, windowsHide: true },
  );
  assert.equal(listed.status, 0, listed.stderr?.toString('utf8'));

  for (const entry of listed.stdout.toString('utf8').split('\0').filter(Boolean)) {
    const match = entry.match(/^([0-9]+) (blob) ([0-9a-f]{40})\t(.+)$/s);
    assert.ok(match, `unsupported git tree entry: ${entry}`);
    const [, mode, , objectSha, relative] = match;
    assert.notEqual(mode, '120000', `symbolic links are forbidden: ${relative}`);
    const blob = spawnSync(
      'git',
      ['cat-file', 'blob', objectSha],
      { cwd: gitRoot, encoding: null, windowsHide: true },
    );
    assert.equal(blob.status, 0, blob.stderr?.toString('utf8'));
    const output = path.join(targetRoot, ...relative.split('/'));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, blob.stdout);
  }
}

function walkHtml(node, visit) {
  visit(node);
  for (const child of node.childNodes || []) walkHtml(child, visit);
  if (node.content) walkHtml(node.content, visit);
}

function htmlAttribute(node, name) {
  return node.attrs?.find((attribute) => attribute.name === name)?.value;
}

function htmlLinksAndIds(document) {
  const hrefs = [];
  const ids = new Set();
  walkHtml(document, (node) => {
    const id = htmlAttribute(node, 'id');
    if (id) ids.add(id);
    if (node.tagName === 'a') {
      const href = htmlAttribute(node, 'href');
      if (href) hrefs.push(href);
    }
  });
  return { hrefs, ids };
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
    assert.deepEqual(result.release.declared_site_source_shas, COMPATIBILITY);
    assert.deepEqual(result.releaseManifest.compatible_backend_site_shas, COMPATIBILITY);
    assert.deepEqual(result.releaseManifest.declared_site_source_shas, COMPATIBILITY);
    assert.deepEqual(result.release.planned_site_sha_transition, {
      bridge_site_sha: LEGACY_SHA,
      final_site_sha: SITE_SHA,
      rollback_site_sha: LEGACY_SHA,
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
    for (const reference of result.releaseManifest.media_references) {
      assert.match(reference.url, /^\/assets\/[A-Za-z0-9._/-]+\.mp4\?sha256=[0-9a-f]{64}$/);
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
    assert.doesNotThrow(() => validateReleaseManifestIdentity(result.releaseManifest, result.release));
    const tamperedManifest = structuredClone(result.releaseManifest);
    tamperedManifest.declared_site_source_shas = [SITE_SHA];
    assert.throws(
      () => validateReleaseManifestIdentity(tamperedManifest, result.release),
      /release manifest identity mismatch: declared_site_source_shas/,
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
    {
      name: 'invalid public PDF signature',
      relative: 'assets/proof/release-core/When_Approval_Should_Not_Travel_With_the_Output.pdf',
      bytes: Buffer.from('not a PDF\n'),
      expected: /public PDF does not have a valid PDF signature boundary/,
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
    {
      name: 'unreviewed nested HTML namespace',
      mutate: (manifest) => `${JSON.stringify({
        schema_version: 1,
        paths: [...manifest.paths, '/lineage/private/index.html'].sort(),
      }, null, 2)}\n`,
      expected: /public file path is outside reviewed namespaces/,
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
    assert.deepEqual(result.releaseManifest.compatible_backend_site_shas, [LEGACY_SHA]);
    assert.deepEqual(result.releaseManifest.declared_site_source_shas, [LEGACY_SHA]);
    assert.doesNotThrow(() => validateReleaseManifestIdentity(result.releaseManifest, result.release));
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

test('historical rollback evidence is bound to the exact approved live source and manifest bytes', () => {
  assert.equal(isApprovedHistoricalRollbackEvidence(CURRENT_LIVE_SHA, CURRENT_LIVE_EVIDENCE_SHA), true);
  assert.equal(isApprovedHistoricalRollbackEvidence(CURRENT_LIVE_SHA, '0'.repeat(64)), false);
  assert.equal(isApprovedHistoricalRollbackEvidence('0'.repeat(40), CURRENT_LIVE_EVIDENCE_SHA), false);
});

test('approved live rollback packages exact bytes and rejects modified historical public files', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxtho-approved-live-rollback-'));
  try {
    const archive = path.join(temporary, 'live.tar');
    const source = path.join(temporary, 'live');
    const tampered = path.join(temporary, 'tampered');
    const previous = path.join(temporary, 'previous');
    fs.mkdirSync(source);
    fs.mkdirSync(previous);
    createSourceFixture(previous);

    const archived = spawnSync('git', ['archive', '--format=tar', `--output=${archive}`, CURRENT_LIVE_SHA], {
      cwd: gitRoot,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(archived.status, 0, archived.stderr);
    const extracted = spawnSync('tar', ['-xf', archive, '-C', source], { encoding: 'utf8', windowsHide: true });
    assert.equal(extracted.status, 0, extracted.stderr);

    const result = buildArtifact({
      sourceRoot: source,
      previousSourceRoot: previous,
      outputRoot: path.join(temporary, 'site'),
      provenanceRoot: path.join(temporary, 'provenance'),
      sourceSha: CURRENT_LIVE_SHA,
      previousSha: CURRENT_LIVE_SHA,
      compatibleJson: JSON.stringify([CURRENT_LIVE_SHA]),
      mode: 'rollback',
      rollbackOfSha: SITE_SHA,
      retiredManifestPath: path.join(root, 'scripts', 'release', 'retired-public-paths.json'),
      artifactName: 'github-pages-rollback',
      repository: 'auxtho/auxtho.github.io',
      runId: '123',
      runAttempt: '1',
    });
    assert.equal(result.release.privacy_manifest.historical_approved, true);
    assert.equal(result.releaseManifest.evidence_boundaries.reviewed_candidate_claims_present, false);

    const wrongLegacySite = path.join(temporary, 'wrong-legacy-site');
    assert.throws(() => buildArtifact({
      sourceRoot: source,
      previousSourceRoot: previous,
      outputRoot: wrongLegacySite,
      provenanceRoot: path.join(temporary, 'wrong-legacy-provenance'),
      sourceSha: CURRENT_LIVE_SHA,
      previousSha: CURRENT_LIVE_SHA,
      compatibleJson: JSON.stringify([CURRENT_LIVE_SHA]),
      mode: 'rollback',
      rollbackOfSha: SITE_SHA,
      legacyBootstrap: true,
      retiredManifestPath: path.join(root, 'scripts', 'release', 'retired-public-paths.json'),
      artifactName: 'github-pages-rollback',
      repository: 'auxtho/auxtho.github.io',
      runId: '123',
      runAttempt: '1',
    }), /exact approved bootstrap source SHA/);
    assert.equal(fs.existsSync(wrongLegacySite), false);

    const changedPage = path.join(temporary, 'changed-page');
    fs.cpSync(source, changedPage, { recursive: true });
    fs.appendFileSync(path.join(changedPage, 'index.html'), '\n');
    assert.throws(() => buildArtifact({
      sourceRoot: changedPage,
      previousSourceRoot: previous,
      outputRoot: path.join(temporary, 'changed-page-site'),
      provenanceRoot: path.join(temporary, 'changed-page-provenance'),
      sourceSha: CURRENT_LIVE_SHA,
      previousSha: CURRENT_LIVE_SHA,
      compatibleJson: JSON.stringify([CURRENT_LIVE_SHA]),
      mode: 'rollback',
      rollbackOfSha: SITE_SHA,
      retiredManifestPath: path.join(root, 'scripts', 'release', 'retired-public-paths.json'),
      artifactName: 'github-pages-rollback',
      repository: 'auxtho/auxtho.github.io',
      runId: '123',
      runAttempt: '1',
    }), /historical rollback public tree differs/);

    fs.cpSync(source, tampered, { recursive: true });
    const sidecarPath = path.join(
      tampered,
      'assets',
      'proposal',
      'app-overview-synthetic-replay-20260716.json',
    );
    fs.appendFileSync(sidecarPath, '\n');
    assert.throws(() => buildArtifact({
      sourceRoot: tampered,
      previousSourceRoot: previous,
      outputRoot: path.join(temporary, 'tampered-site'),
      provenanceRoot: path.join(temporary, 'tampered-provenance'),
      sourceSha: CURRENT_LIVE_SHA,
      previousSha: CURRENT_LIVE_SHA,
      compatibleJson: JSON.stringify([CURRENT_LIVE_SHA]),
      mode: 'rollback',
      rollbackOfSha: SITE_SHA,
      retiredManifestPath: path.join(root, 'scripts', 'release', 'retired-public-paths.json'),
      artifactName: 'github-pages-rollback',
      repository: 'auxtho/auxtho.github.io',
      runId: '123',
      runAttempt: '1',
    }), /historical rollback public tree differs/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('current marketing live source packages as the exact rollback despite older front-page copy', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxtho-current-marketing-live-rollback-'));
  try {
    const archive = path.join(temporary, 'live.tar');
    const source = path.join(temporary, 'live');
    const previous = path.join(temporary, 'previous');
    fs.mkdirSync(source);
    fs.mkdirSync(previous);
    createSourceFixture(previous);

    const archived = spawnSync(
      'git',
      ['archive', '--format=tar', `--output=${archive}`, CURRENT_MARKETING_LIVE_SHA],
      { cwd: gitRoot, encoding: 'utf8', windowsHide: true },
    );
    assert.equal(archived.status, 0, archived.stderr);
    const extracted = spawnSync('tar', ['-xf', archive, '-C', source], { encoding: 'utf8', windowsHide: true });
    assert.equal(extracted.status, 0, extracted.stderr);

    const result = buildArtifact({
      sourceRoot: source,
      previousSourceRoot: previous,
      outputRoot: path.join(temporary, 'site'),
      provenanceRoot: path.join(temporary, 'provenance'),
      sourceSha: CURRENT_MARKETING_LIVE_SHA,
      previousSha: CURRENT_MARKETING_LIVE_SHA,
      compatibleJson: JSON.stringify([CURRENT_MARKETING_LIVE_SHA]),
      mode: 'rollback',
      rollbackOfSha: SITE_SHA,
      retiredManifestPath: path.join(root, 'scripts', 'release', 'retired-public-paths.json'),
      artifactName: 'github-pages-rollback',
      repository: 'auxtho/auxtho.github.io',
      runId: '123',
      runAttempt: '1',
    });

    assert.equal(result.release.source_sha, CURRENT_MARKETING_LIVE_SHA);
    assert.equal(result.releaseManifest.source_sha, CURRENT_MARKETING_LIVE_SHA);
    assert.deepEqual(result.releaseManifest.compatible_backend_site_shas, [CURRENT_MARKETING_LIVE_SHA]);
    assert.doesNotThrow(() => validateReleaseManifestIdentity(result.releaseManifest, result.release));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('bootstrap rollback packages the actual approved legacy tree without inventing a candidate evidence manifest', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxtho-actual-legacy-rollback-'));
  try {
    const source = path.join(temporary, 'legacy');
    const previous = path.join(temporary, 'previous');
    fs.mkdirSync(source);
    fs.mkdirSync(previous);
    createSourceFixture(previous);
    materializeExactGitTree(ACTUAL_LEGACY_SHA, source);
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

    const tampered = path.join(temporary, 'tampered-legacy');
    fs.cpSync(source, tampered, { recursive: true });
    fs.appendFileSync(path.join(tampered, 'index.html'), '\n');
    const tamperedSite = path.join(temporary, 'tampered-site');
    assert.throws(() => buildArtifact({
      sourceRoot: tampered,
      previousSourceRoot: previous,
      outputRoot: tamperedSite,
      provenanceRoot: path.join(temporary, 'tampered-provenance'),
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
    }), /legacy bootstrap public tree differs/);
    assert.equal(fs.existsSync(tamperedSite), false);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('every HTML script reference is query-free and bound to exact SHA-256 bytes', () => {
  const htmlFiles = [
    '404.html', 'index.html', 'privacy.html', 'terms.html',
    'story.html', 'lineage/isp/index.html', 'security/ardamire/index.html',
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
  assert.equal(referenced.size, 4);
});

test('every candidate stylesheet URL carries the exact SHA-256 of its bytes', () => {
  const htmlFiles = [
    '404.html', 'index.html', 'privacy.html', 'story.html', 'terms.html',
    'lineage/isp/index.html', 'security/ardamire/index.html',
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
  const htmlFiles = [
    '404.html', 'index.html', 'privacy.html', 'terms.html',
    'lineage/isp/index.html', 'security/ardamire/index.html',
  ];
  for (const relative of htmlFiles) {
    const document = fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
    for (const source of findImageSources(document)) {
      const match = source.match(/^(\/assets\/[A-Za-z0-9._/-]+\.(?:png|svg))\?sha256=([0-9a-f]{64})$/);
      assert.ok(match, `${relative} -> ${source}`);
      const bytes = fs.readFileSync(path.join(root, ...match[1].slice(1).split('/')));
      assert.equal(sha256(bytes), match[2]);
    }
  }
});

test('every candidate-rendered MP4 URL carries the exact SHA-256 of its bytes', () => {
  const htmlFiles = [
    '404.html', 'index.html', 'privacy.html', 'terms.html',
    'lineage/isp/index.html', 'security/ardamire/index.html',
  ];
  const referenced = new Set();
  for (const relative of htmlFiles) {
    const document = fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
    for (const source of findMediaSources(document)) {
      const match = source.match(/^(\/assets\/[A-Za-z0-9._/-]+\.mp4)\?sha256=([0-9a-f]{64})$/);
      assert.ok(match, `${relative} -> ${source}`);
      const bytes = fs.readFileSync(path.join(root, ...match[1].slice(1).split('/')));
      assert.equal(sha256(bytes), match[2]);
      referenced.add(source);
    }
  }
  assert.equal(referenced.size, 2);
});

test('public notice separates public information from signed commercial scope', () => {
  const terms = fs.readFileSync(path.join(root, 'terms.html'), 'utf8');
  assert.match(terms, /Public Site Notice/);
  assert.match(terms, /do not by themselves create a commercial relationship/i);
  assert.match(terms, /separate signed agreement/i);
  assert.match(terms, /identif(?:y|ies|ying) the parties, jurisdiction, data roles, security controls, retention, and operating boundary/i);
  assert.doesNotMatch(terms, /unresolved legal identity|remains HOLD/i);
  assert.doesNotMatch(terms, /verify-audit-v1|HMAC-SHA-256|pseudonymization key identifier/i);
  assert.doesNotMatch(terms, /Terms of Service|agree to be bound|binding terms/i);
});

test('privacy notice describes public-site data handling without exposing a verifier service', () => {
  const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
  assert.match(privacy, /describes the Auxtho public website/i);
  assert.match(privacy, /respond to inquiries you explicitly send/i);
  assert.match(privacy, /does not intentionally configure site analytics/i);
  assert.match(privacy, /Website, CDN, hosting, and security providers may process/i);
  assert.match(privacy, /Do not send personal, customer-confidential, regulated, production, or secret data/i);
  assert.doesNotMatch(
    privacy,
    /verify\.html|verification API|audit contract version|pseudonymization key identifier|HMAC-SHA-256|Redis|anonymous fingerprint|guaranteed deletion|all logs are deleted|bounded rate-limit window key|remains HOLD|unresolved legal identity/i,
  );
});

test('public evidence manifest and homepage preserve a concise synthetic boundary', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const evidenceNotes = fs.readFileSync(path.join(root, 'evidence-notes.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, 'assets', 'proposal', 'evidence-manifest-20260716.json'),
    'utf8',
  ));
  assert.match(index, /synthetic workflow/i);
  assert.doesNotMatch(index, /not live telemetry|no customer data|not production/i);
  assert.doesNotMatch(index, /evidence-manifest-20260716\.json/i);
  assert.match(evidenceNotes, /independent example of its named product surface/i);
  assert.match(evidenceNotes, /rather than a recording of one correlated operational run/i);
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.attestation_class, 'publisher_self_attestation');
  assert.equal(manifest.evidence_policy.matching_display_sequence_is_deliberate_synthetic_fixture, true);
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
    const sidecarBytes = fs.readFileSync(path.join(root, ...asset.sidecar.replace(/^\//, '').split('/')));
    const sidecar = JSON.parse(sidecarBytes.toString('utf8'));
    assert.equal(sidecar.schema_version, 1);
    assert.equal(sha256(bytes), asset.sha256);
    assert.equal(sha256(sidecarBytes), asset.sidecar_sha256);
    assert.equal(sidecar.customer_data_used, false);
    assert.equal(asset.fixture_class, 'independent_synthetic_fixture');
    assert.equal(asset.synthetic_only, true);
    assert.equal(asset.correlated_run_claimed, false);
    assert.equal(sidecar.fixture_class, asset.fixture_class);
    assert.equal(sidecar.synthetic_only, asset.synthetic_only);
    assert.equal(sidecar.correlated_run_claimed, asset.correlated_run_claimed);
    assert.equal(sidecar.fixture_relationship, asset.fixture_relationship);
    assert.equal(sidecar.output_path, asset.path);
    assert.equal(sidecar.sha256, asset.sha256);
    assert.deepEqual(sidecar.fixture_summary, asset.fixture_values);
    assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], asset.dimensions_px);
    assert.deepEqual(sidecar.dimensions_physical_px, asset.dimensions_px);
    assert.ok(asset.dimensions_px[0] <= 1920, `${asset.path} exceeds the public width limit`);
  }
  const appAsset = manifest.assets.find((asset) => asset.surface === 'Auxtho App');
  assert.equal(appAsset.public_derivative, true);
});

test('candidate artifact rejects a stale public evidence sidecar hash', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxtho-sidecar-integrity-'));
  try {
    const source = path.join(temporary, 'source');
    const previous = path.join(temporary, 'previous');
    fs.mkdirSync(source);
    fs.mkdirSync(previous);
    createSourceFixture(source);
    createSourceFixture(previous);
    const manifestPath = path.join(source, 'assets', 'proposal', 'evidence-manifest-20260716.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.assets[0].sidecar_sha256 = '0'.repeat(64);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

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
    }), /public evidence sidecar hash mismatch/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('candidate artifact binds each homepage evidence card to its reviewed surface asset', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxtho-surface-binding-'));
  try {
    const source = path.join(temporary, 'source');
    const previous = path.join(temporary, 'previous');
    fs.mkdirSync(source);
    fs.mkdirSync(previous);
    createSourceFixture(source);
    createSourceFixture(previous);
    const manifest = JSON.parse(fs.readFileSync(
      path.join(source, 'assets', 'proposal', 'evidence-manifest-20260716.json'),
      'utf8',
    ));
    const app = manifest.assets.find((asset) => asset.surface === 'Auxtho App');
    const consoleSurface = manifest.assets.find((asset) => asset.surface === 'Auxtho Console');
    const appReference = `${app.path}?sha256=${app.sha256}`;
    const consoleReference = `${consoleSurface.path}?sha256=${consoleSurface.sha256}`;
    const indexPath = path.join(source, 'index.html');
    const index = fs.readFileSync(indexPath, 'utf8');
    fs.writeFileSync(
      indexPath,
      index
        .split(appReference).join('__AUXTHO_APP_EVIDENCE__')
        .split(consoleReference).join(appReference)
        .split('__AUXTHO_APP_EVIDENCE__').join(consoleReference),
    );

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
    }), /must bind Auxtho App to its exact reviewed heading and image/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('candidate artifact rejects unreviewed public HTML claim drift', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxtho-claim-drift-'));
  try {
    const source = path.join(temporary, 'source');
    const previous = path.join(temporary, 'previous');
    fs.mkdirSync(source);
    fs.mkdirSync(previous);
    createSourceFixture(source);
    createSourceFixture(previous);
    const indexPath = path.join(source, 'index.html');
    const index = fs.readFileSync(indexPath, 'utf8');
    fs.writeFileSync(
      indexPath,
      index.replace('</main>', '<p>Independently certified and regulator-approved production readiness.</p></main>'),
    );

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
    }), /reviewed public HTML differs from its exact approved claim contract: index\.html/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('candidate artifact rejects an added public HTML claim surface', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxtho-added-claim-surface-'));
  try {
    const source = path.join(temporary, 'source');
    const previous = path.join(temporary, 'previous');
    fs.mkdirSync(source);
    fs.mkdirSync(previous);
    createSourceFixture(source);
    createSourceFixture(previous);
    fs.writeFileSync(
      path.join(source, 'certified.html'),
      '<!doctype html><html><body>Independently certified and production-ready.</body></html>\n',
    );
    const publicManifestPath = path.join(source, 'scripts', 'release', 'public-files.json');
    const publicManifest = JSON.parse(fs.readFileSync(publicManifestPath, 'utf8'));
    publicManifest.paths.push('/certified.html');
    publicManifest.paths.sort();
    fs.writeFileSync(publicManifestPath, `${JSON.stringify(publicManifest, null, 2)}\n`);

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
    }), /public file path is outside reviewed namespaces: \/certified\.html/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('candidate artifact rejects evidence traversal, cross-binding, duplicate paths, and weakened structure', () => {
  const fixtures = [
    {
      name: 'path traversal',
      expected: /public path traversal is forbidden/,
      mutate(source, manifest) {
        manifest.assets[0].path = '/assets/proposal/../style.css';
      },
    },
    {
      name: 'wrong sidecar binding',
      expected: /sidecar is not bound to its declared image and fixture summary/,
      mutate(source, manifest) {
        const original = path.join(source, ...manifest.assets[1].sidecar.slice(1).split('/'));
        const wrongRelative = 'assets/proposal/app-wrong-binding.json';
        const wrong = path.join(source, ...wrongRelative.split('/'));
        fs.copyFileSync(original, wrong);
        const publicManifestPath = path.join(source, 'scripts', 'release', 'public-files.json');
        const publicManifest = JSON.parse(fs.readFileSync(publicManifestPath, 'utf8'));
        publicManifest.paths.push(`/${wrongRelative}`);
        publicManifest.paths.sort();
        fs.writeFileSync(publicManifestPath, `${JSON.stringify(publicManifest, null, 2)}\n`);
        manifest.assets[0].sidecar = `/${wrongRelative}`;
        manifest.assets[0].sidecar_sha256 = sha256(fs.readFileSync(wrong));
      },
    },
    {
      name: 'duplicate evidence path',
      expected: /public evidence path is declared more than once/,
      mutate(source, manifest) {
        manifest.assets[1].path = manifest.assets[0].path;
        manifest.assets[1].sha256 = manifest.assets[0].sha256;
      },
    },
    {
      name: 'dimension mismatch',
      expected: /image dimensions do not match/,
      mutate(source, manifest) {
        manifest.assets[0].dimensions_px = [1, 1];
      },
    },
    {
      name: 'weakened structured boundary',
      expected: /weakened the independent synthetic boundary/,
      mutate(source, manifest) {
        manifest.assets[0].synthetic_only = false;
      },
    },
    {
      name: 'contradictory relationship prose',
      expected: /weakened the independent synthetic boundary/,
      mutate(source, manifest) {
        manifest.assets[0].fixture_relationship = 'This fixture is not independent.';
      },
    },
    {
      name: 'removed homepage evidence asset',
      expected: /exact two reviewed homepage assets/,
      mutate(source, manifest) {
        manifest.assets.pop();
      },
    },
    {
      name: 'unknown manifest claim',
      expected: /exact reviewed schema keys/,
      mutate(source, manifest) {
        manifest.regulatory_approved = true;
      },
    },
    {
      name: 'weakened matching-display policy',
      expected: /weakened its privacy or evidence boundaries/,
      mutate(source, manifest) {
        manifest.evidence_policy.matching_display_sequence_is_deliberate_synthetic_fixture = false;
      },
    },
    {
      name: 'unknown sidecar claim',
      expected: /sidecar must use the exact reviewed schema keys/,
      mutate(source, manifest) {
        const sidecarPath = path.join(source, ...manifest.assets[0].sidecar.slice(1).split('/'));
        const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
        sidecar.independent_assurance_claimed = true;
        fs.writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
        manifest.assets[0].sidecar_sha256 = sha256(fs.readFileSync(sidecarPath));
      },
    },
    {
      name: 'reviewed manifest narrative changed',
      expected: /exact reviewed evidence contract/,
      mutate(source, manifest) {
        manifest.attestation_limit = 'Independent assurance and regulatory approval are established.';
      },
    },
    {
      name: 'reviewed asset narrative changed',
      expected: /exact reviewed evidence contract/,
      mutate(source, manifest) {
        manifest.assets[0].validation[0] = 'Regulatory approval and operating effectiveness confirmed.';
      },
    },
    {
      name: 'reviewed sidecar claim changed',
      expected: /exact reviewed evidence contract/,
      mutate(source, manifest) {
        const sidecarPath = path.join(source, ...manifest.assets[0].sidecar.slice(1).split('/'));
        const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
        sidecar.claim_boundary = 'Independent assurance and customer production readiness are established.';
        fs.writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
        manifest.assets[0].sidecar_sha256 = sha256(fs.readFileSync(sidecarPath));
      },
    },
    {
      name: 'reviewed asset order changed',
      expected: /exact reviewed evidence contract/,
      mutate(source, manifest) {
        manifest.assets.reverse();
      },
    },
    {
      name: 'PNG text metadata inserted',
      expected: /unreviewed PNG chunk: tEXt/,
      mutate(source, manifest) {
        const imagePath = path.join(source, ...manifest.assets[0].path.slice(1).split('/'));
        const original = fs.readFileSync(imagePath);
        const changed = insertPngChunkBeforeIend(
          original,
          'tEXt',
          Buffer.from('Comment\0unreviewed metadata', 'latin1'),
        );
        rewriteEvidenceImageAndSidecar(source, manifest, 0, changed);
      },
    },
    {
      name: 'PNG trailing data appended',
      expected: /end exactly at IEND/,
      mutate(source, manifest) {
        const imagePath = path.join(source, ...manifest.assets[0].path.slice(1).split('/'));
        const changed = Buffer.concat([fs.readFileSync(imagePath), Buffer.from('hidden trailing bytes')]);
        rewriteEvidenceImageAndSidecar(source, manifest, 0, changed);
      },
    },
    {
      name: 'duplicate manifest key',
      expected: /canonical JSON without duplicate keys/,
      mutate() {},
      serialize(manifest) {
        return `${JSON.stringify(manifest, null, 2)}\n`.replace(
          '  "schema_version": 1,\n',
          '  "schema_version": 1,\n  "schema_version": 1,\n',
        );
      },
    },
  ];

  for (const fixture of fixtures) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxtho-evidence-attack-'));
    try {
      const source = path.join(temporary, 'source');
      const previous = path.join(temporary, 'previous');
      fs.mkdirSync(source);
      fs.mkdirSync(previous);
      createSourceFixture(source);
      createSourceFixture(previous);
      const manifestPath = path.join(source, 'assets', 'proposal', 'evidence-manifest-20260716.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      fixture.mutate(source, manifest);
      fs.writeFileSync(
        manifestPath,
        fixture.serialize ? fixture.serialize(manifest) : `${JSON.stringify(manifest, null, 2)}\n`,
      );

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

test('first screen presents evidence-backed review and controlled release in plain language', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const hero = index.match(/<section[^>]*class="sales-hero"[\s\S]*?<\/section>/i)?.[0] || '';
  const sourceReviewBand = index.match(
    /<article class="sales-product-band sales-product-band-source-review">[\s\S]*?<\/article>/i,
  )?.[0] || '';
  assert.match(hero, /For regulated financial teams/i);
  assert.match(hero, /AI can do the work\. A person must own the consequence/i);
  assert.match(hero, /checks selected claims/i);
  assert.match(hero, /approved sources and review rules/i);
  assert.match(hero, /accountable reviewer/i);
  assert.match(hero, /exact reviewed version, authorized next action, and recorded result/i);
  assert.match(hero, /Discuss one workflow/i);
  assert.match(hero, /View public proof/i);
  assert.match(hero, /Synthetic workflow/i);
  assert.match(hero, /Public proof: a local synthetic Singapore source-review demo and a separate Release Core proof/i);
  assert.doesNotMatch(hero, /customer adoption|production readiness|regulatory approval/i);
  assert.match(index, /Source-based review helps determine what a person should approve/i);
  assert.match(index, /A changed or unconfirmed result does not inherit approval or trigger an automatic resend/i);
  assert.match(sourceReviewBand, /class="sales-source-record"/i);
  assert.match(sourceReviewBand, /MAS Notice FSM-N05/i);
  assert.match(sourceReviewBand, /Page 3/i);
  assert.match(sourceReviewBand, /4DB66F0F\.\.\.7D2D26B6/i);
  assert.match(sourceReviewBand, /SUPPORTED IN SELECTED SOURCE SET/i);
  assert.doesNotMatch(sourceReviewBand, /source-traceability\.png/i);
  assert.doesNotMatch(sourceReviewBand, /frozen-demo\.png/i);
  assert.doesNotMatch(index, /important statements|material claims|Policy Packs?/i);
  assert.match(index, /class="vision-film-continue" href="#how-it-works"/i);
  assert.doesNotMatch(hero, /Request a pilot|production-ready|regulatory approval|masked data/i);
});

test('post-deploy browser smoke covers Evidence Notes and the retired verifier route', () => {
  const smoke = fs.readFileSync(path.join(root, 'tests', 'post-deploy-verifier-smoke.spec.cjs'), 'utf8');
  assert.match(smoke, /path: '\/evidence-notes\.html'/i);
  assert.match(smoke, /path: '\/proof\/release-core\/'/i);
  assert.match(smoke, /path: '\/proof\/release-core\/transcript\/'/i);
  assert.match(smoke, /path: '\/proof\/singapore-source-review\/'/i);
  assert.match(smoke, /public verifier route is absent/i);
  assert.match(smoke, /response\.status\(\)\)\.toBe\(404\)/i);
  assert.match(smoke, /api_request_count/i);
  assert.match(smoke, /request\.resourceType\(\) === 'media'/i);
  assert.match(smoke, /request\.failure\(\)\?\.errorText === 'net::ERR_ABORTED'/i);
  assert.match(smoke, /auxtho-incident-led-hero-\(\?:mobile-\)\?v9\\\.mp4/i);
  assert.match(smoke, /expectedVisionMediaCancellations\.length\)\.toBeLessThanOrEqual\(2\)/i);
});

test('Release Core public manifest binds the exact public proof assets and private-source boundary', () => {
  const manifestPath = path.join(root, 'assets', 'proof', 'release-core', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.proof_id, 'auxtho-release-core-public-safe-level-a');
  assert.equal(manifest.public_site_repository, 'https://github.com/Auxtho/auxtho.github.io');
  assert.equal(manifest.internal_frozen_source.visibility, 'private');
  assert.equal(manifest.internal_frozen_source.publicly_resolvable, false);
  assert.equal(manifest.scope.customer_results_claimed, false);
  assert.equal(manifest.scope.production_results_claimed, false);
  assert.equal(manifest.scope.operating_effectiveness_claimed, false);

  const manifestPaths = new Set();
  for (const asset of manifest.assets) {
    assert.match(asset.path, /^\//);
    assert.equal(manifestPaths.has(asset.path), false, `duplicate proof manifest path: ${asset.path}`);
    manifestPaths.add(asset.path);
    const sourcePath = path.join(root, ...asset.path.slice(1).split('/'));
    const bytes = fs.readFileSync(sourcePath);
    assert.equal(bytes.length, asset.bytes, `proof manifest size mismatch: ${asset.path}`);
    assert.equal(sha256(bytes), asset.sha256, `proof manifest digest mismatch: ${asset.path}`);
  }

  for (const requiredPath of [
    '/proof/release-core/index.html',
    '/proof/release-core/transcript/index.html',
    '/assets/proof-release-core.css',
    '/assets/proof/release-core/When_Approval_Should_Not_Travel_With_the_Output.pdf',
    '/assets/proof/release-core/rc01.png',
    '/assets/proof/release-core/rc02.png',
    '/assets/proof/release-core/rc10.png',
  ]) assert.equal(manifestPaths.has(requiredPath), true, `missing proof manifest path: ${requiredPath}`);
});

test('Singapore source-review proof preserves exact source roles, claim boundary, and release result', () => {
  const page = fs.readFileSync(
    path.join(root, 'proof', 'singapore-source-review', 'index.html'),
    'utf8',
  );
  const manifestPath = path.join(
    root,
    'assets',
    'proof',
    'singapore-source-review',
    'manifest.json',
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const frozenScreen = fs.readFileSync(
    path.join(root, 'assets', 'proof', 'singapore-source-review', 'frozen-demo.png'),
  );
  const humanDecisionDetail = fs.readFileSync(
    path.join(root, 'assets', 'proof', 'singapore-source-review', 'human-decision-exact-artifact.png'),
  );

  assert.equal(manifest.schema_version, 'auxtho-public-singapore-source-review-proof-v2');
  assert.equal(manifest.status, 'MAS_DEMO_FREEZE_GO');
  assert.equal(manifest.product_source.repository_visibility, 'private');
  assert.equal(manifest.source_set.sources.length, 3);
  assert.equal(manifest.source_set.sources[0].release_support, 'primary or supporting');
  assert.equal(manifest.source_set.sources[1].release_support, 'supporting only');
  assert.equal(manifest.source_set.sources[2].release_support, 'not eligible');
  assert.equal(manifest.synthetic_case.materiality_classifier, false);
  assert.equal(manifest.synthetic_case.claim_statuses.C1, 'supported');
  assert.equal(manifest.synthetic_case.claim_statuses.C2, 'evidence mismatch');
  assert.equal(manifest.synthetic_case.claim_statuses.C3, 'proposed-only support');
  assert.equal(manifest.release_result.mutation_blocked, true);
  assert.equal(manifest.release_result.unknown_retry_directive, 'NO_AUTOMATIC_RETRY');
  assert.equal(manifest.release_result.provider_calls, 0);
  assert.equal(manifest.release_result.customer_data_used, false);
  assert.equal(manifest.release_result.external_dispatch_executed, false);
  assert.equal(manifest.presentation_capture.status, 'CLEAN_CAPTURE_GO');
  assert.equal(manifest.buyer_detail_captures.status, 'BUYER_DETAIL_CAPTURE_GO');
  assert.equal(manifest.buyer_detail_captures.accepted.length, 1);
  assert.equal(
    manifest.buyer_detail_captures.accepted[0].path,
    '/assets/proof/singapore-source-review/human-decision-exact-artifact.png',
  );
  assert.equal(manifest.buyer_detail_captures.public_source_locator_record.claim_id, 'C1');
  assert.equal(manifest.buyer_detail_captures.public_source_locator_record.page_locator, 3);
  assert.equal(manifest.buyer_detail_captures.public_source_locator_record.source_page_reproduced, false);
  assert.equal(manifest.source_set.sources.every((source) => !Object.hasOwn(source, 'url')), true);
  assert.equal(manifest.capture_absence_assertions.nextjs_development_indicator, false);
  assert.equal(manifest.capture_absence_assertions.nextjs_portal, false);
  assert.equal(
    sha256(frozenScreen),
    'd4ce3a63f2e0f5e55be47c7854d2bf4d308abaeadd99448e89d50836fc75933e',
  );
  assert.equal(
    sha256(humanDecisionDetail),
    'c7c6458b6b307a47c3b35d6215d65ba7c603ceaf6bfd141ab84260a3788d1b61',
  );

  assert.match(page, /Claims defined for review/i);
  assert.match(page, /source-policy eligibility separate from PDF traceability/i);
  assert.match(page, /2026 TRM Consultation Paper/i);
  assert.match(page, /Not eligible/i);
  assert.match(page, /Changed artifact blocked/i);
  assert.match(page, /Clean capture/i);
  assert.match(page, /Follow the source identity into the human decision/i);
  assert.match(page, /Frozen source traceability record/i);
  assert.match(page, /without reproducing the source page/i);
  assert.match(page, /human-decision-exact-artifact\.png\?sha256=c7c6458b[0-9a-f]{56}/i);
  assert.doesNotMatch(page, /source-traceability\.png|https:\/\/www\.mas\.gov\.sg/i);
  assert.match(page, /No automatic retry/i);
  assert.doesNotMatch(page, /material claims|important statements|MAS approved|compliance certified/i);
});

test('public research and trust routes are stable, scoped, and buyer-readable', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const isp = fs.readFileSync(path.join(root, 'lineage', 'isp', 'index.html'), 'utf8');
  const ardamire = fs.readFileSync(path.join(root, 'security', 'ardamire', 'index.html'), 'utf8');
  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  const publicFiles = JSON.parse(fs.readFileSync(
    path.join(root, 'scripts', 'release', 'public-files.json'),
    'utf8',
  ));
  const retiredPaths = JSON.parse(fs.readFileSync(
    path.join(root, 'scripts', 'release', 'retired-public-paths.json'),
    'utf8',
  ));

  assert.match(index, /id="research"/);
  assert.match(index, /href="\/lineage\/isp\/"/);
  assert.match(index, /href="\/security\/ardamire\/"/);
  assert.doesNotMatch(index, /href="\/verify\.html"/);
  assert.match(index, /Auxtho checks selected claims in AI-assisted financial complaint responses/i);
  assert.match(index, /Source-based review helps determine what a person should approve/i);
  assert.match(index, /Release Core keeps that decision tied to the exact reviewed version/i);
  assert.match(index, /Example release record/i);
  assert.match(index, /See each selected claim, its source, and what needs judgment/i);
  assert.match(index, /See what needs attention/i);
  assert.match(index, /Track items awaiting review, blocked items, and follow-up/i);
  assert.doesNotMatch(index, /critical signals/i);
  assert.doesNotMatch(index, /material claims|important statements|Policy Packs?|source strength/i);
  assert.match(index, /Deeper technical work, outside the first buyer story/i);
  assert.match(index, /Intent Synchronization Protocol \(ISP\)/i);
  assert.match(index, /Ardamire Defense Layer/i);
  assert.match(index, /Auxtho Artifact Verification/i);
  assert.match(index, /Workflows to evaluate/i);
  assert.match(index, /Financial complaint response/i);
  assert.match(index, /Compliance or assurance report/i);
  assert.match(index, /One other high-consequence workflow after its review scope is defined/i);
  assert.doesNotMatch(index, /controlled synthetic rendering|captured \d{1,2} Jul 2026|Evidence record:/i);

  assert.match(isp, /<meta name="robots" content="index,follow">/);
  assert.match(isp, /Intent Synchronization Protocol \(ISP\)/i);
  assert.match(isp, /Historically, Auxtho Core described the broader execution-control architecture/i);
  assert.match(isp, /Capture intent &rarr; Bind authority &rarr; Return evidence/i);
  assert.match(isp, /Move from request to an accountable handoff/i);
  assert.match(isp, /Record whether the work is ready, passed, partial, or blocked/i);
  assert.match(isp, /Open public package/i);
  assert.match(isp, /Auxtho App presents the selected work and its supporting evidence for review/i);
  assert.match(isp, /Discuss one workflow/i);
  assert.doesNotMatch(isp, /AgentRunner/i);

  assert.match(ardamire, /<meta name="robots" content="index,follow">/);
  assert.match(ardamire, /Ardamire Defense Layer/i);
  assert.match(ardamire, /Human-gated defensive change control/i);
  assert.match(ardamire, /Detect/i);
  assert.match(ardamire, /Quarantine/i);
  assert.match(ardamire, /Analyze \+ Profile/i);
  assert.match(ardamire, /Harden proposal/i);
  assert.match(ardamire, /Human review/i);
  assert.match(ardamire, /Verify before rollout/i);
  assert.match(ardamire, /Map the review and verification stages against SOC, SIEM, EDR, IAM/i);
  assert.match(ardamire, /Keep review, approval, release, and export decisions with designated people/i);
  assert.match(ardamire, /Interactive control sequence \/ modelled signal scenario/i);
  assert.match(ardamire, /Discuss one workflow/i);
  assert.match(ardamire, /verification before rollout/i);
  assert.doesNotMatch(ardamire, /Ardamire Workbench|Ardamire Watch|Ardamire Agent|Operator Board|Replay Lab|Reviewer Handoff|Dated publisher observation/i);
  assert.doesNotMatch(ardamire, /guarantees? prevention|certified defense|autonomous approval/i);

  assert.match(sitemap, /https:\/\/auxtho\.com\/lineage\/isp\//);
  assert.match(sitemap, /https:\/\/auxtho\.com\/proof\/singapore-source-review\//);
  assert.match(sitemap, /https:\/\/auxtho\.com\/security\/ardamire\//);
  assert.doesNotMatch(sitemap, /verify\.html/);
  assert.equal(fs.existsSync(path.join(root, 'verify.html')), false);
  assert.equal(publicFiles.paths.includes('/verify.html'), false);
  assert.equal(publicFiles.paths.some((publicPath) => /\/assets\/verify(?:\.|$)/.test(publicPath)), false);
  assert.ok(retiredPaths.paths.includes('/verify.html'));
  assert.ok(retiredPaths.paths.includes('/assets/verify.css'));
  assert.ok(retiredPaths.paths.includes('/assets/verify.7f3052256aaf732742482d6e1a1ef1d70389e802a6543c0e9ffd6684e5247049.js'));

  for (const required of [
    '/assets/technical-foundations.css',
    '/assets/homepage-source-record.css',
    '/assets/proof-singapore-source-review.css',
    '/assets/proof/singapore-source-review/frozen-demo.png',
    '/assets/proof/singapore-source-review/human-decision-exact-artifact.png',
    '/assets/proof/singapore-source-review/manifest.json',
    '/lineage/isp/index.html',
    '/proof/singapore-source-review/index.html',
    '/security/ardamire/index.html',
  ]) assert.ok(publicFiles.paths.includes(required), required);
});

test('every reviewed internal link resolves to a public file and every internal fragment exists', () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, 'scripts', 'release', 'public-files.json'),
    'utf8',
  ));
  const publicPaths = new Set(manifest.paths);
  const htmlDocuments = new Map();

  for (const publicPath of manifest.paths.filter((value) => value.endsWith('.html'))) {
    const relative = publicPath.slice(1);
    const document = parse5.parse(fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8'));
    htmlDocuments.set(publicPath, htmlLinksAndIds(document));
  }

  for (const [sourcePath, sourceDocument] of htmlDocuments.entries()) {
    for (const href of sourceDocument.hrefs) {
      if (/^(?:mailto|tel):/i.test(href)) continue;
      assert.doesNotMatch(href, /^javascript:/i, `${sourcePath} -> ${href}`);
      const target = new URL(href, `https://auxtho.com${sourcePath}`);
      if (target.origin !== 'https://auxtho.com') continue;
      let targetPath = decodeURIComponent(target.pathname);
      if (targetPath === '/') targetPath = '/index.html';
      else if (targetPath.endsWith('/')) targetPath = `${targetPath}index.html`;
      assert.ok(publicPaths.has(targetPath), `${sourcePath} -> ${href} -> ${targetPath}`);
      if (target.hash && htmlDocuments.has(targetPath)) {
        const fragment = decodeURIComponent(target.hash.slice(1));
        assert.ok(htmlDocuments.get(targetPath).ids.has(fragment), `${sourcePath} -> ${href}`);
      }
    }
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
    '/package.json',
    '/src/build-core-overview.js',
  ]) assert.ok(manifest.paths.includes(required), required);
  assert.equal(manifest.paths.includes('/lineage/isp/'), false);
  assert.equal(manifest.paths.includes('/lineage/isp/index.html'), false);
  assert.equal(new Set(manifest.paths).size, manifest.paths.length);
});
