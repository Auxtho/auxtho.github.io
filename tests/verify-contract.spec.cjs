const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');

test.use({ channel: 'chrome' });
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

function successPayload({ fileVerified = false, reportId = 'RPT-VERIFY-001' } = {}) {
  return {
    verified: true,
    record_match_confirmed: true,
    artifact_hash_match: true,
    file_bytes_verified: fileVerified,
    verification_scope: fileVerified ? 'record_and_file_bytes' : 'registry_identifiers_only',
    artifact: {
      report_id: reportId,
      export_event_id: 'EXP-VERIFY-001',
      exported_at: '2026-07-16T00:00:00Z',
    },
    signature: {
      enabled: false,
      present: false,
      signature_valid: false,
      signature_format: null,
      certificate_chain_status: 'not_enabled',
      timestamp_present: false,
      timestamp_valid: false,
      reason_code: 'SIGNATURE_NOT_ENABLED',
    },
    mode: 'pilot',
    verification_mode: 'pilot_hash_only',
    timestamp_provider: 'none',
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
  await expect(page.locator('#verify-result-title')).toHaveText('Artifact File Verified');

  await page.locator('#manual-report-id').fill('RPT-VERIFY-CHANGED');
  await expect(page.locator('#verify-result')).toBeHidden();

  await page.locator('#manual-report-id').fill('RPT-VERIFY-001');
  await page.locator('#manual-verify-btn').click();
  await expect(page.locator('#verify-result-title')).toHaveText('Artifact File Verified');
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

test('non-operational readiness keeps verification disabled', async ({ page }) => {
  await mockStatus(page, 'unavailable');
  await page.goto(`${baseUrl}/verify.html`);
  await expect(page.locator('#verification-service-status')).toHaveText('Verification unavailable');
  await expect(page.locator('#manual-verify-btn')).toBeDisabled();
});
