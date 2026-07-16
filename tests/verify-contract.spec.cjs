const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');

test.describe.configure({ mode: 'serial' });

const root = path.resolve(__dirname, '..');
let server;
let baseUrl;

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function statusPayload(status = 'operational') {
  return {
    status,
    mode: 'pilot',
    signing_mode: 'pilot_hash_only',
    timestamp_provider: 'none',
    registry_configured: status === 'operational',
  };
}

function successPayload({
  fileVerified = false,
  reportId = 'RPT-VERIFY-001',
  exportEventId = 'EXP-VERIFY-001',
  verificationMode = 'pilot_hash_only',
  signature = {},
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
    recorded_reason_code: 'SIGNATURE_NOT_ENABLED',
  };
  return {
    verification_outcome: 'RECORDED_MATCH',
    record_match_confirmed: true,
    artifact_hash_match: true,
    file_bytes_verified: fileVerified,
    verification_scope: fileVerified ? 'FILE' : 'IDENTIFIER',
    artifact: {
      report_id: reportId,
      export_event_id: exportEventId,
      exported_at: '2026-07-16T00:00:00Z',
    },
    signature: { ...defaultSignature, ...signature },
    mode: 'pilot',
    verification_mode: verificationMode,
    timestamp_provider: verificationMode === 'production_signed' ? 'public_tsa' : (verificationMode === 'local_signed' ? 'local_mock' : 'none'),
  };
}

async function mockStatus(page, status = 'operational') {
  await page.route('http://127.0.0.1:8000/api/verify/status', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(statusPayload(status)) });
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
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(successPayload()) });
  });

  const hash = 'a'.repeat(64);
  await page.goto(`${baseUrl}/verify.html?report=RPT-VERIFY-001&h=${hash}&exp=EXP-VERIFY-001`);
  await expect(page.locator('#verification-service-status')).toContainText('Endpoint ready');
  expect(postCount).toBe(0);
  await expect(page.locator('#manual-report-id')).toHaveValue('RPT-VERIFY-001');

  await page.locator('#qr-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Artifact Record Match');
  await expect(page.locator('#verify-result-grid')).toContainText('RECORDED_MATCH');
  await expect(page.locator('#verify-result-grid')).toContainText('IDENTIFIER');
  expect(postCount).toBe(1);
});

test('changing identifiers or the selected file invalidates a prior success result', async ({ page }) => {
  await mockStatus(page);
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successPayload({ fileVerified: Boolean(body.artifact_bytes_sha256) })),
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
        body: JSON.stringify(successPayload({ reportId: body.report_id })),
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
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(successPayload()) });
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
        body: JSON.stringify(successPayload({ reportId: body.report_id })),
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
      body: JSON.stringify(successPayload({
        verificationMode: 'production_signed',
        signature: {
          enabled: true,
          present: false,
          signature_recorded_valid: true,
          certificate_chain_recorded_status: 'verified',
          timestamp_present: false,
          timestamp_recorded_valid: true,
          validation_basis: 'registry_record',
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
  await expect(page.locator('#verify-result-grid')).not.toContainText('RECORDED VALID');
  await expect(page.locator('#verify-result-grid')).toContainText('NO_MATCH');
});

test('complete signed registry state is labeled recorded and not revalidated', async ({ page }) => {
  await mockStatus(page);
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(successPayload({
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
  await expect(page.locator('#verify-result-grid')).toContainText('RECORDED VALID / NOT REVALIDATED');
  await expect(page.locator('#verify-result-grid')).toContainText('RECORDED VERIFIED / NOT REVALIDATED');
  await expect(page.locator('#verify-result-grid')).toContainText('RECORDED SIG_VALID / NOT REVALIDATED');
  const validClaims = await page.locator('#verify-result-grid .verify-result-value').allTextContents();
  expect(validClaims.filter((value) => value.includes('VALID')).every(
    (value) => value.includes('RECORDED') && value.includes('NOT REVALIDATED')
  )).toBe(true);
});

test('legacy bare verified true cannot authorize a displayed match', async ({ page }) => {
  await mockStatus(page);
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
    const legacy = successPayload();
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

test('response scope must match whether file bytes were requested', async ({ page }) => {
  await mockStatus(page);
  await page.route('http://127.0.0.1:8000/api/verify', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(successPayload()) });
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
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(successPayload({ reportId: 'RPT-OTHER' })) });
  });
  await page.goto(`${baseUrl}/verify.html`);
  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-artifact-hash').fill('1'.repeat(64));
  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Not confirmed');
  await expect(page.locator('#verify-result-grid')).toContainText('NO_MATCH');
  await expect(page.locator('#verify-result-grid')).not.toContainText('RPT-OTHER');
});

test('partial verification parameters are removed from browser history', async ({ page }) => {
  await mockStatus(page);
  await page.goto(`${baseUrl}/verify.html?report=RPT-PARTIAL`);
  await expect(page).toHaveURL(`${baseUrl}/verify.html`);
  await expect(page.locator('#manual-report-id')).toHaveValue('');
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

  await page.goto(`${baseUrl}/verify.html?report=RPT-REDIRECT&h=${'a'.repeat(64)}`);
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
