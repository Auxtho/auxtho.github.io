const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { findBrokenImageSources } = require('../scripts/release/browser-readback.cjs');

test.describe.configure({ mode: 'serial' });

const root = path.resolve(__dirname, '..');
let server;
let baseUrl;
const MATCHED_SITE_SHA = 'a'.repeat(40);
const ROLLBACK_SITE_SHA = '1'.repeat(40);
const BACKEND_SHA = 'b'.repeat(40);

function releaseTuple(overrides = {}) {
  return {
    verification_contract_version: 'artifact-verification-v2',
    qr_contract_version: '1',
    registry_schema: 'artifact-registry-v2',
    signing_mode: 'pilot_hash_only',
    public_site_source_sha: MATCHED_SITE_SHA,
    backend_source_sha: BACKEND_SHA,
    ...overrides,
  };
}

test('site CI watches release identity and requires committed build output', async () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'site-ci.yml'), 'utf8');
  const releaseTemplate = fs.readFileSync(path.join(root, 'release.json'), 'utf8');
  expect(workflow).toContain('- "release.json"');
  expect(workflow).toContain('git diff --exit-code');
  expect(releaseTemplate).toContain('site.github.build_revision');
});

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function statusPayload(status = 'operational', overrides = {}) {
  return {
    status,
    readiness: status === 'operational' ? 'READY' : 'NOT_READY',
    verification_contract_version: 'artifact-verification-v2',
    qr_contract_version: '1',
    registry_schema: 'artifact-registry-v2',
    signing_mode: 'pilot_hash_only',
    public_site_source_sha: MATCHED_SITE_SHA,
    backend_source_sha: BACKEND_SHA,
    ...overrides,
  };
}

function successPayload({
  reportId = 'RPT-VERIFY-001',
  exportEventId = 'EXP-VERIFY-001',
  artifactHash,
  artifactBytesSha256,
  durableDeliveryBindingRecorded = false,
  verificationOutcome,
  verificationScope,
  reason,
  submittedFileDigestMatch,
  fileBytesVerified = false,
  verificationMode = 'pilot_hash_only',
  signature = {},
  publicMode,
  timestampProvider,
  responseReleaseTuple,
} = {}) {
  const defaultSignature = {
    enabled: false,
    present: false,
    signature_recorded_valid: false,
    signature_format: null,
    certificate_chain_recorded_status: 'not_enabled',
    timestamp_present: false,
    timestamp_recorded_valid: false,
    validation_basis: 'registry_record',
    recorded_evidence_type: verificationMode === 'production_signed'
      ? 'PRODUCTION_SIGNED'
      : (verificationMode === 'local_signed' ? 'LOCAL_SIGNED_TEST' : 'HASH_ONLY'),
    live_cryptographic_revalidation_performed: false,
    recorded_reason_code: 'SIGNATURE_NOT_ENABLED',
  };
  const digestSubmitted = artifactBytesSha256 !== undefined;
  const digestMatch = submittedFileDigestMatch === undefined ? digestSubmitted : submittedFileDigestMatch;
  const resolvedOutcome = verificationOutcome || (
    digestSubmitted && digestMatch
      ? 'SUBMITTED_DIGEST_MATCH'
      : (durableDeliveryBindingRecorded ? 'ISSUED_ARTIFACT_RECORD_MATCH' : 'REGISTRY_RECORD_MATCH')
  );
  const payload = {
    verification_contract_version: 'artifact-verification-v2',
    verified: false,
    record_verified: true,
    issued_record_match: true,
    verification_outcome: resolvedOutcome,
    record_match_confirmed: true,
    artifact_hash_match: true,
    artifact_hash: artifactHash,
    file_bytes_verified: fileBytesVerified,
    submitted_file_digest_match: digestMatch,
    verification_scope: verificationScope || (digestSubmitted ? 'FILE' : 'IDENTIFIER'),
    reason: reason || (
      resolvedOutcome === 'SUBMITTED_DIGEST_MATCH'
        ? 'SUBMITTED_DIGEST_MATCH'
        : (resolvedOutcome === 'ISSUED_ARTIFACT_RECORD_MATCH' ? 'ISSUED_RECORD_CONFIRMED' : 'REGISTRY_RECORD_MATCH')
    ),
    artifact: {
      report_id: reportId,
      export_event_id: exportEventId,
      exported_at: '2026-07-16T00:00:00Z',
      lifecycle_status: 'ACTIVE',
      durable_delivery_binding_recorded: durableDeliveryBindingRecorded,
    },
    file_verification: {
      available: true,
      algorithm: 'SHA-256',
      method: 'CALLER_SUBMITTED_DIGEST_COMPARISON',
    },
    signature: { ...defaultSignature, ...signature },
    mode: publicMode || (verificationMode === 'production_signed' ? 'production' : 'pilot'),
    verification_mode: verificationMode,
    timestamp_provider: timestampProvider || (verificationMode === 'production_signed' ? 'rfc3161_http' : (verificationMode === 'local_signed' ? 'local_mock' : 'none')),
    release_tuple: responseReleaseTuple || releaseTuple({ signing_mode: verificationMode }),
  };
  if (artifactBytesSha256 !== undefined) payload.artifact_bytes_sha256 = artifactBytesSha256;
  return payload;
}

function successPayloadForRequest(request, overrides = {}) {
  const body = request.postDataJSON();
  return successPayload({
    reportId: body.report_id,
    exportEventId: body.export_event_id,
    artifactHash: body.artifact_hash,
    artifactBytesSha256: body.artifact_bytes_sha256,
    ...overrides,
  });
}

async function mockStatus(page, status = 'operational', options = {}) {
  const statusOverrides = options.statusOverrides || {};
  await page.route(`${baseUrl}/api/verify/status`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(statusPayload(status, statusOverrides)) });
  });
  await page.route('**/release.json*', async (route) => {
    if (options.onReleaseRequest) options.onReleaseRequest(route.request());
    const releaseSourceSha = options.releaseSourceSha || MATCHED_SITE_SHA;
    const releasePayload = Object.prototype.hasOwnProperty.call(options, 'releasePayload')
      ? options.releasePayload
      : {
        source_sha: releaseSourceSha,
        compatible_backend_site_shas: options.compatibleBackendSiteShas || [releaseSourceSha],
      };
    const body = Object.prototype.hasOwnProperty.call(options, 'releaseBody')
      ? options.releaseBody
      : JSON.stringify(releasePayload);
    await route.fulfill({
      status: options.releaseStatus || 200,
      contentType: options.releaseContentType || 'application/json',
      body,
    });
  });
}

test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relativePath = pathname === '/' ? 'verify.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store' });
      response.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('homepage image readback rejects source-less images except the closed sample lightbox placeholder', async ({ page }) => {
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
  await page.locator('img:not(#sample-lightbox-image)').evaluateAll(async (images) => {
    await Promise.all(images.map((image) => {
      image.loading = 'eager';
      image.scrollIntoView({ block: 'center' });
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    }));
  });
  const collect = () => page.locator('img').evaluateAll((images) => images.map((image) => {
    const lightbox = image.closest('dialog#sample-lightbox');
    return {
      source: image.currentSrc || image.getAttribute('src'),
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      descriptor: image.id ? `#${image.id}` : 'img',
      inactiveSampleLightboxPlaceholder: image.id === 'sample-lightbox-image'
        && Boolean(lightbox)
        && !lightbox.open,
    };
  }));

  expect(findBrokenImageSources(await collect())).toEqual([]);
  await page.locator('body').evaluate((body) => {
    const missing = document.createElement('img');
    missing.id = 'missing-image-regression';
    body.appendChild(missing);
  });
  expect(findBrokenImageSources(await collect())).toContain('missing-src:#missing-image-regression');
});

test('verifier CSP allows reviewed endpoints and blocks an unlisted connection', async ({ page }) => {
  let unlistedRequestCount = 0;
  await mockStatus(page);
  await page.route('https://example.invalid/**', async (route) => {
    unlistedRequestCount += 1;
    await route.abort();
  });

  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#verification-service-status')).toContainText('Endpoint ready');
  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.invalid/not-reviewed');
      return false;
    } catch (_error) {
      return true;
    }
  });
  expect(blocked).toBe(true);
  expect(unlistedRequestCount).toBe(0);
});

test('verifier leads with supported comparisons and defers cryptographic metadata until a result', async ({ page }) => {
  await mockStatus(page);
  await page.goto(`${baseUrl}/verify.html`);

  await expect(page.getByRole('heading', { level: 1, name: 'Artifact Verification' })).toBeVisible();
  await expect(page.locator('.verify-capability')).toHaveCount(3);
  await expect(page.locator('.verify-capability-grid')).toContainText('Check the issued export record');
  await expect(page.locator('.verify-capability-grid')).toContainText('Compare the digital document');
  await expect(page.locator('.verify-capability-grid')).toContainText('Keep the PDF in your browser');
  await expect(page.locator('#artifact-crypto-block')).toBeHidden();
  await expect(page.locator('.manual-verify-panel .verification-details')).toHaveCount(2);
});

test('QR parameters prefill but never submit before an explicit click', async ({ page }) => {
  let postCount = 0;
  let postedBody;
  await mockStatus(page);
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    if (route.request().method() === 'POST') {
      postCount += 1;
      postedBody = route.request().postDataJSON();
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(successPayloadForRequest(route.request())) });
  });

  const hash = 'a'.repeat(64);
  await page.goto(`${baseUrl}/verify.html#report=RPT-VERIFY-001&h=${hash}&exp=EXP-VERIFY-001`);
  await expect(page.locator('#verification-service-status')).toContainText('Endpoint ready');
  expect(postCount).toBe(0);
  await expect(page.locator('#manual-report-id')).toHaveValue('RPT-VERIFY-001');
  expect(page.url()).toBe(`${baseUrl}/verify.html`);

  await page.locator('#qr-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Artifact Record Match');
  await expect(page.locator('#verify-result-grid')).toContainText('REGISTRY_RECORD_MATCH');
  await expect(page.locator('#verify-result-grid')).toContainText('IDENTIFIER');
  expect(postCount).toBe(1);
  expect(postedBody).toEqual({
    verification_contract_version: 'artifact-verification-v2',
    report_id: 'RPT-VERIFY-001',
    artifact_hash: hash,
    export_event_id: 'EXP-VERIFY-001',
    qr_contract_version: 'legacy-0',
  });
});

test('v1 QR sends the exact versioned producer contract only after explicit verification', async ({ page }) => {
  let postCount = 0;
  let postedBody;
  await mockStatus(page);
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    postCount += 1;
    postedBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successPayloadForRequest(route.request())),
    });
  });

  const hash = 'f'.repeat(64);
  await page.goto(`${baseUrl}/verify.html#v=1&report=RPT-PRODUCER-001&h=${hash}&exp=EXP-PRODUCER-001`);
  await expect(page.locator('#verification-service-status')).toContainText('Endpoint ready');
  expect(postCount).toBe(0);
  await page.locator('#qr-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Artifact Record Match');
  expect(postedBody).toEqual({
    verification_contract_version: 'artifact-verification-v2',
    report_id: 'RPT-PRODUCER-001',
    artifact_hash: hash,
    export_event_id: 'EXP-PRODUCER-001',
    qr_contract_version: '1',
  });
  expect(postCount).toBe(1);
});

test('an actual backend-produced v1 URL is consumed without contract translation', async ({ page }) => {
  const producerUrl = process.env.AUXTHO_BACKEND_QR_URL;
  const fixtureB64 = process.env.AUXTHO_BACKEND_VERIFY_FIXTURE_B64;
  test.skip(
    !producerUrl || !fixtureB64,
    'Set AUXTHO_BACKEND_QR_URL and AUXTHO_BACKEND_VERIFY_FIXTURE_B64 from the backend producer for the cross-repository release check.',
  );
  const fixture = JSON.parse(Buffer.from(fixtureB64, 'base64').toString('utf8'));

  const produced = new URL(producerUrl);
  expect(produced.origin).toBe('https://auxtho.com');
  expect(produced.pathname).toBe('/verify.html');
  expect(produced.search).toBe('');
  expect(fixture.http_contract).toEqual({
    transport: 'ASGI_HTTP',
    status_route: 'GET /api/verify/status',
    verify_route: 'POST /api/verify',
    status_codes: [200, 200, 200, 200],
  });

  let postedBody;
  await mockStatus(page, 'operational', {
    statusOverrides: fixture.status_response,
    releaseSourceSha: fixture.identifier_response.release_tuple.public_site_source_sha,
  });
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    postedBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixture.identifier_response),
    });
  });

  await page.goto(`${baseUrl}${produced.pathname}${produced.hash}`);
  await expect(page.locator('#verification-service-status')).toContainText('Endpoint ready');
  await page.locator('#qr-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Artifact Record Match');
  expect(postedBody).toEqual({
    verification_contract_version: 'artifact-verification-v2',
    report_id: fixture.report_id,
    artifact_hash: fixture.artifact_hash,
    export_event_id: fixture.export_event_id,
    qr_contract_version: '1',
  });
  await expect(page.locator('#verify-result-grid')).toContainText(fixture.identifier_response.verification_outcome);
});

test('an actual backend-produced submitted-digest response is consumed without claiming API file-byte verification', async ({ page }) => {
  const producerUrl = process.env.AUXTHO_BACKEND_QR_URL;
  const fixtureB64 = process.env.AUXTHO_BACKEND_VERIFY_FIXTURE_B64;
  test.skip(
    !producerUrl || !fixtureB64,
    'Set AUXTHO_BACKEND_QR_URL and AUXTHO_BACKEND_VERIFY_FIXTURE_B64 from the backend producer for the cross-repository release check.',
  );
  const fixture = JSON.parse(Buffer.from(fixtureB64, 'base64').toString('utf8'));
  const produced = new URL(producerUrl);
  let postedBody;

  await mockStatus(page, 'operational', {
    statusOverrides: fixture.status_response,
    releaseSourceSha: fixture.digest_response.release_tuple.public_site_source_sha,
  });
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    postedBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixture.digest_response),
    });
  });

  await page.goto(`${baseUrl}${produced.pathname}${produced.hash}`);
  await expect(page.locator('#verification-service-status')).toContainText('Endpoint ready');
  await page.locator('#manual-artifact-file').setInputFiles({
    name: 'backend-produced-fixture.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(fixture.pdf_bytes_b64, 'base64'),
  });
  await page.locator('#manual-verify-btn').click();

  await expect(page.locator('#verify-result-title')).toHaveText('Artifact Digest Match');
  await expect(page.locator('#verify-result-grid')).toContainText('SUBMITTED_DIGEST_MATCH');
  await expect(page.locator('#verify-result-grid')).toContainText('Submitted File Digest MatchYES');
  await expect(page.locator('#verify-result-grid')).toContainText('API File Bytes VerificationNOT PERFORMED');
  await expect(page.locator('#verify-result-message')).toContainText('API received the digest, not the selected file bytes');
  expect(postedBody).toEqual({
    verification_contract_version: 'artifact-verification-v2',
    report_id: fixture.report_id,
    artifact_hash: fixture.artifact_hash,
    export_event_id: fixture.export_event_id,
    artifact_bytes_sha256: fixture.artifact_bytes_sha256,
    qr_contract_version: '1',
  });
});

test('an actual backend-produced digest mismatch remains unconfirmed and hides record metadata', async ({ page }) => {
  const producerUrl = process.env.AUXTHO_BACKEND_QR_URL;
  const fixtureB64 = process.env.AUXTHO_BACKEND_VERIFY_FIXTURE_B64;
  test.skip(
    !producerUrl || !fixtureB64,
    'Set AUXTHO_BACKEND_QR_URL and AUXTHO_BACKEND_VERIFY_FIXTURE_B64 from the backend producer for the cross-repository release check.',
  );
  const fixture = JSON.parse(Buffer.from(fixtureB64, 'base64').toString('utf8'));
  const produced = new URL(producerUrl);
  let postedBody;

  await mockStatus(page, 'operational', {
    statusOverrides: fixture.status_response,
    releaseSourceSha: fixture.digest_mismatch_response.release_tuple.public_site_source_sha,
  });
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    postedBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixture.digest_mismatch_response),
    });
  });

  await page.goto(`${baseUrl}${produced.pathname}${produced.hash}`);
  await page.locator('#manual-artifact-file').setInputFiles({
    name: 'backend-produced-modified-fixture.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(fixture.mismatched_pdf_bytes_b64, 'base64'),
  });
  await page.locator('#manual-verify-btn').click();

  await expect(page.locator('#verify-result-title')).toHaveText('Not confirmed');
  await expect(page.locator('#verify-result-grid')).toContainText('NO_MATCH');
  await expect(page.locator('#verify-result-grid')).not.toContainText(fixture.report_id);
  expect(postedBody).toEqual(fixture.digest_mismatch_request);
});

test('malformed, mixed, duplicate, incomplete, and unknown QR contracts fail before readiness or verification calls', async ({ browser }) => {
  const hash = 'a'.repeat(64);
  const valid = `report=RPT-STRICT-001&h=${hash}&exp=EXP-STRICT-001`;
  const cases = [
    `#v=2&${valid}`,
    `#v=1&report=RPT-STRICT-001&report=RPT-DUPLICATE&h=${hash}&exp=EXP-STRICT-001`,
    `#v=1&${valid}&extra=not-allowed`,
    `#v=1&report=RPT-STRICT-001&h=${hash}`,
    `?${valid}#v=1&${valid}`,
  ];

  for (const suffix of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let statusCount = 0;
    let postCount = 0;
    await mockStatus(page);
    page.on('request', (request) => {
      if (request.url().includes('/api/verify/status')) statusCount += 1;
      if (request.url().includes('/api/verify') && request.method() === 'POST') postCount += 1;
    });

    await page.goto(`${baseUrl}/verify.html${suffix}`);
    await expect(page.locator('#verification-service-status')).toHaveText('Verification unavailable');
    await expect(page.locator('#manual-verify-btn')).toBeDisabled();
    await expect(page.locator('#qr-verify-btn')).toBeDisabled();
    await expect(page.locator('#verify-error')).toContainText('malformed, incomplete, or uses an unsupported contract version');
    expect(statusCount).toBe(0);
    expect(postCount).toBe(0);
    await context.close();
  }
});

test('legacy unversioned QR cannot add a local file check', async ({ page }) => {
  let postCount = 0;
  await mockStatus(page);
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    postCount += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(successPayloadForRequest(route.request())) });
  });

  await page.goto(`${baseUrl}/verify.html#report=RPT-LEGACY-001&h=${'b'.repeat(64)}&exp=EXP-LEGACY-001`);
  await page.locator('#manual-artifact-file').setInputFiles({
    name: 'legacy.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-legacy-contract'),
  });
  await page.locator('#qr-verify-btn').click();
  await expect(page.locator('#verify-error')).toContainText('Legacy links do not support local file verification');
  expect(postCount).toBe(0);
});

test('manual controls use form semantics and one Enter action submits exactly once', async ({ page }) => {
  let postCount = 0;
  let postedBody;
  await mockStatus(page);
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    if (route.request().method() === 'POST') {
      postCount += 1;
      postedBody = route.request().postDataJSON();
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(successPayloadForRequest(route.request())) });
  });

  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#manual-verify-form')).toHaveJSProperty('tagName', 'FORM');
  await expect(page.locator('#manual-verify-btn')).toHaveAttribute('type', 'submit');
  await expect(page.locator('#manual-verify-btn')).toBeEnabled();
  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-artifact-hash').fill('8'.repeat(64));
  await page.locator('#manual-export-event-id').fill('EXP-VERIFY-001');
  await page.locator('#manual-artifact-hash').press('Enter');

  await expect(page.locator('#verify-result-title')).toHaveText('Artifact Record Match');
  expect(postCount).toBe(1);
  expect(postedBody).toEqual({
    verification_contract_version: 'artifact-verification-v2',
    report_id: 'RPT-VERIFY-001',
    artifact_hash: '8'.repeat(64),
    export_event_id: 'EXP-VERIFY-001',
    qr_contract_version: '1',
  });
});

test('invalid non-legacy artifact hashes never leave manual or QR controls busy', async ({ page }) => {
  let postCount = 0;
  await mockStatus(page);
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    postCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successPayloadForRequest(route.request())),
    });
  });

  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#manual-verify-btn')).toBeEnabled();
  await page.locator('#manual-report-id').fill('RPT-INVALID-HASH');
  await page.locator('#manual-artifact-hash').fill('not-a-hash');
  await page.locator('#manual-export-event-id').fill('EXP-INVALID-HASH');
  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-error')).toContainText('complete 64-character record binding checksum');
  await expect(page.locator('#manual-verify-btn')).toBeEnabled();
  await expect(page.locator('#manual-verify-btn')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#manual-verify-btn')).toHaveText('Verify Artifact');

  await page.goto(`${baseUrl}/verify.html#v=1&report=RPT-INVALID-HASH&h=still-not-a-hash&exp=EXP-INVALID-HASH`);
  // Fragment-only navigation on the same document does not rerun the page
  // bootstrap. Reload to model a QR link opening the verifier document.
  await page.reload();
  await expect(page.locator('#verification-service-status')).toHaveText('Verification unavailable');
  await expect(page.locator('#verify-error')).toContainText('malformed, incomplete, or uses an unsupported contract version');
  await expect(page.locator('#qr-verify-btn')).toBeDisabled();
  expect(postCount).toBe(0);
});

test('legacy 16-character bindings render a tombstone and never reach the API', async ({ page }) => {
  let postCount = 0;
  let statusCount = 0;
  await mockStatus(page);
  page.on('request', (request) => {
    if (request.url().includes('/api/verify/status')) statusCount += 1;
  });
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    postCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successPayloadForRequest(route.request())),
    });
  });

  const retiredHash = 'a'.repeat(16);
  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#manual-verify-btn')).toBeEnabled();
  await page.locator('#manual-report-id').fill('RPT-LEGACY-16');
  await page.locator('#manual-artifact-hash').fill(retiredHash);
  await page.locator('#manual-export-event-id').fill('EXP-LEGACY-16');
  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-error')).toContainText('16-character legacy artifact binding was retired on July 17, 2026');
  await expect(page.locator('#manual-verify-btn')).toBeEnabled();
  expect(postCount).toBe(0);

  const priorStatusCount = statusCount;
  await page.goto(`${baseUrl}/verify.html?report=RPT-LEGACY-16&h=${retiredHash}&exp=EXP-LEGACY-16`);
  await expect(page).toHaveURL(`${baseUrl}/verify.html`);
  await expect(page.locator('#legacy-binding-tombstone')).toBeVisible();
  await expect(page.locator('#legacy-binding-tombstone')).toContainText('retained only as a local tombstone');
  await expect(page.locator('#qr-verify-btn')).toBeDisabled();
  await expect(page.locator('#qr-verify-btn')).toHaveText('Legacy Binding Retired');
  await expect(page.locator('#qr-report-id')).toHaveText('Retired legacy link');
  await expect(page.locator('#qr-hash')).toHaveText('16-character binding retired');
  await expect(page.locator('#manual-report-id')).toHaveValue('');
  await expect(page.locator('#manual-artifact-hash')).toHaveValue('');
  await expect(page.locator('#manual-export-event-id')).toHaveValue('');
  await expect(page.locator('#manual-verify-btn')).toBeDisabled();
  await expect(page.locator('#verification-service-status')).toHaveText('Legacy link retired / no request sent');
  expect(postCount).toBe(0);
  expect(statusCount).toBe(priorStatusCount);

  await page.goto(`${baseUrl}/verify.html#report=RPT-LEGACY-FRAGMENT&h=${retiredHash}&exp=EXP-LEGACY-FRAGMENT`);
  await page.reload();
  await expect(page).toHaveURL(`${baseUrl}/verify.html`);
  await expect(page.locator('#legacy-binding-tombstone')).toBeVisible();
  await expect(page.locator('#manual-report-id')).toHaveValue('');
  await expect(page.locator('#manual-artifact-hash')).toHaveValue('');
  await expect(page.locator('#verification-service-status')).toHaveText('Legacy link retired / no request sent');
  expect(postCount).toBe(0);
  expect(statusCount).toBe(priorStatusCount);
});

test('matching rendered release identity enables verification with a cache-busted same-origin fetch', async ({ page }) => {
  let releaseRequest;
  await mockStatus(page, 'operational', {
    onReleaseRequest(request) {
      releaseRequest = request;
    },
  });

  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#manual-verify-btn')).toBeEnabled();
  expect(releaseRequest).toBeTruthy();
  const releaseUrl = new URL(releaseRequest.url());
  expect(releaseUrl.origin).toBe(baseUrl);
  expect(releaseUrl.pathname).toBe('/release.json');
  expect(releaseUrl.searchParams.get('cache_bust')).toMatch(/^\d+$/);
});

test('a missing, extra, or mismatched response release tuple disables verification and hides record metadata', async ({ browser }) => {
  const mutations = [
    (payload) => { delete payload.release_tuple; },
    (payload) => { payload.release_tuple.backend_source_sha = 'c'.repeat(40); },
    (payload) => { payload.release_tuple.unreviewed_field = 'unexpected'; },
    (payload) => { delete payload.verification_contract_version; },
    (payload) => { payload.verification_contract_version = 'artifact-verification-v1'; },
  ];

  for (const mutate of mutations) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockStatus(page);
    await page.route(`${baseUrl}/api/verify`, async (route) => {
      const payload = successPayloadForRequest(route.request());
      mutate(payload);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    await page.goto(`${baseUrl}/verify.html`);
    await page.locator('#manual-report-id').fill('RPT-TUPLE-001');
    await page.locator('#manual-artifact-hash').fill('7'.repeat(64));
    await page.locator('#manual-export-event-id').fill('EXP-TUPLE-001');
    await page.locator('#manual-verify-btn').click();
    await expect(page.locator('#verify-result-title')).toHaveText('Verification unavailable');
    await expect(page.locator('#verification-service-status')).toHaveText('Verification unavailable');
    await expect(page.locator('#verify-result-grid')).toBeEmpty();
    await expect(page.locator('#verify-error')).toContainText('release identity did not match');
    await context.close();
  }
});

test('missing backend release identity disables verification', async ({ page }) => {
  await mockStatus(page, 'operational', {
    statusOverrides: { public_site_source_sha: undefined, backend_source_sha: undefined },
    compatibleBackendSiteShas: [ROLLBACK_SITE_SHA, MATCHED_SITE_SHA],
  });
  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#verification-service-status')).toHaveText('Verification unavailable');
  await expect(page.locator('#manual-verify-btn')).toBeDisabled();
});

test('wildcard, duplicate, oversized, and non-current release history lists fail closed', async ({ browser }) => {
  const invalidCases = [
    { releasePayload: { source_sha: MATCHED_SITE_SHA, compatible_backend_site_shas: [MATCHED_SITE_SHA, '*'] } },
    { releasePayload: { source_sha: MATCHED_SITE_SHA, compatible_backend_site_shas: [MATCHED_SITE_SHA, MATCHED_SITE_SHA] } },
    { releasePayload: { source_sha: MATCHED_SITE_SHA, compatible_backend_site_shas: [MATCHED_SITE_SHA, ROLLBACK_SITE_SHA] } },
    { releasePayload: { source_sha: MATCHED_SITE_SHA, compatible_backend_site_shas: [MATCHED_SITE_SHA, ROLLBACK_SITE_SHA, 'c'.repeat(40)] } },
    { releasePayload: { source_sha: MATCHED_SITE_SHA, compatible_backend_site_shas: [ROLLBACK_SITE_SHA] } },
    { releasePayload: { source_sha: MATCHED_SITE_SHA.toUpperCase(), compatible_backend_site_shas: [MATCHED_SITE_SHA.toUpperCase()] } },
  ];
  for (const options of invalidCases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockStatus(page, 'operational', options);
    await page.goto(`${baseUrl}/verify.html`);
    await expect(page.locator('#verification-service-status')).toHaveText('Verification unavailable');
    await expect(page.locator('#manual-verify-btn')).toBeDisabled();
    await context.close();
  }
});

test('self-consistent static metadata cannot replace backend release identity', async ({ page }) => {
  await mockStatus(page, 'operational', {
    statusOverrides: { public_site_source_sha: undefined, backend_source_sha: undefined },
    releasePayload: { source_sha: ROLLBACK_SITE_SHA, compatible_backend_site_shas: [ROLLBACK_SITE_SHA] },
  });
  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#verification-service-status')).toHaveText('Verification unavailable');
  await expect(page.locator('#manual-verify-btn')).toBeDisabled();
});

test('malformed release metadata fails closed', async ({ page }) => {
  await mockStatus(page, 'operational', { releaseBody: 'not-json' });
  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#verification-service-status')).toHaveText('Verification unavailable');
  await expect(page.locator('#manual-verify-btn')).toBeDisabled();
});

test('missing release or release-history metadata fails closed', async ({ browser }) => {
  const cases = [
    { releasePayload: {} },
    { releasePayload: { source_sha: MATCHED_SITE_SHA } },
  ];
  for (const options of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockStatus(page, 'operational', options);
    await page.goto(`${baseUrl}/verify.html`);
    await expect(page.locator('#verification-service-status')).toHaveText('Verification unavailable');
    await expect(page.locator('#manual-verify-btn')).toBeDisabled();
    await context.close();
  }
});

test('verifier disclosure does not promise an application audit record for every submit', async ({ page }) => {
  await mockStatus(page);
  await page.goto(`${baseUrl}/verify.html`);
  const disclosure = page.locator('.manual-verify-panel .verification-disclosure')
    .filter({ hasText: 'not guaranteed for every submit' });
  await expect(disclosure).toHaveCount(1);
  await expect(disclosure).toContainText('not guaranteed for every submit');
  await expect(disclosure).toContainText('Infrastructure access and security logs are separate');
  await expect(disclosure).not.toContainText('records a verification/security audit event');
});

test('changing identifiers or the selected file invalidates a prior success result', async ({ page }) => {
  await mockStatus(page);
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successPayloadForRequest(route.request())),
    });
  });

  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#manual-verify-btn')).toBeEnabled();
  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-artifact-hash').fill('b'.repeat(64));
  await page.locator('#manual-export-event-id').fill('EXP-VERIFY-001');
  await page.locator('#manual-artifact-file').setInputFiles({ name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test-a') });
  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Artifact Digest Match');
  await expect(page.locator('#verify-result-grid')).toContainText('FILE');
  await expect(page.locator('#artifact-crypto-block')).toBeVisible();
  await expect(page.locator('#artifact-crypto-block')).toContainText('PILOT HASH ONLY');

  await page.locator('#manual-report-id').fill('RPT-VERIFY-CHANGED');
  await expect(page.locator('#verify-result')).toBeHidden();

  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Artifact Digest Match');
  await page.locator('#manual-artifact-file').setInputFiles({ name: 'b.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test-b') });
  await expect(page.locator('#verify-result')).toBeHidden();
});

test('an aborted stale response cannot restore an invalidated or older result', async ({ page }) => {
  await mockStatus(page);
  let requestCount = 0;
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    requestCount += 1;
    const body = route.request().postDataJSON();
    if (requestCount === 1) await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(successPayloadForRequest(route.request(), { reportId: body.report_id })),
      });
    } catch (error) {
      // The first route may already be canceled by the browser-side AbortController.
    }
  });

  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#manual-verify-btn')).toBeEnabled();
  await page.locator('#manual-report-id').fill('RPT-STALE-ONE');
  await page.locator('#manual-artifact-hash').fill('d'.repeat(64));
  await page.locator('#manual-export-event-id').fill('EXP-STALE-001');
  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Verifying Artifact...');

  await page.locator('#manual-report-id').fill('RPT-CURRENT-TWO');
  await expect(page.locator('#verify-result')).toBeHidden();
  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Artifact Record Match');
  await expect(page.locator('#verify-result-grid')).toContainText('RPT-CURRENT-TWO');

  await page.waitForTimeout(400);
  await expect(page.locator('#verify-result-grid')).toContainText('RPT-CURRENT-TWO');
  await expect(page.locator('#verify-result-grid')).not.toContainText('RPT-STALE-ONE');
  await expect(page.locator('#verification-service-status')).toContainText('Endpoint ready');
  expect(requestCount).toBe(2);
});

test('verification-unavailable response disables controls and removes prior metadata', async ({ page }) => {
  await mockStatus(page);
  let attempts = 0;
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(successPayloadForRequest(route.request())) });
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: { error: 'VERIFICATION_UNAVAILABLE', message: 'Verification unavailable.' } }),
    });
  });

  await page.goto(`${baseUrl}/verify.html`);
  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-artifact-hash').fill('c'.repeat(64));
  await page.locator('#manual-export-event-id').fill('EXP-VERIFY-001');
  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Artifact Record Match');

  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verification-service-status')).toHaveText('Verification unavailable');
  await expect(page.locator('#manual-verify-btn')).toBeDisabled();
  await expect(page.locator('#verify-result-grid')).toBeEmpty();
  await expect(page.locator('#verify-result-title')).toHaveText('Verification not completed');
});

test('a bounded timeout restores the button and permits a successful retry', async ({ page }) => {
  await page.addInitScript(() => {
    window.__AUXTHO_VERIFY_TIMEOUT_MS__ = 100;
  });
  await mockStatus(page);
  let attempts = 0;
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    attempts += 1;
    const body = route.request().postDataJSON();
    if (attempts === 1) await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(successPayloadForRequest(route.request(), { reportId: body.report_id })),
      });
    } catch (error) {
      // The timed-out request may already be canceled by AbortController.
    }
  });

  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#manual-verify-btn')).toBeEnabled();
  await page.locator('#manual-report-id').fill('RPT-TIMEOUT-001');
  await page.locator('#manual-artifact-hash').fill('e'.repeat(64));
  await page.locator('#manual-export-event-id').fill('EXP-TIMEOUT-001');
  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Verification timed out');
  await expect(page.locator('#manual-verify-btn')).toBeEnabled();

  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Artifact Record Match');
  expect(attempts).toBe(2);
});

test('non-operational readiness keeps verification disabled', async ({ page }) => {
  await mockStatus(page, 'unavailable');
  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#verification-service-status')).toHaveText('Verification unavailable');
  await expect(page.locator('#manual-verify-btn')).toBeDisabled();
});

test('unknown preview origins fail closed instead of contacting production', async ({ page }) => {
  const productionRequests = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://api.auxtho.com/')) productionRequests.push(request.url());
  });
  await page.goto(`${baseUrl.replace('127.0.0.1', 'preview.localhost')}/verify.html`);
  await expect(page.locator('#verification-service-status')).toHaveText('Verification unavailable');
  await expect(page.locator('#manual-verify-btn')).toBeDisabled();
  expect(productionRequests).toEqual([]);
});

test('contradictory recorded signature evidence fails closed', async ({ page }) => {
  await mockStatus(page, 'operational', { statusOverrides: { signing_mode: 'production_signed' } });
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successPayloadForRequest(route.request(), {
        verificationMode: 'production_signed',
        signature: {
          enabled: true,
          present: false,
          signature_recorded_valid: true,
          certificate_chain_recorded_status: 'verified',
          timestamp_present: false,
          timestamp_recorded_valid: true,
          validation_basis: 'durable_object_live_cryptographic_revalidation',
          live_cryptographic_revalidation_performed: true,
          recorded_reason_code: 'SIG_VALID',
          signature_valid: true,
          certificate_chain_status: 'verified',
          timestamp_valid: true,
          reason_code: 'SIG_VALID',
        },
      })),
    });
  });
  await page.goto(`${baseUrl}/verify.html`);
  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-artifact-hash').fill('f'.repeat(64));
  await page.locator('#manual-export-event-id').fill('EXP-VERIFY-001');
  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Not confirmed');
  await expect(page.locator('#verify-result-grid')).not.toContainText('AT EXPORT');
  await expect(page.locator('#verify-result-grid')).toContainText('NO_MATCH');
});

test('record verification mode must match the reviewed readiness tuple signing mode', async ({ page }) => {
  await mockStatus(page, 'operational');
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successPayloadForRequest(route.request(), {
        verificationMode: 'production_signed',
        responseReleaseTuple: releaseTuple({ signing_mode: 'pilot_hash_only' }),
        signature: {
          enabled: true,
          present: true,
          signature_recorded_valid: true,
          signature_format: 'PKCS7_CMS_DETACHED_DER',
          certificate_chain_recorded_status: 'verified',
          timestamp_present: true,
          timestamp_recorded_valid: true,
          validation_basis: 'durable_object_live_cryptographic_revalidation',
          recorded_evidence_type: 'PRODUCTION_SIGNED',
          live_cryptographic_revalidation_performed: true,
          recorded_reason_code: 'SIG_VALID',
          signature_valid: true,
          certificate_chain_status: 'verified',
          timestamp_valid: true,
          reason_code: 'SIG_VALID',
        },
      })),
    });
  });

  await page.goto(`${baseUrl}/verify.html`);
  await page.locator('#manual-report-id').fill('RPT-MODE-MISMATCH');
  await page.locator('#manual-artifact-hash').fill('5'.repeat(64));
  await page.locator('#manual-export-event-id').fill('EXP-MODE-MISMATCH');
  await page.locator('#manual-verify-btn').click();

  await expect(page.locator('#verify-result-title')).toHaveText('Not confirmed');
  await expect(page.locator('#verify-result-grid')).toContainText('NO_MATCH');
  await expect(page.locator('body')).not.toContainText('PKCS#7');
  await expect(page.locator('body')).not.toContainText('PUBLIC TSA');
});

test('readiness hints alone never produce PKCS7 or public TSA claims', async ({ page }) => {
  await mockStatus(page, 'operational', {
    statusOverrides: {
      mode: 'production',
      signing_mode: 'production_signed',
      timestamp_provider: 'public_tsa',
    },
  });

  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#manual-verify-btn')).toBeEnabled();
  await expect(page.locator('body')).not.toContainText('PKCS#7');
  await expect(page.locator('body')).not.toContainText('PUBLIC TSA');
});

test('incomplete signed metadata fails closed without crypto capability labels', async ({ page }) => {
  await mockStatus(page, 'operational', { statusOverrides: { signing_mode: 'production_signed' } });
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    const payload = successPayloadForRequest(route.request(), {
      verificationMode: 'production_signed',
      signature: {
        enabled: true,
        present: true,
        signature_recorded_valid: true,
        signature_format: 'PKCS7_CMS_DETACHED_DER',
        certificate_chain_recorded_status: 'verified',
        timestamp_present: true,
        timestamp_recorded_valid: true,
        validation_basis: 'durable_object_live_cryptographic_revalidation',
        live_cryptographic_revalidation_performed: true,
        recorded_reason_code: 'SIG_VALID',
        signature_valid: true,
        certificate_chain_status: 'verified',
        timestamp_valid: true,
        reason_code: 'SIG_VALID',
      },
    });
    delete payload.signature.live_cryptographic_revalidation_performed;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });

  await page.goto(`${baseUrl}/verify.html`);
  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-artifact-hash').fill('6'.repeat(64));
  await page.locator('#manual-export-event-id').fill('EXP-VERIFY-001');
  await page.locator('#manual-verify-btn').click();

  await expect(page.locator('#verify-result-title')).toHaveText('Not confirmed');
  await expect(page.locator('body')).not.toContainText('PKCS#7');
  await expect(page.locator('body')).not.toContainText('PUBLIC TSA');
});

test('production signed state requires and labels API live cryptographic revalidation', async ({ page }) => {
  await mockStatus(page, 'operational', { statusOverrides: { signing_mode: 'production_signed' } });
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successPayloadForRequest(route.request(), {
        verificationMode: 'production_signed',
        signature: {
          enabled: true,
          present: true,
          signature_recorded_valid: true,
          signature_format: 'PKCS7_CMS_DETACHED_DER',
          certificate_chain_recorded_status: 'verified',
          timestamp_present: true,
          timestamp_recorded_valid: true,
          validation_basis: 'durable_object_live_cryptographic_revalidation',
          live_cryptographic_revalidation_performed: true,
          recorded_reason_code: 'SIG_VALID',
          signature_valid: true,
          certificate_chain_status: 'verified',
          timestamp_valid: true,
          reason_code: 'SIG_VALID',
        },
      })),
    });
  });

  await page.goto(`${baseUrl}/verify.html`);
  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-artifact-hash').fill('3'.repeat(64));
  await page.locator('#manual-export-event-id').fill('EXP-VERIFY-001');
  await page.locator('#manual-verify-btn').click();

  await expect(page.locator('#verify-result-title')).toHaveText('Artifact Record Match');
  await expect(page.locator('#verify-result-grid')).toContainText('PKCS#7 CMS DETACHED DER (API RECORD)');
  await expect(page.locator('#verify-result-grid')).toContainText('API LIVE REVALIDATION: VALID / BROWSER DID NOT REVALIDATE');
  await expect(page.locator('#verify-result-grid')).toContainText('API LIVE REVALIDATION: VERIFIED / BROWSER DID NOT REVALIDATE');
  await expect(page.locator('#verify-result-grid')).toContainText('DURABLE OBJECT LIVE CRYPTOGRAPHIC REVALIDATION');
  await expect(page.locator('#verify-result-grid')).toContainText('PRODUCTION SIGNED');
  await expect(page.locator('#verify-result-grid')).toContainText('RFC3161 HTTP');
  const browserRevalidationRow = page.locator('#verify-result-grid .verify-result-row').filter({ hasText: 'Browser Cryptographic Revalidation' });
  await expect(browserRevalidationRow).toContainText('NOT PERFORMED');
  await expect(page.locator('#verify-result-grid')).not.toContainText('PUBLIC TSA');
});

test('production signed registry-only metadata cannot substitute for API live revalidation', async ({ page }) => {
  await mockStatus(page, 'operational', { statusOverrides: { signing_mode: 'production_signed' } });
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successPayloadForRequest(route.request(), {
        verificationMode: 'production_signed',
        signature: {
          enabled: true,
          present: true,
          signature_recorded_valid: true,
          signature_format: 'PKCS7_CMS_DETACHED_DER',
          certificate_chain_recorded_status: 'verified',
          timestamp_present: true,
          timestamp_recorded_valid: true,
          validation_basis: 'registry_record',
          live_cryptographic_revalidation_performed: false,
          recorded_reason_code: 'SIG_VALID',
          signature_valid: true,
          certificate_chain_status: 'verified',
          timestamp_valid: true,
          reason_code: 'SIG_VALID',
        },
      })),
    });
  });

  await page.goto(`${baseUrl}/verify.html`);
  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-artifact-hash').fill('3'.repeat(64));
  await page.locator('#manual-export-event-id').fill('EXP-VERIFY-001');
  await page.locator('#manual-verify-btn').click();

  await expect(page.locator('#verify-result-title')).toHaveText('Not confirmed');
  await expect(page.locator('#verify-result-grid')).toContainText('NO_MATCH');
  await expect(page.locator('#verify-result-grid')).not.toContainText('PRODUCTION SIGNED');
});

test('legacy bare verified true cannot authorize a displayed match', async ({ page }) => {
  await mockStatus(page);
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    const legacy = successPayloadForRequest(route.request());
    delete legacy.verification_outcome;
    legacy.verified = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(legacy) });
  });

  await page.goto(`${baseUrl}/verify.html`);
  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-artifact-hash').fill('4'.repeat(64));
  await page.locator('#manual-export-event-id').fill('EXP-VERIFY-001');
  await page.locator('#manual-verify-btn').click();

  await expect(page.locator('#verify-result-title')).toHaveText('Not confirmed');
  await expect(page.locator('#verify-result-grid')).toContainText('NO_MATCH');
  await expect(page.locator('#verify-result-grid')).not.toContainText('RPT-VERIFY-001');
});

test('contradictory outcome, scope, durable-binding, and digest flags fail closed', async ({ browser }) => {
  const cases = [
    {
      name: 'identifier request cannot claim a submitted digest match',
      mutate(payload) {
        payload.verification_outcome = 'SUBMITTED_DIGEST_MATCH';
        payload.reason = 'SUBMITTED_DIGEST_MATCH';
      },
    },
    {
      name: 'issued-artifact outcome requires a durable delivery binding',
      mutate(payload) {
        payload.verification_outcome = 'ISSUED_ARTIFACT_RECORD_MATCH';
        payload.reason = 'ISSUED_RECORD_CONFIRMED';
      },
    },
    {
      name: 'registry-only outcome cannot claim a durable delivery binding',
      mutate(payload) {
        payload.artifact.durable_delivery_binding_recorded = true;
      },
    },
    {
      name: 'identifier response cannot claim that file bytes were verified',
      mutate(payload) {
        payload.file_bytes_verified = true;
      },
    },
  ];

  for (const contractCase of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockStatus(page);
    await page.route(`${baseUrl}/api/verify`, async (route) => {
      const payload = successPayloadForRequest(route.request());
      contractCase.mutate(payload);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    await page.goto(`${baseUrl}/verify.html`);
    await page.locator('#manual-report-id').fill('RPT-CONTRADICTORY-001');
    await page.locator('#manual-artifact-hash').fill('4'.repeat(64));
    await page.locator('#manual-export-event-id').fill('EXP-CONTRADICTORY-001');
    await page.locator('#manual-verify-btn').click();
    await expect(page.locator('#verify-result-title'), contractCase.name).toHaveText('Not confirmed');
    await expect(page.locator('#verify-result-grid')).toContainText('NO_MATCH');
    await context.close();
  }
});

test('missing or mismatched artifact hash echoes fail closed', async ({ browser }) => {
  const cases = [
    {
      submitted: 'a'.repeat(64),
      mutate(payload) {
        delete payload.artifact_hash;
      },
    },
    {
      submitted: 'b'.repeat(64),
      mutate(payload) {
        payload.artifact_hash = 'c'.repeat(64);
      },
    },
  ];

  for (const contractCase of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockStatus(page);
    await page.route(`${baseUrl}/api/verify`, async (route) => {
      const payload = successPayloadForRequest(route.request());
      contractCase.mutate(payload);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    await page.goto(`${baseUrl}/verify.html`);
    await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
    await page.locator('#manual-artifact-hash').fill(contractCase.submitted);
    await page.locator('#manual-export-event-id').fill('EXP-VERIFY-001');
    await page.locator('#manual-verify-btn').click();
    await expect(page.locator('#verify-result-title')).toHaveText('Not confirmed');
    await expect(page.locator('#verify-result-grid')).toContainText('NO_MATCH');
    await expect(page.locator('#verify-result-grid')).not.toContainText('RPT-VERIFY-001');
    await context.close();
  }
});

test('prefixed uppercase artifact hashes are canonicalized before comparison', async ({ page }) => {
  let submittedHash;
  await mockStatus(page);
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    const body = route.request().postDataJSON();
    submittedHash = body.artifact_hash;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successPayloadForRequest(route.request())),
    });
  });

  await page.goto(`${baseUrl}/verify.html`);
  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-artifact-hash').fill(`sha256:${'D'.repeat(64)}`);
  await page.locator('#manual-export-event-id').fill('EXP-VERIFY-001');
  await page.locator('#manual-verify-btn').click();

  expect(submittedHash).toBe('d'.repeat(64));
  await expect(page.locator('#verify-result-title')).toHaveText('Artifact Record Match');
  await expect(page.locator('#verify-result-grid')).not.toContainText('NO_MATCH');
});

test('missing or mismatched uploaded-file SHA-256 echoes fail closed', async ({ browser }) => {
  const mutations = [
    (payload) => delete payload.artifact_bytes_sha256,
    (payload) => { payload.artifact_bytes_sha256 = '0'.repeat(64); },
  ];

  for (const mutate of mutations) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let submittedFileHash;
    await mockStatus(page);
    await page.route(`${baseUrl}/api/verify`, async (route) => {
      const requestBody = route.request().postDataJSON();
      submittedFileHash = requestBody.artifact_bytes_sha256;
      const payload = successPayloadForRequest(route.request());
      mutate(payload);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    await page.goto(`${baseUrl}/verify.html`);
    await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
    await page.locator('#manual-artifact-hash').fill('9'.repeat(64));
    await page.locator('#manual-export-event-id').fill('EXP-VERIFY-001');
    await page.locator('#manual-artifact-file').setInputFiles({
      name: 'binding.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-file-binding'),
    });
    await page.locator('#manual-verify-btn').click();
    await expect(page.locator('#verify-result-title')).toHaveText('Not confirmed');
    await expect(page.locator('#verify-result-grid')).toContainText('NO_MATCH');
    expect(submittedFileHash).toMatch(/^[0-9a-f]{64}$/);
    await context.close();
  }
});

test('response scope and digest flags must match a submitted local file digest', async ({ page }) => {
  await mockStatus(page);
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successPayloadForRequest(route.request(), {
        verificationScope: 'IDENTIFIER',
        verificationOutcome: 'REGISTRY_RECORD_MATCH',
        reason: 'REGISTRY_RECORD_MATCH',
        submittedFileDigestMatch: false,
      })),
    });
  });

  await page.goto(`${baseUrl}/verify.html`);
  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-artifact-hash').fill('5'.repeat(64));
  await page.locator('#manual-export-event-id').fill('EXP-VERIFY-001');
  await page.locator('#manual-artifact-file').setInputFiles({
    name: 'scope.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-scope-mismatch'),
  });
  await page.locator('#manual-verify-btn').click();

  await expect(page.locator('#verify-result-title')).toHaveText('Not confirmed');
  await expect(page.locator('#verify-result-grid')).toContainText('NO_MATCH');
});

test('submitted-digest success fails closed when the API claims file bytes, omits digest confirmation, or changes comparison method', async ({ browser }) => {
  const mutations = [
    (payload) => { payload.file_bytes_verified = true; },
    (payload) => { payload.submitted_file_digest_match = false; },
    (payload) => { payload.file_verification.method = 'FILE_BYTES_RECEIVED'; },
    (payload) => {
      payload.verification_outcome = 'REGISTRY_RECORD_MATCH';
      payload.reason = 'REGISTRY_RECORD_MATCH';
    },
  ];

  for (const mutate of mutations) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockStatus(page);
    await page.route(`${baseUrl}/api/verify`, async (route) => {
      const payload = successPayloadForRequest(route.request());
      mutate(payload);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });
    await page.goto(`${baseUrl}/verify.html`);
    await page.locator('#manual-report-id').fill('RPT-DIGEST-CONTRACT-001');
    await page.locator('#manual-artifact-hash').fill('8'.repeat(64));
    await page.locator('#manual-export-event-id').fill('EXP-DIGEST-CONTRACT-001');
    await page.locator('#manual-artifact-file').setInputFiles({
      name: 'digest-contract.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-digest-contract'),
    });
    await page.locator('#manual-verify-btn').click();
    await expect(page.locator('#verify-result-title')).toHaveText('Not confirmed');
    await expect(page.locator('#verify-result-grid')).toContainText('NO_MATCH');
    await context.close();
  }
});

test('a mismatched response record identifier fails closed', async ({ page }) => {
  await mockStatus(page);
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successPayloadForRequest(route.request(), { reportId: 'RPT-OTHER' })),
    });
  });
  await page.goto(`${baseUrl}/verify.html`);
  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-artifact-hash').fill('1'.repeat(64));
  await page.locator('#manual-export-event-id').fill('EXP-VERIFY-001');
  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Not confirmed');
  await expect(page.locator('#verify-result-grid')).toContainText('NO_MATCH');
  await expect(page.locator('#verify-result-grid')).not.toContainText('RPT-OTHER');
});

test('retired direct query identifiers are scrubbed and never prefetched', async ({ page }) => {
  await mockStatus(page);
  await page.goto(`${baseUrl}/verify.html?report=RPT-LEGACY&h=${'a'.repeat(64)}&exp=EXP-LEGACY`);
  await expect(page).toHaveURL(`${baseUrl}/verify.html`);
  await expect(page.locator('#manual-report-id')).toHaveValue('');
  await expect(page.locator('#manual-artifact-hash')).toHaveValue('');
  await expect(page.locator('#qr-verify')).not.toHaveClass(/qr-card-visible/);
});

test('verifier fetches reject redirects instead of forwarding identifiers', async ({ page }) => {
  const externalRequests = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://example.invalid/')) externalRequests.push(request.url());
  });
  await page.route(`${baseUrl}/api/verify/status`, async (route) => {
    await route.fulfill({
      status: 302,
      headers: { Location: 'https://example.invalid/collect' },
      body: '',
    });
  });

  await page.goto(`${baseUrl}/verify.html#report=RPT-REDIRECT&h=${'a'.repeat(64)}`);
  await expect(page.locator('#verification-service-status')).toHaveText('Verification unavailable');
  await expect(page.locator('#manual-verify-btn')).toBeDisabled();
  expect(externalRequests).toEqual([]);
});

test('identifier-bearing verification POST rejects redirects', async ({ page }) => {
  const externalRequests = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://example.invalid/')) externalRequests.push(request.url());
  });
  await mockStatus(page);
  await page.route(`${baseUrl}/api/verify`, async (route) => {
    await route.fulfill({ status: 302, headers: { Location: 'https://example.invalid/collect' }, body: '' });
  });
  await page.goto(`${baseUrl}/verify.html`);
  await page.locator('#manual-report-id').fill('RPT-REDIRECT');
  await page.locator('#manual-artifact-hash').fill('2'.repeat(64));
  await page.locator('#manual-export-event-id').fill('EXP-REDIRECT');
  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Verification unavailable');
  expect(externalRequests).toEqual([]);
});
