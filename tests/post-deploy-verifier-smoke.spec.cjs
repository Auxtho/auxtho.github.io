const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const origin = process.env.PUBLIC_SITE_ORIGIN;
const sourceSha = process.env.EXPECTED_SITE_SHA;
const runId = process.env.GITHUB_RUN_ID;
const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
const evidenceDirectory = path.resolve(__dirname, '..', 'post-deploy-evidence');

test.describe.configure({ mode: 'serial', timeout: 45_000 });

test('public pages render with packaged styles and images without CSP or same-origin resource failures', async ({ page }) => {
  expect(origin).toBe('https://auxtho.com');
  expect(sourceSha).toMatch(/^[0-9a-f]{40}$/);

  const failures = [];
  const consoleErrors = [];
  const pageErrors = [];
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin === origin) failures.push(`${request.method()} ${request.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const pages = [
    { path: '/', status: 200, locator: 'main' },
    { path: '/privacy.html', status: 200, locator: 'main' },
    { path: '/terms.html', status: 200, locator: 'main' },
    { path: '/__auxtho_release_missing_page__', status: 404, locator: 'body' },
  ];
  const checked = [];
  for (const item of pages) {
    const url = new URL(item.path, origin);
    url.searchParams.set('sha256_readback', sourceSha);
    const response = await page.goto(url.toString(), { waitUntil: 'networkidle', timeout: 25_000 });
    expect(response).not.toBeNull();
    expect(response.status()).toBe(item.status);
    await expect(page.locator(item.locator)).toBeVisible();
    const styleSheets = await page.evaluate(() => [...document.styleSheets].map((sheet) => sheet.href).filter(Boolean));
    expect(styleSheets.length).toBeGreaterThan(0);
    for (const stylesheet of styleSheets.filter((href) => new URL(href).origin === origin)) {
      expect(stylesheet).toMatch(/\?sha256=[0-9a-f]{64}$/);
    }
    const brokenImages = await page.locator('img').evaluateAll((images) => images
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.getAttribute('src')));
    expect(brokenImages).toEqual([]);
    checked.push({ path: item.path, status: response.status(), style_sheet_count: styleSheets.length });
  }

  expect(failures).toEqual([]);
  expect(consoleErrors.filter((message) => /content security policy|refused to load|blocked/i.test(message))).toEqual([]);
  expect(pageErrors).toEqual([]);
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  fs.writeFileSync(path.join(evidenceDirectory, 'public-pages-browser-smoke.json'), `${JSON.stringify({
    checked_at: new Date().toISOString(),
    source_sha: sourceSha,
    pages: checked,
    same_origin_request_failures: failures,
    csp_console_errors: consoleErrors,
    page_errors: pageErrors,
  }, null, 2)}\n`);
});

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

test('deployed query-form legacy binding is scrubbed into a tombstone without any API request', async ({ page }) => {
  expect(origin).toBe('https://auxtho.com');
  expect(sourceSha).toMatch(/^[0-9a-f]{40}$/);

  const apiRequests = [];
  const pageErrors = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/verify')) apiRequests.push(request.url());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const retiredHash = 'a'.repeat(16);
  const response = await page.goto(
    `${origin}/verify.html?report=RPT-RETIRED-QUERY&h=${retiredHash}&exp=EXP-RETIRED-QUERY`,
    { waitUntil: 'domcontentloaded', timeout: 20_000 },
  );

  expect(response).not.toBeNull();
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(`${origin}/verify.html`);
  await expect(page.locator('#legacy-binding-tombstone')).toBeVisible();
  await expect(page.locator('#legacy-binding-tombstone')).toContainText('start readiness or comparison API requests');
  await expect(page.locator('#qr-verify-btn')).toBeDisabled();
  await expect(page.locator('#manual-report-id')).toHaveValue('');
  await expect(page.locator('#manual-artifact-hash')).toHaveValue('');
  await expect(page.locator('#manual-export-event-id')).toHaveValue('');
  await expect(page.locator('#verification-service-status')).toHaveText('Legacy link retired / no request sent');
  expect(apiRequests).toEqual([]);
  expect(pageErrors).toEqual([]);

  fs.mkdirSync(evidenceDirectory, { recursive: true });
  fs.writeFileSync(path.join(evidenceDirectory, 'legacy-query-tombstone-smoke.json'), `${JSON.stringify({
    checked_at: new Date().toISOString(),
    source_sha: sourceSha,
    url_after_scrub: page.url(),
    response_status: response.status(),
    tombstone_visible: true,
    api_request_count: apiRequests.length,
    page_errors: pageErrors,
  }, null, 2)}\n`);
});
