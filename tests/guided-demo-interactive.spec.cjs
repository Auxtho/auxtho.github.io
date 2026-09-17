const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const test = require('node:test');
const root = path.resolve(__dirname,'..');
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const html = read('demo/singapore-source-review/index.html');
const script = read('src/demo-complete-path.js');
const publicPaths=JSON.parse(read('scripts/release/public-files.json')).paths;
const manifest=JSON.parse(read('assets/demo/singapore-source-review/evidence-manifest.json'));
test('six workflow stages put the recorded result before optional exception branches',() => {
  assert.deepEqual([...html.matchAll(/data-stage="(\d)"/g)].map(m=>m[1]),['1','2','3','4','5','6']);
  assert.ok(html.indexOf('data-stage="4"')<html.indexOf('data-branch="changed"'));
  assert.ok(html.indexOf('data-stage="5"')<html.indexOf('data-branch="unknown"'));
  assert.match(html,/what|What/);
  assert.match(html,/data-start/);
});
test('script and stylesheet references are exact-byte addressed',() => {
  const scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);
  for(const url of scripts) {
    const match=url.match(/\.([a-f0-9]{64})\.js$/);assert.ok(match,url);
    assert.equal(hash(fs.readFileSync(path.join(root,url.slice(1)))),match[1]);
    assert.ok(publicPaths.includes(url));
  }
  const style=html.match(/href="([^"]+complete-path\.css)\?sha256=([a-f0-9]{64})"/);
  assert.ok(style);assert.equal(hash(fs.readFileSync(path.join(root,style[1].slice(1)))),style[2]);
  const emitted=scripts.find(p=>p.includes('/complete-path.'));
  assert.equal(read(emitted.slice(1)),script);
});
test('existing M120 source wording and data remain byte-identical',() => {
  const p='assets/demo/singapore-source-review/interactive-demo-data.b7fb698009c4342c57e20e229abd927f6a22abf13ad24d5a4b4cc5fc9acedbf7.js';
  assert.equal(hash(fs.readFileSync(path.join(root,p))),'b7fb698009c4342c57e20e229abd927f6a22abf13ad24d5a4b4cc5fc9acedbf7');
  const context={window:{}};vm.runInNewContext(read(p),context);
  assert.equal(context.window.AuxthoInteractiveDemoData.claims.C1.reviewRequired,false);
  assert.match(context.window.AuxthoInteractiveDemoData.claims.C3.en.corrected,/immutable or offline/);
  assert.match(context.window.AuxthoInteractiveDemoData.claims.C2.en.corrected,/FAQ/);
});
test('image usage preserves accepted bytes and identifies separate cases',() => {
  assert.equal(manifest.correlated_single_run_claimed,false);
  assert.equal(manifest.new_product_claims,false);
  assert.equal(manifest.assets.length,6);
  for(const asset of manifest.assets){
    assert.equal(hash(fs.readFileSync(path.join(root,asset.path.slice(1)))),asset.sha256);
    assert.equal(asset.bytes_unchanged,true);
    assert.ok(asset.redaction);
    assert.ok(asset.presentation);
    assert.ok(html.includes(asset.path));
  }
  assert.match(html,/C1 on Notice page 3/);
  assert.match(html,/C3 refers to consultation page 6/);
  assert.match(html,/distinct from your review exercise/);
  assert.match(html,/Audit capture displays example data in the actual product component/);
  assert.match(html,/separate case from the preceding delivery test/);
});
test('no backend, accounts, trackers, saved browser choices or republished source PDFs',() => {
  assert.doesNotMatch(html,/<(?:input|textarea|form|select|iframe)\b/i);
  assert.doesNotMatch(html+script,/\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie)/);
  assert.doesNotMatch(html+script,/gtag|plausible|mixpanel|hotjar|google-analytics/i);
  assert.doesNotMatch(html+script,/[A-Z]:\\|localhost|127\.0\.0\.1|serviceAccount|api[_-]?key|private-provenance/i);
  assert.doesNotMatch(html+script,/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(html,/consultation-page-6\.png|<[^>]+(?:src|href)="[^"]+\.pdf/);
  assert.match(html,/No actual record is saved and no report is sent/);
});
test('approval and unconfirmed outcomes preserve their distinct meanings',() => {
  assert.match(script,/!state\.corrected \|\| !state\.inspected/);
  assert.match(script,/UNKNOWN is not a confirmed failure or success/);
  assert.match(script,/does not dispatch the action again automatically/);
  assert.match(script,/held or rejected draft has no approval to reuse/);
  assert.match(html,/inspection acknowledgment|no actual record is saved/i);
});
test('canonical metadata, bilingual mode and accessible evidence remain present',() => {
  assert.match(html,/<html lang="en-SG"/);
  assert.match(html,/rel="canonical" href="https:\/\/auxtho.com\/demo\/singapore-source-review\/"/);
  assert.match(html,/og:locale:alternate" content="ko_KR"/);
  assert.match(html,/<dialog[^>]+aria-labelledby="dialog-title"/);
  for(const m of html.matchAll(/<img\b[^>]+>/g)) assert.match(m[0],/alt="[^"]*"/);
  assert.match(script,/'en-SG' : 'ko-KR'/);
  assert.match(script,/showModal\(\)/);
  assert.match(html,/<noscript>/);
});
test('homepage changes only by approved membership block; public proof and release identity remain untouched',() => {
  for(const p of ['index.html','release.json','proof/singapore-source-review/index.html','capabilities/index.html','assets/capabilities/manifest.json']){
    const baseline=execFileSync('git',['show','43d229eeeedfe3c5190416995271e14c2245325a:'+p],{cwd:root,windowsHide:true});
    let current=fs.readFileSync(path.join(root,p));
    if(p==='index.html'){
      const original=current.toString('utf8');
      assert.match(original,/Auxtho is a member of NVIDIA Inception\./);
      const withoutMembership=original.replace(/^  <link rel="stylesheet" href="\/assets\/membership\.css\?sha256=[a-f0-9]{64}">\n/m,'').replace(/^  <section class="inception-membership"[\s\S]*?^  <\/section>\n/m,'');
      current=Buffer.from(withoutMembership);
    }
    assert.equal(hash(current),hash(baseline),p);
  }
});
test('the short demo note leads with the workflow and detailed evidence stays available',() => {
  const brief=html.match(/data-i18n="sourceNote">([^<]+)</)[1];
  assert.match(brief,/source review, human decisions, result records and event reconstruction/);
  assert.match(brief,/example data/);
  assert.doesNotMatch(brief,/does not|not |provider|production|cognitive/i);
  assert.match(html,/<details class="demo-details" data-demo-details>/);
  const detail=html.match(/<details class="demo-details"[\s\S]+?<\/details>/)[0];
  assert.match(detail,/synthetic example data in a local environment/);
  assert.match(detail,/without external AI-provider calls/);
  assert.match(detail,/Customer operation and hosted-production outcomes are outside this evidence scope/);
  assert.match(detail,/29 August 2026/);
  assert.match(detail,/MAS affiliation or endorsement/);
  assert.match(detail,/No actual record is saved and no report is sent/);
  assert.match(detail,/authenticated reviewer’s statement/);
  assert.match(manifest.proof_boundaries.inspection,/no cognitive-understanding claim/);
});
test('Korean first-layer language names the work and leaves proof terminology in its detail layer',() => {
  assert.match(script,/보고서의 검토 대상 문장을 Auxtho가 원문과 대조합니다/);
  assert.match(script,/승인한 보고서와 처리 결과를 함께 기록합니다/);
  assert.match(script,/어떤 자료를 보고, 어느 버전을 승인했을까요/);
  assert.match(script,/sourceNoteTitle:'데모 안내'/);
  assert.doesNotMatch(script,/이해 여부를 입증하지 않습니다/);
  assert.doesNotMatch(html,/proof of cognitive understanding/);
});
