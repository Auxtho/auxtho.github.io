const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');

test.describe.configure({ mode: 'serial' });

const root = path.resolve(__dirname, '..');
let server;
let baseUrl;
const MATCHED_SITE_SHA = 'a'.repeat(40);

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
    public_site_source_sha: MATCHED_SITE_SHA,
    ...overrides,
  };
}

function successPayload({
  fileVerified = false,
  reportId = 'RPT-VERIFY-001',
  exportEventId = 'EXP-VERIFY-001',
  artifactHash,
  artifactBytesSha256,
  verificationMode = 'pilot_hash_only',
  signature = {},
  publicMode,
  timestampProvider,
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
  const payload = {
    verification_outcome: 'RECORDED_MATCH',
    record_match_confirmed: true,
    artifact_hash_match: true,
    artifact_hash: artifactHash,
    file_bytes_verified: fileVerified,
    verification_scope: fileVerified ? 'FILE' : 'IDENTIFIER',
    artifact: {
      report_id: reportId,
      export_event_id: exportEventId,
      exported_at: '2026-07-16T00:00:00Z',
    },
    signature: { ...defaultSignature, ...signature },
    mode: publicMode || (verificationMode === 'production_signed' ? 'production' : 'pilot'),
    verification_mode: verificationMode,
    timestamp_provider: timestampProvider || (verificationMode === 'production_signed' ? 'rfc3161_http' : (verificationMode === 'local_signed' ? 'local_mock' : 'none')),
  };
  if (artifactBytesSha256 !== undefined) payload.artifact_bytes_sha256 = artifactBytesSha256;
  return payload;
}

function successPayloadForRequest(request, overrides = {}) {
  const body = request.postDataJSON();
  return successPayload({
    artifactHash: body.artifact_hash,
    artifactBytesSha256: body.artifact_bytes_sha256,
    fileVerified: Boolean(body.artifact_bytes_sha256),
    ...overrides,
  });
}

async function mockStatus(page, status = 'operational', options = {}) {
  const statusOverrides = options.statusOverrides || {};
  await page.route('http://127.0.0.1:8000/api/verify/status', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(statusPayload(status, statusOverrides)) });
  });
  await page.route('**/release.json*', async (route) => {
    if (options.onReleaseRequest) options.onReleaseRequest(route.request());
    const releasePayload = Object.prototype.hasOwnProperty.call(options, 'releasePayload')
      ? options.releasePayload
      : { source_sha: statusOverrides.public_site_source_sha || MATCHED_SITE_SHA };
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

test('QR parameters prefill but never submit before an explicit click', async ({ page }) => {
  let postCount = 0;
  await mockStatus(page);
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
    if (route.request().method() === 'POST') postCount += 1;
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
  await expect(page.locator('#verify-result-grid')).toContainText('RECORDED_MATCH');
  await expect(page.locator('#verify-result-grid')).toContainText('IDENTIFIER');
  expect(postCount).toBe(1);
});

test('manual controls use form semantics and one Enter action submits exactly once', async ({ page }) => {
  let postCount = 0;
  await mockStatus(page);
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
    if (route.request().method() === 'POST') postCount += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(successPayloadForRequest(route.request())) });
  });

  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#manual-verify-form')).toHaveJSProperty('tagName', 'FORM');
  await expect(page.locator('#manual-verify-btn')).toHaveAttribute('type', 'submit');
  await expect(page.locator('#manual-verify-btn')).toBeEnabled();
  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-artifact-hash').fill('8'.repeat(64));
  await page.locator('#manual-artifact-hash').press('Enter');

  await expect(page.locator('#verify-result-title')).toHaveText('Artifact Record Match');
  expect(postCount).toBe(1);
});

test('invalid artifact hashes never leave manual or QR controls busy', async ({ page }) => {
  let postCount = 0;
  await mockStatus(page);
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
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
  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-error')).toContainText('complete record binding checksum');
  await expect(page.locator('#manual-verify-btn')).toBeEnabled();
  await expect(page.locator('#manual-verify-btn')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#manual-verify-btn')).toHaveText('Verify Artifact');

  await page.goto(`${baseUrl}/verify.html#report=RPT-INVALID-HASH&h=still-not-a-hash`);
  // Fragment-only navigation on the same document does not rerun the page
  // bootstrap. Reload to model a QR link opening the verifier document.
  await page.reload();
  await expect(page.locator('#qr-verify-btn')).toBeEnabled();
  await page.locator('#qr-verify-btn').click();
  await expect(page.locator('#verify-error')).toContainText('complete record binding checksum');
  await expect(page.locator('#qr-verify-btn')).toBeEnabled();
  await expect(page.locator('#qr-verify-btn')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#qr-verify-btn')).toHaveText('Run Verification');
  expect(postCount).toBe(0);
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

test('release identity mismatch fails closed', async ({ page }) => {
  await mockStatus(page, 'operational', { releasePayload: { source_sha: 'b'.repeat(40) } });
  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#verification-service-status')).toHaveText('Verification unavailable');
  await expect(page.locator('#manual-verify-btn')).toBeDisabled();
  await expect(page.locator('#qr-verify-btn')).toBeDisabled();
});

test('malformed release metadata fails closed', async ({ page }) => {
  await mockStatus(page, 'operational', { releaseBody: 'not-json' });
  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#verification-service-status')).toHaveText('Verification unavailable');
  await expect(page.locator('#manual-verify-btn')).toBeDisabled();
});

test('missing release or backend source metadata fails closed', async ({ browser }) => {
  const cases = [
    { releasePayload: {} },
    { statusOverrides: { public_site_source_sha: undefined } },
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
  const disclosure = page.locator('.manual-verify-panel .verification-disclosure');
  await expect(disclosure).toContainText('not guaranteed for every submit');
  await expect(disclosure).toContainText('Infrastructure access and security logs are separate');
  await expect(disclosure).not.toContainText('records a verification/security audit event');
});

test('changing identifiers or the selected file invalidates a prior success result', async ({ page }) => {
  await mockStatus(page);
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
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
  await expect(page.locator('#verify-result-title')).toHaveText('Artifact File Match');
  await expect(page.locator('#verify-result-grid')).toContainText('FILE');

  await page.locator('#manual-report-id').fill('RPT-VERIFY-CHANGED');
  await expect(page.locator('#verify-result')).toBeHidden();

  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Artifact File Match');
  await page.locator('#manual-artifact-file').setInputFiles({ name: 'b.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test-b') });
  await expect(page.locator('#verify-result')).toBeHidden();
});

test('an aborted stale response cannot restore an invalidated or older result', async ({ page }) => {
  await mockStatus(page);
  let requestCount = 0;
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
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
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
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
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
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
  await mockStatus(page);
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
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
          validation_basis: 'registry_record',
          live_cryptographic_revalidation_performed: true,
          recorded_reason_code: 'SIG_VALID',
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
  await mockStatus(page);
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
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
        validation_basis: 'registry_record',
        recorded_reason_code: 'SIG_VALID',
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

test('complete signed registry state is labeled recorded and not revalidated', async ({ page }) => {
  await mockStatus(page);
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
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
          recorded_reason_code: 'SIG_VALID',
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
  await expect(page.locator('#verify-result-grid')).toContainText('API RECORDED AS VALID AT EXPORT / NOT REVALIDATED BY THIS BROWSER');
  await expect(page.locator('#verify-result-grid')).toContainText('API RECORDED AS VERIFIED AT EXPORT / NOT REVALIDATED BY THIS BROWSER');
  await expect(page.locator('#verify-result-grid')).toContainText('API RECORDED: SIG_VALID / NOT REVALIDATED BY THIS BROWSER');
  await expect(page.locator('#verify-result-grid')).toContainText('PRODUCTION SIGNED');
  await expect(page.locator('#verify-result-grid')).toContainText('RFC3161 HTTP');
  const liveRevalidationRow = page.locator('#verify-result-grid .verify-result-row').filter({ hasText: 'Live Cryptographic Revalidation' });
  await expect(liveRevalidationRow).toContainText('NOT PERFORMED');
  await expect(page.locator('#verify-result-grid')).not.toContainText('PUBLIC TSA');
  const validClaims = await page.locator('#verify-result-grid .verify-result-value').allTextContents();
  expect(validClaims.filter((value) => value.includes('RECORDED AS VALID')).every(
    (value) => value.includes('AT EXPORT') && value.includes('NOT REVALIDATED BY THIS BROWSER')
  )).toBe(true);
});

test('legacy bare verified true cannot authorize a displayed match', async ({ page }) => {
  await mockStatus(page);
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
    const legacy = successPayloadForRequest(route.request());
    delete legacy.verification_outcome;
    legacy.verified = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(legacy) });
  });

  await page.goto(`${baseUrl}/verify.html`);
  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-artifact-hash').fill('4'.repeat(64));
  await page.locator('#manual-verify-btn').click();

  await expect(page.locator('#verify-result-title')).toHaveText('Not confirmed');
  await expect(page.locator('#verify-result-grid')).toContainText('NO_MATCH');
  await expect(page.locator('#verify-result-grid')).not.toContainText('RPT-VERIFY-001');
});

test('missing, mismatched, or normalized artifact hash echoes fail closed', async ({ browser }) => {
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
    {
      submitted: `sha256:${'D'.repeat(64)}`,
      mutate(payload) {
        payload.artifact_hash = 'd'.repeat(64);
      },
    },
  ];

  for (const contractCase of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockStatus(page);
    await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
      const payload = successPayloadForRequest(route.request());
      contractCase.mutate(payload);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    await page.goto(`${baseUrl}/verify.html`);
    await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
    await page.locator('#manual-artifact-hash').fill(contractCase.submitted);
    await page.locator('#manual-verify-btn').click();
    await expect(page.locator('#verify-result-title')).toHaveText('Not confirmed');
    await expect(page.locator('#verify-result-grid')).toContainText('NO_MATCH');
    await expect(page.locator('#verify-result-grid')).not.toContainText('RPT-VERIFY-001');
    await context.close();
  }
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
    await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
      const requestBody = route.request().postDataJSON();
      submittedFileHash = requestBody.artifact_bytes_sha256;
      const payload = successPayloadForRequest(route.request());
      mutate(payload);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    await page.goto(`${baseUrl}/verify.html`);
    await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
    await page.locator('#manual-artifact-hash').fill('9'.repeat(64));
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

test('response scope must match whether file bytes were requested', async ({ page }) => {
  await mockStatus(page);
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successPayloadForRequest(route.request(), { fileVerified: false })),
    });
  });

  await page.goto(`${baseUrl}/verify.html`);
  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-artifact-hash').fill('5'.repeat(64));
  await page.locator('#manual-artifact-file').setInputFiles({
    name: 'scope.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-scope-mismatch'),
  });
  await page.locator('#manual-verify-btn').click();

  await expect(page.locator('#verify-result-title')).toHaveText('Not confirmed');
  await expect(page.locator('#verify-result-grid')).toContainText('NO_MATCH');
});

test('a mismatched response record identifier fails closed', async ({ page }) => {
  await mockStatus(page);
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successPayloadForRequest(route.request(), { reportId: 'RPT-OTHER' })),
    });
  });
  await page.goto(`${baseUrl}/verify.html`);
  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-artifact-hash').fill('1'.repeat(64));
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
  await page.route('http://127.0.0.1:8000/api/verify/status', async (route) => {
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
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
    await route.fulfill({ status: 302, headers: { Location: 'https://example.invalid/collect' }, body: '' });
  });
  await page.goto(`${baseUrl}/verify.html`);
  await page.locator('#manual-report-id').fill('RPT-REDIRECT');
  await page.locator('#manual-artifact-hash').fill('2'.repeat(64));
  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Verification unavailable');
  expect(externalRequests).toEqual([]);
});
