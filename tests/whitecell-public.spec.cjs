const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const assetRoot=path.join(root,'assets/whitecell-20261015');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const html=fs.readFileSync(path.join(root,'whitecell/index.html'),'utf8');
const css=fs.readFileSync(path.join(assetRoot,'styles.css'),'utf8');
const linkName='introduction-link.f17aeb18fa071b0c9ee4ec5a0ebf604ec7b2d03f2049e4741d08b0bddcc6a041.js';

test('Selected WhiteCell language survives a URL round trip without losing the query or section',()=>{
  const appName=fs.readdirSync(assetRoot).find(name=>/^app\.[0-9a-f]{64}\.js$/.test(name));
  const app=fs.readFileSync(path.join(assetRoot,appName),'utf8');
  const prefix=app.slice(0,app.indexOf('  const boundaryScene'))+'})();';
  function open(href){
    let address=new URL(href),replacements=0;
    const nodes=new Map();
    function element(id){
      if(!nodes.has(id))nodes.set(id,{dataset:{},listeners:{},children:[],setAttribute(k,v){this[k]=v},
        addEventListener(k,fn){this.listeners[k]=fn},replaceChildren(){this.children=[]},append(n){this.children.push(n)},focus(){}});
      return nodes.get(id);
    }
    const tabs=Array.from({length:6},(_,i)=>Object.assign(element('tab'+i),{id:'step-tab-'+i,dataset:{step:String(i)}}));
    const document={documentElement:{dataset:{}},getElementById:element,
      querySelector:element,querySelectorAll(selector){
        if(selector==='[data-step]')return tabs;
        if(selector==='[data-motion-toggle]')return [element('motion1'),element('motion2')];
        return [];
      },createElement(tag){return {tag}},createTextNode(text){return {text}},dispatchEvent(){}};
    const state={marker:'unchanged'};
    const window={location:{get href(){return address.href},get search(){return address.search}},
      history:{state,replaceState(received,title,url){assert.equal(received,state);assert.equal(title,'');address=new URL(url,address);replacements++}},
      matchMedia(){return {matches:false,addEventListener(){}}}};
    vm.runInNewContext(prefix,{window,document,URL,URLSearchParams},{timeout:1000});
    return {document,toggle(){element('language').listeners.click()},get href(){return address.href},get replacements(){return replacements}};
  }
  const first=open('https://auxtho.com/whitecell/?lang=en&ref=shared#cycle');
  assert.equal(first.document.documentElement.lang,'en');
  assert.equal(first.replacements,0);
  first.toggle();
  assert.equal(first.document.documentElement.lang,'ko');
  const korean=new URL(first.href);
  assert.equal(korean.searchParams.get('lang'),'ko');
  assert.equal(korean.searchParams.get('ref'),'shared');
  assert.equal(korean.hash,'#cycle');
  assert.equal(first.replacements,1);
  // Re-initialise the actual page source from the copied/shared address.
  const reopened=open(first.href);
  assert.equal(reopened.document.documentElement.lang,'ko');
  assert.equal(reopened.replacements,0);
  reopened.toggle();
  assert.equal(reopened.document.documentElement.lang,'en');
  assert.equal(new URL(reopened.href).searchParams.get('lang'),'en');
  assert.equal(new URL(reopened.href).hash,'#cycle');
  const bare=open('https://auxtho.com/whitecell/#architecture');
  bare.toggle();
  assert.equal(new URL(bare.href).searchParams.get('lang'),'ko');
  assert.equal(new URL(bare.href).hash,'#architecture');
});

test('Every common contact section places the data warning next to the email action in both languages',()=>{
  const {render}=require('../scripts/release/render-company-portfolio.cjs');
  for(const lang of ['en','ko'])for(const route of ['/','/products/auxtho/','/products/moirion/','/products/ardamire/','/products/metdol/','/products/agent-runner/']){
    const main=render(route,lang).main;
    const section=main.slice(main.indexOf('<section class="contact-section"'));
    assert.ok(section.includes('<p data-contact-note>'),route+lang);
    assert.ok(section.includes(lang==='ko'?'개인정보·고객 기밀·규제 대상·실서비스 자료나 비밀정보는 이메일로 보내지 마세요':'Do not email personal, customer-confidential'),route+lang);
    assert.ok(section.indexOf('data-contact-note')<section.indexOf('mailto:hello@auxtho.com'),route+lang);
  }
});

test('The Korean defense charter identifies its English-only implementation record',()=>{
  const {routes,article}=require('../scripts/release/render-publications.cjs');
  const defense=routes.find(route=>route.id==='defense');
  const korean=article(defense,'ko').html;
  assert.match(korean,/<a href="\/security\/ardamire\/">Ardamire 구현·시험 기록\(영문\)<\/a>/);
  assert.doesNotMatch(korean,/\/security\/ardamire\/\?lang=ko/);
  assert.ok(korean.includes('/whitecell/?lang=ko'));
});

test('The public evidence index separates dated workflow checks from preserved July illustrations',()=>{
  const notes=fs.readFileSync(path.join(root,'evidence-notes.html'),'utf8');
  assert.ok(notes.includes('/products/auxtho/?lang=en#verification'));
  assert.ok(notes.includes('/products/auxtho/?lang=ko#verification'));
  assert.ok(notes.includes('16 JULY 2026 / EARLIER INTERFACE ILLUSTRATIONS'));
  assert.ok(notes.includes('app-overview-synthetic-replay-20260716.json'));
  assert.ok(notes.includes('console-synthetic-workflow-replay-20260716.json'));
  assert.ok(notes.includes('evidence-manifest-20260716.json'));
  assert.ok(notes.indexOf('workflow-record-title')<notes.indexOf('app-evidence-title'));
});


test('WhiteCell public route has canonical bilingual metadata and existing legal links',()=>{
  assert.match(html,/name="robots" content="index,follow"/);
  assert.match(html,/rel="canonical" href="https:\/\/auxtho\.com\/whitecell\/"/);
  for(const lang of ['ko','en']) assert.ok(html.includes('https://auxtho.com/whitecell/?lang='+lang));
  for(const page of ['privacy.html','terms.html','products/ardamire/']) assert.ok(html.includes('https://auxtho.com/'+page));
  assert.doesNotMatch(html,/noindex|localhost|[A-Z]:\\|PACKAGING_|PRIVATE|api[_-]?key/i);
});

test('WhiteCell publication is exact-file addressed and excludes private preparation',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'scripts/release/public-files.json'),'utf8'));
  const publicFiles=manifest.paths.filter(p=>p.startsWith('/assets/whitecell-20261015/')||p==='/whitecell/index.html');
  assert.equal(publicFiles.length,9);
  for(const file of publicFiles) assert.ok(fs.existsSync(path.join(root,file.slice(1))),file);
  assert.doesNotMatch(publicFiles.join('\n'),/PRIVATE|verify-hero|ART_|QA_|shadow-cell/);
  for(const m of html.matchAll(/(?:src|href)="(\/assets\/whitecell-20261015\/[^"?]+)(?:\?sha256=([0-9a-f]{64}))?"/g)) {
    const bytes=fs.readFileSync(path.join(root,m[1].slice(1)));
    assert.equal(hash(bytes),m[2]||m[1].match(/\.([0-9a-f]{64})\.js$/)[1]);
  }
});

test('Ardamire and diamond share one full-plane light trajectory, delay and pause',()=>{
  assert.match(html,/class="jewel-illumination"><div class="jewel-layer"/);
  assert.ok(css.includes('.gate-light,.jewel-illumination,.hero-art .moonlight>span{'));
  assert.ok(css.includes('.hero .gate-light,.jewel-illumination,.hero-art .moonlight>span{animation-delay:-3.92s}'));
  assert.ok(css.includes('html[data-motion-paused="true"] .jewel-illumination'));
  assert.ok(css.includes('.hero .gate-light,.jewel-illumination,.hero-art .moonlight>span{animation:none;'));
  assert.doesNotMatch(css,/@keyframes jewel-(?:facet|outline)-reveal/);
  assert.ok(css.includes('transparent 48%,#fff 49.7%,#fff 50.3%,transparent 52%'));
});

test('WhiteCell scripts parse and do not add network, persistence or model disclosures',()=>{
  for(const name of fs.readdirSync(assetRoot).filter(n=>n.endsWith('.js'))) {
    const source=fs.readFileSync(path.join(assetRoot,name),'utf8');
    new vm.Script(source);
    assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|api[_-]?key/i);
  }
  assert.doesNotMatch(html,/GPT|Gemini|certified|guarantees prevention/i);
});

test('Ardamire introduction link survives rendering and language changes without duplicates',()=>{
  let language='en',callback,children=[];
  const related={querySelector(){return children[0]||null},appendChild(node){children.push(node)}};
  const main={};
  const document={readyState:'complete',documentElement:{get lang(){return language}},querySelector(selector){return selector==='#main .product-related'?related:selector==='#main'?main:null},createElement(){return {textContent:'',attributes:{},setAttribute(k,v){this.attributes[k]=v},getAttribute(k){return this.attributes[k]??null}}}};
  class Observer {constructor(fn){callback=fn}observe(node,options){assert.equal(node,main);assert.equal(options.subtree,true)}}
  vm.runInNewContext(fs.readFileSync(path.join(assetRoot,linkName),'utf8'),{document,MutationObserver:Observer},{timeout:1000});
  assert.equal(children.length,1);assert.equal(children[0].attributes.href,'/whitecell/?lang=en');
  callback();assert.equal(children.length,1);
  children=[];language='ko';callback();
  assert.equal(children.length,1);assert.equal(children[0].attributes.href,'/whitecell/?lang=ko');
  assert.equal(children[0].textContent,'Ardamire WhiteCell 소개 ↗');
});

test('WhiteCell restores original typography while preserving the prior hero visibility fix',()=>{
  assert.equal(hash(Buffer.from(css)),'ebc37b418648a1eb59ed0f0431ccf4819e5dc3166b497abe7a9b1f7ffe1fc363');
  assert.doesNotMatch(css,/Accessible reading scale:|Reading scale:/);
  assert.ok(css.includes('z-index:6;bottom:34px'));
  assert.doesNotMatch(html,/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/);
});

test('WhiteCell bilingual architecture preserves independent enforcement, evidence and human authority',()=>{
  const appName=fs.readdirSync(assetRoot).find(name=>/^app\.[0-9a-f]{64}\.js$/.test(name));
  assert.ok(appName);
  const source=fs.readFileSync(path.join(assetRoot,appName),'utf8');
  const cut=source.indexOf('  const labels =');
  assert.ok(cut>0);
  const scope={};
  vm.runInNewContext(source.slice(0,cut)+'globalThis.content={copy,stages};})();',scope,{timeout:1000});
  const {copy,stages}=scope.content;
  for(const match of html.matchAll(/<([a-z0-9-]+)\b[^>]*data-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
    for(const lang of ['ko','en']) assert.equal(typeof copy[lang][match[2]],'string',lang+':'+match[2]);
    const initial=match[3].replace(/<br\s*\/?\s*>/g,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&');
    assert.equal(initial,copy.en[match[2]],'Initial EN mismatch: '+match[2]);
  }
  assert.ok(html.includes('id="oversight"'));
  assert.match(copy.ko.architectureIntro,/독립된 역할/);
  assert.match(copy.en.architectureIntro,/independent roles/);
  assert.match(copy.ko.whitecellBody,/WhiteCell 자신도.*권한 검사/);
  assert.match(copy.en.whitecellBody,/WhiteCell itself must pass Ardamire/);
  assert.match(copy.ko.recordBody,/새 기록.*원본과 이전 기록.*보존/);
  assert.match(copy.en.recordBody,/append.*preserving originals and earlier records/);
  assert.match(copy.ko.humanBody,/검증 후 사람이 승인.*최종 책임/);
  assert.match(copy.en.humanBody,/verify and approve.*final accountability/);
  assert.match(copy.en.oversightIntro,/architecture.*Live Operator Wall/);
  assert.match(stages.en[1][1],/^Ardamire applies/);
  assert.doesNotMatch(source,/24\/7|tamper-proof|immutable storage|fully implemented|not implemented|already connected/i);
});

test('WhiteCell hosted acceptance covers both languages, controls, mobile and raw failure evidence',()=>{
  const source=fs.readFileSync(path.join(root,'tests/post-deploy-verifier-smoke.spec.cjs'),'utf8');
  assert.ok(source.includes('path: `/whitecell/?lang=${lang}`'));
  assert.match(source,/test\('published WhiteCell preserves bilingual roles, human oversight, controls and mobile layout'/);
  for(const required of ['await readPublicPage(page, `${origin}/whitecell/', 'await assertLanguage(lang)',
    "await page.locator('#language').click()", 'index < 6', "data-motion-paused', 'true'", "motionButtons.nth(1).click()",
    "reducedMotion: 'no-preference'", "reducedMotion: 'reduce'", 'canvasSample()', 'width: 390, height: 844',
    'mobile_widths.scroll - result.mobile_widths.client', '[data-whitecell-introduction]',
    'whitecell-hosted-smoke.json', 'same_origin_request_failures: failures', 'console_errors: consoleErrors',
    'page_errors: pageErrors', 'non_get_head_requests: nonReadRequests', "route.abort('blockedbyclient')",
    "expect(failures).toEqual([])", "expect(pageErrors).toEqual([])", "expect(nonReadRequests).toEqual([])",
    "content security policy|refused to load|blocked", "evidence.status = 'PASS'", 'finally {']) assert.ok(source.includes(required),required);
  // Catch an incorrect acceptance oracle without executing a browser or the page.
  const expectedStart=source.indexOf('  const expected = {');
  const expectedEnd=source.indexOf('  async function assertLanguage',expectedStart);
  assert.ok(expectedStart>0&&expectedEnd>expectedStart);
  const scope={};
  vm.runInNewContext(source.slice(expectedStart,expectedEnd)+'globalThis.hosted=expected;',scope,{timeout:1000});
  const appName=fs.readdirSync(assetRoot).find(name=>/^app\.[0-9a-f]{64}\.js$/.test(name));
  const app=fs.readFileSync(path.join(assetRoot,appName),'utf8');
  vm.runInNewContext(app.slice(0,app.indexOf('  const labels ='))+'globalThis.content={copy,stages};})();',scope,{timeout:1000});
  const normalise=text=>text.replace(/\s+/g,' ').trim();
  for(const lang of ['ko','en']) {
    for(const key of ['architectureIntro','whitecellBody','ardamireBody','authorityNote','oversightIntro','recordBody','forensicBody','humanBody','oversightNote']) {
      assert.equal(normalise(scope.hosted[lang][key]),normalise(scope.content.copy[lang][key]),lang+':'+key);
    }
    for(const [expectedKey,copyKey] of [['pause','pauseMotion'],['resume','resumeMotion'],['reduced','reducedMotion']]) {
      assert.equal(scope.hosted[lang][expectedKey],scope.content.copy[lang][copyKey],lang+':'+expectedKey);
    }
    for(let index=0;index<6;index++) {
      assert.equal(scope.hosted[lang].steps[index],scope.content.copy[lang]['step'+index]);
      assert.equal(scope.hosted[lang].titles[index],normalise(scope.content.stages[lang][index][0]));
    }
  }
});


test('WhiteCell defaults to English and Korean requires an explicit selection',()=>{
  assert.match(html,/<html lang="en">/);
  assert.match(html,/property="og:locale" content="en_US"/);
  assert.match(html,/id="language"[^>]*lang="ko">KO<\/button>/);
  const appName=fs.readdirSync(assetRoot).find(name=>/^app\.[0-9a-f]{64}\.js$/.test(name));
  const source=fs.readFileSync(path.join(assetRoot,appName),'utf8');
  const initialiser=source.match(/  let language = ([^;]+);/);
  assert.ok(initialiser);
  for(const [search,expected] of [['','en'],['?lang=en','en'],['?lang=ko','ko'],['?lang=fr','en']]) {
    const scope={URLSearchParams,window:{location:{search}}};
    vm.runInNewContext('globalThis.result='+initialiser[1],scope,{timeout:1000});
    assert.equal(scope.result,expected,search||'no query');
  }
  assert.equal(hash(Buffer.from(source.slice(0,source.indexOf('  const labels =')))),'ad45fc14e19b0f5224ca7ba7a1959155063f8017a94eb82e507a724b941539af','Bilingual copy/stages must remain unchanged');
});
