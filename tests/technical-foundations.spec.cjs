const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { expect, test } = require('@playwright/test');

test.describe.configure({ mode: 'serial' });

const root = path.resolve(__dirname, '..');
const desktopVisionPosterPath = '/assets/vision-film/auxtho-incident-led-hero-v9-poster.png';
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
      && new URL(request.url()).pathname === desktopVisionPosterPath;
    if (!isResponsivePosterSwap) {
      failedRequests.push(`${request.url()} (${failure?.errorText || 'unknown failure'})`);
    }
  });
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'load' });
  await page.waitForTimeout(150);
  expect(response.status()).toBe(200);
  expect(runtimeErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
}

test('homepage vision film selects the desktop master and leaves the product proposition visible below', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithoutRuntimeErrors(page, '/index.html');

  const film = page.locator('[data-vision-film]');
  const video = film.locator('video');
  await expect(film).toBeVisible();
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

  const productTop = await page.locator('.sales-hero').evaluate((element) => element.getBoundingClientRect().top);
  expect(productTop).toBeLessThan(900);
  await expectNoHorizontalOverflow(page);
});

test('homepage vision film selects the portrait master on mobile without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWithoutRuntimeErrors(page, '/index.html');

  const film = page.locator('[data-vision-film]');
  const video = film.locator('video');
  await expect.poll(() => video.evaluate((element) => ({
    currentSrc: element.currentSrc,
    height: element.videoHeight,
    width: element.videoWidth,
  }))).toEqual(expect.objectContaining({
    currentSrc: expect.stringContaining('auxtho-incident-led-hero-mobile-v9.mp4'),
    height: 1920,
    width: 1080,
  }));
  const productTop = await page.locator('.sales-hero').evaluate((element) => element.getBoundingClientRect().top);
  expect(productTop).toBeLessThan(844);
  const controlHeights = await film.locator('.vision-film-toggle, .vision-film-continue')
    .evaluateAll((controls) => controls.map((control) => control.getBoundingClientRect().height));
  expect(controlHeights.every((height) => height >= 44)).toBe(true);

  const heroButtons = await page.locator('.sales-hero-actions .sales-button')
    .evaluateAll((buttons) => buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { bottom: box.bottom, height: box.height, left: box.left, right: box.right, top: box.top };
    }));
  expect(heroButtons).toHaveLength(2);
  expect(heroButtons[1].top).toBeGreaterThanOrEqual(heroButtons[0].bottom - 1);
  expect(heroButtons.every((box) => box.height >= 44 && box.left >= 0 && box.right <= 390)).toBe(true);
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
    name: 'Control beneath the interface.',
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
      return {
        titleFontSize: Number.parseFloat(getComputedStyle(title).fontSize),
        titleLineHeight: Number.parseFloat(getComputedStyle(title).lineHeight),
        logoWidth: logo.getBoundingClientRect().width,
        primaryActionHeight: primaryAction.getBoundingClientRect().height,
      };
    });
    expect(layout.titleFontSize).toBeGreaterThanOrEqual(viewport.minimumTitleSize);
    expect(layout.titleLineHeight).toBeGreaterThan(layout.titleFontSize);
    expect(layout.logoWidth).toBeGreaterThanOrEqual(95);
    expect(layout.logoWidth).toBeLessThanOrEqual(115);
    expect(layout.primaryActionHeight).toBeGreaterThanOrEqual(44);
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
