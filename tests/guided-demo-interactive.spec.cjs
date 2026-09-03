const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const demoPagePath = path.join(root, 'demo', 'singapore-source-review', 'index.html');
const homepagePath = path.join(root, 'index.html');
const proofPagePath = path.join(root, 'proof', 'singapore-source-review', 'index.html');
const sitemapPath = path.join(root, 'sitemap.xml');
const assetRoot = path.join(root, 'assets', 'demo', 'singapore-source-review');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test('public route does not republish the frozen MAS PDFs or page image', () => {
  const removed = [
    'consultation-page-6.png',
    'sources/01_MAS_Notice_FSM-N05.pdf',
    'sources/02_MAS_TRM_FAQ.pdf',
    'sources/03_MAS_TRM_Consultation_P012-2026.pdf',
  ];
  for (const relative of removed) {
    assert.equal(fs.existsSync(path.join(assetRoot, ...relative.split('/'))), false, relative);
  }
  const html = fs.readFileSync(demoPagePath, 'utf8');
  assert.doesNotMatch(html, /assets\/demo\/singapore-source-review\/(?:sources|consultation-page-6)/);
  assert.match(html, /The full MAS document is not republished/);
  assert.match(html, /href="\/proof\/singapore-source-review\/#details-title"/);
  assert.match(html, /href="\/proof\/singapore-source-review\/#details-title" target="_blank" rel="noopener noreferrer"/);
});

test('interactive demo CSS and scripts are local and content-addressed', () => {
  const html = fs.readFileSync(demoPagePath, 'utf8');
  const expected = new Map([
    ['guided-demo.css', 'fa626a3dea209ef8f6bc9366be7bec67072bcbd54eef10b36743e02a5193a579'],
    ['interactive-demo-data.b7fb698009c4342c57e20e229abd927f6a22abf13ad24d5a4b4cc5fc9acedbf7.js', 'b7fb698009c4342c57e20e229abd927f6a22abf13ad24d5a4b4cc5fc9acedbf7'],
    ['interactive-demo.06caa9cd1045d21b35f32ab9bd16dd406416887b95e6652e8fcbd6b4eb088ef2.js', '06caa9cd1045d21b35f32ab9bd16dd406416887b95e6652e8fcbd6b4eb088ef2'],
  ]);
  for (const [name, digest] of expected) {
    assert.equal(sha256(path.join(assetRoot, name)), digest, name);
    if (name.endsWith('.css')) {
      assert.match(html, new RegExp('/assets/demo/singapore-source-review/' + name.replace('.', '\\.') + '\\?sha256=' + digest));
    } else {
      assert.match(html, new RegExp('/assets/demo/singapore-source-review/' + name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '"'));
    }
  }
  assert.equal(fs.existsSync(path.join(assetRoot, 'guided-demo.js')), false);
});

test('demo has no account, input, tracking, backend write, or private-state surface', () => {
  const html = fs.readFileSync(demoPagePath, 'utf8');
  const dataScript = fs.readFileSync(path.join(assetRoot, 'interactive-demo-data.b7fb698009c4342c57e20e229abd927f6a22abf13ad24d5a4b4cc5fc9acedbf7.js'), 'utf8');
  const script = fs.readFileSync(path.join(assetRoot, 'interactive-demo.06caa9cd1045d21b35f32ab9bd16dd406416887b95e6652e8fcbd6b4eb088ef2.js'), 'utf8');
  const combined = html + '\n' + dataScript + '\n' + script;
  const text = visibleText(html);
  assert.doesNotMatch(html, /<(?:form|input|textarea|select)\b/i);
  assert.doesNotMatch(combined, /(?:fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage)/);
  assert.doesNotMatch(combined, /(?:gtag|dataLayer|plausible|umami|segment|mixpanel|hotjar|google-analytics)/i);
  assert.doesNotMatch(combined, /[A-Z]:\\|localhost|127\.0\.0\.1|serviceAccount|api[_-]?key/i);
  assert.doesNotMatch(combined, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(text, /\b(?:SUPPORTED|PROPOSED_ONLY|UNKNOWN|INTENT_RECORDED|Release Core)\b/);
  assert.doesNotMatch(text, /SHA-256|authorization-|workspace-|tenant-/i);
  assert.match(text, /guided walkthrough/);
  assert.match(text, /stores no interaction and takes no external action/);
  assert.match(text, /not affiliated with or endorsed by MAS/);
});

test('en-SG is default and ko-KR remains an explicit alternate', () => {
  const html = fs.readFileSync(demoPagePath, 'utf8');
  const dataScript = fs.readFileSync(path.join(assetRoot, 'interactive-demo-data.b7fb698009c4342c57e20e229abd927f6a22abf13ad24d5a4b4cc5fc9acedbf7.js'), 'utf8');
  const script = fs.readFileSync(path.join(assetRoot, 'interactive-demo.06caa9cd1045d21b35f32ab9bd16dd406416887b95e6652e8fcbd6b4eb088ef2.js'), 'utf8');
  assert.match(html, /<html lang="en-SG" data-language="en">/);
  assert.match(html, /property="og:locale" content="en_SG"/);
  assert.match(html, /property="og:locale:alternate" content="ko_KR"/);
  assert.match(script, /language === 'en' \? 'en-SG' : 'ko-KR'/);
  assert.match(dataScript, /이해를 위한 Auxtho의 비공식 한국어 설명/);
  assert.doesNotMatch(dataScript, /공식 번역이나 법적 해석이 아닙니다/);
});

test('the interaction exposes exact M120 claim states and meaningful reviewer choices', () => {
  const html = fs.readFileSync(demoPagePath, 'utf8');
  const dataScript = fs.readFileSync(path.join(assetRoot, 'interactive-demo-data.b7fb698009c4342c57e20e229abd927f6a22abf13ad24d5a4b4cc5fc9acedbf7.js'), 'utf8');
  const script = fs.readFileSync(path.join(assetRoot, 'interactive-demo.06caa9cd1045d21b35f32ab9bd16dd406416887b95e6652e8fcbd6b4eb088ef2.js'), 'utf8');
  assert.match(html, /data-claim-select="C1"/);
  assert.match(html, /data-claim-select="C2"/);
  assert.match(html, /data-claim-select="C3"/);
  assert.match(dataScript, /does not exceed 4 hours within any 12-month period/);
  assert.match(dataScript, /pendingTitle: 'Source wording confirmed'/);
  assert.match(dataScript, /pendingTitle: 'One source-role issue found'/);
  assert.match(dataScript, /pendingAction: 'Attribute the detail to the supporting FAQ, not to FSM-N05 itself\.'/);
  assert.match(dataScript, /modalSummary: 'One source-role exception prepared for review'/);
  assert.match(dataScript, /correctedSub: 'Version 1\.1 now attributes the detail to the MAS TRM FAQ rather than to FSM-N05 itself\./);
  assert.match(dataScript, /sourceOpenGuidance: 'The selected wording matches the current Notice\./);
  assert.match(dataScript, /sourceOpenGuidance: 'The detail appears in the supporting FAQ, not in FSM-N05 itself\./);
  assert.match(dataScript, /버전 1\.2에서는 <mark>“변경 불가능한 백업 또는 오프라인 백업”이 “두 가지 모두”<\/mark>로 바뀌었습니다\./);
  assert.match(dataScript, /supporting FAQ, not in FSM-N05 itself/);
  assert.match(dataScript, /Closed consultation · proposed only/);
  assert.match(dataScript, /an immutable or offline backup/);
  assert.match(html, /data-hold/);
  assert.match(html, /data-reject/);
  assert.match(html, /data-approve/);
  assert.match(html, /Fixed synthetic example · Browser-only · Nothing saved/);
  assert.match(html, /data-approved-excerpt/);
  assert.match(html, /data-changed-excerpt/);
  assert.match(html, /Compare the selected wording/);
  assert.match(html, /data-prepared-issues/);
  assert.match(dataScript, /artifactChanged: 'Synthetic AI draft · changed version 1\.2'/);
  assert.match(dataScript, /Version 1\.2 says <mark>both an immutable backup and an offline backup<\/mark>/);
  assert.match(dataScript, /reviewerStatusApproved: 'Exact decision recorded'/);
  assert.match(dataScript, /reviewerStatusChanged: 'Review required'/);
  assert.match(dataScript, /documentStatusChanged: 'Version mismatch'/);
  assert.match(script, /recordDecision\('HOLD'\)/);
  assert.match(script, /recordDecision\('REJECT'\)/);
  assert.match(script, /recordDecision\('APPROVE'\)/);
  assert.match(script, /function renderLifecycle\(\)/);
  assert.match(script, /copy\.changed/);
  assert.match(script, /copy\.modalSummary/);
  assert.match(script, /correctedCopy\?\.correctedSub/);
  assert.match(script, /claimCopy\(\)\.sourceOpenGuidance/);
  assert.match(script, /classList\.toggle\('confirmed', !selected\.reviewRequired\)/);
  assert.match(script, /state\.decision !== 'APPROVE' \|\| state\.changed/);
  assert.doesNotMatch(dataScript, /material(?:ity)? classifier/i);
});

test('the primary path has exactly four numbered product actions', () => {
  const html = fs.readFileSync(demoPagePath, 'utf8');
  const css = fs.readFileSync(path.join(assetRoot, 'guided-demo.css'), 'utf8');
  const script = fs.readFileSync(path.join(assetRoot, 'interactive-demo.06caa9cd1045d21b35f32ab9bd16dd406416887b95e6652e8fcbd6b4eb088ef2.js'), 'utf8');
  for (let step = 1; step <= 4; step += 1) {
    assert.match(html, new RegExp('data-step="' + step + '"'));
  }
  assert.doesNotMatch(html, /data-step="[5-9]"/);
  assert.match(html, /Guided product walkthrough/);
  assert.equal((html.match(/data-action-step="[1-4]"/g) || []).length, 4);
  assert.match(script, /const totalSteps = 4/);
  assert.match(script, /addEventListener\('click', continueFromSource\)/);
  assert.match(script, /addEventListener\('click', dismissSource\)/);
  assert.match(css, /\.is-next-action/);
  assert.match(css, /\.completed-action \.action-number::before/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(script, /value === nextStep/);
});

test('homepage and sitemap keep demo and evidence routes separate', () => {
  const homepage = fs.readFileSync(homepagePath, 'utf8');
  const proof = fs.readFileSync(proofPagePath, 'utf8');
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const heroActions = homepage.match(/<div class="sales-hero-actions">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.match(homepage, /href="\/demo\/singapore-source-review\/"[^>]*>Try the guided walkthrough</);
  assert.match(homepage, /href="\/demo\/singapore-source-review\/"[^>]*>Open the guided walkthrough/);
  assert.match(homepage, /href="\/proof\/singapore-source-review\/"[^>]*>Inspect the evidence/);
  assert.match(homepage, /ONE WORKED EXAMPLE/);
  assert.match(homepage, /Singapore source-review walkthrough/);
  assert.match(homepage, /DOCUMENT EVIDENCE \+ SOURCE REVIEW/);
  assert.match(homepage, /One source-review example of Auxtho’s exact-version release-control path\./);
  assert.equal((heroActions.match(/<a\b/g) || []).length, 3);
  assert.doesNotMatch(heroActions, /View public proof/);
  assert.doesNotMatch(proof, /\bindependent(?:ly)?\b/i);
  assert.match(proof, /Separate local replay check/);
  assert.match(proof, /separate deterministic replay check/);
  assert.match(sitemap, /<loc>https:\/\/auxtho\.com\/<\/loc>\s*<lastmod>2026-09-03<\/lastmod>/);
  assert.match(sitemap, /<loc>https:\/\/auxtho\.com\/demo\/singapore-source-review\/<\/loc>\s*<lastmod>2026-09-03<\/lastmod>/);
  assert.match(sitemap, /<loc>https:\/\/auxtho\.com\/proof\/singapore-source-review\/<\/loc>\s*<lastmod>2026-09-03<\/lastmod>/);
});
