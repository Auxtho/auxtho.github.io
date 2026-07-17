const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const parse5 = require('parse5');

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const SCRIPT_PATH_PATTERN = /^\/assets\/[A-Za-z0-9._/-]+\.([0-9a-f]{64})\.js$/;
const STYLESHEET_URL_PATTERN = /^(\/assets\/[A-Za-z0-9._/-]+\.css)\?sha256=([0-9a-f]{64})$/;
const IMAGE_URL_PATTERN = /^(\/assets\/[A-Za-z0-9._/-]+\.(?:png|svg))\?sha256=([0-9a-f]{64})$/;
const ALLOWED_ASSET_EXTENSIONS = new Set(['.css', '.js', '.json', '.png', '.svg']);
const CANONICAL_PUBLIC_TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.xml']);
const PUBLIC_FILE_MANIFEST_RELATIVE = 'scripts/release/public-files.json';
const PRIVACY_MANIFEST_PATH = '/assets/proposal/evidence-manifest-20260716.json';
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const BYTE_ORDER_MARKS = [
  Buffer.from([0xef, 0xbb, 0xbf]),
  Buffer.from([0xff, 0xfe, 0x00, 0x00]),
  Buffer.from([0x00, 0x00, 0xfe, 0xff]),
  Buffer.from([0xff, 0xfe]),
  Buffer.from([0xfe, 0xff]),
];

function fail(message) {
  throw new Error(`HOLD: ${message}`);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function assertSha(name, value) {
  if (typeof value !== 'string' || !SHA_PATTERN.test(value)) fail(`${name} must be an exact lowercase 40-character SHA`);
  return value;
}

function parseShaList(name, document, requiredSha) {
  let parsed;
  try {
    parsed = JSON.parse(document);
  } catch {
    fail(`${name} must be valid JSON`);
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 2) fail(`${name} must contain one or two SHAs`);
  parsed.forEach((sha) => assertSha(`${name} entry`, sha));
  if (new Set(parsed).size !== parsed.length || !parsed.includes(requiredSha)) {
    fail(`${name} must be unique and include its site SHA`);
  }
  if (JSON.stringify(parsed) !== JSON.stringify([...parsed].sort())) fail(`${name} must use canonical SHA sort order`);
  return parsed;
}

function relativeFiles(root) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      const relative = path.relative(root, fullPath).split(path.sep).join('/');
      if (entry.isSymbolicLink()) fail(`symbolic links are forbidden: ${relative}`);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) files.push(relative);
      else fail(`unsupported filesystem entry: ${relative}`);
    }
  }
  visit(root);
  return files.sort();
}

function publicPathFromRelative(relative) {
  return `/${relative.split('/').map((segment) => encodeURIComponent(segment)).join('/')}`;
}

function normalizeManifestPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) fail(`unsafe public path: ${String(value)}`);
  let url;
  try {
    url = new URL(value, 'https://auxtho.invalid');
  } catch {
    fail(`invalid public URL path: ${value}`);
  }
  if (url.origin !== 'https://auxtho.invalid' || url.search || url.hash) fail(`public path must not contain an origin, query, or fragment: ${value}`);
  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    fail(`public path has invalid percent encoding: ${value}`);
  }
  if (decoded.includes('\\') || decoded.split('/').some((segment) => segment === '.' || segment === '..')) {
    fail(`public path traversal is forbidden: ${value}`);
  }
  return url.pathname;
}

function isReviewedPublicSourcePath(relative) {
  const isRootHtml = !relative.includes('/') && relative.endsWith('.html');
  const isRootStatic = ['CNAME', 'robots.txt', 'sitemap.xml'].includes(relative);
  const isSecurityTombstone = relative === 'security/ardamire/index.html';
  return isRootHtml || isRootStatic || isSecurityTombstone || relative.startsWith('assets/');
}

function readPublicSourcePaths(sourceRoot) {
  const manifestPath = path.join(sourceRoot, ...PUBLIC_FILE_MANIFEST_RELATIVE.split('/'));
  if (!fs.existsSync(manifestPath)) fail(`public file manifest is absent: ${PUBLIC_FILE_MANIFEST_RELATIVE}`);
  const manifestBytes = fs.readFileSync(manifestPath);
  const document = decodeCanonicalTextBytes(manifestBytes, PUBLIC_FILE_MANIFEST_RELATIVE);
  let manifest;
  try {
    manifest = JSON.parse(document);
  } catch {
    fail('public file manifest must be valid JSON');
  }
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.paths) || manifest.paths.length < 1) {
    fail('public file manifest schema is invalid');
  }
  const canonicalDocument = `${JSON.stringify({ schema_version: 1, paths: manifest.paths }, null, 2)}\n`;
  if (document !== canonicalDocument) {
    fail('public file manifest must use exact canonical JSON without duplicate or unknown keys');
  }
  if (JSON.stringify(manifest.paths) !== JSON.stringify([...manifest.paths].sort())) {
    fail('public file manifest paths must use canonical sort order');
  }
  const paths = manifest.paths.map((value) => {
    const publicPath = normalizeManifestPath(value);
    const relative = decodeURIComponent(publicPath.slice(1));
    if (value !== publicPathFromRelative(relative)) fail(`public file manifest path is not canonical: ${value}`);
    if (!isReviewedPublicSourcePath(relative)) fail(`public file path is outside reviewed namespaces: ${value}`);
    if (relative.startsWith('assets/') && !ALLOWED_ASSET_EXTENSIONS.has(path.posix.extname(relative))) {
      fail(`unreviewed public asset type in manifest: ${value}`);
    }
    if (relative === 'assets/release-manifest.json') fail('generated release manifest must not be source-approved');
    return relative;
  });
  if (new Set(paths).size !== paths.length) fail('public file manifest contains duplicate paths');
  return new Set(paths);
}

function pathsWithIndexAliases(relativePaths) {
  const paths = new Set();
  for (const relative of relativePaths) {
    const publicPath = publicPathFromRelative(relative);
    paths.add(publicPath);
    if (relative.endsWith('/index.html')) paths.add(publicPath.slice(0, -'index.html'.length));
  }
  return paths;
}

function sourceCandidatePaths(root) {
  const candidates = relativeFiles(root).filter((relative) => (
    !relative.split('/').some((segment) => segment.startsWith('.'))
    && !relative.startsWith('node_modules/')
    && !relative.startsWith('_site/')
    && !relative.startsWith('_rollback_site/')
    && !relative.startsWith('site-release-provenance/')
    && !relative.startsWith('rollback-release-provenance/')
  ));
  return pathsWithIndexAliases(candidates);
}

function copyFile(sourceRoot, outputRoot, relative) {
  const source = path.join(sourceRoot, ...relative.split('/'));
  const target = path.join(outputRoot, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
}

function decodeCanonicalTextBytes(bytes, relative) {
  if (BYTE_ORDER_MARKS.some((mark) => bytes.subarray(0, mark.length).equals(mark))) {
    fail(`public text file must not contain a byte-order mark: ${relative}`);
  }
  if (bytes.includes(0x00)) {
    fail(`public text file must not contain NUL bytes: ${relative}`);
  }
  let document;
  try {
    document = UTF8_DECODER.decode(bytes);
  } catch {
    fail(`public text file must be valid UTF-8: ${relative}`);
  }
  if (bytes.includes(0x0d)) fail(`public text file must use LF-only bytes: ${relative}`);
  return document;
}

function assertCanonicalPublicTextBytes(sourceRoot, relative) {
  const extension = path.posix.extname(relative);
  if (relative !== 'CNAME' && !CANONICAL_PUBLIC_TEXT_EXTENSIONS.has(extension)) return;
  decodeCanonicalTextBytes(fs.readFileSync(path.join(sourceRoot, ...relative.split('/'))), relative);
}

function stageExplicitPublicFiles(sourceRoot, outputRoot, options = {}) {
  if (fs.existsSync(outputRoot)) fail(`artifact output already exists: ${outputRoot}`);
  fs.mkdirSync(outputRoot, { recursive: false });
  const sourceFiles = relativeFiles(sourceRoot);
  const staged = [];
  const legacyBootstrapRollback = options.mode === 'rollback' && options.legacyBootstrap === true;
  const approvedPublicFiles = legacyBootstrapRollback ? null : readPublicSourcePaths(sourceRoot);

  for (const relative of sourceFiles) {
    if (legacyBootstrapRollback) {
      if (relative.split('/').some((segment) => segment.startsWith('.'))) continue;
      copyFile(sourceRoot, outputRoot, relative);
      staged.push(relative);
      continue;
    }
    const reviewedPublicSource = isReviewedPublicSourcePath(relative);
    const isAsset = relative.startsWith('assets/');
    if (!reviewedPublicSource) continue;
    if (relative === 'assets/ld-org.json') fail('assets/ld-org.json remains retired while legal identity is unresolved');
    if (relative === 'assets/release-manifest.json') fail('source must not pre-populate generated release manifest');
    if (isAsset && !ALLOWED_ASSET_EXTENSIONS.has(path.posix.extname(relative))) {
      fail(`unreviewed public asset type: ${relative}`);
    }
    if (!approvedPublicFiles.has(relative)) fail(`unreviewed public source path: ${relative}`);
    assertCanonicalPublicTextBytes(sourceRoot, relative);
    copyFile(sourceRoot, outputRoot, relative);
    staged.push(relative);
  }

  for (const approved of approvedPublicFiles || []) {
    if (!staged.includes(approved)) fail(`approved public source file is absent: ${approved}`);
  }

  for (const required of ['index.html', 'verify.html', 'privacy.html', 'terms.html', '404.html', 'CNAME', 'robots.txt', 'sitemap.xml']) {
    if (!staged.includes(required)) fail(`required public path is absent: ${required}`);
  }
  if (staged.length < 1 || staged.length > 1024) fail('staged public file count is outside the reviewed range');
  return staged.sort();
}

function findScriptSources(document) {
  const parsed = parse5.parse(document);
  const sources = [];
  function visit(node) {
    if (node.nodeName === 'script') {
      const source = (node.attrs || []).find((attribute) => attribute.name === 'src');
      if (source) sources.push(source.value);
    }
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parsed);
  return sources;
}

function findStylesheetSources(document) {
  const parsed = parse5.parse(document);
  const sources = [];
  function visit(node) {
    if (node.nodeName === 'link') {
      const attributes = Object.fromEntries((node.attrs || []).map((attribute) => [attribute.name, attribute.value]));
      if (String(attributes.rel || '').split(/\s+/).includes('stylesheet') && attributes.href) {
        sources.push(attributes.href);
      }
    }
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parsed);
  return sources;
}

function findImageSources(document) {
  const parsed = parse5.parse(document);
  const sources = [];
  function visit(node) {
    const attributes = Object.fromEntries((node.attrs || []).map((attribute) => [attribute.name, attribute.value]));
    if (node.nodeName === 'img' && attributes.src) sources.push(attributes.src);
    if (node.nodeName === 'a' && attributes.href && /^\/assets\/.+\.(?:png|svg)(?:\?|$)/i.test(attributes.href)) {
      sources.push(attributes.href);
    }
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parsed);
  return sources;
}

function validateScriptReferences(outputRoot, mode = 'candidate', legacyBootstrap = false) {
  const references = [];
  const htmlFiles = relativeFiles(outputRoot).filter((relative) => relative.endsWith('.html'));
  for (const htmlPath of htmlFiles) {
    const document = fs.readFileSync(path.join(outputRoot, ...htmlPath.split('/')), 'utf8');
    for (const source of findScriptSources(document)) {
      const url = new URL(source, 'https://auxtho.invalid');
      if (legacyBootstrap && !url.pathname.endsWith('.js')) continue;
      if (url.origin !== 'https://auxtho.invalid' || !source.startsWith('/') || url.hash) {
        fail(`script reference must be an absolute local URL without a fragment: ${htmlPath} -> ${source}`);
      }
      const match = url.pathname.match(SCRIPT_PATH_PATTERN);
      if (mode === 'candidate' && (url.search || !match)) {
        fail(`candidate script URL must be query-free and contain its full SHA-256: ${htmlPath} -> ${source}`);
      }
      if (!/^\/assets\/[A-Za-z0-9._/-]+\.js$/.test(url.pathname)) {
        fail(`script URL path is outside the reviewed assets namespace: ${htmlPath} -> ${source}`);
      }
      const relative = decodeURIComponent(url.pathname.slice(1));
      const scriptPath = path.join(outputRoot, ...relative.split('/'));
      if (!fs.existsSync(scriptPath)) fail(`referenced script is absent: ${source}`);
      const actualHash = sha256(fs.readFileSync(scriptPath));
      const contentAddressed = Boolean(match && !url.search && actualHash === match[1]);
      if (mode === 'candidate' && !contentAddressed) fail(`script filename hash does not match exact bytes: ${source}`);
      references.push({
        html_path: publicPathFromRelative(htmlPath),
        url: source,
        path: url.pathname,
        sha256: actualHash,
        content_addressed: contentAddressed,
      });
    }
  }
  const publishedScripts = relativeFiles(outputRoot).filter((relative) => relative.endsWith('.js'));
  const referenced = new Set(references.map((entry) => decodeURIComponent(entry.path.slice(1))));
  for (const relative of publishedScripts) {
    if (!legacyBootstrap && !referenced.has(relative)) fail(`published JavaScript is not referenced by HTML: ${relative}`);
  }
  return references.sort((left, right) => (
    `${left.html_path}\0${left.url}`.localeCompare(`${right.html_path}\0${right.url}`)
  ));
}

function validateStylesheetReferences(outputRoot, mode = 'candidate') {
  const references = [];
  const htmlFiles = relativeFiles(outputRoot).filter((relative) => relative.endsWith('.html'));
  for (const htmlPath of htmlFiles) {
    const document = fs.readFileSync(path.join(outputRoot, ...htmlPath.split('/')), 'utf8');
    for (const source of findStylesheetSources(document)) {
      const url = new URL(source, 'https://auxtho.invalid');
      if (url.origin !== 'https://auxtho.invalid' || !source.startsWith('/') || url.hash) {
        fail(`stylesheet reference must be an absolute local URL without a fragment: ${htmlPath} -> ${source}`);
      }
      if (!/^\/assets\/[A-Za-z0-9._/-]+\.css$/.test(url.pathname)) {
        fail(`stylesheet URL path is outside the reviewed assets namespace: ${htmlPath} -> ${source}`);
      }
      const relative = decodeURIComponent(url.pathname.slice(1));
      const stylesheetPath = path.join(outputRoot, ...relative.split('/'));
      if (!fs.existsSync(stylesheetPath)) fail(`referenced stylesheet is absent: ${source}`);
      const actualHash = sha256(fs.readFileSync(stylesheetPath));
      const match = source.match(STYLESHEET_URL_PATTERN);
      const contentAddressed = Boolean(match && actualHash === match[2]);
      if (mode === 'candidate' && !contentAddressed) {
        fail(`candidate stylesheet URL must contain the exact SHA-256 bytes: ${htmlPath} -> ${source}`);
      }
      references.push({
        html_path: publicPathFromRelative(htmlPath),
        url: source,
        path: url.pathname,
        sha256: actualHash,
        content_addressed: contentAddressed,
      });
    }
  }
  return references.sort((left, right) => (
    `${left.html_path}\0${left.url}`.localeCompare(`${right.html_path}\0${right.url}`)
  ));
}

function validateImageReferences(outputRoot, mode = 'candidate') {
  const references = [];
  const htmlFiles = relativeFiles(outputRoot).filter((relative) => relative.endsWith('.html'));
  for (const htmlPath of htmlFiles) {
    const document = fs.readFileSync(path.join(outputRoot, ...htmlPath.split('/')), 'utf8');
    for (const source of findImageSources(document)) {
      const url = new URL(source, 'https://auxtho.invalid');
      if (url.origin !== 'https://auxtho.invalid' || !source.startsWith('/') || url.hash) {
        fail(`image reference must be an absolute local URL without a fragment: ${htmlPath} -> ${source}`);
      }
      const relative = decodeURIComponent(url.pathname.slice(1));
      const imagePath = path.join(outputRoot, ...relative.split('/'));
      if (!fs.existsSync(imagePath)) fail(`referenced image is absent: ${source}`);
      const actualHash = sha256(fs.readFileSync(imagePath));
      const match = source.match(IMAGE_URL_PATTERN);
      const contentAddressed = Boolean(match && actualHash === match[2]);
      if (mode === 'candidate' && !contentAddressed) {
        fail(`candidate image URL must contain the exact SHA-256 bytes: ${htmlPath} -> ${source}`);
      }
      references.push({
        html_path: publicPathFromRelative(htmlPath),
        url: source,
        path: url.pathname,
        sha256: actualHash,
        content_addressed: contentAddressed,
      });
    }
  }
  return references.sort((left, right) => (
    `${left.html_path}\0${left.url}`.localeCompare(`${right.html_path}\0${right.url}`)
  ));
}

function validatePrivacyAndClaims(outputRoot, mode, legacyBootstrap = false) {
  const manifestPath = path.join(outputRoot, ...PRIVACY_MANIFEST_PATH.slice(1).split('/'));
  if (!fs.existsSync(manifestPath)) {
    if (mode === 'rollback' && legacyBootstrap) {
      return { path: null, sha256: null, legacy_absent: true };
    }
    fail('public evidence manifest is absent');
  }
  if (legacyBootstrap) fail('legacy bootstrap rollback unexpectedly contains the candidate evidence manifest');
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (
    manifest.attestation_class !== 'publisher_self_attestation'
    || manifest.evidence_policy?.live_telemetry_claimed !== false
    || manifest.evidence_policy?.operating_effectiveness_claimed !== false
    || manifest.evidence_policy?.production_readiness_claimed !== false
  ) {
    fail('public evidence manifest weakened its privacy or evidence boundaries');
  }
  const index = fs.readFileSync(path.join(outputRoot, 'index.html'), 'utf8');
  if (!/public evidence manifest/i.test(index) || !/no customer data/i.test(index) || !/synthetic/i.test(index)) {
    fail('homepage must preserve public manifest, no-customer-data, and synthetic claims');
  }
  if (mode === 'candidate') {
    const terms = fs.readFileSync(path.join(outputRoot, 'terms.html'), 'utf8');
    if (!/Public Site Notice/.test(terms) || /agree to be bound|binding terms|Terms of Service/i.test(terms)) {
      fail('terms.html must remain a non-contractual Public Site Notice');
    }
  }
  return { path: PRIVACY_MANIFEST_PATH, sha256: sha256(manifestBytes) };
}

function readRetiredPaths(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.paths)) fail('retired path manifest schema is invalid');
  const paths = manifest.paths.map(normalizeManifestPath);
  if (new Set(paths).size !== paths.length) fail('retired path manifest contains duplicate paths');
  return paths;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function writeProvenance(outputRoot, provenanceRoot, releaseManifest, metadata) {
  if (fs.existsSync(provenanceRoot)) fail(`provenance output already exists: ${provenanceRoot}`);
  fs.mkdirSync(provenanceRoot, { recursive: false });
  const publicFiles = relativeFiles(outputRoot);
  const digestLines = publicFiles.map((relative) => (
    `${sha256(fs.readFileSync(path.join(outputRoot, ...relative.split('/'))))}  ./${relative}`
  ));
  fs.writeFileSync(path.join(provenanceRoot, 'public-files-sha256.txt'), `${digestLines.join('\n')}\n`, { flag: 'wx' });
  fs.copyFileSync(
    path.join(outputRoot, 'robots.txt'),
    path.join(provenanceRoot, 'robots.txt'),
    fs.constants.COPYFILE_EXCL,
  );
  writeJson(path.join(provenanceRoot, 'release-manifest.json'), releaseManifest);
  fs.writeFileSync(
    path.join(provenanceRoot, 'must-be-absent-public-paths.txt'),
    `${releaseManifest.must_be_absent_public_paths.join('\n')}\n`,
    { flag: 'wx' },
  );
  const provenance = {
    schema_version: 2,
    publication_mode: metadata.mode,
    source_sha: metadata.sourceSha,
    previous_approved_source_sha: metadata.previousSha,
    rollback_of_source_sha: metadata.rollbackOfSha || null,
    repository: metadata.repository,
    workflow_run_id: metadata.runId,
    workflow_run_attempt: Number(metadata.runAttempt),
    artifact_name: metadata.artifactName,
    digest_algorithm: 'sha256',
    digest_manifest: 'public-files-sha256.txt',
    release_manifest_sha256: sha256(fs.readFileSync(path.join(outputRoot, 'assets', 'release-manifest.json'))),
    public_file_count: publicFiles.length,
    removed_public_path_count: releaseManifest.removed_public_paths.length,
    must_be_absent_public_path_count: releaseManifest.must_be_absent_public_paths.length,
  };
  writeJson(path.join(provenanceRoot, 'provenance.json'), provenance);
  return provenance;
}

function buildArtifact(options) {
  const sourceRoot = path.resolve(options.sourceRoot);
  const previousSourceRoot = path.resolve(options.previousSourceRoot);
  const outputRoot = path.resolve(options.outputRoot);
  const provenanceRoot = path.resolve(options.provenanceRoot);
  const sourceSha = assertSha('source SHA', options.sourceSha);
  const previousSha = assertSha('previous approved source SHA', options.previousSha);
  if (!['candidate', 'rollback'].includes(options.mode)) fail('publication mode must be candidate or rollback');
  const rollbackOfSha = options.mode === 'rollback' ? assertSha('rollback-of source SHA', options.rollbackOfSha) : null;
  const compatible = parseShaList('compatible backend site SHAs', options.compatibleJson, sourceSha);
  if (options.mode === 'candidate' && JSON.stringify(compatible) !== JSON.stringify([previousSha, sourceSha].sort())) {
    fail('candidate compatibility must be the canonical sorted legacy/candidate SHA pair');
  }
  const legacyBootstrap = options.legacyBootstrap === true;
  if (legacyBootstrap && options.mode !== 'rollback') fail('legacy bootstrap packaging is allowed only for rollback');
  const staged = stageExplicitPublicFiles(sourceRoot, outputRoot, { mode: options.mode, legacyBootstrap });
  const scriptReferences = validateScriptReferences(outputRoot, options.mode, legacyBootstrap);
  const stylesheetReferences = legacyBootstrap ? [] : validateStylesheetReferences(outputRoot, options.mode);
  const imageReferences = legacyBootstrap ? [] : validateImageReferences(outputRoot, options.mode);
  const privacyManifest = validatePrivacyAndClaims(outputRoot, options.mode, legacyBootstrap);

  const generatedPaths = new Set(['/release.json', '/assets/release-manifest.json']);
  const publishedRoutes = pathsWithIndexAliases(staged);
  for (const generated of generatedPaths) publishedRoutes.add(generated);
  const previousCandidates = sourceCandidatePaths(previousSourceRoot);
  const currentCandidates = sourceCandidatePaths(sourceRoot);
  const explicitRetired = readRetiredPaths(options.retiredManifestPath);
  const removed = new Set(explicitRetired);
  for (const candidate of previousCandidates) if (!publishedRoutes.has(candidate)) removed.add(candidate);
  const nonPublicSource = new Set();
  for (const candidate of currentCandidates) if (!publishedRoutes.has(candidate)) nonPublicSource.add(candidate);
  const mustBeAbsent = new Set([...removed, ...nonPublicSource]);
  for (const published of publishedRoutes) {
    removed.delete(published);
    nonPublicSource.delete(published);
    mustBeAbsent.delete(published);
  }

  const releaseManifest = {
    schema_version: 2,
    publication_mode: options.mode,
    source_sha: sourceSha,
    previous_approved_source_sha: previousSha,
    rollback_of_source_sha: rollbackOfSha,
    script_references: scriptReferences,
    stylesheet_references: stylesheetReferences,
    image_references: imageReferences,
    privacy_manifest: privacyManifest,
    evidence_boundaries: {
      synthetic_only: !legacyBootstrap,
      customer_data_claimed: false,
      live_telemetry_claimed: false,
      production_readiness_claimed: false,
      reviewed_candidate_claims_present: !legacyBootstrap,
    },
    backend_site_sha_transition: {
      bridge_reported_site_sha: options.mode === 'candidate' ? previousSha : sourceSha,
      final_reported_site_sha: sourceSha,
      rollback_reported_site_sha: options.mode === 'candidate' ? previousSha : sourceSha,
    },
    removed_public_paths: [...removed].sort(),
    non_public_source_paths: [...nonPublicSource].sort(),
    must_be_absent_public_paths: [...mustBeAbsent].sort(),
  };
  const releaseManifestPath = path.join(outputRoot, 'assets', 'release-manifest.json');
  writeJson(releaseManifestPath, releaseManifest);
  const releaseManifestHash = sha256(fs.readFileSync(releaseManifestPath));
  const release = {
    schema_version: 2,
    publication_mode: options.mode,
    source_sha: sourceSha,
    previous_approved_source_sha: previousSha,
    compatible_backend_site_shas: compatible,
    backend_site_sha_transition: releaseManifest.backend_site_sha_transition,
    rollback_of_source_sha: rollbackOfSha,
    release_manifest: { path: '/assets/release-manifest.json', sha256: releaseManifestHash },
    privacy_manifest: privacyManifest,
  };
  writeJson(path.join(outputRoot, 'release.json'), release);
  const provenance = writeProvenance(outputRoot, provenanceRoot, releaseManifest, {
    mode: options.mode,
    sourceSha,
    previousSha,
    rollbackOfSha,
    repository: options.repository,
    runId: options.runId,
    runAttempt: options.runAttempt,
    artifactName: options.artifactName,
  });
  return { release, releaseManifest, provenance };
}

function parseArguments(argv) {
  if (argv[0] !== 'build') fail('first argument must be build');
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith('--') || argv[index + 1] === undefined) fail(`invalid argument: ${String(key)}`);
    options[key.slice(2)] = argv[index + 1];
  }
  const required = [
    'source', 'previous-source', 'output', 'provenance', 'source-sha', 'previous-sha',
    'compatible-json', 'mode', 'retired-manifest', 'artifact-name',
  ];
  for (const key of required) if (!options[key]) fail(`missing --${key}`);
  return {
    sourceRoot: options.source,
    previousSourceRoot: options['previous-source'],
    outputRoot: options.output,
    provenanceRoot: options.provenance,
    sourceSha: options['source-sha'],
    previousSha: options['previous-sha'],
    compatibleJson: options['compatible-json'],
    mode: options.mode,
    rollbackOfSha: options['rollback-of-sha'],
    legacyBootstrap: options['legacy-bootstrap'] === 'true',
    retiredManifestPath: options['retired-manifest'],
    artifactName: options['artifact-name'],
    repository: process.env.GITHUB_REPOSITORY || 'local/auxtho-site',
    runId: process.env.GITHUB_RUN_ID || 'local',
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || '1',
  };
}

if (require.main === module) {
  try {
    const result = buildArtifact(parseArguments(process.argv.slice(2)));
    process.stdout.write(
      `public-artifact mode=${result.release.publication_mode} source=${result.release.source_sha} files=${result.provenance.public_file_count}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildArtifact,
  findScriptSources,
  findStylesheetSources,
  findImageSources,
  normalizeManifestPath,
  sha256,
  sourceCandidatePaths,
  validateScriptReferences,
  validateStylesheetReferences,
  validateImageReferences,
};
