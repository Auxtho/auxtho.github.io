const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const siteRoot = path.resolve(__dirname, '..', '..');
const outputRoot = path.resolve(process.argv[2] || path.join(siteRoot, 'qa-finance-language-correction'));

const routes = [
  ['home', '/'],
  ['capabilities', '/capabilities/'],
  ['exact-source', '/capabilities/exact-source-traceability/'],
  ['source-pack', '/capabilities/regulatory-source-pack/'],
  ['decision-receipts', '/capabilities/decision-receipts-audit-history/'],
  ['incident-recovery', '/capabilities/incident-reconstruction-recovery/'],
  ['ardamire-capability', '/capabilities/ardamire-defense-layer/'],
  ['ardamire-interactive', '/security/ardamire/'],
  ['singapore-proof', '/proof/singapore-source-review/'],
];

const fullPageRoutes = new Set([
  'capabilities',
  'exact-source',
  'source-pack',
  'ardamire-capability',
  'ardamire-interactive',
  'singapore-proof',
]);

const reviewedHtmlPaths = [
  'index.html',
  'capabilities/index.html',
  'capabilities/exact-source-traceability/index.html',
  'capabilities/regulatory-source-pack/index.html',
  'capabilities/ai-review-exception-queue/index.html',
  'capabilities/decision-receipts-audit-history/index.html',
  'capabilities/incident-reconstruction-recovery/index.html',
  'capabilities/ardamire-defense-layer/index.html',
  'proof/singapore-source-review/index.html',
  'security/ardamire/index.html',
];

const locatorCaptures = {
  home: [
    ['singapore-pack', '.sales-pack-focus'],
    ['ardamire-card', '.sales-foundation[href="/security/ardamire/"]'],
  ],
  capabilities: [
    ['ardamire-row', '.cap-module-row.secondary-track'],
    ['library-source-note', '.cap-source-note'],
  ],
  'exact-source': [['dated-source-note', '.cap-source-note']],
  'source-pack': [['dated-source-note', '.cap-source-note']],
  'decision-receipts': [
    ['hero', '.cap-hero'],
    ['source-note', '.cap-source-note'],
  ],
  'incident-recovery': [['verified-readback', '#recovery-case']],
  'ardamire-capability': [['modeled-hero', '.cap-hero']],
  'ardamire-interactive': [
    ['modeled-hero', '.technical-detail-hero'],
    ['modeled-sequence', '.ardamire-motion'],
  ],
  'singapore-proof': [
    ['value-first-hero', '.sg-proof-hero'],
    ['dated-source-set', '#sources'],
  ],
};

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

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function main() {
  fs.mkdirSync(outputRoot, { recursive: true });
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relativePath = pathname === '/'
      ? 'index.html'
      : pathname.endsWith('/')
        ? `${pathname.replace(/^\/+/, '')}index.html`
        : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(siteRoot, relativePath);
    if (!filePath.startsWith(`${siteRoot}${path.sep}`)) {
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
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const artifacts = [];

  try {
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 1000 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        reducedMotion: 'reduce',
        deviceScaleFactor: 1,
      });
      for (const [slug, route] of routes) {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const response = await page.goto(`${origin}${route}`, { waitUntil: 'load' });
        if (!response || response.status() !== 200) throw new Error(`HTTP readback failed: ${route}`);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(100);
        if (errors.length > 0) throw new Error(`${route} runtime errors: ${errors.join('; ')}`);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 1) throw new Error(`${route} horizontal overflow: ${overflow}px`);

        const firstViewportPath = path.join(outputRoot, `${viewport.name}-${slug}-first-viewport.png`);
        await page.screenshot({ path: firstViewportPath, fullPage: false });
        artifacts.push({
          kind: 'first-viewport',
          route,
          viewport,
          file: path.basename(firstViewportPath),
          sha256: sha256(firstViewportPath),
        });

        if (fullPageRoutes.has(slug)) {
          const fullPagePath = path.join(outputRoot, `${viewport.name}-${slug}-full-page.png`);
          await page.screenshot({ path: fullPagePath, fullPage: true });
          artifacts.push({
            kind: 'full-page',
            route,
            viewport,
            file: path.basename(fullPagePath),
            sha256: sha256(fullPagePath),
          });
        }

        for (const [name, selector] of locatorCaptures[slug] || []) {
          const locator = page.locator(selector).first();
          await locator.scrollIntoViewIfNeeded();
          const locatorPath = path.join(outputRoot, `${viewport.name}-${slug}-${name}.png`);
          await locator.screenshot({ path: locatorPath });
          artifacts.push({
            kind: 'locator',
            route,
            selector,
            viewport,
            file: path.basename(locatorPath),
            sha256: sha256(locatorPath),
          });
        }
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const manifest = {
    schema_version: 'auxtho-finance-language-correction-visual-qa-v1',
    created_date: '2026-09-01',
    source_base_sha: 'd262386a10f30443aff1417dc9c5de8cedeca1f7',
    boundary: 'local static readback; no deployment or external mutation',
    reviewed_html_sha256: Object.fromEntries(reviewedHtmlPaths.map((relativePath) => [
      relativePath,
      sha256(path.join(siteRoot, relativePath)),
    ])),
    artifacts,
  };
  fs.writeFileSync(
    path.join(outputRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`visual-qa captures=${artifacts.length} output=${outputRoot}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
