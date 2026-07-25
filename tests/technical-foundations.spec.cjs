const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { expect, test } = require('@playwright/test');

test.describe.configure({ mode: 'serial' });

const root = path.resolve(__dirname, '..');
let server;
let baseUrl;

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relativePath = pathname === '/'
      ? 'index.html'
      : pathname.endsWith('/')
        ? `${pathname.replace(/^\/+/, '')}index.html`
        : pathname.replace(/^\/+/, '');
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
      response.writeHead(200, { 'Content-Type': contentType(filePath) });
      response.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function expectNoHorizontalOverflow(page) {
  await expect.poll(() => page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))).toEqual(expect.objectContaining({
    clientWidth: expect.any(Number),
    scrollWidth: expect.any(Number),
  }));
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function openWithoutRuntimeErrors(page, route) {
  const runtimeErrors = [];
  const failedRequests = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
  expect(response.status()).toBe(200);
  expect(runtimeErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
}

test('homepage keeps separate public references secondary and readable on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithoutRuntimeErrors(page, '/index.html#foundations');

  const section = page.locator('#foundations');
  await expect(section).toBeVisible();
  await expect(section.getByRole('heading', {
    level: 2,
    name: 'Inspect each claim at its actual evidence level.',
  })).toBeVisible();
  await expect(section.locator('.technical-reference-item')).toHaveCount(3);

  const boxes = await section.locator('.technical-reference-item').evaluateAll((cards) => cards.map((card) => {
    const box = card.getBoundingClientRect();
    return { height: box.height, left: box.left, top: box.top, width: box.width };
  }));
  expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1);
  expect(Math.max(...boxes.map((box) => box.height)) - Math.min(...boxes.map((box) => box.height))).toBeLessThan(2);
  expect(boxes.every((box) => box.width >= 280)).toBe(true);
  await expectNoHorizontalOverflow(page);
});

test('homepage public references stack without overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWithoutRuntimeErrors(page, '/index.html#foundations');

  const section = page.locator('#foundations');
  const boxes = await section.locator('.technical-reference-item').evaluateAll((cards) => cards.map((card) => {
    const box = card.getBoundingClientRect();
    return { bottom: box.bottom, left: box.left, right: box.right, top: box.top };
  }));
  expect(boxes).toHaveLength(3);
  expect(boxes[1].top).toBeGreaterThanOrEqual(boxes[0].bottom - 1);
  expect(boxes[2].top).toBeGreaterThanOrEqual(boxes[1].bottom - 1);
  expect(boxes.every((box) => box.left >= 0 && box.right <= 390)).toBe(true);
  await expectNoHorizontalOverflow(page);
});

for (const detail of [
  {
    route: '/lineage/isp/',
    title: 'ISP records the research lineage behind a bounded AI workflow.',
    flowCount: 5,
  },
  {
    route: '/security/ardamire/',
    title: 'Ardamire is designed to separate investigation context from decision authority.',
    flowCount: 0,
  },
]) {
  test(`${detail.route} renders a bounded desktop detail page`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWithoutRuntimeErrors(page, detail.route);
    await expect(page.getByRole('heading', { level: 1, name: detail.title })).toBeVisible();
    await expect(page.locator('.technical-status-line')).toBeVisible();
    await expect(page.locator('.technical-flow-step')).toHaveCount(detail.flowCount);
    await expect(page.getByRole('link', { name: 'Back to public references' })).toHaveAttribute(
      'href',
      '/#foundations',
    );
    await expectNoHorizontalOverflow(page);
  });

  test(`${detail.route} remains legible and vertically ordered on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWithoutRuntimeErrors(page, detail.route);

    const heading = page.getByRole('heading', { level: 1, name: detail.title });
    await expect(heading).toBeVisible();
    const headingFits = await heading.evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
    expect(headingFits).toBe(true);

    const steps = await page.locator('.technical-flow-step').evaluateAll((items) => items.map((item) => {
      const box = item.getBoundingClientRect();
      return { bottom: box.bottom, left: box.left, right: box.right, top: box.top };
    }));
    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index].top).toBeGreaterThanOrEqual(steps[index - 1].bottom - 1);
    }
    expect(steps.every((box) => box.left >= 0 && box.right <= 390)).toBe(true);
    if (detail.route === '/security/ardamire/') {
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
      await expect(page.locator('.technical-status-line')).toContainText('LIVE_VISIBLE_ONLY');
      await expect(page.locator('.technical-status-line')).toContainText('zero investigation cases');
    }
    await expectNoHorizontalOverflow(page);
  });
}
