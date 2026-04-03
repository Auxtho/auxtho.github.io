const fs = require('fs');
const path = require('path');
const http = require('http');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(path.resolve(__dirname, '../../auxtho-fe/node_modules/playwright')));
}

const SITE_ROOT = path.resolve(__dirname, '..');
const DOCS_ROOT = path.resolve(__dirname, '..', '..', 'docs');
const SOURCE_PATH = path.resolve(__dirname, 'core-overview.json');
const OUTPUT_HTML = path.resolve(SITE_ROOT, 'core', 'index.html');
const OUTPUT_PDF = path.resolve(SITE_ROOT, 'assets', 'pdf', 'auxtho-core-overview-v2025.1.pdf');
const RELEASE_LOG = path.resolve(DOCS_ROOT, 'releases', 'auxtho-core-public-log.json');

function ensureDir(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function writeText(filePath, text) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, text, 'utf8');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderList(items, renderer) {
  return items.map(renderer).join('\n');
}

function renderPage(data, { assetPrefix, canonicalUrl, robots }) {
  const flow = renderList(data.core_flow, (step, index) => `
        <div class="core-flow-step">
          <div class="core-flow-index">0${index + 1}</div>
          <div>
            <h3>${escapeHtml(step.label)}</h3>
            <p>${escapeHtml(step.detail)}</p>
          </div>
        </div>`);

  const timeline = renderList(data.timeline, (item) => `
          <div class="timeline-row">
            <div class="timeline-year">${escapeHtml(item.year)}</div>
            <div class="timeline-copy">${escapeHtml(item.event)}</div>
          </div>`);

  const bullets = (items) => renderList(items, (item) => `<li>${escapeHtml(item)}</li>`);
  const paras = (items) => renderList(items, (item) => `<p>${escapeHtml(item)}</p>`);

  return `<!DOCTYPE html>
<html lang="en" class="scroll-smooth dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.title)}</title>
  <meta name="description" content="${escapeHtml(data.description)}">
  <meta name="robots" content="${robots}">
  <meta name="color-scheme" content="dark light">
  <link rel="icon" href="${assetPrefix}/favicon.svg">
  <link rel="canonical" href="${canonicalUrl}">
  <meta name="theme-color" content="#0f1014">
  <link rel="apple-touch-icon" href="${assetPrefix}/apple-touch-icon.png">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(data.title)}">
  <meta property="og:description" content="${escapeHtml(data.description)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="https://auxtho.com/assets/og-image.png">
  <meta property="og:image:alt" content="${escapeHtml(data.title)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(data.title)}">
  <meta name="twitter:description" content="${escapeHtml(data.description)}">
  <meta name="twitter:image" content="https://auxtho.com/assets/og-image.png">
  <link rel="stylesheet" href="${assetPrefix}/style.css?v=2026-03-19d">
  <link rel="stylesheet" href="${assetPrefix}/custom.css?v=2026-03-19d">
  <link rel="stylesheet" href="${assetPrefix}/final-overrides.css?v=ep07-design-pass">
  <style>
    .core-shell { max-width: 1120px; margin: 0 auto; }
    .core-page { padding-top: 6.5rem; padding-bottom: 5rem; }
    .core-hero { text-align: center; max-width: 880px; margin: 0 auto 4rem; }
    .core-kicker { color: #7ea5ff; font-size: 0.78rem; letter-spacing: 0.18em; text-transform: uppercase; }
    .core-title { font-size: clamp(2.2rem, 4vw, 3.6rem); line-height: 1.12; margin-top: 0.9rem; }
    .core-copy { color: #b8c0cc; font-size: 1.05rem; line-height: 1.78; margin-top: 1.3rem; }
    .core-section { border-top: 1px solid rgba(255,255,255,0.06); padding-top: 3rem; margin-top: 3rem; }
    .core-grid { display: grid; gap: 1.5rem; }
    .core-flow-grid { display: grid; gap: 1rem; margin-top: 1.5rem; }
    .core-flow-step { display: grid; grid-template-columns: 64px 1fr; gap: 1rem; align-items: start; background: rgba(17,19,24,0.72); border: 1px solid rgba(255,255,255,0.08); border-radius: 1.25rem; padding: 1.25rem; }
    .core-flow-index { width: 52px; height: 52px; border-radius: 999px; display:flex; align-items:center; justify-content:center; background: rgba(59,130,246,0.12); color:#9ab8ff; font-weight:700; }
    .core-flow-note { margin-top: 1rem; color: #dce4f1; font-size: 0.95rem; padding: 1rem 1.15rem; border-radius: 1rem; background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.18); }
    .core-card { background: rgba(17,19,24,0.72); border: 1px solid rgba(255,255,255,0.08); border-radius: 1.25rem; padding: 1.4rem; }
    .core-card h3 { font-size: 1.1rem; margin-bottom: 0.75rem; }
    .core-card p, .core-card li { color: #c1c8d2; line-height: 1.72; }
    .core-card ul { padding-left: 1.2rem; margin: 0; }
    .timeline-row { display:grid; grid-template-columns: 90px 1fr; gap: 1rem; padding: 0.9rem 0; border-top: 1px solid rgba(255,255,255,0.05); }
    .timeline-row:first-child { border-top: 0; }
    .timeline-year { color: #8aa7ff; font-weight: 700; }
    .note-box { margin-top: 1.25rem; background: rgba(17,19,24,0.72); border: 1px solid rgba(255,255,255,0.08); border-radius: 1.25rem; padding: 1.25rem; color: #b6bec8; line-height: 1.7; }
    @media (min-width: 860px) {
      .core-grid.two-col { grid-template-columns: 1.2fr 0.8fr; }
      .core-grid.equal-col { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body class="antialiased">
  <header class="primary-header sticky top-0 z-50 bg-black/50 backdrop-blur-lg border-b border-white/10">
    <div class="container mx-auto px-6 py-5 flex justify-between items-center">
      <a href="/" class="z-50" aria-label="Auxtho Home">
        <img src="${assetPrefix}/logo-white.svg" alt="Auxtho Logo" class="h-6 w-auto">
      </a>
      <a href="/" class="btn-secondary text-sm">Back to Home</a>
    </div>
  </header>

  <main class="core-page">
    <div class="core-shell px-6">
      <section class="core-hero">
        <p class="core-kicker">Core Architecture</p>
        <h1 class="core-title">${escapeHtml(data.page_title)}</h1>
        <div class="core-copy">${paras(data.intro)}</div>
      </section>

      <section class="core-section">
        <div class="core-grid two-col">
          <div>
            <p class="core-kicker">Core Flow</p>
            <h2 class="text-3xl font-bold mt-3">Execution passes through verification before it becomes action.</h2>
            <div class="core-flow-grid">${flow}</div>
            <div class="core-flow-note">Every execution path is expected to pass through the verification stage. Generation alone does not grant execution authority.</div>
          </div>
          <div class="core-card">
            <h3>Flow message</h3>
            <p>Input  Intent  Plan  Verification  Execution  Output</p>
            <p>The order matters. The architecture is designed to constrain execution rather than explain it away after the fact.</p>
          </div>
        </div>
      </section>

      <section class="core-section">
        <div class="core-grid equal-col">
          <div class="core-card">
            <p class="core-kicker">ISP</p>
            <h2 class="text-2xl font-bold mt-2 mb-4">Intent Synchronization Protocol</h2>
            ${paras(data.isp)}
          </div>
          <div class="core-card">
            <p class="core-kicker">Execution Control</p>
            <h2 class="text-2xl font-bold mt-2 mb-4">Execution is a gated outcome</h2>
            <ul>${bullets(data.execution_control)}</ul>
          </div>
        </div>
      </section>

      <section class="core-section">
        <div class="core-grid equal-col">
          <div class="core-card">
            <p class="core-kicker">Policy Structure</p>
            <h2 class="text-2xl font-bold mt-2 mb-4">Policy is meant to remain inspectable.</h2>
            <ul>${bullets(data.policy_structure)}</ul>
          </div>
          <div class="core-card">
            <p class="core-kicker">Timeline</p>
            <h2 class="text-2xl font-bold mt-2 mb-4">Recorded concept milestones</h2>
            ${timeline}
          </div>
        </div>
      </section>

      <section class="core-section">
        <div class="note-box">
          <p class="core-kicker">Note</p>
          <p>${escapeHtml(data.public_note)}</p>
          <p class="mt-4">${escapeHtml(data.note)}</p>
          <p class="mt-4 text-sm text-gray-500">Shadow mode build. This page may exist before homepage linking and indexing are enabled.</p>
        </div>
      </section>
    </div>
  </main>
</body>
</html>`;
}

function archivePaths(version) {
  return {
    archiveHtml: path.resolve(SITE_ROOT, 'archive', 'core', version, 'index.html'),
    archivePdf: path.resolve(SITE_ROOT, 'archive', 'core', version, `auxtho-core-overview-${version}.pdf`),
  };
}

async function renderPdf(htmlPath, pdfPath) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'load' });
  await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' } });
  await browser.close();
}

function updateReleaseLog(entry) {
  const existing = fs.existsSync(RELEASE_LOG) ? readJson(RELEASE_LOG) : { entries: [] };
  const entries = Array.isArray(existing.entries) ? existing.entries : [];
  const filtered = entries.filter((item) => item.version !== entry.version);
  filtered.push(entry);
  writeJson(RELEASE_LOG, { entries: filtered });
}

async function main() {
  const source = readJson(SOURCE_PATH);
  const version = source.version;
  const archive = archivePaths(version);

  const publicHtml = renderPage(source, {
    assetPrefix: '../assets',
    canonicalUrl: 'https://auxtho.com/core/',
    robots: 'noindex,nofollow',
  });
  const archiveHtml = renderPage(source, {
    assetPrefix: '../../../assets',
    canonicalUrl: 'https://auxtho.com/core/',
    robots: 'noindex,nofollow',
  });

  writeText(OUTPUT_HTML, publicHtml);
  writeText(archive.archiveHtml, archiveHtml);
  await renderPdf(OUTPUT_HTML, OUTPUT_PDF);
  await renderPdf(archive.archiveHtml, archive.archivePdf);

  updateReleaseLog({
    version,
    final_url: 'https://auxtho.com/core/',
    pdf_url: `https://auxtho.com/assets/pdf/auxtho-core-overview-${version}.pdf`,
    archive_html_url: `https://auxtho.com/archive/core/${version}/`,
    archive_pdf_url: `https://auxtho.com/archive/core/${version}/auxtho-core-overview-${version}.pdf`,
    published_at: null,
    updated_at: new Date().toISOString(),
    indexing_requested_at: null,
    notes: [
      'Shadow mode build complete.',
      'Homepage link, sitemap, and indexing remain gated behind film-UAT trust milestones.'
    ]
  });

  console.log(JSON.stringify({
    html: OUTPUT_HTML,
    pdf: OUTPUT_PDF,
    archive_html: archive.archiveHtml,
    archive_pdf: archive.archivePdf,
    release_log: RELEASE_LOG,
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});

