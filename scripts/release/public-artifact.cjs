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
const MEDIA_URL_PATTERN = /^(\/assets\/[A-Za-z0-9._/-]+\.mp4)\?sha256=([0-9a-f]{64})$/;
const ALLOWED_ASSET_EXTENSIONS = new Set(['.css', '.js', '.json', '.mp4', '.pdf', '.png', '.svg']);
const CANONICAL_PUBLIC_TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.xml']);
const PUBLIC_FILE_MANIFEST_RELATIVE = 'scripts/release/public-files.json';
const PRIVACY_MANIFEST_PATH = '/assets/proposal/evidence-manifest-20260716.json';
const REVIEWED_PRIVACY_MANIFEST_SHA256 = '9a182c662c8586f55d8ae597c168effb0ac67af6e6120ab0b045cc1c4c76250f';
const APPROVED_LEGACY_BOOTSTRAP = Object.freeze({
  source_sha: '4b2f476c741b771519745930a6ebf244cf5d6433',
  public_file_count: 52,
  public_tree_sha256: 'd90365ebda61477e60ea66a3fe17b165c9c43033ede8cf4e6a8570eaf4fc2105',
});
const APPROVED_HISTORICAL_ROLLBACK_EVIDENCE = Object.freeze({
  '784ec29c658ed08ebccfcb3a107d3c7556262d96': Object.freeze({
    manifest_sha256: 'dc5e5b15347e11b2e3da85df585c0d5b1ab414f37e63b3ce617cced98787e3ec',
    public_file_count: 28,
    public_tree_sha256: '1f87a2bfb982701bbbebb0e3d510590232a70bad552f44678cddf67362a37d9e',
    sidecar_sha256: Object.freeze({
      '/assets/proposal/app-overview-synthetic-replay-20260716.json': 'ebfaf20d13e1660cfc3435f24efce4fe9e0ffa70520700b98239abc0684df38f',
      '/assets/proposal/console-synthetic-workflow-replay-20260716.json': '97076584d54ed5a5b7e9557dd65acd960119ffbaabee44af4db4084652abb2ac',
    }),
  }),
});
const REVIEWED_PUBLIC_HTML_SHA256 = Object.freeze({
  '404.html': '1e31659de27c76ad8cb36372283cffe90bfd2401820dd3e7f4d73b717b3d5793',
  'evidence-notes.html': '9cfeeafa88312510e003bf74850fea577a1f957c0f5ff5f9c031f2b082171167',
  'index.html': 'f61c748858102fb9f561e2267c016ba1db2a69a77f7937b107fdab2ba450cf62',
  'lineage/isp/index.html': 'ba032516fe4f49cd4d69117cd526b5b60d4702338e879420810fed35d838104f',
  'privacy.html': '987da6cbe5011a47a87e69bec9288248e3ac8ab25af228445d391fdccd02d5b7',
  'proof/release-core/index.html': 'f781d7246fa4ee7c6a689cd9e881d16ed61173efeedc401d7140edd4730e3dcc',
  'proof/release-core/transcript/index.html': '40938725f8bc6434329a47f5987b23b758ca23fcdcf8705051b26ef903ec6f2d',
  'proof/singapore-source-review/index.html': '1dff322a56bcd105f0ec6dc9b30f65330056c22c643baf07e367f57f30c4736a',
  'security/ardamire/index.html': '3b1df81e4bb7452f4f1e2549e0eee300f007283450e652ad85ffef0d370a9a9e',
  'story.html': '6853310c4058a7d87f8a4373953d4d22da34bb87a4bdf91a477bd009f6da690b',
  'terms.html': '20efc6042ff1141854fbcedd25d910df3432d277b6c440e4ecc7e1eaf721e335',
  'verify.html': '679a62d6c2e2f9ff0fdb856bc3ae932ab7ef4066d67f324205a5fcbd13edb857',
});
const REVIEWED_PNG_CHUNKS = new Set(['IHDR', 'sRGB', 'gAMA', 'pHYs', 'IDAT', 'IEND']);
const EVIDENCE_MANIFEST_KEYS = [
  'schema_version',
  'version',
  'scope',
  'attestation_class',
  'attestation_limit',
  'evidence_policy',
  'assets',
  'illustrative_elements',
];
const EVIDENCE_POLICY_KEYS = [
  'surfaces_are_independent',
  'matching_display_sequence_is_deliberate_synthetic_fixture',
  'correlated_customer_run_claimed',
  'live_telemetry_claimed',
  'operating_effectiveness_claimed',
  'production_readiness_claimed',
];
const EVIDENCE_ASSET_COMMON_KEYS = [
  'path',
  'sidecar',
  'sidecar_sha256',
  'sha256',
  'sha256_basis',
  'media_type',
  'dimensions_px',
  'public_derivative',
];
const EVIDENCE_ASSET_TRAILING_KEYS = [
  'surface',
  'captured_on',
  'source_revision',
  'source_revision_publicly_resolvable',
  'source_revision_note',
  'provenance_class',
  'fixture_class',
  'synthetic_only',
  'correlated_run_claimed',
  'fixture_relationship',
];
const EVIDENCE_SIDECAR_COMMON_KEYS = [
  'schema_version',
  'decision',
  'output_path',
  'source_revision',
  'source_revision_publicly_resolvable',
  'source_revision_note',
  'sha256',
  'dimensions_physical_px',
  'public_derivative',
];
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

function publicTreeSha256(root, relativePaths) {
  const rows = [...relativePaths].sort().map((relative) => (
    `${sha256(fs.readFileSync(path.join(root, ...relative.split('/'))))}  ${relative}\n`
  ));
  return sha256(Buffer.from(rows.join(''), 'utf8'));
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

function validateApprovedLegacyBootstrapSource(sourceRoot, sourceSha) {
  if (sourceSha !== APPROVED_LEGACY_BOOTSTRAP.source_sha) {
    fail('legacy bootstrap packaging is allowed only for the exact approved bootstrap source SHA');
  }
  const publicPaths = relativeFiles(sourceRoot).filter(
    (relative) => !relative.split('/').some((segment) => segment.startsWith('.')),
  );
  if (
    publicPaths.length !== APPROVED_LEGACY_BOOTSTRAP.public_file_count
    || publicTreeSha256(sourceRoot, publicPaths) !== APPROVED_LEGACY_BOOTSTRAP.public_tree_sha256
  ) {
    fail('legacy bootstrap public tree differs from the exact approved artifact bytes');
  }
}

function publicPathFromRelative(relative) {
  return `/${relative.split('/').map((segment) => encodeURIComponent(segment)).join('/')}`;
}

function normalizeManifestPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) fail(`unsafe public path: ${String(value)}`);
  let rawDecoded;
  try {
    rawDecoded = decodeURIComponent(value);
  } catch {
    fail(`public path has invalid percent encoding: ${value}`);
  }
  const rawPath = rawDecoded.split(/[?#]/, 1)[0];
  if (rawPath.includes('\\') || rawPath.split('/').some((segment) => segment === '.' || segment === '..')) {
    fail(`public path traversal is forbidden: ${value}`);
  }
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

function resolveReviewedEvidencePath(outputRoot, value, label) {
  const publicPath = normalizeManifestPath(value);
  if (!publicPath.startsWith('/assets/proposal/')) {
    fail(`${label} must remain inside /assets/proposal/: ${publicPath}`);
  }
  const relative = decodeURIComponent(publicPath.slice(1));
  if (publicPath !== publicPathFromRelative(relative)) {
    fail(`${label} is not a canonical public path: ${value}`);
  }
  const resolved = path.resolve(outputRoot, ...relative.split('/'));
  const relativeToRoot = path.relative(path.resolve(outputRoot), resolved);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    fail(`${label} escapes the staged public artifact: ${publicPath}`);
  }
  return { publicPath, relative, resolved };
}

function jsonValuesEqual(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => jsonValuesEqual(value, right[index]));
  }
  if (
    left
    && right
    && typeof left === 'object'
    && typeof right === 'object'
  ) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return jsonValuesEqual(leftKeys, rightKeys)
      && leftKeys.every((key) => jsonValuesEqual(left[key], right[key]));
  }
  return false;
}

function assertExactObjectKeys(label, value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actualKeys = Object.keys(value);
  if (!jsonValuesEqual(actualKeys, expectedKeys)) {
    fail(`${label} must use the exact reviewed schema keys`);
  }
}

function assertStringFields(label, value, fields) {
  for (const field of fields) {
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      fail(`${label}.${field} must be a non-empty string`);
    }
  }
}

function assertStringArray(label, value) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    fail(`${label} must be a non-empty string array`);
  }
}

function assertNumericFixture(label, value, expectedKeys) {
  assertExactObjectKeys(label, value, expectedKeys);
  if (expectedKeys.some((key) => !Number.isInteger(value[key]) || value[key] < 0)) {
    fail(`${label} must contain non-negative integer values`);
  }
}

function parseCanonicalEvidenceJson(bytes, relative, label) {
  const document = decodeCanonicalTextBytes(bytes, relative);
  let value;
  try {
    value = JSON.parse(document);
  } catch {
    fail(`${label} must be valid JSON`);
  }
  if (document !== `${JSON.stringify(value, null, 2)}\n`) {
    fail(`${label} must use canonical JSON without duplicate keys`);
  }
  return value;
}

function parseHistoricalEvidenceJson(bytes, relative, label) {
  const document = decodeCanonicalTextBytes(bytes, relative);
  let value;
  try {
    value = JSON.parse(document);
  } catch {
    fail(`${label} must be valid JSON`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be a JSON object`);
  }
  return value;
}

function isApprovedHistoricalRollbackEvidence(sourceSha, manifestSha256) {
  return APPROVED_HISTORICAL_ROLLBACK_EVIDENCE[sourceSha]?.manifest_sha256 === manifestSha256;
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

function readPngDimensions(bytes, label) {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 33 || !bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
    fail(`${label} must be a valid reviewed PNG`);
  }
  let offset = pngSignature.length;
  let chunkIndex = 0;
  let dimensions = null;
  let sawIdat = false;
  let sawIend = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail(`${label} has a truncated PNG chunk`);
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (crcEnd > bytes.length) fail(`${label} has a truncated PNG chunk payload`);
    const type = bytes.subarray(typeStart, dataStart).toString('ascii');
    if (!/^[A-Za-z]{4}$/.test(type) || !REVIEWED_PNG_CHUNKS.has(type)) {
      fail(`${label} contains an unreviewed PNG chunk: ${type}`);
    }
    const expectedCrc = bytes.readUInt32BE(dataEnd);
    const actualCrc = pngCrc32(bytes.subarray(typeStart, dataEnd));
    if (actualCrc !== expectedCrc) fail(`${label} has an invalid PNG chunk CRC: ${type}`);
    if (chunkIndex === 0) {
      if (type !== 'IHDR' || length !== 13) fail(`${label} must begin with one valid IHDR chunk`);
      dimensions = [bytes.readUInt32BE(dataStart), bytes.readUInt32BE(dataStart + 4)];
    } else if (type === 'IHDR') {
      fail(`${label} contains more than one IHDR chunk`);
    }
    if (type === 'IDAT') sawIdat = true;
    if (type === 'IEND') {
      if (length !== 0 || sawIend) fail(`${label} has an invalid IEND chunk`);
      sawIend = true;
      offset = crcEnd;
      break;
    }
    offset = crcEnd;
    chunkIndex += 1;
  }
  if (!dimensions || !sawIdat || !sawIend || offset !== bytes.length) {
    fail(`${label} must contain image data and end exactly at IEND`);
  }
  return dimensions;
}

function isReviewedPublicSourcePath(relative) {
  const isReviewedHtml = Object.prototype.hasOwnProperty.call(REVIEWED_PUBLIC_HTML_SHA256, relative);
  const isRootStatic = ['CNAME', 'robots.txt', 'sitemap.xml'].includes(relative);
  return isReviewedHtml || isRootStatic || relative.startsWith('assets/');
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

function assertReviewedPublicBinaryBytes(sourceRoot, relative) {
  if (path.posix.extname(relative) !== '.pdf') return;
  const bytes = fs.readFileSync(path.join(sourceRoot, ...relative.split('/')));
  if (bytes.length < 8 || bytes.length > 10 * 1024 * 1024) {
    fail(`public PDF size is outside the reviewed range: ${relative}`);
  }
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) || !bytes.subarray(-1024).includes(Buffer.from('%%EOF'))) {
    fail(`public PDF does not have a valid PDF signature boundary: ${relative}`);
  }
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
    if (!reviewedPublicSource) {
      if (!relative.includes('/') && relative.endsWith('.html')) {
        fail(`unreviewed public source path: ${relative}`);
      }
      continue;
    }
    if (relative === 'assets/ld-org.json') fail('assets/ld-org.json remains retired while legal identity is unresolved');
    if (relative === 'assets/release-manifest.json') fail('source must not pre-populate generated release manifest');
    if (isAsset && !ALLOWED_ASSET_EXTENSIONS.has(path.posix.extname(relative))) {
      fail(`unreviewed public asset type: ${relative}`);
    }
    if (!approvedPublicFiles.has(relative)) fail(`unreviewed public source path: ${relative}`);
    assertCanonicalPublicTextBytes(sourceRoot, relative);
    assertReviewedPublicBinaryBytes(sourceRoot, relative);
    copyFile(sourceRoot, outputRoot, relative);
    staged.push(relative);
  }

  for (const approved of approvedPublicFiles || []) {
    if (!staged.includes(approved)) fail(`approved public source file is absent: ${approved}`);
  }

  for (const required of ['index.html', 'privacy.html', 'terms.html', '404.html', 'CNAME', 'robots.txt', 'sitemap.xml']) {
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
    if (node.nodeName === 'video' && attributes.poster) sources.push(attributes.poster);
    if (node.nodeName === 'source' && attributes.srcset && /\.(?:png|svg)(?:\?|$)/i.test(attributes.srcset)) {
      for (const candidate of attributes.srcset.split(',')) {
        const source = candidate.trim().split(/\s+/)[0];
        if (source) sources.push(source);
      }
    }
    if (node.nodeName === 'a' && attributes.href && /^\/assets\/.+\.(?:png|svg)(?:\?|$)/i.test(attributes.href)) {
      sources.push(attributes.href);
    }
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parsed);
  return sources;
}

function findMediaSources(document) {
  const parsed = parse5.parse(document);
  const sources = [];
  function visit(node) {
    const attributes = Object.fromEntries((node.attrs || []).map((attribute) => [attribute.name, attribute.value]));
    if (node.nodeName === 'video' && attributes.src && /\.mp4(?:\?|$)/i.test(attributes.src)) {
      sources.push(attributes.src);
    }
    if (node.nodeName === 'source' && attributes.src && /\.mp4(?:\?|$)/i.test(attributes.src)) {
      sources.push(attributes.src);
    }
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parsed);
  return sources;
}

function nodeAttributes(node) {
  return Object.fromEntries((node.attrs || []).map((attribute) => [attribute.name, attribute.value]));
}

function nodeClassList(node) {
  return String(nodeAttributes(node).class || '').split(/\s+/).filter(Boolean);
}

function nodeText(node) {
  if (node.nodeName === '#text') return node.value || '';
  return (node.childNodes || []).map(nodeText).join('');
}

function findDescendants(node, predicate) {
  const matches = [];
  function visit(current) {
    if (predicate(current)) matches.push(current);
    for (const child of current.childNodes || []) visit(child);
  }
  visit(node);
  return matches;
}

function assertReviewedPublicHtml(outputRoot, stagedPublicFiles) {
  const reviewedEntries = Object.entries(REVIEWED_PUBLIC_HTML_SHA256);
  const reviewedPaths = new Set(reviewedEntries.map(([relative]) => relative));
  const stagedHtmlPaths = [...stagedPublicFiles].filter((relative) => relative.endsWith('.html'));
  if (stagedHtmlPaths.some((relative) => !reviewedPaths.has(relative))) {
    fail('staged public HTML must be covered by the reviewed claim contract');
  }
  for (const [relative, expectedHash] of reviewedEntries) {
    if (!stagedPublicFiles.has(relative)) continue;
    const resolved = path.join(outputRoot, ...relative.split('/'));
    if (!fs.existsSync(resolved)) fail(`reviewed public HTML is absent: ${relative}`);
    if (sha256(fs.readFileSync(resolved)) !== expectedHash) {
      fail(`reviewed public HTML differs from its exact approved claim contract: ${relative}`);
    }
  }
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

function validateMediaReferences(outputRoot, mode = 'candidate') {
  const references = [];
  const htmlFiles = relativeFiles(outputRoot).filter((relative) => relative.endsWith('.html'));
  for (const htmlPath of htmlFiles) {
    const document = fs.readFileSync(path.join(outputRoot, ...htmlPath.split('/')), 'utf8');
    for (const source of findMediaSources(document)) {
      const url = new URL(source, 'https://auxtho.invalid');
      if (url.origin !== 'https://auxtho.invalid' || !source.startsWith('/') || url.hash) {
        fail(`media reference must be an absolute local URL without a fragment: ${htmlPath} -> ${source}`);
      }
      const relative = decodeURIComponent(url.pathname.slice(1));
      const mediaPath = path.join(outputRoot, ...relative.split('/'));
      if (!fs.existsSync(mediaPath)) fail(`referenced media is absent: ${source}`);
      const actualHash = sha256(fs.readFileSync(mediaPath));
      const match = source.match(MEDIA_URL_PATTERN);
      const contentAddressed = Boolean(match && actualHash === match[2]);
      if (mode === 'candidate' && !contentAddressed) {
        fail(`candidate media URL must contain the exact SHA-256 bytes: ${htmlPath} -> ${source}`);
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

function validateHistoricalRollbackEvidence(outputRoot, sourceSha, stagedPublicFiles) {
  const manifestPath = path.join(outputRoot, ...PRIVACY_MANIFEST_PATH.slice(1).split('/'));
  if (!fs.existsSync(manifestPath)) fail('approved historical rollback evidence manifest is absent');

  const manifestBytes = fs.readFileSync(manifestPath);
  const manifestSha256 = sha256(manifestBytes);
  if (!isApprovedHistoricalRollbackEvidence(sourceSha, manifestSha256)) {
    fail('historical rollback evidence is not bound to the exact approved source and manifest');
  }
  const approvedEvidence = APPROVED_HISTORICAL_ROLLBACK_EVIDENCE[sourceSha];
  if (
    stagedPublicFiles.size !== approvedEvidence.public_file_count
    || publicTreeSha256(outputRoot, stagedPublicFiles) !== approvedEvidence.public_tree_sha256
  ) {
    fail('historical rollback public tree differs from the exact approved artifact bytes');
  }

  const manifest = parseHistoricalEvidenceJson(
    manifestBytes,
    PRIVACY_MANIFEST_PATH.slice(1),
    'approved historical rollback evidence manifest',
  );
  if (
    manifest.attestation_class !== 'publisher_self_attestation'
    || manifest.evidence_policy?.surfaces_are_independent !== true
    || manifest.evidence_policy?.matching_display_sequence_is_deliberate_synthetic_fixture !== true
    || manifest.evidence_policy?.correlated_customer_run_claimed !== false
    || manifest.evidence_policy?.live_telemetry_claimed !== false
    || manifest.evidence_policy?.operating_effectiveness_claimed !== false
    || manifest.evidence_policy?.production_readiness_claimed !== false
    || !Array.isArray(manifest.assets)
    || manifest.assets.length !== 2
  ) {
    fail('approved historical rollback evidence weakened its recorded boundaries');
  }

  const surfaces = new Set();
  const imagePaths = new Set();
  const sidecarPaths = new Set();
  for (const asset of manifest.assets) {
    if (
      typeof asset.path !== 'string'
      || typeof asset.sidecar !== 'string'
      || !HASH_PATTERN.test(asset.sha256)
      || !HASH_PATTERN.test(asset.sidecar_sha256)
    ) {
      fail('approved historical rollback evidence contains invalid asset metadata');
    }
    if (
      !['Auxtho App', 'Auxtho Console'].includes(asset.surface)
      || surfaces.has(asset.surface)
      || imagePaths.has(asset.path)
      || sidecarPaths.has(asset.sidecar)
      || !/independent synthetic fixture/i.test(asset.fixture_relationship || '')
      || !/not correlated.*customer run/i.test(asset.fixture_relationship || '')
    ) {
      fail('approved historical rollback evidence has an invalid synthetic fixture binding');
    }
    surfaces.add(asset.surface);
    imagePaths.add(asset.path);
    sidecarPaths.add(asset.sidecar);
    const image = resolveReviewedEvidencePath(outputRoot, asset.path, 'historical rollback evidence image path');
    const sidecar = resolveReviewedEvidencePath(
      outputRoot,
      asset.sidecar,
      'historical rollback evidence sidecar path',
    );
    if (!stagedPublicFiles.has(image.relative) || !stagedPublicFiles.has(sidecar.relative)) {
      fail('approved historical rollback evidence is outside the public file manifest');
    }
    if (!fs.existsSync(image.resolved) || !fs.existsSync(sidecar.resolved)) {
      fail('approved historical rollback evidence asset is absent');
    }
    const actualSidecarSha256 = sha256(fs.readFileSync(sidecar.resolved));
    if (
      sha256(fs.readFileSync(image.resolved)) !== asset.sha256
      || approvedEvidence.sidecar_sha256[asset.sidecar] !== actualSidecarSha256
    ) {
      fail('approved historical rollback evidence asset hash mismatch');
    }
    const sidecarValue = parseHistoricalEvidenceJson(
      fs.readFileSync(sidecar.resolved),
      sidecar.relative,
      'approved historical rollback evidence sidecar',
    );
    if (
      sidecarValue.customer_data_used !== false
      || sidecarValue.output_path !== asset.path
      || sidecarValue.sha256 !== asset.sha256
      || !/independent synthetic fixture/i.test(sidecarValue.fixture_relationship || '')
      || !/not correlated.*customer run/i.test(sidecarValue.fixture_relationship || '')
    ) {
      fail('approved historical rollback evidence sidecar weakened its customer-data boundary');
    }
  }

  return {
    path: PRIVACY_MANIFEST_PATH,
    sha256: manifestSha256,
    historical_approved: true,
    reviewed_candidate_claims_present: false,
    evidence_boundaries: {
      synthetic_only: true,
      customer_data_claimed: false,
      surfaces_are_independent: true,
      correlated_customer_run_claimed: false,
      live_telemetry_claimed: false,
      operating_effectiveness_claimed: false,
      production_readiness_claimed: false,
    },
  };
}

function validatePrivacyAndClaims(
  outputRoot,
  mode,
  legacyBootstrap = false,
  stagedPublicFiles = new Set(),
  sourceSha = null,
) {
  const manifestPath = path.join(outputRoot, ...PRIVACY_MANIFEST_PATH.slice(1).split('/'));
  if (mode === 'rollback' && APPROVED_HISTORICAL_ROLLBACK_EVIDENCE[sourceSha]) {
    return validateHistoricalRollbackEvidence(outputRoot, sourceSha, stagedPublicFiles);
  }
  if (!fs.existsSync(manifestPath)) {
    if (mode === 'rollback' && legacyBootstrap) {
      return { path: null, sha256: null, legacy_absent: true };
    }
    fail('public evidence manifest is absent');
  }
  if (legacyBootstrap) fail('legacy bootstrap rollback unexpectedly contains the candidate evidence manifest');
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = parseCanonicalEvidenceJson(
    manifestBytes,
    PRIVACY_MANIFEST_PATH.slice(1),
    'public evidence manifest',
  );
  assertExactObjectKeys('public evidence manifest', manifest, EVIDENCE_MANIFEST_KEYS);
  assertExactObjectKeys('public evidence policy', manifest.evidence_policy, EVIDENCE_POLICY_KEYS);
  assertStringFields('public evidence manifest', manifest, [
    'version',
    'scope',
    'attestation_class',
    'attestation_limit',
  ]);
  if (
    manifest.schema_version !== 1
    || manifest.attestation_class !== 'publisher_self_attestation'
    || manifest.evidence_policy?.surfaces_are_independent !== true
    || manifest.evidence_policy?.matching_display_sequence_is_deliberate_synthetic_fixture !== true
    || manifest.evidence_policy?.correlated_customer_run_claimed !== false
    || manifest.evidence_policy?.live_telemetry_claimed !== false
    || manifest.evidence_policy?.operating_effectiveness_claimed !== false
    || manifest.evidence_policy?.production_readiness_claimed !== false
  ) {
    fail('public evidence manifest weakened its privacy or evidence boundaries');
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== 2) {
    fail('public evidence manifest must contain the exact two reviewed homepage assets');
  }
  if (!Array.isArray(manifest.illustrative_elements) || manifest.illustrative_elements.length !== 1) {
    fail('public evidence manifest must contain the exact reviewed illustrative element');
  }
  for (const element of manifest.illustrative_elements) {
    assertExactObjectKeys('public evidence illustrative element', element, [
      'name',
      'purpose',
      'evidence_status',
      'final_state',
    ]);
    assertStringFields('public evidence illustrative element', element, [
      'name',
      'purpose',
      'evidence_status',
      'final_state',
    ]);
  }
  const declaredEvidencePaths = new Set();
  const reviewedAssets = manifest.assets.map((asset) => {
    const isApp = asset.surface === 'Auxtho App';
    const isConsole = asset.surface === 'Auxtho Console';
    if (!isApp && !isConsole) fail(`public evidence asset has an unreviewed surface: ${String(asset.surface)}`);
    const assetKeys = [
      ...EVIDENCE_ASSET_COMMON_KEYS,
      ...(isApp ? ['public_derivative_note'] : []),
      ...EVIDENCE_ASSET_TRAILING_KEYS,
      ...(isApp ? ['capture_annotation'] : []),
      'fixture_values',
      'validation',
      'does_not_establish',
    ];
    assertExactObjectKeys(`public evidence ${asset.surface} asset`, asset, assetKeys);
    for (const field of ['path', 'sidecar', 'sidecar_sha256', 'sha256', 'fixture_relationship']) {
      if (typeof asset[field] !== 'string' || asset[field].length === 0) {
        fail(`public evidence asset is missing ${field}`);
      }
    }
    assertStringFields(`public evidence ${asset.surface} asset`, asset, [
      'sha256_basis',
      'media_type',
      'surface',
      'captured_on',
      'source_revision_note',
      'provenance_class',
      'fixture_class',
    ]);
    if (isApp) {
      assertStringFields('public evidence Auxtho App asset', asset, [
        'public_derivative_note',
        'capture_annotation',
      ]);
    }
    if (
      asset.sha256_basis !== 'raw file bytes'
      || asset.media_type !== 'image/png'
      || asset.source_revision !== null
      || asset.source_revision_publicly_resolvable !== false
      || asset.provenance_class !== 'publisher_self_attestation'
      || asset.public_derivative !== isApp
    ) {
      fail(`public evidence asset metadata is outside the reviewed schema: ${asset.path}`);
    }
    const fixtureKeys = isApp
      ? ['needs_review', 'blocked', 'ready_for_release', 'released', 'in_progress', 'released_today', 'total']
      : ['review_attention', 'critical_signals', 'synthetic_customer_records', 'active_synthetic_bootstraps'];
    assertNumericFixture(`public evidence ${asset.surface} fixture_values`, asset.fixture_values, fixtureKeys);
    assertStringArray(`public evidence ${asset.surface} validation`, asset.validation);
    assertStringArray(`public evidence ${asset.surface} does_not_establish`, asset.does_not_establish);
    if (!HASH_PATTERN.test(asset.sha256) || !HASH_PATTERN.test(asset.sidecar_sha256)) {
      fail(`public evidence asset hashes must be exact lowercase SHA-256 values: ${asset.path}`);
    }
    const image = resolveReviewedEvidencePath(outputRoot, asset.path, 'public evidence image path');
    const sidecarFile = resolveReviewedEvidencePath(outputRoot, asset.sidecar, 'public evidence sidecar path');
    if (path.posix.extname(image.publicPath) !== '.png' || path.posix.extname(sidecarFile.publicPath) !== '.json') {
      fail(`public evidence assets must bind a PNG image to a JSON sidecar: ${asset.path}`);
    }
    for (const declared of [image.publicPath, sidecarFile.publicPath]) {
      if (declaredEvidencePaths.has(declared)) fail(`public evidence path is declared more than once: ${declared}`);
      declaredEvidencePaths.add(declared);
    }
    if (!stagedPublicFiles.has(image.relative) || !stagedPublicFiles.has(sidecarFile.relative)) {
      fail(`public evidence image and sidecar must be listed in the public file manifest: ${asset.path}`);
    }
    if (!fs.existsSync(image.resolved) || !fs.existsSync(sidecarFile.resolved)) {
      fail(`public evidence asset or sidecar is absent: ${asset.path}`);
    }
    const imageBytes = fs.readFileSync(image.resolved);
    const sidecarBytes = fs.readFileSync(sidecarFile.resolved);
    if (sha256(imageBytes) !== asset.sha256) fail(`public evidence image hash mismatch: ${asset.path}`);
    if (sha256(sidecarBytes) !== asset.sidecar_sha256) {
      fail(`public evidence sidecar hash mismatch: ${asset.sidecar}`);
    }
    let sidecar;
    sidecar = parseCanonicalEvidenceJson(
      sidecarBytes,
      sidecarFile.relative,
      `public evidence ${asset.surface} sidecar`,
    );
    const expectedFixtureClass = 'independent_synthetic_fixture';
    const expectedFixtureRelationship = 'Independent synthetic fixture; no correlated cross-surface or customer run is claimed.';
    if (
      sidecar.customer_data_used !== false
      || sidecar.fixture_class !== expectedFixtureClass
      || sidecar.synthetic_only !== true
      || sidecar.correlated_run_claimed !== false
      || asset.fixture_class !== expectedFixtureClass
      || asset.synthetic_only !== true
      || asset.correlated_run_claimed !== false
      || sidecar.fixture_relationship !== expectedFixtureRelationship
      || asset.fixture_relationship !== expectedFixtureRelationship
    ) {
      fail(`public evidence sidecar weakened the independent synthetic boundary: ${asset.sidecar}`);
    }
    if (
      sidecar.output_path !== image.publicPath
      || sidecar.sha256 !== asset.sha256
      || !jsonValuesEqual(sidecar.fixture_summary, asset.fixture_values)
    ) {
      fail(`public evidence sidecar is not bound to its declared image and fixture summary: ${asset.sidecar}`);
    }
    const sidecarKeys = [
      ...EVIDENCE_SIDECAR_COMMON_KEYS,
      ...(isApp ? ['public_derivative_note', 'capture_time_utc'] : []),
      'fixture_summary',
      'customer_data_used',
      'fixture_class',
      'synthetic_only',
      'correlated_run_claimed',
      ...(isApp ? ['capture_annotation'] : []),
      'fixture_relationship',
      'claim_boundary',
    ];
    assertExactObjectKeys(`public evidence ${asset.surface} sidecar`, sidecar, sidecarKeys);
    assertStringFields(`public evidence ${asset.surface} sidecar`, sidecar, [
      'decision',
      'output_path',
      'source_revision_note',
      'sha256',
      'fixture_class',
      'fixture_relationship',
      'claim_boundary',
    ]);
    if (isApp) {
      assertStringFields('public evidence Auxtho App sidecar', sidecar, [
        'public_derivative_note',
        'capture_time_utc',
        'capture_annotation',
      ]);
    }
    const expectedDecision = isApp
      ? 'PUBLIC_SYNTHETIC_APP_CAPTURE_READY'
      : 'PUBLIC_SYNTHETIC_CONSOLE_CAPTURE_READY';
    if (
      sidecar.schema_version !== 1
      || sidecar.decision !== expectedDecision
      || sidecar.source_revision !== null
      || sidecar.source_revision_publicly_resolvable !== false
      || sidecar.public_derivative !== isApp
    ) {
      fail(`public evidence sidecar metadata is outside the reviewed schema: ${asset.sidecar}`);
    }
    assertNumericFixture(`public evidence ${asset.surface} fixture_summary`, sidecar.fixture_summary, fixtureKeys);
    if (
      !Array.isArray(asset.dimensions_px)
      || asset.dimensions_px.length !== 2
      || asset.dimensions_px.some((dimension) => !Number.isInteger(dimension) || dimension < 1)
      || !jsonValuesEqual(readPngDimensions(imageBytes, asset.path), asset.dimensions_px)
      || !jsonValuesEqual(sidecar.dimensions_physical_px, asset.dimensions_px)
    ) {
      fail(`public evidence image dimensions do not match the manifest and sidecar: ${asset.path}`);
    }
    return { asset, sidecar };
  });
  const index = fs.readFileSync(path.join(outputRoot, 'index.html'), 'utf8');
  const parsedIndex = parse5.parse(index);
  const evidenceCards = findDescendants(parsedIndex, (node) => (
    node.tagName === 'article' && nodeClassList(node).includes('evidence-surface-card')
  ));
  if (evidenceCards.length !== 2) {
    fail('homepage must contain exactly two reviewed evidence surface cards');
  }
  const expectedHeadings = {
    'Auxtho App': [
      'Auxtho App - Human review workspace',
      'Governed review states rendered in the App',
      'The human review workspace',
      'Review the document and supporting evidence',
      'Review the work and make the decision',
    ],
    'Auxtho Console': [
      'Auxtho Console - Operator oversight',
      'Operator attention rendered in the Console',
      'The operator oversight surface',
      'See what needs attention',
    ],
  };
  for (const { asset } of reviewedAssets) {
    const cardsForSurface = evidenceCards.filter((card) => (
      nodeAttributes(card)['data-evidence-surface'] === asset.surface
    ));
    if (cardsForSurface.length !== 1) {
      fail(`homepage must contain exactly one evidence card for ${asset.surface}`);
    }
    const card = cardsForSurface[0];
    const headings = findDescendants(card, (node) => node.tagName === 'h3');
    const images = findDescendants(card, (node) => node.tagName === 'img');
    const mediaLinks = findDescendants(card, (node) => (
      node.tagName === 'a' && nodeClassList(node).includes('proposal-surface-media')
    ));
    const expectedReference = `${asset.path}?sha256=${asset.sha256}`;
    if (
      headings.length !== 1
      || !expectedHeadings[asset.surface].includes(nodeText(headings[0]).trim())
      || images.length !== 1
      || nodeAttributes(images[0]).src !== expectedReference
      || mediaLinks.length !== 1
      || nodeAttributes(mediaLinks[0]).href !== expectedReference
    ) {
      fail(`homepage evidence card must bind ${asset.surface} to its exact reviewed heading and image`);
    }
  }
  const homepageEvidencePaths = new Set(findImageSources(index)
    .map((source) => new URL(source, 'https://auxtho.invalid').pathname)
    .filter((publicPath) => publicPath.startsWith('/assets/proposal/') && publicPath.endsWith('.png')));
  const manifestEvidencePaths = new Set(reviewedAssets.map(({ asset }) => asset.path));
  if (
    homepageEvidencePaths.size !== manifestEvidencePaths.size
    || [...homepageEvidencePaths].some((publicPath) => !manifestEvidencePaths.has(publicPath))
  ) {
    fail('public evidence manifest image set must exactly match the homepage evidence images');
  }
  const reviewedSurfaces = new Set(reviewedAssets.map(({ asset }) => asset.surface));
  if (reviewedSurfaces.size !== 2 || !reviewedSurfaces.has('Auxtho App') || !reviewedSurfaces.has('Auxtho Console')) {
    fail('public evidence manifest must contain exactly one App asset and one Console asset');
  }
  if (mode === 'candidate') {
    if (
      !/synthetic workflow/i.test(index)
      || /not live telemetry|no customer data|not production/i.test(index)
      || /evidence-manifest-20260716\.json/i.test(index)
    ) {
      fail('homepage must label synthetic workflow media once, avoid defensive front-page copy, and keep raw fixture metadata behind the human-readable evidence page');
    }
  }
  if (sha256(manifestBytes) !== REVIEWED_PRIVACY_MANIFEST_SHA256) {
    fail('public evidence manifest differs from the exact reviewed evidence contract');
  }
  if (mode === 'candidate') assertReviewedPublicHtml(outputRoot, stagedPublicFiles);
  if (mode === 'candidate') {
    const terms = fs.readFileSync(path.join(outputRoot, 'terms.html'), 'utf8');
    if (!/Public Site Notice/.test(terms) || /agree to be bound|binding terms|Terms of Service/i.test(terms)) {
      fail('terms.html must remain a non-contractual Public Site Notice');
    }
  }
  return {
    path: PRIVACY_MANIFEST_PATH,
    sha256: sha256(manifestBytes),
    evidence_boundaries: {
      synthetic_only: reviewedAssets.every(({ asset, sidecar }) => (
        asset.fixture_class === 'independent_synthetic_fixture'
        && asset.synthetic_only === true
        && asset.correlated_run_claimed === false
        && sidecar.customer_data_used === false
        && sidecar.fixture_class === 'independent_synthetic_fixture'
        && sidecar.synthetic_only === true
        && sidecar.correlated_run_claimed === false
      )),
      customer_data_claimed: reviewedAssets.some(({ sidecar }) => sidecar.customer_data_used !== false),
      surfaces_are_independent: manifest.evidence_policy.surfaces_are_independent,
      correlated_customer_run_claimed: manifest.evidence_policy.correlated_customer_run_claimed,
      live_telemetry_claimed: manifest.evidence_policy.live_telemetry_claimed,
      operating_effectiveness_claimed: manifest.evidence_policy.operating_effectiveness_claimed,
      production_readiness_claimed: manifest.evidence_policy.production_readiness_claimed,
    },
  };
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
  const declaredSourceShas = parseShaList('declared site source SHAs', options.compatibleJson, sourceSha);
  if (options.mode === 'candidate' && JSON.stringify(declaredSourceShas) !== JSON.stringify([previousSha, sourceSha].sort())) {
    fail('candidate declaration must be the canonical sorted legacy/candidate SHA pair');
  }
  const legacyBootstrap = options.legacyBootstrap === true;
  if (legacyBootstrap && options.mode !== 'rollback') fail('legacy bootstrap packaging is allowed only for rollback');
  if (legacyBootstrap) validateApprovedLegacyBootstrapSource(sourceRoot, sourceSha);
  const staged = stageExplicitPublicFiles(sourceRoot, outputRoot, { mode: options.mode, legacyBootstrap });
  const scriptReferences = validateScriptReferences(outputRoot, options.mode, legacyBootstrap);
  const stylesheetReferences = legacyBootstrap ? [] : validateStylesheetReferences(outputRoot, options.mode);
  const imageReferences = legacyBootstrap ? [] : validateImageReferences(outputRoot, options.mode);
  const mediaReferences = legacyBootstrap ? [] : validateMediaReferences(outputRoot, options.mode);
  const privacyManifest = validatePrivacyAndClaims(
    outputRoot,
    options.mode,
    legacyBootstrap,
    new Set(staged),
    sourceSha,
  );

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
    compatible_backend_site_shas: declaredSourceShas,
    declared_site_source_shas: declaredSourceShas,
    rollback_of_source_sha: rollbackOfSha,
    script_references: scriptReferences,
    stylesheet_references: stylesheetReferences,
    image_references: imageReferences,
    media_references: mediaReferences,
    privacy_manifest: privacyManifest,
    evidence_boundaries: {
      synthetic_only: privacyManifest.evidence_boundaries?.synthetic_only ?? false,
      customer_data_claimed: privacyManifest.evidence_boundaries?.customer_data_claimed ?? false,
      surfaces_are_independent: privacyManifest.evidence_boundaries?.surfaces_are_independent ?? false,
      correlated_customer_run_claimed: privacyManifest.evidence_boundaries?.correlated_customer_run_claimed ?? false,
      live_telemetry_claimed: privacyManifest.evidence_boundaries?.live_telemetry_claimed ?? false,
      operating_effectiveness_claimed: privacyManifest.evidence_boundaries?.operating_effectiveness_claimed ?? false,
      production_readiness_claimed: privacyManifest.evidence_boundaries?.production_readiness_claimed ?? false,
      reviewed_candidate_claims_present: (
        privacyManifest.reviewed_candidate_claims_present ?? !legacyBootstrap
      ),
    },
    planned_site_sha_transition: {
      bridge_site_sha: options.mode === 'candidate' ? previousSha : sourceSha,
      final_site_sha: sourceSha,
      rollback_site_sha: options.mode === 'candidate' ? previousSha : sourceSha,
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
    compatible_backend_site_shas: declaredSourceShas,
    declared_site_source_shas: declaredSourceShas,
    planned_site_sha_transition: releaseManifest.planned_site_sha_transition,
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
  findMediaSources,
  normalizeManifestPath,
  isApprovedHistoricalRollbackEvidence,
  sha256,
  sourceCandidatePaths,
  validateScriptReferences,
  validateStylesheetReferences,
  validateImageReferences,
  validateMediaReferences,
};
