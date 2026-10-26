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

test('queued dialog close preserves newer outside focus and restores stranded focus',() => {
  const handler=script.match(/addEventListener\('close',\(\) => \{([\s\S]*?)\n  \}\);/);
  assert.ok(handler,'dialog close handler exists');
  const body={},inside={},summary={};
  const dialog={contains:e=>e===inside};
  for(const active of [summary,body,inside]) {
    let restored=0;
    const state={dialogKind:'unknown',returnFocus:{isConnected:true,focus:()=>{restored++;}}};
    vm.runInNewContext(handler[1],{
      state,q:()=>dialog,
      document:{activeElement:active,body:Object.assign(body,{classList:{remove:()=>{}}})},
    });
    assert.equal(restored,active===summary?0:1);
    assert.equal(state.dialogKind,null);
  }
});
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
test('archived financial overview preserves reviewed copy and markup except exact typography stylesheet identities',() => {
  for(const p of ['index.html','release.json','proof/singapore-source-review/index.html','capabilities/index.html','assets/capabilities/manifest.json']){
    const baseline=execFileSync('git',['show','23e28e26c995f340df151d51e4177d22e30aeb48:'+p],{cwd:process.env.AUXTHO_PUBLIC_VERIFY_GIT_ROOT || root,windowsHide:true});
    let current=fs.readFileSync(path.join(root,p==='index.html'?'proof/workflow-overview/index.html':p));
    if(p==='index.html'){
      const original=current.toString('utf8');
      assert.match(original,/Auxtho is a member of NVIDIA Inception\./);
      assert.equal((original.match(/RECORDED DEFENSE CONTROLS/g)||[]).length,1);
      const restoredCard=original
        .replace('<span>RECORDED DEFENSE CONTROLS</span>','<span>MODELED DEFENSIVE SEQUENCE</span>')
        .replace('<small>Recorded April implementation and tests: related signals, targeted holds, replay evidence, and separately reviewed defensive changes.</small>','<small>Public model: Detect <b>&rarr;</b> Quarantine <b>&rarr;</b> Analyze <b>&rarr;</b> Harden proposal <b>&rarr;</b> Human review <b>&rarr;</b> Verify before rollout</small>')
        .replace('<em>Inspect Ardamire records <b aria-hidden="true">&rarr;</b></em>','<em>Explore Ardamire <b aria-hidden="true">&rarr;</b></em>');
      current=Buffer.from(restoredCard);
    }
    const headingsOnly = value => value
      .replace(/(<h[1-6]\b[^>]*>)([\s\S]*?)(<\/h[1-6]>)/g, (_, open, text, close) => open + text.replace(/\.(?=\s|<|$)/g,'') + close)
      .replace('app.eb0dad8c9eb83e2e9ec71879749daea7fcad30d3ffee6fdc69fc6aba18139665.js','app.238a061afe45a87f67b1cba921e686127f82b9fbee382d4758451c0f16d6f11e.js');
    // Only the enumerated typography stylesheet identities may differ from the archive.
    // All claims, source material and non-heading markup still compare byte-for-byte.
    const typographyAssetPins = [["/assets/ardamire-proof.css?sha256=53ae301db2f5a447044bea72124c6452f924121d9067ad683bdb5879ee0f31c4", "/assets/ardamire-proof.css?sha256=7a0cc9d7379d09dde1683c13822a11041d2480140a7a8f33db56fbccc25c3e4a"], ["/assets/capability-library.css?sha256=f7c4de94402a5c98558707f7c7dc0c073f10b126f8d6e37825479b04135fdc51", "/assets/capability-library.css?sha256=c6823a72aeb47c63f06df2c8c688491dcc34670f99214a935791cbf6a85936a0"], ["/assets/custom.css?sha256=9cc5df03283f74b411325e1dd0f9fba719255e75c4d3c53650fd1cd2299c529c", "/assets/custom.css?sha256=863e7c34d919ef0d54e94b56ce4c95c42d309739cf04fb5c7854faf67ef381cb"], ["/assets/final-overrides.css?sha256=9d18c113b46b58d319852f3e00cfd6455d2e6b1de8ec97f48ecb52dd64f397c9", "/assets/final-overrides.css?sha256=4d60fec8e748194746a51c19fede235b2ccfbaebf6e7d92a845bcedb61ae1a5f"], ["/assets/membership.css?sha256=cfab6e3307ab9abd4f40b2c43f625d8b420f281a1aec4b849b24be9f09dee11b", "/assets/membership.css?sha256=b6e0d2044f34b315ef0236b9d132e5e12fecdaca221165f6d9d99c7ab42f8509"], ["/assets/style.css?sha256=dae86678fceee76a0e55b6af31c0107f79aa2ce7980b900121e8d6a540bef9f5", "/assets/style.css?sha256=8b31c316244752c87d57620c116f96644028a3d1e36541328ae77d69b41ce1d0"], ["/src/home-overview.css?sha256=8f31eb5be2f1b05aa0f834a2018d3758a6a393e1e5a314bcf56c35d8615597ed", "/src/home-overview.css?sha256=879af7582313d81f6c1a3976b7006c1bdb41b9cd4a0835bb2eb53a57a271054d"], ["/src/menu-overlay.css?sha256=84ee9d584426ae3bdfae22c34af109c918f4d1877768aaa070b8c01320632d6c", "/src/menu-overlay.css?sha256=fb26dbda2079e0534ea76b84f15db77f090eb21f6c7e009e834b74647daf282e"], ["/assets/auxtho-overview-20261026/home.css?sha256=9ddbe1eb06c856ccd1a88e11c205541076ecf34cf42d71328b6ea524c27b3935", "/assets/auxtho-overview-20261026/home.css?sha256=1d95bd48fb7b406a6b3c65e6c2e24566c2dfd59638b3176876fdb706dd2488f5"], ["/assets/auxtho-overview-20261026/menu.css?sha256=dd4795b916d1dbf242c79da16c4d5b575d18a337745e3ab926bb767434f8a790", "/assets/auxtho-overview-20261026/menu.css?sha256=21c62cf7beaafdcd62ef3d7d919f2556c962b15f1dbf72df5e6d6109a89746c2"], ["/assets/auxtho-workflow-20261026/finance-reading.css?sha256=ab96cc2735ca4908d9becd227b41f86f85b64d7ffbab7a82b976aff298efd8c5", "/assets/auxtho-workflow-20261026/finance-reading.css?sha256=a5f2878c361b95bc0de67494fc68004e7e62f6f2d3bd5ad240f1a2751854b4dc"], ["/assets/auxtho-workflow-20261026/flow.css?sha256=6410b49ac66100655a0706ee4c376a8e6acb7200fc2002f316dd35c59c13d763", "/assets/auxtho-workflow-20261026/flow.css?sha256=0ad88c7bf6e1d9ed11d878cf5c9dc1966815de85919752aaaa14f77e6b641c11"], ["/assets/auxtho-workflow-20261026/long-term.css?sha256=604000ad46221a0873b480ca43b4a1076350a7e7c121068f6f00f9a6f0da7d11", "/assets/auxtho-workflow-20261026/long-term.css?sha256=e87440d9ac7260469ef654f6ef2c829b8fa794a8334425273cfa3cb391c23d6d"], ["/assets/portfolio-20261009/styles.css?sha256=99a51b036c093c0a64dc0643cba8f541a1ce8d7afa38e4a292fbb74bcb78987b", "/assets/portfolio-20261009/styles.css?sha256=7a6aae34f98aa936ae58e8854c524623314c40a0269cf7308327da9c2e35cc35"], ["/assets/publications-20261018/styles.css?sha256=f762495b24715c1e5c7762d1fcd5af3c38eaef0bae050350021dee6efa4b4a4d", "/assets/publications-20261018/styles.css?sha256=3cbb536c3b95abbd708306cf099fccb92345156e1ba3a8efbc56d38c21a93c22"], ["/assets/whitecell-20261015/styles.css?sha256=a5e996f7aa4c66922574cc65cd39488473cf6f93faf124b433de5f8dfe5e8073", "/assets/whitecell-20261015/styles.css?sha256=ebc37b418648a1eb59ed0f0431ccf4819e5dc3166b497abe7a9b1f7ffe1fc363"], ["/assets/demo/singapore-source-review/complete-path.css?sha256=2f2bb42844e3ba340d04ce030ebc943ab701aa2508ddac8df61fdc7a8e7e224e", "/assets/demo/singapore-source-review/complete-path.css?sha256=ff84fd3920b1aa21747ecbddab9e651d745a8d7e52a4ff3eae25a71671783394"]];
    const expected = typographyAssetPins.reduce((text, [before, after]) => text.split(before).join(after), headingsOnly(baseline.toString('utf8')));
    assert.equal(hash(current),hash(Buffer.from(expected)),p);
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
