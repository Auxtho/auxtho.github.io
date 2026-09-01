const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { findBrokenImageSources } = require('../scripts/release/browser-readback.cjs');

const origin = process.env.PUBLIC_SITE_ORIGIN;
const sourceSha = process.env.EXPECTED_SITE_SHA;
const evidenceDirectory = path.resolve(__dirname, '..', 'post-deploy-evidence');

test.describe.configure({ mode: 'serial', timeout: 120_000 });

function isExpectedVisionMediaCancellation(request) {
  const url = new URL(request.url());
  return request.resourceType() === 'media'
    && request.failure()?.errorText === 'net::ERR_ABORTED'
    && /^\/assets\/vision-film\/auxtho-incident-led-hero-(?:mobile-)?v9\.mp4$/.test(url.pathname)
    && /^[0-9a-f]{64}$/.test(url.searchParams.get('sha256') || '');
}

test('public pages render with packaged styles and images without CSP or same-origin resource failures', async ({ page }) => {
  expect(origin).toBe('https://auxtho.com');
  expect(sourceSha).toMatch(/^[0-9a-f]{40}$/);

  const failures = [];
  const expectedVisionMediaCancellations = [];
  const consoleErrors = [];
  const pageErrors = [];
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin !== origin) return;
    if (isExpectedVisionMediaCancellation(request)) {
      expectedVisionMediaCancellations.push({
        error: request.failure()?.errorText,
        method: request.method(),
        url: request.url(),
      });
      return;
    }
    failures.push(`${request.method()} ${request.url()} (${request.failure()?.errorText || 'unknown failure'})`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const pages = [
    { path: '/', status: 200, locator: 'main' },
    { path: '/evidence-notes.html', status: 200, locator: 'main' },
    { path: '/lineage/isp/', status: 200, locator: 'main' },
    { path: '/proof/release-core/', status: 200, locator: 'main' },
    { path: '/proof/release-core/transcript/', status: 200, locator: '#transcript' },
    { path: '/proof/singapore-source-review/', status: 200, locator: 'main' },
    { path: '/capabilities/', status: 200, locator: 'main' },
    { path: '/capabilities/exact-source-traceability/', status: 200, locator: 'main' },
    { path: '/capabilities/regulatory-source-pack/', status: 200, locator: 'main' },
    { path: '/capabilities/ai-review-exception-queue/', status: 200, locator: 'main' },
    { path: '/capabilities/decision-receipts-audit-history/', status: 200, locator: 'main' },
    { path: '/capabilities/incident-reconstruction-recovery/', status: 200, locator: 'main' },
    { path: '/capabilities/ardamire-defense-layer/', status: 200, locator: 'main' },
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
    if (item.path === '/proof/release-core/') {
      const proofLayout = await page.evaluate(() => ({
        inlineStyleCount: document.querySelectorAll('style, [style]').length,
        titleFontSize: Number.parseFloat(getComputedStyle(document.querySelector('.proof-hero h1')).fontSize),
        logoWidth: document.querySelector('.proof-logo').getBoundingClientRect().width,
        logoHeight: document.querySelector('.proof-logo').getBoundingClientRect().height,
        logoHomePath: new URL(document.querySelector('.proof-logo').closest('a').href).pathname,
        proofStyleSheets: [...document.styleSheets]
          .map((sheet) => sheet.href)
          .filter((href) => href && href.includes('/assets/proof-release-core.css')),
      }));
      expect(proofLayout.inlineStyleCount).toBe(0);
      expect(proofLayout.titleFontSize).toBeGreaterThanOrEqual(70);
      expect(proofLayout.logoWidth).toBeGreaterThanOrEqual(190);
      expect(proofLayout.logoWidth).toBeLessThanOrEqual(198);
      expect(proofLayout.logoHeight).toBeGreaterThanOrEqual(23.5);
      expect(proofLayout.logoHeight).toBeLessThanOrEqual(24.5);
      expect(proofLayout.logoHomePath).toBe('/');
      expect(proofLayout.proofStyleSheets).toHaveLength(1);
    }
    const images = page.locator('img');
    const imageCount = await images.count();
    for (let index = 0; index < imageCount; index += 1) {
      const image = images.nth(index);
      const inactiveSampleLightboxPlaceholder = await image.evaluate((element) => {
        const lightbox = element.closest('dialog#sample-lightbox');
        return element.id === 'sample-lightbox-image' && Boolean(lightbox) && !lightbox.open;
      });
      if (inactiveSampleLightboxPlaceholder) continue;
      await image.scrollIntoViewIfNeeded();
      await expect.poll(
        () => image.evaluate((element) => element.complete && element.naturalWidth > 0),
        { message: `image did not load or decode: ${await image.getAttribute('src')}` },
      ).toBe(true);
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
  expect(expectedVisionMediaCancellations.length).toBeLessThanOrEqual(2);
  expect(consoleErrors.filter((message) => /content security policy|refused to load|blocked/i.test(message))).toEqual([]);
  expect(pageErrors).toEqual([]);
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  fs.writeFileSync(path.join(evidenceDirectory, 'public-pages-browser-smoke.json'), `${JSON.stringify({
    checked_at: new Date().toISOString(),
    source_sha: sourceSha,
    pages: checked,
    same_origin_request_failures: failures,
    expected_vision_media_cancellations: expectedVisionMediaCancellations,
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
