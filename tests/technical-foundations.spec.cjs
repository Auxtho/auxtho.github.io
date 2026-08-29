const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { expect, test } = require('@playwright/test');

test.describe.configure({ mode: 'serial' });

const root = path.resolve(__dirname, '..');
const visionPosterPaths = new Set([
  '/assets/vision-film/auxtho-incident-led-hero-v9-poster.png',
  '/assets/vision-film/auxtho-incident-led-hero-mobile-v9-poster.png',
]);
let server;
let baseUrl;

function contrastRatio(foreground, background) {
  const parse = (value) => {
    const channels = value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
    if (!channels || channels.length !== 3) throw new Error(`Unsupported CSS color: ${value}`);
    return channels.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
  };
  const luminance = (channels) => (
    (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2])
  );
  const foregroundLuminance = luminance(parse(foreground));
  const backgroundLuminance = luminance(parse(background));
  const light = Math.max(foregroundLuminance, backgroundLuminance);
  const dark = Math.min(foregroundLuminance, backgroundLuminance);
  return (light + 0.05) / (dark + 0.05);
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.mp4')) return 'video/mp4';
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
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    const isResponsivePosterSwap = request.resourceType() === 'image'
      && failure?.errorText === 'net::ERR_ABORTED'
      && visionPosterPaths.has(new URL(request.url()).pathname);
    const isInactiveVisionMediaCancellation = request.resourceType() === 'media'
      && failure?.errorText === 'net::ERR_ABORTED'
      && /\/assets\/vision-film\/auxtho-incident-led-hero-(?:mobile-)?v9\.mp4$/.test(
        new URL(request.url()).pathname,
      );
    if (!isResponsivePosterSwap && !isInactiveVisionMediaCancellation) {
      failedRequests.push(`${request.url()} (${failure?.errorText || 'unknown failure'})`);
    }
  });
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'load' });
  await page.waitForTimeout(150);
  expect(response.status()).toBe(200);
  expect(runtimeErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
}

test('homepage shows the product proposition before the desktop vision film', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithoutRuntimeErrors(page, '/index.html');

  const film = page.locator('[data-vision-film]');
  const video = film.locator('video');
  await expect(film).toBeVisible();
  const provenance = film.locator('.vision-film-provenance');
  await expect(provenance).toBeVisible();
  await expect(provenance).toContainText('Editorial reconstructions from public records.');
  await expect(provenance).toContainText('Auxtho was not involved in either event.');
  await expect(provenance.getByRole('link', { name: 'Department of Finance FOI 25-26/084' }))
    .toHaveAttribute('href', 'https://www.finance.gov.au/sites/default/files/foi-25-26-084-document-1.pdf');
  await expect(provenance.getByRole('link', { name: 'Ayinde and Al-Haroun [2025] EWHC 1383 (Admin)' }))
    .toHaveAttribute(
      'href',
      'https://www.judiciary.uk/wp-content/uploads/2025/06/Ayinde-v-London-Borough-of-Haringey-and-Al-Haroun-v-Qatar-National-Bank.pdf',
    );
  const sectionTops = await page.locator('.sales-hero, #why-now, [data-vision-film], #how-it-works')
    .evaluateAll((sections) => sections.map((section) => (
      section.getBoundingClientRect().top + window.scrollY
    )));
  expect(sectionTops).toHaveLength(4);
  expect(sectionTops[0]).toBeLessThan(900);
  expect(sectionTops[1]).toBeGreaterThan(sectionTops[0]);
  expect(sectionTops[2]).toBeGreaterThan(sectionTops[1]);
  expect(sectionTops[3]).toBeGreaterThan(sectionTops[2]);

  await film.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((element) => ({
    currentSrc: element.currentSrc,
    duration: element.duration,
    height: element.videoHeight,
    width: element.videoWidth,
  }))).toEqual(expect.objectContaining({
    currentSrc: expect.stringContaining('auxtho-incident-led-hero-v9.mp4'),
    duration: 26,
    height: 1080,
    width: 1920,
  }));
  await expect.poll(() => video.evaluate((element) => !element.paused && element.currentTime > 0)).toBe(true);
  await expect(film).toHaveClass(/has-film-frame/);

  await expectNoHorizontalOverflow(page);
});

test('homepage shows the product proposition before the mobile vision film without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWithoutRuntimeErrors(page, '/index.html');

  const film = page.locator('[data-vision-film]');
  const video = film.locator('video');
  const provenance = film.locator('.vision-film-provenance');
  const sectionTops = await page.locator('.sales-hero, #why-now, [data-vision-film], #how-it-works')
    .evaluateAll((sections) => sections.map((section) => (
      section.getBoundingClientRect().top + window.scrollY
    )));
  expect(sectionTops).toHaveLength(4);
  expect(sectionTops[0]).toBeLessThan(844);
  expect(sectionTops[1]).toBeGreaterThan(sectionTops[0]);
  expect(sectionTops[2]).toBeGreaterThan(sectionTops[1]);
  expect(sectionTops[3]).toBeGreaterThan(sectionTops[2]);

  const heroButtons = await page.locator('.sales-hero-actions .sales-button')
    .evaluateAll((buttons) => buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { bottom: box.bottom, height: box.height, left: box.left, right: box.right, top: box.top };
    }));
  expect(heroButtons).toHaveLength(3);
  expect(heroButtons.slice(1).every((box, index) => (
    box.top >= heroButtons[index].bottom - 1
  ))).toBe(true);
  expect(heroButtons.every((box) => box.height >= 44 && box.left >= 0 && box.right <= 390)).toBe(true);

  await film.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((element) => ({
    currentSrc: element.currentSrc,
    height: element.videoHeight,
    width: element.videoWidth,
  }))).toEqual(expect.objectContaining({
    currentSrc: expect.stringContaining('auxtho-incident-led-hero-mobile-v9.mp4'),
    height: 1920,
    width: 1080,
  }));
  const controlHeights = await film.locator('.vision-film-toggle, .vision-film-continue')
    .evaluateAll((controls) => controls.map((control) => control.getBoundingClientRect().height));
  expect(controlHeights.every((height) => height >= 44)).toBe(true);
  await expect(provenance).toBeVisible();
  const provenanceCopy = await provenance.locator('p, li').evaluateAll((elements) => elements.map((element) => ({
    fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  })));
  expect(provenanceCopy.every((item) => item.fontSize >= 14)).toBe(true);
  expect(provenanceCopy.every((item) => item.lineHeight > item.fontSize)).toBe(true);

  await expectNoHorizontalOverflow(page);
});

test('homepage vision film respects reduced motion until the visitor explicitly plays it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await openWithoutRuntimeErrors(page, '/index.html');

  const film = page.locator('[data-vision-film]');
  const video = film.locator('video');
  const toggle = film.getByRole('button', { name: 'Play film' });
  await expect(toggle).toBeVisible();
  await expect(video).toHaveJSProperty('paused', true);
  await expect(film).not.toHaveClass(/has-film-frame/);

  await film.scrollIntoViewIfNeeded();
  await toggle.click();
  await expect.poll(() => video.evaluate((element) => !element.paused && element.currentTime > 0)).toBe(true);
  await expect(film).toHaveClass(/has-film-frame/);
  await expect(film.getByRole('button', { name: 'Pause film' })).toBeVisible();
});

test('homepage keeps technical references secondary and readable on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithoutRuntimeErrors(page, '/index.html#research');

  const section = page.locator('#research');
  await expect(section).toBeVisible();
  await expect(section.getByRole('heading', {
    level: 2,
    name: 'Deeper technical work, outside the first buyer story.',
  })).toBeVisible();
  await expect(section.locator('.sales-foundation')).toHaveCount(3);

  const boxes = await section.locator('.sales-foundation').evaluateAll((cards) => cards.map((card) => {
    const box = card.getBoundingClientRect();
    return { height: box.height, left: box.left, top: box.top, width: box.width };
  }));
  expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1);
  expect(Math.max(...boxes.map((box) => box.height)) - Math.min(...boxes.map((box) => box.height))).toBeLessThan(2);
  expect(boxes.every((box) => box.width >= 280)).toBe(true);
  await expectNoHorizontalOverflow(page);
});

test('homepage technical references stack without overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWithoutRuntimeErrors(page, '/index.html#research');

  const section = page.locator('#research');
  const boxes = await section.locator('.sales-foundation').evaluateAll((cards) => cards.map((card) => {
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
    title: 'Intent Synchronization Protocol (ISP)',
    flowCount: 5,
  },
  {
    route: '/security/ardamire/',
    title: 'Ardamire Defense Layer',
    flowCount: 0,
  },
]) {
  test(`${detail.route} renders a bounded desktop detail page`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWithoutRuntimeErrors(page, detail.route);
    await expect(page.getByRole('heading', { level: 1, name: detail.title })).toBeVisible();
    await expect(page.locator('.technical-status-line')).toBeVisible();
    await expect(page.locator('.technical-flow-step')).toHaveCount(detail.flowCount);
    await expect(page.getByRole('link', { name: 'Back to Auxtho' })).toHaveAttribute(
      'href',
      '/',
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
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
      await expect(page.locator('.technical-status-line')).toContainText(
        'Detect',
      );
      await expect(page.locator('body')).not.toContainText('Ardamire Workbench');
      await expect(page.locator('body')).not.toContainText('Ardamire Watch');
      await expect(page.locator('body')).not.toContainText('Ardamire Agent');
      await expect(page.locator('body')).not.toContainText('Dated publisher observation');
    } else {
      await expect(page.locator('body')).toContainText(
        'Historically, Auxtho Core described the broader execution-control architecture.',
      );
      await expect(page.locator('body')).toContainText('Inspect the public ISP proof package');
    }
    await expectNoHorizontalOverflow(page);
  });
}

test('Ardamire motion stays idle, pauses at human review, and requires explicit continuation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithoutRuntimeErrors(page, '/security/ardamire/');

  const motion = page.locator('[data-ardamire-motion]');
  await expect(motion).toHaveAttribute('data-state', 'idle');
  await expect(motion.locator('[data-ardamire-stage]')).toHaveCount(6);
  await expect(motion.locator('.is-active')).toHaveCount(0);

  await motion.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(motion).toHaveAttribute('data-state', 'playing');
  await expect(motion.locator('[data-ardamire-status]')).toHaveText('Detect');
  await expect(motion.locator('.is-active')).toHaveCount(1);

  await motion.getByRole('button', { name: 'Pause' }).click();
  await expect(motion).toHaveAttribute('data-state', 'paused');
  await expect(motion.locator('[data-ardamire-status]')).toContainText('paused');

  await motion.getByRole('button', { name: 'Replay' }).click();
  await expect(motion).toHaveAttribute('data-state', 'playing');
  await expect(motion.locator('[data-ardamire-status]')).toHaveText('Detect');

  await expect(motion).toHaveAttribute('data-state', 'awaiting-review', { timeout: 7_000 });
  await expect(motion.locator('[data-ardamire-status]')).toHaveText(
    'Human review required - continue only after a person decides',
  );
  await expect(motion.locator('[data-ardamire-stage]').nth(4)).toHaveClass(/is-active/);
  await expect(motion.locator('[data-ardamire-stage]').nth(5)).not.toHaveClass(/is-active|is-complete/);
  await expect(motion.locator('.is-complete')).toHaveCount(4);
  await expect(motion.locator('[data-ardamire-continue]')).toBeVisible();
  await expect(motion.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();

  await page.waitForTimeout(1_250);
  await expect(motion).toHaveAttribute('data-state', 'awaiting-review');
  await expect(motion.locator('[data-ardamire-stage]').nth(5)).not.toHaveClass(/is-active|is-complete/);

  await motion.locator('[data-ardamire-continue]').click();
  await expect(motion).toHaveAttribute('data-state', 'verification');
  await expect(motion.locator('[data-ardamire-status]')).toHaveText(
    'Verification stage active - rollout remains separately controlled',
  );
  await expect(motion.locator('.is-complete')).toHaveCount(5);
  await expect(motion.locator('[data-ardamire-stage]').nth(5)).toHaveClass(/is-active/);
  await expect(motion.locator('[data-ardamire-continue]')).toBeHidden();
  await expectNoHorizontalOverflow(page);
});

test('Release Core proof uses CSP-compatible external styles with deliberate desktop and mobile layout', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900, minimumTitleSize: 70 },
    { width: 390, height: 844, minimumTitleSize: 38 },
  ]) {
    await page.setViewportSize(viewport);
    await openWithoutRuntimeErrors(page, '/proof/release-core/');

    await expect(page.locator('style')).toHaveCount(0);
    await expect(page.locator('[style]')).toHaveCount(0);
    await expect(page.locator('link[href^="/assets/proof-release-core.css?sha256="]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /\/assets\/proof\/release-core\/rc02-linkedin\.png\?sha256=[0-9a-f]{64}$/,
    );
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
    await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');

    const layout = await page.evaluate(() => {
      const title = document.querySelector('.proof-hero h1');
      const logo = document.querySelector('.proof-logo');
      const primaryAction = document.querySelector('.proof-button');
      const homeLink = logo.closest('a');
      return {
        titleFontSize: Number.parseFloat(getComputedStyle(title).fontSize),
        titleLineHeight: Number.parseFloat(getComputedStyle(title).lineHeight),
        logoWidth: logo.getBoundingClientRect().width,
        logoHeight: logo.getBoundingClientRect().height,
        homePath: new URL(homeLink.href).pathname,
        primaryActionHeight: primaryAction.getBoundingClientRect().height,
      };
    });
    expect(layout.titleFontSize).toBeGreaterThanOrEqual(viewport.minimumTitleSize);
    expect(layout.titleLineHeight).toBeGreaterThan(layout.titleFontSize);
    expect(layout.logoWidth).toBeGreaterThanOrEqual(190);
    expect(layout.logoWidth).toBeLessThanOrEqual(198);
    expect(layout.logoHeight).toBeGreaterThanOrEqual(23.5);
    expect(layout.logoHeight).toBeLessThanOrEqual(24.5);
    expect(layout.homePath).toBe('/');
    expect(layout.primaryActionHeight).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
  }
});

test('homepage shows the frozen Singapore source identity without reproducing the source page', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await openWithoutRuntimeErrors(page, '/');

    const sourceReviewBand = page.locator('.sales-product-band-source-review');
    await sourceReviewBand.scrollIntoViewIfNeeded();
    const sourceRecord = sourceReviewBand.locator('.sales-source-record');
    await expect(sourceRecord).toBeVisible();
    await expect(sourceReviewBand).toContainText(
      'Exact source bytes, the page locator, and the review result remain bound to one frozen proof record.',
    );
    await expect(sourceRecord).toContainText('MAS Notice FSM-N05');
    await expect(sourceRecord).toContainText('Page 3');
    await expect(sourceReviewBand.locator('img[src*="source-traceability.png"]')).toHaveCount(0);
    const productImageSizes = await page.locator('#product img').evaluateAll(async (images) => {
      images.forEach((image) => { image.loading = 'eager'; });
      await Promise.all(images.map((image) => image.decode()));
      return images.map((image) => ({ height: image.naturalHeight, width: image.naturalWidth }));
    });
    expect(productImageSizes).toEqual([
      { height: 1280, width: 1920 },
      { height: 2025, width: 1620 },
      { height: 509, width: 1280 },
    ]);
    await expectNoHorizontalOverflow(page);
  }
});

test('Singapore source-review proof serves the overview, source identity, and human decision detail on desktop and mobile', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await openWithoutRuntimeErrors(page, '/proof/singapore-source-review/');

    const outcome = page.locator('.sg-proof-outcome');
    const disclosure = page.locator('.sg-proof-disclosure');
    await expect(outcome).toHaveText('A changed version cannot reuse the prior approval.');
    await expect(disclosure).toContainText('Demonstration only.');
    await expect(disclosure).toContainText('Not affiliated with or endorsed by MAS.');
    await expect(disclosure).toContainText('Not legal advice or a regulatory compliance determination.');

    const cleanCapture = page.locator(
      'img[src^="/assets/proof/singapore-source-review/frozen-demo.png?sha256=d4ce3a63"]',
    );
    await expect(cleanCapture).toBeVisible();
    await expect(page.getByText('Clean browser capture', { exact: true })).toBeVisible();
    await expect(page.getByText('CLEAN_CAPTURE_GO', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open capture manifest' })).toHaveAttribute(
      'href',
      /capture-manifest\.json\?sha256=64e44bda[0-9a-f]{56}$/,
    );

    const humanDecisionDetail = page.locator(
      'img[src^="/assets/proof/singapore-source-review/human-decision-exact-artifact.png?sha256=c7c6458b"]',
    );
    const sourceRecord = page.locator('.sg-proof-traceability-record');
    await sourceRecord.scrollIntoViewIfNeeded();
    await expect(sourceRecord).toBeVisible();
    await expect(humanDecisionDetail).toBeVisible();
    await humanDecisionDetail.evaluate((element) => element.decode());
    await expect(page.getByText('Evidence detail', { exact: true })).toBeVisible();
    await expect(page.getByText('Follow the source identity into the human decision.', { exact: true })).toBeVisible();
    await expect(sourceRecord).toContainText('Supported in selected source set');
    await expect(sourceRecord).toContainText('Page 3');
    await expect(page.getByRole('link', { name: 'Open full decision detail' })).toBeVisible();

    const image = await cleanCapture.evaluate((element) => ({
      complete: element.complete,
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
    }));
    expect(image).toEqual({ complete: true, naturalWidth: 1280, naturalHeight: 2132 });

    const detail = await humanDecisionDetail.evaluate((element) => ({
      complete: element.complete,
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
    }));
    expect(detail).toEqual({ complete: true, naturalWidth: 434, naturalHeight: 1194 });
    const detailColors = await page.evaluate(() => ({
      background: getComputedStyle(document.querySelector('.sg-proof-details')).backgroundColor,
      body: getComputedStyle(document.querySelector('.sg-proof-details .proof-body')).color,
      caption: getComputedStyle(document.querySelector('.sg-proof-detail-figure figcaption')).color,
    }));
    expect(contrastRatio(detailColors.body, detailColors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(detailColors.caption, detailColors.background)).toBeGreaterThanOrEqual(4.5);
    const boundaryStyles = await page.evaluate(() => ({
      disclosureColor: getComputedStyle(document.querySelector('.sg-proof-disclosure')).color,
      disclosureFontSize: Number.parseFloat(getComputedStyle(document.querySelector('.sg-proof-disclosure')).fontSize),
      heroBackground: getComputedStyle(document.querySelector('.sg-proof-hero')).backgroundColor,
      outcomeColor: getComputedStyle(document.querySelector('.sg-proof-outcome')).color,
      outcomeFontSize: Number.parseFloat(getComputedStyle(document.querySelector('.sg-proof-outcome')).fontSize),
    }));
    expect(boundaryStyles.disclosureFontSize).toBeGreaterThanOrEqual(15);
    expect(boundaryStyles.outcomeFontSize).toBeGreaterThanOrEqual(viewport.width < 600 ? 22 : 30);
    expect(contrastRatio(boundaryStyles.disclosureColor, boundaryStyles.heroBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(boundaryStyles.outcomeColor, boundaryStyles.heroBackground)).toBeGreaterThanOrEqual(4.5);
    await expectNoHorizontalOverflow(page);
  }
});

test('Release Core transcript preserves six-page reading order on desktop and mobile', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900, minimumTitleSize: 54 },
    { width: 390, height: 844, minimumTitleSize: 36 },
  ]) {
    await page.setViewportSize(viewport);
    await openWithoutRuntimeErrors(page, '/proof/release-core/transcript/');

    await expect(page.locator('style')).toHaveCount(0);
    await expect(page.locator('[style]')).toHaveCount(0);
    await expect(page.locator('link[href^="/assets/proof-release-core.css?sha256="]')).toHaveCount(1);
    await expect(page.locator('.proof-transcript-page')).toHaveCount(6);
    await expect(page.locator('#transcript-page-1')).toContainText('approval should not travel');
    await expect(page.locator('#transcript-page-4')).toContainText('receipt is not trustworthy');
    await expect(page.locator('#transcript-page-6')).toContainText('Control the exact object');
    await expect(page.locator('a[href$="When_Approval_Should_Not_Travel_With_the_Output.pdf"]')).toBeVisible();

    const layout = await page.evaluate(() => ({
      titleFontSize: Number.parseFloat(getComputedStyle(document.querySelector('.proof-transcript-hero h1')).fontSize),
      transcriptBackground: getComputedStyle(document.querySelector('.proof-transcript')).backgroundColor,
      introHeadingColor: getComputedStyle(document.querySelector('.proof-transcript-intro h2')).color,
      pageHeadingColor: getComputedStyle(document.querySelector('.proof-transcript-page h2')).color,
      pageSubheadingColor: getComputedStyle(document.querySelector('.proof-transcript-page h3')).color,
      pageLabels: [...document.querySelectorAll('.proof-transcript-page-number')]
        .map((element) => element.textContent.trim()),
      transcriptTextLength: document.querySelector('#transcript').innerText.trim().length,
    }));
    expect(layout.titleFontSize).toBeGreaterThanOrEqual(viewport.minimumTitleSize);
    expect(contrastRatio(layout.introHeadingColor, layout.transcriptBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(layout.pageHeadingColor, layout.transcriptBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(layout.pageSubheadingColor, layout.transcriptBackground)).toBeGreaterThanOrEqual(4.5);
    expect(layout.pageLabels).toEqual([
      'Page 1 of 6', 'Page 2 of 6', 'Page 3 of 6',
      'Page 4 of 6', 'Page 5 of 6', 'Page 6 of 6',
    ]);
    expect(layout.transcriptTextLength).toBeGreaterThan(2500);
    await expectNoHorizontalOverflow(page);
  }
});

test('Ardamire idle stages keep readable copy on desktop and mobile', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await openWithoutRuntimeErrors(page, '/security/ardamire/');
    const styles = await page.locator('[data-ardamire-motion]').evaluate((rootElement) => ({
      backgroundColor: getComputedStyle(rootElement).backgroundColor,
      stageOpacities: [...rootElement.querySelectorAll('.ardamire-motion-stage')]
        .map((stage) => Number.parseFloat(getComputedStyle(stage).opacity)),
      paragraphs: [...rootElement.querySelectorAll('.ardamire-motion-stage p')].map((paragraph) => ({
        color: getComputedStyle(paragraph).color,
        fontSize: Number.parseFloat(getComputedStyle(paragraph).fontSize),
      })),
    }));
    expect(styles.stageOpacities.every((opacity) => opacity === 1)).toBe(true);
    expect(styles.paragraphs.every((paragraph) => paragraph.fontSize >= 14)).toBe(true);
    expect(styles.paragraphs.every((paragraph) => (
      contrastRatio(paragraph.color, styles.backgroundColor) >= 4.5
    ))).toBe(true);
    await expectNoHorizontalOverflow(page);
  }
});

test('Ardamire reduced-motion mode stays static without implying completed stages', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await openWithoutRuntimeErrors(page, '/security/ardamire/');

  const motion = page.locator('[data-ardamire-motion]');
  await expect(motion).toHaveAttribute('data-state', 'static');
  await expect(motion.locator('.is-complete')).toHaveCount(0);
  await expect(motion.locator('.is-active')).toHaveCount(0);
  await expect(motion.locator('[data-ardamire-status]')).toHaveText(
    'Static control path - human review remains required',
  );
  await expect(motion.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await expect(motion.locator('[data-ardamire-continue]')).toBeHidden();
  const mobileStyles = await motion.evaluate((root) => ({
    buttonHeights: [...root.querySelectorAll('.ardamire-motion-controls button')]
      .map((button) => button.getBoundingClientRect().height)
      .filter((height) => height > 0),
    stageParagraphFontSizes: [...root.querySelectorAll('.ardamire-motion-stage p')]
      .map((paragraph) => Number.parseFloat(getComputedStyle(paragraph).fontSize)),
    stageOpacities: [...root.querySelectorAll('.ardamire-motion-stage')]
      .map((stage) => Number.parseFloat(getComputedStyle(stage).opacity)),
    stageNumberColor: getComputedStyle(root.querySelector('.ardamire-motion-stage > span')).color,
    stageParagraphColor: getComputedStyle(root.querySelector('.ardamire-motion-stage p')).color,
  }));
  expect(mobileStyles.buttonHeights.every((height) => height >= 44)).toBe(true);
  expect(mobileStyles.stageParagraphFontSizes.every((size) => size >= 14)).toBe(true);
  expect(mobileStyles.stageOpacities.every((opacity) => opacity === 1)).toBe(true);
  expect(mobileStyles.stageNumberColor).toBe('rgb(144, 152, 163)');
  expect(mobileStyles.stageParagraphColor).toBe('rgb(168, 175, 184)');
  await expectNoHorizontalOverflow(page);
});
