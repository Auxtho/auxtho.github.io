const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { findBrokenImageSources } = require('../scripts/release/browser-readback.cjs');

const origin = process.env.PUBLIC_SITE_ORIGIN;
const sourceSha = process.env.EXPECTED_SITE_SHA;
const evidenceDirectory = path.resolve(__dirname, '..', 'post-deploy-evidence');

test.describe.configure({ mode: 'serial', timeout: 120_000 });

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
    { path: '/evidence-notes.html', status: 200, locator: 'main' },
    { path: '/lineage/isp/', status: 200, locator: 'main' },
    { path: '/security/ardamire/', status: 200, locator: 'main' },
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
    const imageStates = await page.locator('img').evaluateAll((images) => images.map((image) => {
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
    expect(findBrokenImageSources(imageStates)).toEqual([]);
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

test('public verifier route is absent and triggers no verification API request', async ({ page }) => {
  expect(origin).toBe('https://auxtho.com');
  expect(sourceSha).toMatch(/^[0-9a-f]{40}$/);

  const apiRequests = [];
  const pageErrors = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/verify')) apiRequests.push(request.url());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const response = await page.goto(
    `${origin}/verify.html?report=RPT-RETIRED&h=${'a'.repeat(64)}&exp=EXP-RETIRED`,
    { waitUntil: 'networkidle', timeout: 25_000 },
  );

  expect(response).not.toBeNull();
  expect(response.status()).toBe(404);
  expect(apiRequests).toEqual([]);
  expect(pageErrors).toEqual([]);

  fs.mkdirSync(evidenceDirectory, { recursive: true });
  fs.writeFileSync(path.join(evidenceDirectory, 'retired-verifier-smoke.json'), `${JSON.stringify({
    checked_at: new Date().toISOString(),
    source_sha: sourceSha,
    response_status: response.status(),
    api_request_count: apiRequests.length,
    page_errors: pageErrors,
  }, null, 2)}\n`);
});
