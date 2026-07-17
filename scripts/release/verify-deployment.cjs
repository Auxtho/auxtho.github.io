const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { TextDecoder } = require('node:util');
const { findImageSources, findScriptSources, findStylesheetSources } = require('./public-artifact.cjs');

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const MAX_READBACK_ATTEMPTS = 48;
const MAX_READBACK_RETRY_DELAY_MS = 15_000;
const MAX_READBACK_WINDOW_MS = 600_000;
const CLOUDFLARE_MANAGED_ROBOTS_BLOCK = [
  '# BEGIN Cloudflare Managed content',
  '',
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
].join('\n');

function fail(message) {
  throw new Error(`HOLD: ${message}`);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function assertHttpsUrl(value, allowedOrigins, label) {
  const url = value instanceof URL ? value : new URL(value);
  if (url.protocol !== 'https:') fail(`${label} attempted an HTTP downgrade`);
  if (!allowedOrigins.includes(url.origin)) fail(`${label} left the exact reviewed HTTPS origins`);
  return url;
}

function resolveHttpsRedirect(currentUrl, location, allowedOrigins) {
  if (!location) fail('redirect response omitted Location');
  return assertHttpsUrl(new URL(location, currentUrl), allowedOrigins, 'redirect chain');
}

function monotonicNow() {
  return performance.now();
}

function boundedRequestTimeoutMs(options = {}) {
  const now = options.now || monotonicNow;
  if (options.deadlineAt === undefined) return 30_000;
  const remaining = options.deadlineAt - now();
  if (!Number.isFinite(remaining) || remaining <= 0) fail('HTTPS readback deadline exceeded');
  return Math.max(1, Math.min(30_000, Math.ceil(remaining)));
}

function requestOnce(url, options = {}) {
  const headers = {
    'Accept-Encoding': 'identity',
    'User-Agent': 'auxtho-release-readback/2',
  };
  if (options.bypassCache === true) headers['Cache-Control'] = 'no-cache';
  const timeoutMs = boundedRequestTimeoutMs(options);
  const requestFactory = options.requestFactory || https.request;
  return new Promise((resolve, reject) => {
    let deadlineTimer;
    const clearDeadline = () => {
      if (deadlineTimer) clearTimeout(deadlineTimer);
    };
    const request = requestFactory(url, {
      method: 'GET',
      headers,
      timeout: timeoutMs,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        clearDeadline();
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks),
        });
      });
      response.on('error', (error) => {
        clearDeadline();
        reject(error);
      });
    });
    deadlineTimer = setTimeout(() => {
      request.destroy(new Error('HTTPS readback absolute deadline exceeded'));
    }, timeoutMs);
    request.on('timeout', () => request.destroy(new Error('HTTPS readback socket timed out')));
    request.on('error', (error) => {
      clearDeadline();
      reject(error);
    });
    request.end();
  });
}

async function fetchHttps(value, allowedOrigins, maxRedirects = 5, requestOptions = {}) {
  let url = assertHttpsUrl(value, allowedOrigins, 'readback URL');
  const chain = [];
  for (let index = 0; index <= maxRedirects; index += 1) {
    boundedRequestTimeoutMs(requestOptions);
    const response = await requestOnce(url, requestOptions);
    chain.push({ url: url.toString(), status: response.status, location: response.headers.location || null });
    if (!REDIRECT_STATUSES.has(response.status)) return { ...response, url, chain };
    if (index === maxRedirects) fail('HTTPS redirect chain exceeded the reviewed limit');
    url = resolveHttpsRedirect(url, response.headers.location, allowedOrigins);
  }
  fail('unreachable redirect state');
}

function parseDigestManifest(document) {
  const entries = String(document).split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
    const match = line.match(/^([0-9a-f]{64})  \.\/([A-Za-z0-9._/ -]+)$/);
    const relative = match?.[2] || '';
    const segments = relative.split('/');
    if (
      !match
      || relative !== relative.trim()
      || relative.includes('\\')
      || path.posix.isAbsolute(relative)
      || segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) fail(`invalid digest line: ${line}`);
    return { sha256: match[1], relative };
  });
  if (entries.length < 1 || entries.length > 1024) fail('digest entry count is outside the reviewed range');
  if (new Set(entries.map((entry) => entry.relative)).size !== entries.length) fail('digest manifest contains duplicate paths');
  return entries;
}

function headerValue(headers, name) {
  const value = headers[String(name).toLowerCase()];
  return Array.isArray(value) ? value.join(', ') : value;
}

function isManagedRobotsOverlay(response, expectedBody) {
  if (!Buffer.isBuffer(response?.body) || !Buffer.isBuffer(expectedBody)) return false;
  if ((headerValue(response.headers || {}, 'server') || '').trim().toLowerCase() !== 'cloudflare') return false;
  if (!/^[0-9a-f]{16,32}-[a-z0-9]{3,8}$/i.test(headerValue(response.headers || {}, 'cf-ray') || '')) return false;
  if (!/^text\/plain\b/i.test(headerValue(response.headers || {}, 'content-type') || '')) return false;
  let finalUrl;
  try {
    finalUrl = response.url instanceof URL ? response.url : new URL(response.url);
  } catch {
    return false;
  }
  if (finalUrl.origin !== 'https://auxtho.com' || finalUrl.pathname !== '/robots.txt') return false;
  if (response.body.length <= expectedBody.length) return false;
  const prefixLength = response.body.length - expectedBody.length;
  if (!response.body.subarray(prefixLength).equals(expectedBody)) return false;
  const prefixBytes = response.body.subarray(0, prefixLength);
  if (prefixBytes.length > 16_384) return false;
  let prefix;
  try {
    prefix = UTF8_DECODER.decode(prefixBytes);
  } catch {
    return false;
  }
  if (!/^[\x09\x0a\x0d\x20-\x7e]+$/.test(prefix)) return false;
  const normalizedPrefix = prefix.replace(/\r\n/g, '\n');
  if (normalizedPrefix.includes('\r')) return false;
  const marker = '# BEGIN Cloudflare Managed content';
  const markerIndex = normalizedPrefix.indexOf(marker);
  if (markerIndex < 0 || normalizedPrefix.indexOf(marker, markerIndex + marker.length) >= 0) return false;
  const preamble = normalizedPrefix.slice(0, markerIndex);
  if (!preamble.split('\n').every((line) => line === '' || line.startsWith('#'))) return false;
  return normalizedPrefix.slice(markerIndex) === CLOUDFLARE_MANAGED_ROBOTS_BLOCK;
}

function validateVerifierSecurity(response, document) {
  function requireHeader(name, pattern) {
    const value = headerValue(response.headers, name);
    if (!value || !pattern.test(value)) fail(`required ${name} response header is missing or invalid`);
  }
  requireHeader('cf-ray', /\S+/);
  requireHeader('server', /cloudflare/i);
  requireHeader('content-type', /^text\/html\b/i);
  requireHeader('strict-transport-security', /(?:^|;)\s*max-age=\d+/i);
  requireHeader('x-content-type-options', /^nosniff$/i);
  requireHeader('referrer-policy', /\S+/);
  requireHeader('content-security-policy', /(?:^|;)\s*frame-ancestors\s+'none'\s*(?:;|$)/i);
  const responseCsp = headerValue(response.headers, 'content-security-policy');
  if (/127\.0\.0\.1|localhost|http:/i.test(responseCsp)) fail('production response CSP contains loopback or HTTP');

  const match = document.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/i);
  if (!match) fail('verifier meta CSP is missing');
  const metaCsp = match[1];
  if (/127\.0\.0\.1|localhost|http:/i.test(metaCsp)) fail('published verifier meta CSP contains loopback or HTTP');
  if (!/(?:^|;)\s*connect-src\s+'self'\s+https:\/\/api\.auxtho\.com\s*(?:;|$)/i.test(metaCsp)) {
    fail('published verifier meta CSP connect-src is not the exact production policy');
  }
}

function validatePublicPageSecurity(response, document, publicPath) {
  function requireHeader(name, pattern) {
    const value = headerValue(response.headers, name);
    if (!value || !pattern.test(value)) fail(`${publicPath} required ${name} response header is missing or invalid`);
  }
  requireHeader('content-type', /^text\/html\b/i);
  requireHeader('strict-transport-security', /(?:^|;)\s*max-age=\d+/i);
  requireHeader('x-content-type-options', /^nosniff$/i);
  requireHeader('referrer-policy', /\S+/);
  requireHeader('content-security-policy', /(?:^|;)\s*frame-ancestors\s+'none'\s*(?:;|$)/i);
  const csp = headerValue(response.headers, 'content-security-policy');
  if (/127\.0\.0\.1|localhost|(?:^|\s)http:/i.test(csp)) fail(`${publicPath} response CSP contains loopback or HTTP`);
  if (/(?:^|\s)'unsafe-eval'(?:\s|;|$)/i.test(csp)) fail(`${publicPath} response CSP permits unsafe-eval`);
  if (/(?:^|\s)\*(?:\s|;|$)/.test(csp)) fail(`${publicPath} response CSP contains a wildcard source`);
  if (/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(document)) {
    fail(`${publicPath} contains an inline script that cannot be bound to package bytes`);
  }
}

function validateRelease(release, provenance, expected) {
  const exactKeys = [
    'schema_version', 'publication_mode', 'source_sha', 'previous_approved_source_sha',
    'compatible_backend_site_shas', 'backend_site_sha_transition', 'rollback_of_source_sha',
    'release_manifest', 'privacy_manifest',
  ];
  if (JSON.stringify(Object.keys(release)) !== JSON.stringify(exactKeys)) fail('release.json keys are not exact');
  if (release.schema_version !== 2 || release.publication_mode !== expected.mode) fail('release mode or schema mismatch');
  if (release.source_sha !== expected.sourceSha || provenance.source_sha !== expected.sourceSha) fail('release source SHA mismatch');
  if (release.previous_approved_source_sha !== provenance.previous_approved_source_sha) fail('previous approved source SHA mismatch');
  if (JSON.stringify(release.compatible_backend_site_shas) !== JSON.stringify(expected.compatibleShas)) {
    fail('deployed compatible backend site SHA list mismatch');
  }
  if (JSON.stringify(release.compatible_backend_site_shas) !== JSON.stringify([...release.compatible_backend_site_shas].sort())) {
    fail('deployed compatibility list is not in canonical SHA sort order');
  }
  if (!release.compatible_backend_site_shas.includes(release.source_sha)) fail('compatibility list omits current site source');
  if (
    expected.mode === 'candidate'
    && JSON.stringify(release.compatible_backend_site_shas)
      !== JSON.stringify([release.previous_approved_source_sha, expected.sourceSha].sort())
  ) {
    fail('candidate compatibility is not the exact canonical legacy/candidate pair');
  }
  const expectedTransition = expected.mode === 'candidate'
    ? {
      bridge_reported_site_sha: release.previous_approved_source_sha,
      final_reported_site_sha: expected.sourceSha,
      rollback_reported_site_sha: release.previous_approved_source_sha,
    }
    : {
      bridge_reported_site_sha: expected.sourceSha,
      final_reported_site_sha: expected.sourceSha,
      rollback_reported_site_sha: expected.sourceSha,
    };
  if (JSON.stringify(release.backend_site_sha_transition) !== JSON.stringify(expectedTransition)) {
    fail('backend site SHA transition metadata mismatch');
  }
  if (release.rollback_of_source_sha !== (expected.rollbackOfSha || null)) fail('rollback-of source SHA mismatch');
  if (release.release_manifest?.path !== '/assets/release-manifest.json') fail('release manifest path is not exact');
  if (!HASH_PATTERN.test(release.release_manifest?.sha256)) fail('release manifest digest is invalid');
}

function validateReadbackAttempts(value) {
  const attempts = Number(value);
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > MAX_READBACK_ATTEMPTS) {
    fail(`readback attempts must be an integer from 1 to ${MAX_READBACK_ATTEMPTS}`);
  }
  return attempts;
}

function readbackRetryDelayMs() {
  const raw = process.env.READBACK_RETRY_DELAY_MS || '10000';
  if (!/^\d+$/.test(raw)) fail('readback retry delay must be a non-negative integer');
  const delay = Number(raw);
  if (!Number.isSafeInteger(delay) || delay > MAX_READBACK_RETRY_DELAY_MS) {
    fail(`readback retry delay exceeds ${MAX_READBACK_RETRY_DELAY_MS}ms`);
  }
  return delay;
}

function attachReadbackObservations(error, observations) {
  const finalError = error instanceof Error ? error : new Error(String(error));
  finalError.readbackObservations = observations;
  return finalError;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || argv[index + 1] === undefined) fail(`invalid argument: ${String(argv[index])}`);
    options[argv[index].slice(2)] = argv[index + 1];
  }
  for (const key of [
    'origin', 'source-sha', 'compatible-json',
    'mode', 'provenance', 'evidence', 'cache-token',
  ]) {
    if (!options[key]) fail(`missing --${key}`);
  }
  if (options.origin !== 'https://auxtho.com') fail('public origin must be exactly https://auxtho.com');
  if (!SHA_PATTERN.test(options['source-sha'])) fail('site SHA must be exact');
  let compatibleShas;
  try { compatibleShas = JSON.parse(options['compatible-json']); } catch { fail('compatible JSON is invalid'); }
  if (!Array.isArray(compatibleShas) || !compatibleShas.includes(options['source-sha'])) {
    fail('compatible list must include current site source');
  }
  return {
    origin: options.origin,
    sourceSha: options['source-sha'],
    compatibleShas,
    mode: options.mode,
    rollbackOfSha: options['rollback-of-sha'] || null,
    provenanceRoot: path.resolve(options.provenance),
    evidenceRoot: path.resolve(options.evidence),
    cacheToken: options['cache-token'],
    attempts: validateReadbackAttempts(options.attempts || 6),
  };
}

function readProvenance(root) {
  const provenance = JSON.parse(fs.readFileSync(path.join(root, 'provenance.json'), 'utf8'));
  const releaseManifestBytes = fs.readFileSync(path.join(root, 'release-manifest.json'));
  const releaseManifest = JSON.parse(releaseManifestBytes.toString('utf8'));
  const digestEntries = parseDigestManifest(fs.readFileSync(path.join(root, 'public-files-sha256.txt'), 'utf8'));
  const robotsBytes = fs.readFileSync(path.join(root, 'robots.txt'));
  if (provenance.public_file_count !== digestEntries.length) fail('provenance public file count mismatch');
  if (provenance.release_manifest_sha256 !== sha256(releaseManifestBytes)) fail('provenance release manifest digest mismatch');
  const robotsDigest = digestEntries.find((entry) => entry.relative === 'robots.txt')?.sha256;
  if (!robotsDigest || sha256(robotsBytes) !== robotsDigest) fail('provenance robots source digest mismatch');
  if (releaseManifest.must_be_absent_public_paths.length !== provenance.must_be_absent_public_path_count) {
    fail('must-be-absent path count mismatch');
  }
  return { provenance, releaseManifest, releaseManifestBytes, digestEntries, robotsBytes };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitBeforeRetry({ attempt, attempts, deadlineAt, sleeper, delayMs, now }) {
  if (attempt >= attempts || now() >= deadlineAt) return false;
  const remaining = deadlineAt - now();
  await sleeper(Math.min(delayMs, Math.max(0, remaining)));
  return now() < deadlineAt;
}

async function waitForExpectedPublicFile({
  url,
  allowedOrigins,
  expectedHash,
  expectedBody = null,
  attempts,
  statusMessage,
  mismatchMessage,
  allowManagedRobots = false,
  fetcher = fetchHttps,
  sleeper = sleep,
  now = monotonicNow,
}) {
  const boundedAttempts = validateReadbackAttempts(attempts);
  const delayMs = readbackRetryDelayMs();
  const deadlineAt = now() + MAX_READBACK_WINDOW_MS;
  const observations = [];
  let lastError;
  for (let attempt = 1; attempt <= boundedAttempts && now() < deadlineAt; attempt += 1) {
    let recorded = false;
    try {
      const response = await fetcher(url, allowedOrigins, 5, {
        bypassCache: true,
        deadlineAt,
        now,
      });
      const actualHash = sha256(response.body);
      const observation = {
        attempt,
        status: response.status,
        actual_sha256: actualHash,
        chain: response.chain || [],
      };
      observations.push(observation);
      recorded = true;
      if (now() >= deadlineAt) {
        observation.deadline_exceeded = true;
        fail('public file readback deadline exceeded');
      }
      if (response.status !== 200) fail(`${statusMessage} HTTP ${response.status}`);
      if (actualHash === expectedHash) {
        return { response, actualHash, attempt, edgeTransform: null, observations };
      }
      if (allowManagedRobots && isManagedRobotsOverlay(response, expectedBody)) {
        observation.edge_transform = 'cloudflare_managed_robots_prefix';
        return {
          response,
          actualHash,
          attempt,
          edgeTransform: 'cloudflare_managed_robots_prefix',
          observations,
        };
      }
      fail(mismatchMessage);
    } catch (error) {
      lastError = error;
      if (!recorded) observations.push({ attempt, error: String(error?.message || error) });
      const shouldContinue = await waitBeforeRetry({
        attempt,
        attempts: boundedAttempts,
        deadlineAt,
        sleeper,
        delayMs,
        now,
      });
      if (!shouldContinue) break;
    }
  }
  throw attachReadbackObservations(lastError || new Error(`HOLD: ${mismatchMessage}`), observations);
}

async function waitForAbsentPublicPath(url, allowedOrigins, options, statusMessage) {
  const boundedAttempts = validateReadbackAttempts(options.attempts);
  const delayMs = readbackRetryDelayMs();
  const deadlineAt = monotonicNow() + MAX_READBACK_WINDOW_MS;
  const observations = [];
  let lastError;
  for (let attempt = 1; attempt <= boundedAttempts && monotonicNow() < deadlineAt; attempt += 1) {
    let recorded = false;
    try {
      const response = await fetchHttps(url, allowedOrigins, 5, {
        bypassCache: true,
        deadlineAt,
        now: monotonicNow,
      });
      const observation = { attempt, status: response.status, chain: response.chain || [] };
      observations.push(observation);
      recorded = true;
      if (monotonicNow() >= deadlineAt) {
        observation.deadline_exceeded = true;
        fail('absent-path readback deadline exceeded');
      }
      if (![404, 410].includes(response.status)) fail(`${statusMessage} HTTP ${response.status}`);
      return { response, attempt, observations };
    } catch (error) {
      lastError = error;
      if (!recorded) observations.push({ attempt, error: String(error?.message || error) });
      const shouldContinue = await waitBeforeRetry({
        attempt,
        attempts: boundedAttempts,
        deadlineAt,
        sleeper: sleep,
        delayMs,
        now: monotonicNow,
      });
      if (!shouldContinue) break;
    }
  }
  throw attachReadbackObservations(lastError || new Error(`HOLD: ${statusMessage}`), observations);
}

async function waitForExactRelease(options, allowedOrigins, provenance) {
  const boundedAttempts = validateReadbackAttempts(options.attempts);
  const delayMs = readbackRetryDelayMs();
  const deadlineAt = monotonicNow() + MAX_READBACK_WINDOW_MS;
  const observations = [];
  let lastError;
  for (let attempt = 1; attempt <= boundedAttempts && monotonicNow() < deadlineAt; attempt += 1) {
    let recorded = false;
    try {
      const url = new URL('/release.json', options.origin);
      url.searchParams.set('cache_bust', `${options.cacheToken}-identity-${attempt}`);
      const response = await fetchHttps(url, allowedOrigins, 5, {
        bypassCache: true,
        deadlineAt,
        now: monotonicNow,
      });
      const observation = {
        attempt,
        status: response.status,
        actual_sha256: sha256(response.body),
        chain: response.chain || [],
      };
      observations.push(observation);
      recorded = true;
      if (monotonicNow() >= deadlineAt) {
        observation.deadline_exceeded = true;
        fail('release identity readback deadline exceeded');
      }
      if (response.status !== 200) fail(`release readback returned HTTP ${response.status}`);
      const release = JSON.parse(response.body.toString('utf8'));
      validateRelease(release, provenance, options);
      return { release, response, attempt, observations };
    } catch (error) {
      lastError = error;
      if (!recorded) observations.push({ attempt, error: String(error?.message || error) });
      const shouldContinue = await waitBeforeRetry({
        attempt,
        attempts: boundedAttempts,
        deadlineAt,
        sleeper: sleep,
        delayMs,
        now: monotonicNow,
      });
      if (!shouldContinue) break;
    }
  }
  throw attachReadbackObservations(
    lastError || new Error('HOLD: exact release identity was not observed'),
    observations,
  );
}

async function verifyDeployment(options) {
  if (!['candidate', 'rollback'].includes(options.mode)) fail('mode must be candidate or rollback');
  const {
    provenance,
    releaseManifest,
    releaseManifestBytes,
    digestEntries,
    robotsBytes,
  } = readProvenance(options.provenanceRoot);
  const allowedOrigins = ['https://auxtho.com', 'https://auxtho.github.io'];
  if (provenance.publication_mode !== options.mode || provenance.source_sha !== options.sourceSha) {
    fail('selected provenance does not match requested publication');
  }
  const releaseReadback = await waitForExactRelease(options, allowedOrigins, provenance);
  const records = [];
  const canonicalBodies = new Map();

  for (const entry of digestEntries) {
    for (const variant of ['canonical', 'cache_busted']) {
      const url = new URL(`/${entry.relative}`, options.origin);
      if (variant === 'cache_busted') url.searchParams.set('cache_bust', `${options.cacheToken}-bytes`);
      const readback = await waitForExpectedPublicFile({
        url,
        allowedOrigins,
        expectedHash: entry.sha256,
        expectedBody: entry.relative === 'robots.txt' ? robotsBytes : null,
        attempts: options.attempts,
        statusMessage: `${variant} public path /${entry.relative} returned`,
        mismatchMessage: `${variant} public byte mismatch for /${entry.relative}`,
        allowManagedRobots: entry.relative === 'robots.txt',
      });
      const { response } = readback;
      records.push({
        type: 'published',
        variant,
        path: `/${entry.relative}`,
        status: response.status,
        sha256: readback.actualHash,
        expected_sha256: entry.sha256,
        edge_transform: readback.edgeTransform,
        attempt: readback.attempt,
        observations: readback.observations,
        chain: response.chain,
      });
      if (variant === 'canonical') canonicalBodies.set(entry.relative, { body: response.body, response });
    }
  }

  const deployedManifest = canonicalBodies.get('assets/release-manifest.json')?.body;
  if (!deployedManifest || !deployedManifest.equals(releaseManifestBytes)) fail('canonical release manifest bytes mismatch');
  const digestByPath = new Map(digestEntries.map((entry) => [`/${entry.relative}`, entry.sha256]));
  for (const reference of releaseManifest.script_references) {
    if (digestByPath.get(reference.path) !== reference.sha256) fail(`script reference is not bound to package digest: ${reference.url}`);
    const html = canonicalBodies.get(reference.html_path.slice(1))?.body?.toString('utf8');
    if (!html || !findScriptSources(html).includes(reference.url)) fail(`deployed HTML does not reference exact script URL: ${reference.html_path}`);
    if (options.mode === 'candidate' && reference.content_addressed !== true) {
      fail(`candidate script reference is not content-addressed: ${reference.url}`);
    }
    const referencedReadback = await waitForExpectedPublicFile({
      url: new URL(reference.url, options.origin),
      allowedOrigins,
      expectedHash: reference.sha256,
      attempts: options.attempts,
      statusMessage: `exact referenced script URL returned: ${reference.url}`,
      mismatchMessage: `exact referenced script URL bytes mismatch: ${reference.url}`,
    });
    const referencedResponse = referencedReadback.response;
    records.push({
      type: 'published',
      variant: 'exact_script_reference',
      path: reference.url,
      status: referencedResponse.status,
      sha256: reference.sha256,
      attempt: referencedReadback.attempt,
      observations: referencedReadback.observations,
      chain: referencedResponse.chain,
    });
  }
  for (const reference of releaseManifest.stylesheet_references || []) {
    if (digestByPath.get(reference.path) !== reference.sha256) fail(`stylesheet reference is not bound to package digest: ${reference.url}`);
    const html = canonicalBodies.get(reference.html_path.slice(1))?.body?.toString('utf8');
    if (!html || !findStylesheetSources(html).includes(reference.url)) {
      fail(`deployed HTML does not reference exact stylesheet URL: ${reference.html_path}`);
    }
    if (options.mode === 'candidate' && reference.content_addressed !== true) {
      fail(`candidate stylesheet reference is not content-addressed: ${reference.url}`);
    }
    const referencedReadback = await waitForExpectedPublicFile({
      url: new URL(reference.url, options.origin),
      allowedOrigins,
      expectedHash: reference.sha256,
      attempts: options.attempts,
      statusMessage: `exact referenced stylesheet URL returned: ${reference.url}`,
      mismatchMessage: `exact referenced stylesheet URL bytes mismatch: ${reference.url}`,
    });
    const referencedResponse = referencedReadback.response;
    records.push({
      type: 'published',
      variant: 'exact_stylesheet_reference',
      path: reference.url,
      status: referencedResponse.status,
      sha256: reference.sha256,
      attempt: referencedReadback.attempt,
      observations: referencedReadback.observations,
      chain: referencedResponse.chain,
    });
  }
  for (const reference of releaseManifest.image_references || []) {
    if (digestByPath.get(reference.path) !== reference.sha256) fail(`image reference is not bound to package digest: ${reference.url}`);
    const html = canonicalBodies.get(reference.html_path.slice(1))?.body?.toString('utf8');
    if (!html || !findImageSources(html).includes(reference.url)) {
      fail(`deployed HTML does not reference exact image URL: ${reference.html_path}`);
    }
    if (options.mode === 'candidate' && reference.content_addressed !== true) {
      fail(`candidate image reference is not content-addressed: ${reference.url}`);
    }
    const referencedReadback = await waitForExpectedPublicFile({
      url: new URL(reference.url, options.origin),
      allowedOrigins,
      expectedHash: reference.sha256,
      attempts: options.attempts,
      statusMessage: `exact referenced image URL returned: ${reference.url}`,
      mismatchMessage: `exact referenced image URL bytes mismatch: ${reference.url}`,
    });
    const referencedResponse = referencedReadback.response;
    records.push({
      type: 'published',
      variant: 'exact_image_reference',
      path: reference.url,
      status: referencedResponse.status,
      sha256: reference.sha256,
      attempt: referencedReadback.attempt,
      observations: referencedReadback.observations,
      chain: referencedResponse.chain,
    });
  }
  if (options.mode === 'candidate') {
    for (const [relative, value] of canonicalBodies) {
      if (relative.endsWith('.html')) validatePublicPageSecurity(value.response, value.body.toString('utf8'), `/${relative}`);
    }
  }
  const verifier = canonicalBodies.get('verify.html');
  if (!verifier) fail('canonical verifier readback is absent');
  if (options.mode === 'candidate') validateVerifierSecurity(verifier.response, verifier.body.toString('utf8'));

  for (const publicPath of releaseManifest.must_be_absent_public_paths) {
    for (const variant of ['canonical', 'cache_busted']) {
      const url = new URL(publicPath, options.origin);
      if (variant === 'cache_busted') url.searchParams.set('cache_bust', `${options.cacheToken}-retired`);
      const readback = await waitForAbsentPublicPath(
        url,
        allowedOrigins,
        options,
        `${variant} removed path ${publicPath} returned`,
      );
      records.push({
        type: 'absent',
        variant,
        path: publicPath,
        status: readback.response.status,
        attempt: readback.attempt,
        observations: readback.observations,
        chain: readback.response.chain,
      });
    }
  }

  fs.mkdirSync(options.evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(options.evidenceRoot, 'deployment-readback.json'), `${JSON.stringify({
    schema_version: 2,
    publication_mode: options.mode,
    source_sha: options.sourceSha,
    release_identity_attempt: releaseReadback.attempt,
    release_identity_observations: releaseReadback.observations,
    release_chain: releaseReadback.response.chain,
    public_file_variants_verified: records.filter((record) => record.type === 'published').length,
    absent_path_variants_verified: records.filter((record) => record.type === 'absent').length,
    records,
  }, null, 2)}\n`, { flag: 'wx' });
  return { records };
}

function writeFailureEvidence(options, error) {
  if (!options?.evidenceRoot) return;
  fs.mkdirSync(options.evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(options.evidenceRoot, 'deployment-readback-error.json'), `${JSON.stringify({
    schema_version: 2,
    publication_mode: options.mode,
    source_sha: options.sourceSha,
    error: String(error?.message || error),
    readback_observations: Array.isArray(error?.readbackObservations) ? error.readbackObservations : [],
  }, null, 2)}\n`);
}

if (require.main === module) {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
    verifyDeployment(options).then((result) => {
      process.stdout.write(`deployment-readback mode=${options.mode} records=${result.records.length}\n`);
    }).catch((error) => {
      writeFailureEvidence(options, error);
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  assertHttpsUrl,
  boundedRequestTimeoutMs,
  fetchHttps,
  isManagedRobotsOverlay,
  parseDigestManifest,
  parseArguments,
  requestOnce,
  resolveHttpsRedirect,
  validateRelease,
  validatePublicPageSecurity,
  validateVerifierSecurity,
  verifyDeployment,
  waitForExpectedPublicFile,
  writeFailureEvidence,
};
