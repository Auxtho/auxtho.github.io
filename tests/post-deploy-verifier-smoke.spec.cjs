const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const origin = process.env.PUBLIC_SITE_ORIGIN;
const sourceSha = process.env.EXPECTED_SITE_SHA;
const runId = process.env.GITHUB_RUN_ID;
const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
const evidenceDirectory = path.resolve(__dirname, '..', 'post-deploy-evidence');

test.describe.configure({ mode: 'serial', timeout: 45_000 });

test('deployed verifier loads over HTTPS and performs no identifier-bearing request', async ({ page }) => {
  expect(origin).toBe('https://auxtho.com');
  expect(sourceSha).toMatch(/^[0-9a-f]{40}$/);

  const verificationPosts = [];
  const pageErrors = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/verify')) {
      verificationPosts.push(request.url());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const cacheBust = `${sourceSha}-${runId}-${runAttempt}-browser`;
  const response = await page.goto(`${origin}/verify.html?cache_bust=${cacheBust}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });

  expect(response).not.toBeNull();
  expect(response.status()).toBe(200);
  expect(new URL(page.url()).protocol).toBe('https:');
  await expect(page.locator('#manual-verify-form')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#verification-service-status')).toContainText('Endpoint ready', { timeout: 20_000 });
  await expect(page.locator('#manual-verify-btn')).toBeEnabled();
  await expect(page.locator('#manual-report-id')).toHaveValue('');
  await expect(page.locator('#manual-artifact-hash')).toHaveValue('');
  expect(verificationPosts).toEqual([]);
  expect(pageErrors).toEqual([]);

  fs.mkdirSync(evidenceDirectory, { recursive: true });
  fs.writeFileSync(path.join(evidenceDirectory, 'browser-smoke.json'), `${JSON.stringify({
    checked_at: new Date().toISOString(),
    source_sha: sourceSha,
    url: page.url(),
    response_status: response.status(),
    verification_status: await page.locator('#verification-service-status').textContent(),
    identifier_bearing_post_count: verificationPosts.length,
    page_errors: pageErrors,
  }, null, 2)}\n`);
});
