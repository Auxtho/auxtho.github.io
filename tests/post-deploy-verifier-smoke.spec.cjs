const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { findBrokenImageSources, navigatePublicPage } = require('../scripts/release/browser-readback.cjs');

const origin = process.env.PUBLIC_SITE_ORIGIN;
const sourceSha = process.env.EXPECTED_SITE_SHA;
const evidenceDirectory = path.resolve(__dirname, '..', 'post-deploy-evidence');

test.describe.configure({ mode: 'serial', timeout: 120_000 });
test.use({ screenshot: 'only-on-failure' });

async function readPublicPage(page, url, expectedStatus, label) {
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  return (await navigatePublicPage({
    url, expectedStatus,
    navigate: (target, options) => page.goto(target, options),
    observe: async (observation, response) => {
      // Written incrementally, including the failed page before any rollback.
      fs.appendFileSync(path.join(evidenceDirectory, 'browser-navigation-attempts.jsonl'),
        JSON.stringify({ checked_at: new Date().toISOString(), source_sha: sourceSha, ...observation }) + '\n');
      if (observation.status === expectedStatus && !observation.error) return;
      const stem = label.replace(/[^a-z0-9-]/gi, '-').slice(0, 100) + '-attempt-' + observation.attempt;
      if (response) {
        try {
          const body = await response.body();
          fs.writeFileSync(path.join(evidenceDirectory, stem + '-response.bin'), body.subarray(0, 262144));
        } catch (error) {
          fs.writeFileSync(path.join(evidenceDirectory, stem + '-body-error.txt'), String(error.message));
        }
      }
      try { await page.screenshot({ path: path.join(evidenceDirectory, stem + '.png'), timeout: 3000 }); } catch {}
    },
  })).response;
}

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

  await page.emulateMedia({ reducedMotion: 'reduce' });

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
    ...['ko', 'en'].map(lang => ({ path: `/whitecell/?lang=${lang}`, status: 200, locator: '#oversight' })),
    ...['auxtho', 'moirion', 'agent-runner', 'ardamire', 'metdol'].map(id => ({ path: `/products/${id}/`, status: 200, locator: 'main' })),
    { path: '/proof/workflow-overview/', status: 200, locator: 'main' },
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
    const response = await readPublicPage(page, url.toString(), item.status, item.path);
    expect(response, `missing response: ${url}`).not.toBeNull();
    expect(response.status(), `unexpected page status: ${url}`).toBe(item.status);
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
        const portfolioDialog = element.closest('dialog.image-dialog');
        return (element.id === 'sample-lightbox-image' && Boolean(lightbox) && !lightbox.open)
          || (Boolean(portfolioDialog) && !portfolioDialog.open && !element.hasAttribute('src'));
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
      const portfolioDialog = image.closest('dialog.image-dialog');
      return {
        source: image.currentSrc || image.getAttribute('src'),
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        descriptor: image.id ? `#${image.id}` : 'img',
        inactiveSampleLightboxPlaceholder: (image.id === 'sample-lightbox-image'
          && Boolean(lightbox)
          && !lightbox.open) || (Boolean(portfolioDialog) && !portfolioDialog.open && !image.hasAttribute('src')),
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

test('published WhiteCell preserves bilingual roles, human oversight, controls and mobile layout', async ({ page }) => {
  expect(origin).toBe('https://auxtho.com');
  expect(sourceSha).toMatch(/^[0-9a-f]{40}$/);
  const failures = [], consoleErrors = [], pageErrors = [], nonReadRequests = [];
  const evidence = { source_sha: sourceSha, checked_at: new Date().toISOString(), status: 'FAIL', languages: [] };
  page.on('requestfailed', request => {
    if (new URL(request.url()).origin === origin) failures.push({ method: request.method(), url: request.url(), error: request.failure()?.errorText });
  });
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (!['GET', 'HEAD'].includes(request.method())) nonReadRequests.push({ method: request.method(), url: request.url() });
  });
  // This acceptance test must never deliver a non-read request, even on failure.
  await page.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort('blockedbyclient'));
  const expected = {
    ko: {
      architectureIntro: '관찰과 집행은 독립된 역할입니다. WhiteCell은 경계 안팎을 살피고, Ardamire Defense Layer는 별도의 권한과 정책으로 실제 행동을 통제합니다.',
      whitecellBody: 'WhiteCell은 허가된 범위에서 관찰·조사하고, 신호와 근거를 연결해 격리 요청과 방어 개선안을 제시합니다. WhiteCell 자신도 경계를 넘거나 자료에 접근하고 행동하려면 Ardamire의 권한 검사를 거칩니다.',
      ardamireBody: 'Ardamire는 독립적인 권한으로 행동을 통제하는 방어 계층입니다. WhiteCell의 신호도 현재 신원·권한·대상 상태와 미리 승인된 정책에 대조해 판단하고, 대상별 검사·보류·격리를 집행합니다. AI의 판단이 곧 행동 권한이 되지는 않습니다.',
      authorityNote: '새로운 방어 정책과 중요한 변경·복구는 검증 후 권한 있는 사람이 승인합니다. AI가 자신의 제안을 승인하지 않습니다.',
      oversightIntro: 'WhiteCell의 관찰과 Ardamire의 집행 근거를 사건별로 연결하고, Auxtho Console의 Live Operator Wall을 사람의 감독과 개입 지점으로 두는 구조입니다.',
      recordBody: '관찰·분석·정정은 새 기록으로 더하고, 원본과 이전 기록은 보존하는 원칙입니다. 확인된 사실과 AI의 추정을 구분하며, 판단이 바뀐 이유까지 남깁니다.',
      forensicBody: '자료·버전·행동의 이력을 연결해 포렌식 조사로 이어갑니다. 원본 근거와 분석, 격리 재현 결과를 구분하고 조치의 이유와 경과를 추적합니다.',
      humanBody: 'Live Operator Wall에서 권한 있는 담당자가 사건·근거·조치 상태와 미확인 사항을 살핍니다. 새로운 방어 정책과 중요한 변경·복구는 검증 후 사람이 승인하며, 최종 책임도 사람이 맡습니다.',
      oversightNote: '미리 승인된 범위의 보호 대응과 사람의 감독은 함께 작동합니다. 화면을 보는 행위가 집행 권한을 대신하지는 않습니다.',
      steps: ['탐지', '대상 격리', '격리 환경 재현', '패턴 분석', '방어 개선안', '검증 후 적용'],
      titles: ['평범한 흐름에서, 다른 신호를 읽다.', '전체가 아니라, 영향받는 대상을.', '운영과 분리해, 같은 원인을 살피다.', '반복된 문구보다, 경계를 넘는 행동을.', '관찰한 근거를, 제한된 개선안으로.', '검증한 것만, 다음 방어에.'],
      pause: '움직임 멈추기', resume: '움직임 재생하기', reduced: '동작 줄이기 적용 중', introduction: 'Ardamire WhiteCell 소개 ↗',
    },
    en: {
      architectureIntro: 'Observation and enforcement are independent roles. WhiteCell observes on both sides of the boundary. Ardamire Defense Layer governs actual actions under separate authority and policy.',
      whitecellBody: 'WhiteCell observes and investigates within its authorised scope, linking signals with evidence to request containment and propose defensive improvements. WhiteCell itself must pass Ardamire’s authority checks to cross boundaries, access material or act.',
      ardamireBody: 'Ardamire is the independent boundary authority. It checks WhiteCell signals against current identity, authority, target state and preauthorised policy, then enforces scoped checks, holds and containment. An AI judgement is not permission to act.',
      authorityNote: 'New defence policies and consequential changes or recovery require verification and approval by authorised people. The AI does not approve its own proposals.',
      oversightIntro: 'The architecture links WhiteCell observations and Ardamire enforcement evidence by case, placing the Live Operator Wall in Auxtho Console at the point of human oversight and intervention.',
      recordBody: 'The principle is to append observations, analyses and corrections while preserving originals and earlier records. Separate verified facts from AI inference, including the reasons for a changed assessment.',
      forensicBody: 'Link material, versions and action history for forensic investigation. Keep original evidence, analysis and isolated replay results distinct, and trace the reasons and sequence behind each response.',
      humanBody: 'Authorised operators use the Live Operator Wall to review cases, evidence, action status and unresolved questions. People verify and approve new defence policies and consequential changes or recovery, and retain final accountability.',
      oversightNote: 'Preauthorised, scoped protection and human oversight work together. Viewing the wall does not confer authority to enforce an action.',
      steps: ['Detect', 'Contain the target', 'Reproduce in isolation', 'Analyse patterns', 'Propose improvements', 'Validate, then apply'],
      titles: ['Read the difference in an ordinary flow.', 'Contain the target. Scope the impact.', 'Same cause. A separate environment.', 'Beyond repeated words. Understand the action.', 'Turn evidence into a scoped proposal.', 'Validate before the next defence.'],
      pause: 'Pause motion', resume: 'Resume motion', reduced: 'Reduced motion enabled', introduction: 'Explore Ardamire WhiteCell ↗',
    },
  };
  async function assertLanguage(lang) {
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    for (const key of ['architectureIntro', 'whitecellBody', 'ardamireBody', 'authorityNote', 'oversightIntro', 'recordBody', 'forensicBody', 'humanBody', 'oversightNote']) {
      await expect(page.locator(`[data-i18n="${key}"]`)).toHaveText(expected[lang][key], { useInnerText: true });
    }
    await expect(page.locator('#oversight [data-i18n="oversightIntro"]')).toContainText('Live Operator Wall');
    await expect(page.locator('#oversight [data-i18n="forensicBody"]')).toContainText(lang === 'ko' ? '포렌식 조사' : 'forensic investigation');
  }
  const heroMotion = '.hero .gate-light, .jewel-illumination, .hero-art .moonlight>span';
  const allMotion = `${heroMotion}, .boundary-core, .boundary-nucleus, .boundary-orbit.orbit-one, .boundary-signal, .boundary-receiver`;
  const animationStates = selector => page.locator(selector).evaluateAll(elements => elements.map(element => ({ name: getComputedStyle(element).animationName, state: getComputedStyle(element).animationPlayState })));
  async function canvasSample() {
    return page.locator('#whitecell-field').evaluate(async canvas => {
      if (!canvas.width || !canvas.height) throw new Error('WhiteCell canvas has no drawable size');
      const before = canvas.toDataURL();
      for (let frame = 0; frame < 12; frame += 1) await new Promise(resolve => requestAnimationFrame(resolve));
      return { changed: before !== canvas.toDataURL(), width: canvas.width, height: canvas.height };
    });
  }
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  try {
    for (const lang of ['ko', 'en']) {
      const result = { language: lang, stages: [], screenshots: [] };
      evidence.languages.push(result);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const response = await readPublicPage(page, `${origin}/whitecell/?lang=${lang}&sha256_readback=${sourceSha}`, 200, `whitecell-${lang}`);
      expect(response.status()).toBe(200);
      await assertLanguage(lang);
      await page.locator('#language').click();
      await assertLanguage(lang === 'ko' ? 'en' : 'ko');
      await page.locator('#language').click();
      await assertLanguage(lang);
      result.language_switch_roundtrip = true;
      const tabs = page.locator('[role="tab"][data-step]');
      await expect(tabs).toHaveCount(6);
      for (let index = 0; index < 6; index += 1) {
        await expect(tabs.nth(index).locator('[data-i18n]')).toHaveText(expected[lang].steps[index]);
        await tabs.nth(index).click();
        await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'true');
        await expect(tabs.nth(index)).toHaveAttribute('tabindex', '0');
        await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
        await expect(page.locator('#step-panel')).toHaveAttribute('data-active', String(index));
        await expect(page.locator('#step-panel')).toHaveAttribute('aria-labelledby', `step-tab-${index}`);
        await expect(page.locator('#step-title')).toHaveText(expected[lang].titles[index], { useInnerText: true });
        await expect(page.locator('#step-body')).not.toBeEmpty();
        await expect(page.locator('#step-counter')).toHaveText(`${String(index + 1).padStart(2, '0')} / 06`);
        result.stages.push(index);
      }
      await page.locator('#next-step').click();
      await expect(page.locator('#step-panel')).toHaveAttribute('data-active', '0');
      const motionButtons = page.locator('[data-motion-toggle]');
      await expect(motionButtons).toHaveCount(2);
      for (const button of await motionButtons.all()) { await expect(button).toBeEnabled(); await expect(button).toHaveText(expected[lang].pause); }
      await expect(page.locator(heroMotion)).toHaveCount(4);
      await expect(page.locator(allMotion)).toHaveCount(9);
      await expect.poll(async () => (await animationStates(heroMotion)).every(item => item.name !== 'none' && item.state === 'running')).toBe(true);
      await motionButtons.nth(0).click();
      await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'true');
      for (const button of await motionButtons.all()) { await expect(button).toHaveAttribute('aria-pressed', 'true'); await expect(button).toHaveText(expected[lang].resume); }
      result.manual_paused_css = await animationStates(allMotion);
      expect(result.manual_paused_css.every(item => item.name !== 'none' && item.state === 'paused')).toBe(true);
      await page.locator('#whitecell-field').scrollIntoViewIfNeeded();
      result.manual_paused_canvas = await canvasSample();
      expect(result.manual_paused_canvas.changed).toBe(false);
      await motionButtons.nth(1).click();
      await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'false');
      for (const button of await motionButtons.all()) { await expect(button).toHaveAttribute('aria-pressed', 'false'); await expect(button).toHaveText(expected[lang].pause); }
      await expect.poll(async () => (await animationStates(heroMotion)).every(item => item.name !== 'none' && item.state === 'running')).toBe(true);
      await page.locator('#whitecell-field').scrollIntoViewIfNeeded();
      await expect.poll(async () => (await canvasSample()).changed).toBe(true);
      result.manual_resume_canvas_changes = true;
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const button of await motionButtons.all()) { await expect(button).toBeDisabled(); await expect(button).toHaveText(expected[lang].reduced); }
      await expect.poll(async () => (await animationStates(allMotion)).every(item => item.name === 'none')).toBe(true);
      result.reduced_motion_css = await animationStates(allMotion);
      result.reduced_motion_canvas = await canvasSample();
      expect(result.reduced_motion_canvas.changed).toBe(false);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      for (const button of await motionButtons.all()) await expect(button).toBeEnabled();
      await expect.poll(async () => (await animationStates(heroMotion)).every(item => item.name !== 'none' && item.state === 'running')).toBe(true);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.locator('#oversight').scrollIntoViewIfNeeded();
      const desktopShot = `whitecell-${lang}-desktop-oversight.png`;
      await page.screenshot({ path: path.join(evidenceDirectory, desktopShot), fullPage: false });
      result.screenshots.push(desktopShot);
      await page.setViewportSize({ width: 390, height: 844 });
      await assertLanguage(lang);
      result.mobile_widths = await page.evaluate(() => ({ inner: innerWidth, client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      expect(result.mobile_widths.inner).toBe(390);
      expect(result.mobile_widths.scroll - result.mobile_widths.client).toBeLessThanOrEqual(1);
      for (const section of ['top', 'oversight']) {
        await page.locator(`#${section}`).scrollIntoViewIfNeeded();
        const shot = `whitecell-${lang}-mobile-${section}.png`;
        await page.screenshot({ path: path.join(evidenceDirectory, shot), fullPage: false });
        result.screenshots.push(shot);
      }
      const ardamire = await readPublicPage(page, `${origin}/products/ardamire/?lang=${lang}&sha256_readback=${sourceSha}`, 200, `whitecell-introduction-${lang}`);
      expect(ardamire.status()).toBe(200);
      const introduction = page.locator('[data-whitecell-introduction]');
      await expect(introduction).toHaveCount(1);
      await expect(introduction).toHaveText(expected[lang].introduction);
      await expect(introduction).toHaveAttribute('href', `/whitecell/?lang=${lang}`);
      await expect(introduction).toBeVisible();
      await introduction.scrollIntoViewIfNeeded();
      const introductionShot = `whitecell-${lang}-ardamire-introduction.png`;
      await page.screenshot({ path: path.join(evidenceDirectory, introductionShot), fullPage: false });
      result.screenshots.push(introductionShot);
      result.ardamire_introduction_href = await introduction.getAttribute('href');
    }
    expect(failures).toEqual([]);
    expect(consoleErrors.filter(message => /content security policy|refused to load|blocked/i.test(message))).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(nonReadRequests).toEqual([]);
    evidence.status = 'PASS';
  } finally {
    // Preserve raw observations and partial progress if any assertion triggers rollback.
    fs.writeFileSync(path.join(evidenceDirectory, 'whitecell-hosted-smoke.json'), JSON.stringify({ ...evidence,
      same_origin_request_failures: failures, console_errors: consoleErrors, page_errors: pageErrors, non_get_head_requests: nonReadRequests,
    }, null, 2) + '\n');
  }
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

  const response = await readPublicPage(
    page, `${origin}/verify.html?report=RPT-RETIRED&h=${'a'.repeat(64)}&exp=EXP-RETIRED`,
    404, 'retired-verifier',
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

test('published guided demo preserves source scope, review choices, recorded evidence and mobile focus', async ({ page }) => {
  expect(origin).toBe('https://auxtho.com');
  expect(sourceSha).toMatch(/^[0-9a-f]{40}$/);
  const errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.method()!=='GET')writes.push(request.url());});
  await page.setViewportSize({width:390,height:844});
  const response=await readPublicPage(page,origin+'/demo/singapore-source-review/?lang=ko&sha256_readback='+sourceSha,200,'guided-demo');
  expect(response.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang','ko-KR');
  await page.locator('[data-next="2"]').click();
  await expect(page.locator('.pack-date')).toContainText('2026');
  await expect(page.locator('[data-original-title]')).toContainText('별도의');
  await page.locator('[data-review-next]').click();
  await expect(page.locator('[data-approve]')).toBeDisabled();
  await page.locator('[data-correct]').click();
  await page.locator('[data-attest]').click();
  await page.locator('[data-approve]').click();
  await page.locator('[data-next="4"]').click();
  await expect(page.locator('.case-transition')).toContainText('검토 체험과 구분된 각각의 사례');
  expect(await page.locator('[data-result-evidence]').evaluate(e=>e.scrollLeft)).toBeGreaterThan(600);
  await page.locator('[data-next="5"]').click();
  await page.locator('[data-open-audit]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-audit-figure] .evidence-scroll')).toBeFocused();
  await page.locator('[data-next="6"]').click();
  await expect(page.locator('[data-stage="6"]')).toContainText('통보 기준');
  await page.locator('[data-branch="unknown"]').click();
  await expect(page.locator('[data-dialog-content]')).toContainText('UNKNOWN');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-branch="unknown"]')).toBeFocused();
  await expect(page.locator('[data-demo-details]')).not.toHaveAttribute('open','');
  await expect(page.locator('[data-i18n="sourceNote"]')).toContainText('안내형 데모');
  await page.locator('[data-demo-details] summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-i18n="proofEnvironment"]')).toBeVisible();
  await expect(page.locator('[data-i18n="materialsNote"]')).toContainText('2026년 8월 29일');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-demo-details]')).not.toHaveAttribute('open','');
  const widths=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  expect(widths.scroll-widths.client).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
  fs.mkdirSync(evidenceDirectory,{recursive:true});
  await page.screenshot({path:path.join(evidenceDirectory,'guided-demo-mobile.png'),fullPage:false});
  fs.writeFileSync(path.join(evidenceDirectory,'guided-demo-smoke.json'),JSON.stringify({source_sha:sourceSha,checked_at:new Date().toISOString(),page_errors:errors,non_get_requests:writes,widths,separate_case_boundary:true,source_scope_visible:true},null,2)+'\n');
});
