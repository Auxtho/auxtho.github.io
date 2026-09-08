const fs = require('node:fs');
const path = require('node:path');
const {expect,test} = require('@playwright/test');
const {createServer} = require('../scripts/qa/serve-demo.cjs');
let server,base;
const captures=path.resolve(__dirname,'../test-results/demo-complete-path-qa');
test.beforeAll(async () => {
  fs.mkdirSync(captures,{recursive:true});
  server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port;
});
test.afterAll(async () => { if(server) await new Promise(resolve=>server.close(resolve)); });
async function overflow(page) {
  const sizes=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  expect(sizes.scroll-sizes.client).toBeLessThanOrEqual(1);
}
async function stage(page,n) {
  await expect(page.locator('[data-stage="'+n+'"]')).toBeVisible();
  await expect(page.locator('[data-stage]:visible')).toHaveCount(1);
  await expect(page.locator('[data-progress]')).toContainText(n+' / 6');
  await overflow(page);
}
async function capture(page,name) {
  await page.screenshot({path:path.join(captures,name+'.png'),animations:'disabled',fullPage:false});
}
async function enterDecision(page,language='en') {
  await page.goto(base+'/demo/singapore-source-review/');
  if(language==='ko') await page.locator('[data-language-toggle]').click();
  await page.locator('[data-next="2"]').click();
  await page.locator('[data-review-next]').click();
  await stage(page,3);
}
for(const [width,height] of [[1440,1000],[390,844]]) {
  for(const language of ['en','ko']) {
    test('complete normal path and optional branches '+width+' '+language,async({page})=>{
      await page.setViewportSize({width,height});
      const issues=[],requests=[];
      page.on('pageerror',e=>issues.push(e.message));
      page.on('console',e=>{if(e.type()==='error')issues.push(e.text());});
      page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
      await page.goto(base+'/demo/singapore-source-review/');
      if(language==='ko') await page.locator('[data-language-toggle]').click();
      await expect(page.locator('html')).toHaveAttribute('lang',language==='ko'?'ko-KR':'en-SG');
      const start=await page.locator('[data-start]').boundingBox();
      expect(start.y+start.height).toBeLessThan(height);
      await overflow(page);
      await capture(page,width+'-'+language+'-intro');
      await page.locator('[data-start]').click();
      await stage(page,1);
      await page.locator('[data-next="2"]').click();
      await stage(page,2);
      await expect(page.locator('[data-claim="C3"]')).toHaveAttribute('aria-pressed','true');
      await capture(page,width+'-'+language+'-source');
      await page.locator('[data-review-next]').click();
      await stage(page,3);
      await expect(page.locator('[data-approve]')).toBeDisabled();
      await page.locator('[data-correct]').click();
      await expect(page.locator('[data-approve]')).toBeDisabled();
      await page.locator('[data-attest]').click();
      await expect(page.locator('[data-approve]')).toBeEnabled();
      await capture(page,width+'-'+language+'-decision');
      await page.locator('[data-approve]').click();
      await expect(page.locator('[data-reviewed-version]')).toHaveText('1.1');
      await expect(page.locator('[data-example-record]')).toBeVisible();
      await page.locator('[data-next="4"]').click();
      await stage(page,4);
      await expect(page.locator('.case-transition')).toBeVisible();
      await expect(page.locator('[data-branch="changed"]')).not.toBeVisible();
      await capture(page,width+'-'+language+'-result');
      await page.locator('[data-next="5"]').click();
      await stage(page,5);
      await expect(page.locator('[data-audit-figure]')).not.toBeVisible();
      await page.locator('[data-open-audit]').click();
      await expect(page.locator('[data-audit-figure]')).toBeVisible();
      await capture(page,width+'-'+language+'-audit');
      await page.locator('[data-next="6"]').click();
      await stage(page,6);
      await capture(page,width+'-'+language+'-reconstruction');
      await page.locator('[data-branch="changed"]').click();
      await expect(page.locator('[data-dialog]')).toBeVisible();
      await expect(page.locator('[data-dialog-content]')).toContainText('1.2');
      await overflow(page);
      await capture(page,width+'-'+language+'-changed');
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-branch="changed"]')).toBeFocused();
      await page.locator('[data-branch="unknown"]').click();
      await expect(page.locator('[data-dialog-content]')).toContainText('UNKNOWN');
      await capture(page,width+'-'+language+'-unknown');
      await page.locator('[data-close]').click();
      await page.locator('[data-go-audit]').click();
      await stage(page,5);
      await expect(page.locator('[data-audit-figure]')).toBeVisible();
      await page.locator('[data-reset]').click();
      await stage(page,1);
      await expect(page.locator('[data-example-record]')).not.toBeVisible();
      expect(issues).toEqual([]);
      expect(requests.every(r=>r.method==='GET'&&r.url.startsWith(base))).toBe(true);
      expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length,cookies:document.cookie}))).toEqual({local:0,session:0,cookies:''});
    });
  }
}
for(const choice of ['hold','reject']){
  test(choice+' never creates an approved result or a reusable changed-version approval',async({page})=>{
    await enterDecision(page);
    await page.locator('[data-'+choice+']').click();
    await expect(page.locator('[data-permission]')).toHaveText('No next action permitted');
    await expect(page.locator('[data-reviewed-version]')).toHaveText('1.0');
    await expect(page.locator('[data-approve]')).toBeDisabled();
    await page.locator('[data-next="4"]').click();
    await expect(page.locator('.case-transition')).toContainText('not records created by your clicks');
    await page.locator('[data-next="5"]').click();
    await page.locator('[data-next="6"]').click();
    await page.locator('[data-branch="changed"]').click();
    await expect(page.locator('[data-dialog-content]')).toContainText('has no approval to reuse');
  });
}
test('C1 opens the matching original-page evidence without becoming an approval',async({page})=>{
  await page.goto(base+'/demo/singapore-source-review/');
  await page.locator('[data-next="2"]').click();
  await page.locator('[data-claim="C1"]').click();
  await expect(page.locator('[data-review-next]')).toBeDisabled();
  await expect(page.locator('[data-supported]')).toBeVisible();
  await expect(page.locator('[data-original-details]')).toHaveAttribute('open','');
  await expect(page.locator('[data-original-image]')).toHaveAttribute('alt',/C1.*page 3/);
  await page.locator('[data-crop="wording"]').click();
  await expect(page.locator('.source-window')).toHaveClass(/wording/);
  await page.locator('[data-crop="page"]').click();
  await page.locator('[data-zoom="source"]').click();
  await expect(page.locator('[data-dialog] img')).toHaveAttribute('src',/exact-source-page/);
  await page.locator('[data-dialog]').screenshot({path:path.join(captures,'original-page-dialog.png')});
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-zoom="source"]')).toBeFocused();
});
test('C2 correction attributes the FAQ and changing source case clears the prior decision',async({page})=>{
  await page.goto(base+'/demo/singapore-source-review/');
  await page.locator('[data-next="2"]').click();
  await page.locator('[data-claim="C2"]').click();
  await expect(page.locator('[data-source-title]')).toContainText('One source-role issue');
  await page.locator('[data-review-next]').click();
  await expect(page.locator('[data-correction]')).toContainText('FAQ');
  await page.locator('[data-correct]').click();
  await page.locator('[data-attest]').click();
  await page.locator('[data-approve]').click();
  await page.locator('[data-back="2"]').click();
  await page.locator('[data-claim="C3"]').click();
  await page.locator('[data-review-next]').click();
  await expect(page.locator('[data-approve]')).toBeDisabled();
  await expect(page.locator('[data-example-record]')).not.toBeVisible();
});
test('returning to the work restarts the default case without retaining a different statement',async({page})=>{
  await page.goto(base+'/demo/singapore-source-review/');
  await page.locator('[data-next="2"]').click();
  await page.locator('[data-claim="C2"]').click();
  await page.locator('[data-back="1"]').click();
  await expect(page.locator('[data-stage="1"] [data-draft]')).toContainText('both immutable and offline');
  await page.locator('[data-next="2"]').click();
  await expect(page.locator('[data-claim="C3"]')).toHaveAttribute('aria-pressed','true');
});
test('frozen comparison scope and the separate original-page label are explicit',async({page})=>{
  await page.goto(base+'/demo/singapore-source-review/');
  await page.locator('[data-next="2"]').click();
  await expect(page.locator('[data-original-title]')).toContainText('Separate original-page example');
  await expect(page.locator('.pack-date')).toHaveText('Source pack frozen 29 August 2026');
  await page.locator('[data-claim="C1"]').click();
  await expect(page.locator('[data-source-title]')).toContainText('limit and period');
  await expect(page.locator('[data-scope-note]')).toContainText('operations or service to customers');
  await expect(page.locator('[data-source-role]')).toHaveText('Primary source in this frozen pack');
  await page.locator('[data-claim="C2"]').click();
  await expect(page.locator('[data-reason-one-title]')).toContainText('Reason 1');
  await expect(page.locator('[data-reason-two-title]')).toContainText('Reason 2');
  await expect(page.locator('[data-scope-note]')).toContainText('critical-system malfunction');
  await page.locator('[data-review-next]').click();
  await expect(page.locator('[data-correction-scope]')).toContainText('source attribution');
});
test('mobile evidence controls expose the result and Audit reopening while retaining keyboard focus',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await enterDecision(page,'ko');
  await page.locator('[data-correct]').click();
  await page.locator('[data-attest]').click();
  await page.locator('[data-approve]').click();
  await page.locator('[data-next="4"]').click();
  const result=page.locator('[data-result-evidence]');
  expect(await result.evaluate(e=>e.scrollLeft)).toBeGreaterThan(600);
  await expect(page.locator('[data-result-view="outcome"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-stage="4"] .scroll-cue')).toBeVisible();
  await page.locator('[data-result-view="decision"]').click();
  expect(await result.evaluate(e=>e.scrollLeft)).toBe(0);
  await page.locator('[data-result-view="outcome"]').click();
  await capture(page,'390-ko-focused-receipt-outcome');
  await page.locator('[data-next="5"]').click();
  await page.locator('[data-open-audit]').focus();
  await page.keyboard.press('Enter');
  const audit=page.locator('[data-audit-figure] .evidence-scroll');
  await expect(audit).toBeFocused();
  await expect(page.locator('[data-audit-announcement]')).toContainText('열었습니다');
  await page.locator('[data-audit-view="reopen"]').click();
  expect(await audit.evaluate(e=>e.scrollLeft)).toBeGreaterThan(0);
  await capture(page,'390-ko-focused-source-reopening');
});
test('Korean proof navigation and image alternatives are localised',async({page})=>{
  await page.goto(base+'/demo/singapore-source-review/?lang=ko');
  await expect(page.locator('.path-nav')).toHaveAttribute('aria-label','워크스루 진행 단계');
  await expect(page.locator('[data-original-image]')).toHaveAttribute('alt',/실제 제품 원문 화면/);
  await page.locator('[data-next="2"]').click();
  await page.locator('[data-original-title]').click();
  await page.locator('[data-zoom="source"]').click();
  await expect(page.locator('#dialog-title')).toContainText('3쪽');
  await expect(page.locator('[data-dialog] img')).toHaveAttribute('alt',/노란색/);
});
test('language changes preserve exact approval and native dialog traps keyboard focus',async({page})=>{
  await enterDecision(page);
  await page.locator('[data-correct]').click();
  await page.locator('[data-attest]').click();
  await page.locator('[data-approve]').click();
  await page.locator('[data-language-toggle]').click();
  await expect(page.locator('[data-reviewed-version]')).toHaveText('1.1');
  await expect(page.locator('[data-approve]')).toBeDisabled();
  await page.locator('[data-next="4"]').click();
  await page.locator('[data-zoom="release"]').click();
  await page.keyboard.press('Shift+Tab');
  expect(await page.locator('[data-dialog]').evaluate(d=>d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  expect(await page.locator('[data-dialog]').evaluate(d=>d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-zoom="release"]')).toBeFocused();
});
for(const width of [320,768,1280]){
  test('layout has no page overflow at '+width+' px',async({page})=>{
    await page.setViewportSize({width,height:900});
    await enterDecision(page,'ko');
    await overflow(page);
    await page.locator('[data-correct]').click();
    await page.locator('[data-attest]').click();
    await page.locator('[data-approve]').click();
    for(const n of [4,5,6]){
      await page.locator('[data-next="'+n+'"]').click();
      await stage(page,n);
    }
  });
}
test('links and local assets resolve, and the preview exposes no private source paths',async({page,request})=>{
  const bad=[];
  page.on('response',r=>{if(r.status()>=400)bad.push(r.url());});
  await page.goto(base+'/demo/singapore-source-review/');
  const links=await page.locator('a[href]').evaluateAll(es=>es.map(e=>e.getAttribute('href')).filter(u=>u.startsWith('/')));
  for(const href of [...new Set(links)]){
    const r=await request.get(base+href.split('#')[0]);expect(r.status(),href).toBe(200);
  }
  expect(bad).toEqual([]);
  for(const p of ['/src/demo-complete-path.js','/docs/demo-complete-path/CLAIM_MAP.md','/.git/config']){
    expect((await request.get(base+p)).status()).toBe(404);
  }
});
test('JavaScript-disabled page has a useful evidence fallback',async({browser})=>{
  const context=await browser.newContext({javaScriptEnabled:false});
  const page=await context.newPage();
  await page.goto(base+'/demo/singapore-source-review/');
  await expect(page.locator('.notice')).toContainText('Capability Library');
  await expect(page.locator('.notice a')).toBeVisible();
  await context.close();
});
