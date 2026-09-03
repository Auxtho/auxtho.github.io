const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { expect, test } = require('@playwright/test');

test.describe.configure({ mode: 'serial' });

const root = path.resolve(__dirname, '..');
const captureDir = path.join(root, 'test-results', 'guided-demo-interactive-20260902');
let server;
let baseUrl;

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

test.beforeAll(async () => {
  fs.mkdirSync(captureDir, { recursive: true });
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = pathname === '/'
      ? 'index.html'
      : pathname.endsWith('/')
        ? pathname.replace(/^\/+/, '') + 'index.html'
        : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(root, relative);
    if (!filePath.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(filePath, (error, bytes) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store' });
      response.end(bytes);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function openDemo(page, viewport) {
  await page.setViewportSize(viewport);
  const pageErrors = [];
  const consoleErrors = [];
  const externalRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if ((url.protocol === 'http:' && url.origin !== baseUrl) || url.protocol === 'https:') {
      externalRequests.push(request.url());
    }
  });
  const response = await page.goto(baseUrl + '/demo/singapore-source-review/', { waitUntil: 'load' });
  expect(response.status()).toBe(200);
  await expect(page.locator('[data-demo-root]')).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
  return { pageErrors, consoleErrors, externalRequests };
}

async function expectNoOverflow(page) {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll - widths.client).toBeLessThanOrEqual(1);
}

async function prepareFullPageCapture(page) {
  await page.evaluate(() => {
    document.activeElement?.blur();
    document.documentElement.style.scrollBehavior = 'auto';
    document.body.style.scrollBehavior = 'auto';
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  await page.waitForTimeout(200);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(12);
}

async function chooseExceptionAndOpenEvidence(page) {
  await expect(page.locator('[data-claim-select="C3"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-step-count]')).toHaveText('1 / 4');
  await expect(page.locator('[data-reasons]')).toHaveCount(1);
  await expect(page.locator('[data-open-source]')).toHaveClass(/is-next-action/);
  await page.locator('[data-open-source]').click();
  const modal = page.locator('[data-source-modal]');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Page 6 · paragraph 2.17 · Question 5');
  await expect(modal).toContainText('Closed consultation · proposed only');
  await expect(modal).toContainText('whether maintaining either form of backup would suffice');
  await expect(modal.locator('img')).toHaveCount(0);
  await expect(page.locator('[data-source-close]')).toHaveAttribute('aria-label', 'Close source');
  const evidenceLink = modal.locator('a.evidence-link');
  await expect(evidenceLink).toHaveAttribute(
    'href',
    '/proof/singapore-source-review/#details-title',
  );
  await expect(evidenceLink).toHaveAttribute('target', '_blank');
  await expect(evidenceLink).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('[data-step-count]')).toHaveText('1 / 4');
  if (await page.evaluate(() => window.innerWidth) === 1440) {
    await page.screenshot({
      path: path.join(captureDir, 'desktop-source-evidence.png'),
      fullPage: false,
      animations: 'disabled',
    });
  }
  await expect(page.locator('[data-source-continue-label]')).toHaveText('Continue to reviewer');
  await page.locator('[data-source-continue]').click();
  await expect(modal).toBeHidden();
  await expect(page.locator('[data-reviewer-panel]')).toBeVisible();
  await expect(page.locator('[data-review-stage]')).toBeHidden();
  await expect(page.locator('[data-step-count]')).toHaveText('2 / 4');
  await expect(page.locator('[data-correct]')).toHaveClass(/is-next-action/);
}

async function completeApprovePath(page) {
  await chooseExceptionAndOpenEvidence(page);
  await expect(page.locator('[data-approve]')).toBeDisabled();
  await expect(page.locator('[data-hold]')).toBeEnabled();
  await expect(page.locator('[data-reject]')).toBeEnabled();
  await page.locator('[data-correct]').click();
  await expect(page.locator('[data-draft-text]')).toContainText('an immutable or offline backup');
  await expect(page.locator('[data-draft-text]')).toContainText('data crucial to supporting their relevant business services');
  await expect(page.locator('[data-document-version]')).toContainText('corrected version 1.1');
  await expect(page.locator('[data-review-title]')).toHaveText('Example correction applied');
  await expect(page.locator('[data-review-status]')).toHaveText('Correction applied');
  await expect(page.locator('[data-reviewer-status]')).toHaveText('Human decision required');
  await expect(page.locator('[data-step-count]')).toHaveText('3 / 4');
  await expect(page.locator('[data-approve]')).toBeEnabled();
  await expect(page.locator('[data-approve]')).toHaveClass(/is-next-action/);
  await page.locator('[data-approve]').click();
  await expect(page.locator('[data-decision-record]')).toBeVisible();
  await expect(page.locator('[data-decision-record]')).toContainText('Decision tied to this reviewed version');
  await expect(page.locator('[data-decision-record]')).toContainText('stores nothing');
  await expect(page.locator('[data-decision-value]')).toHaveText('Approve');
  await expect(page.locator('[data-artifact-value]')).toContainText('corrected version 1.1');
  await expect(page.locator('[data-review-title]')).toHaveText('Version 1.1 approved');
  await expect(page.locator('[data-review-status]')).toHaveText('Approved');
  await expect(page.locator('[data-reviewer-title]')).toHaveText('Version 1.1 approved');
  await expect(page.locator('[data-reviewer-status]')).toHaveText('Exact decision recorded');
  await expect(page.locator('[data-step-count]')).toHaveText('4 / 4');
  await expect(page.locator('[data-check-changed]')).toBeVisible();
  await expect(page.locator('[data-check-changed]')).toHaveClass(/is-next-action/);
  await page.locator('[data-check-changed]').click();
  await expect(page.locator('[data-changed-result]')).toBeVisible();
  await expect(page.locator('[data-changed-result]')).toContainText('Prior decision cannot be reused');
  await expect(page.locator('[data-document-version]')).toContainText('changed version 1.2');
  await expect(page.locator('[data-draft-text]')).toContainText('both an immutable backup and an offline backup');
  await expect(page.locator('[data-review-title]')).toHaveText('Current document is version 1.2');
  await expect(page.locator('[data-review-status]')).toHaveText('Version mismatch');
  await expect(page.locator('[data-reviewer-title]')).toHaveText('Version 1.2 must return to review');
  await expect(page.locator('[data-reviewer-status]')).toHaveText('Review required');
  await expect(page.locator('[data-reviewer-sub]')).toContainText('differs from the approved document');
  await expect(page.locator('[data-approved-excerpt]')).toContainText('an immutable or offline backup');
  await expect(page.locator('[data-changed-excerpt]')).toContainText('both an immutable backup and an offline backup');
  await expect(page.locator('[data-check-changed]')).toBeHidden();
  await expect(page.locator('[data-next-action]')).toBeVisible();
  await expect(page.locator('.step.done')).toHaveCount(4);
  await expect(page.locator('.is-next-action')).toHaveCount(0);
}

test('desktop visitor selects a claim, resolves exceptions, decides, and tests a changed version', async ({ page }) => {
  const runtime = await openDemo(page, { width: 1440, height: 1000 });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-SG');
  await expect(page.locator('[data-claim-select]')).toHaveCount(3);
  await expect(page.locator('.document-preview')).toBeVisible();
  await expect(page.locator('[data-review-status]')).toHaveText('2 issues found');
  await expect(page.locator('details.claim-explorer')).not.toHaveAttribute('open', '');
  await expect(page.locator('details.reason-details')).not.toHaveAttribute('open', '');
  await expect(page.locator('details.secondary-proof')).not.toHaveAttribute('open', '');
  await expect(page.locator('.source-inventory')).toBeHidden();
  await expect(page.locator('[data-action-step]:visible')).toHaveCount(1);
  await page.screenshot({
    path: path.join(captureDir, 'desktop-interactive-start.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await completeApprovePath(page);
  await expectNoOverflow(page);
  expect(runtime.externalRequests).toEqual([]);
  await prepareFullPageCapture(page);
  await page.screenshot({
    path: path.join(captureDir, 'desktop-interactive-final.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.locator('[data-reset]').click();
  await expect(page.locator('[data-step-count]')).toHaveText('1 / 4');
  await expect(page.locator('[data-reviewer-panel]')).toBeHidden();
  await expect(page.locator('[data-open-source]')).toHaveClass(/is-next-action/);
});

test('supported and source-role exception statements remain independently inspectable', async ({ page }) => {
  await openDemo(page, { width: 1280, height: 900 });
  await page.locator('details.claim-explorer > summary').click();
  await page.locator('[data-claim-select="C1"]').click();
  await expect(page.locator('[data-review-status]')).toHaveText('Source confirmed');
  await expect(page.locator('[data-review-title]')).toHaveText('Source wording confirmed');
  await expect(page.locator('[data-review-sub]')).toContainText('four-hour limit');
  await page.locator('[data-open-source]').click();
  await expect(page.locator('[data-source-modal]')).toContainText('Page 3 · paragraph 5');
  await expect(page.locator('[data-modal-secondary]')).toBeHidden();
  await expect(page.locator('[data-i18n="compareTitle"]')).toHaveText('Compare the selected wording');
  await expect(page.locator('[data-prepared-issues]')).toHaveClass(/confirmed/);
  await expect(page.locator('[data-prepared-issues-label]')).toHaveText('Source wording confirmed');
  await expect(page.locator('[data-modal-issue-one]')).toContainText('four-hour limit and 12-month period match');
  await expect(page.locator('[data-modal-issue-two]')).toContainText('eligible as the binding source');
  await expect(page.locator('[data-next-guidance] span:last-child')).toContainText('matches the current Notice');
  await expect(page.locator('[data-source-modal]')).not.toContainText('flagged wording');
  await page.locator('details.source-proof-details > summary').click();
  const currentUrl = page.url();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Inspect the frozen evidence in a new tab' }).click();
  const evidencePage = await popupPromise;
  await evidencePage.waitForLoadState('load');
  expect(evidencePage.url()).toContain('/proof/singapore-source-review/#details-title');
  expect(page.url()).toBe(currentUrl);
  await expect(page.locator('[data-source-modal]')).toBeVisible();
  await evidencePage.close();
  await page.locator('[data-source-close]').first().click();

  await page.locator('[data-claim-select="C2"]').click();
  await expect(page.locator('[data-primary-status]')).toHaveText('Source-role mismatch');
  await expect(page.locator('[data-review-title]')).toHaveText('One source-role issue found');
  await expect(page.locator('[data-review-sub]')).toContainText('supporting FAQ');
  await expect(page.locator('[data-reasons]')).toHaveCount(1);
  await page.locator('[data-open-source]').click();
  await expect(page.locator('[data-source-modal]')).toContainText('Page 2 · Q10.1 / A10.1');
  await expect(page.locator('[data-source-modal]')).toContainText('total, partial or intermittent disruption');
  await expect(page.locator('[data-prepared-issues]')).not.toHaveClass(/confirmed/);
  await expect(page.locator('[data-prepared-issues-label]')).toHaveText('One source-role exception prepared for review');
  await expect(page.locator('[data-modal-issue-one]')).toHaveText('Reason 1 · Detail attributed to the wrong document');
  await expect(page.locator('[data-modal-issue-two]')).toHaveText('Reason 2 · Source roles must remain distinct');
  await expect(page.locator('[data-next-guidance] span:last-child')).toContainText('supporting FAQ, not in FSM-N05 itself');
  await expect(page.locator('[data-next-guidance] span:last-child')).not.toContainText('either');
  await expect(page.locator('[data-step-count]')).toHaveText('1 / 4');
  await page.locator('[data-source-close]').first().click();
  await expect(page.locator('[data-source-modal]')).toBeHidden();
  await expect(page.locator('[data-reviewer-panel]')).toBeHidden();
  await expect(page.locator('[data-step-count]')).toHaveText('1 / 4');
  await expect(page.locator('[data-open-source]')).toHaveClass(/is-next-action/);
  await page.locator('[data-open-source]').click();
  await page.locator('[data-source-continue]').click();
  await expect(page.locator('[data-reviewer-panel]')).toBeVisible();
  await expect(page.locator('[data-exception-count]')).toHaveText('1 source-role issue');
  await expect(page.locator('[data-reviewer-action]')).toContainText('supporting FAQ, not to FSM-N05 itself');
  await expect(page.locator('[data-step-count]')).toHaveText('2 / 4');
  await page.locator('[data-correct]').click();
  await expect(page.locator('[data-review-sub]')).toContainText('attributes the detail to the MAS TRM FAQ');
  await expect(page.locator('[data-reviewer-sub]')).toContainText('rather than to FSM-N05 itself');
  await expect(page.locator('[data-reviewer-action]')).toContainText('corrected FAQ attribution');
  await expect(page.locator('[data-review-sub]')).not.toContainText('“or” wording');
  await page.locator('[data-approve]').click();
  await expect(page.locator('[data-artifact-value]')).toContainText('corrected version 1.1');
  await page.locator('[data-check-changed]').click();
  await expect(page.locator('[data-document-version]')).toContainText('changed version 1.2');
  await expect(page.locator('[data-changed-result]')).toContainText('Prior decision cannot be reused');
});

test('Hold and Reject are real reviewer branches and never expose the changed-version action', async ({ page }) => {
  await openDemo(page, { width: 1280, height: 900 });
  await chooseExceptionAndOpenEvidence(page);
  await page.locator('[data-hold]').click();
  await expect(page.locator('[data-decision-value]')).toHaveText('Hold');
  await expect(page.locator('[data-next-value]')).toContainText('No next action permitted');
  await expect(page.locator('[data-review-status]')).toHaveText('On hold');
  await expect(page.locator('[data-reviewer-status]')).toHaveText('On hold');
  await expect(page.locator('[data-step-count]')).toHaveText('Decision recorded · Hold');
  await expect(page.locator('[data-check-changed]')).toBeHidden();
  await expect(page.locator('.is-next-action')).toHaveCount(0);

  await page.locator('[data-reset]').click();
  await chooseExceptionAndOpenEvidence(page);
  await page.locator('[data-reject]').click();
  await expect(page.locator('[data-decision-value]')).toHaveText('Reject');
  await expect(page.locator('[data-next-value]')).toContainText('No next action permitted');
  await expect(page.locator('[data-review-status]')).toHaveText('Rejected');
  await expect(page.locator('[data-reviewer-status]')).toHaveText('Rejected');
  await expect(page.locator('[data-step-count]')).toHaveText('Decision recorded · Reject');
  await expect(page.locator('[data-check-changed]')).toBeHidden();
});

test('language switch uses ko-KR while MAS excerpts remain in English', async ({ page }) => {
  await openDemo(page, { width: 1280, height: 900 });
  await page.locator('[data-language-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko-KR');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('AI 보조 문서를 원문과 비교해 승인하고');
  await page.screenshot({
    path: path.join(captureDir, 'desktop-ko-interactive-start.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.locator('[data-open-source]').click();
  await expect(page.locator('[data-source-modal]')).toContainText('immutable or offline backup');
  await expect(page.locator('[data-source-modal]')).toContainText('MAS 원문·공식 번역·법률 자문·규제 해석이 아닙니다');
  await expect(page.locator('[data-source-close]')).toHaveAttribute('aria-label', '원문 닫기');
  await page.locator('[data-source-close]').first().click();
  await page.locator('details.claim-explorer > summary').click();
  await page.locator('[data-claim-select="C2"]').click();
  await page.locator('[data-open-source]').click();
  await expect(page.locator('[data-next-guidance] span:last-child')).toContainText('세부 문구는 FSM-N05 자체가 아니라 보충 FAQ에');
  await page.locator('[data-source-continue]').click();
  await page.locator('[data-correct]').click();
  await expect(page.locator('[data-review-sub]')).toContainText('MAS TRM FAQ의 설명으로 표시합니다');
  await expect(page.locator('[data-review-sub]')).not.toContainText('“or” 표현');
  await page.locator('[data-language-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-SG');
});

test('mobile path remains readable, keyboard navigation works, and only one action glows', async ({ page }) => {
  const runtime = await openDemo(page, { width: 390, height: 844 });
  await expectNoOverflow(page);
  await page.screenshot({
    path: path.join(captureDir, 'mobile-interactive-start.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.locator('details.claim-explorer > summary').click();
  await page.locator('[data-claim-select="C2"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-claim-select="C3"]')).toBeFocused();
  await expect(page.locator('[data-step-count]')).toHaveText('1 / 4');
  await expect(page.locator('.is-next-action')).toHaveCount(1);
  const actionable = page.locator('button:visible, a.button:visible');
  const sizes = await actionable.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
  expect(sizes.every((height) => height >= 40)).toBe(true);
  await completeApprovePath(page);
  await expectNoOverflow(page);
  expect(runtime.externalRequests).toEqual([]);
  await prepareFullPageCapture(page);
  await page.screenshot({
    path: path.join(captureDir, 'mobile-interactive-final.png'),
    fullPage: true,
    animations: 'disabled',
  });
});
