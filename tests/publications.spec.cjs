'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const parse5=require('parse5');
const {routes,manuscript,article,shell,renderPage}=require('../scripts/release/render-publications.cjs');
const {publicationLinks,decorateMain,decorateFooter,researchRecordLink,agentRunnerRecordUrl,agentRunnerRecordLabel}=require('../src/publication-links.js');
const {render}=require('../scripts/release/render-company-portfolio.cjs');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
function all(node,predicate,found=[]){if(predicate(node))found.push(node);for(const c of node.childNodes||[])all(c,predicate,found);return found;}
const text=node=>node.nodeName==='#text'?node.value:(node.childNodes||[]).map(text).join('');
const attr=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
const plain=value=>value.replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\*\*/g,'');
function articleNodes(html){return all(parse5.parseFragment(html),n=>['h2','h3','p','li'].includes(n.tagName));}
test('Charters retain every approved paragraph, heading and list item in both languages',()=>{
 for(const p of routes.filter(p=>p.kind==='charter'))for(const lang of ['en','ko']){
  const doc=manuscript(p,lang);
  const expected=doc.blocks.flatMap(block=>block.startsWith('- ')?block.split('\n').map(x=>plain(x.slice(2))):[plain(block.replace(/^#{2,3} /,''))]);
  assert.deepEqual(articleNodes(article(p,lang).html).map(text),expected,p.id+':'+lang);
 }
 assert.equal(manuscript(routes[0],'en').blocks.length,53);
 assert.ok(article(routes[0],'ko').html.includes('의사는 미처 보지 못했던 근거와 가능성까지 살펴'));
 assert.ok(article(routes[0],'en').html.includes('live a life true to themselves'));
 assert.ok(article(routes[0],'en').html.includes('Auxtho will never develop offensive AI.'));
});
test('Publications have English initial HTML, exact Korean template, canonical and language-specific metadata',()=>{
 for(const p of routes){
  const html=read(p.route.slice(1)+'index.html');
  const parsed=parse5.parse(html);
  assert.equal(attr(all(parsed,n=>n.tagName==='html')[0],'lang'),'en');
  assert.ok(html.includes(shell(p,'en')));
  assert.ok(html.includes('<template id="publication-ko">'+shell(p,'ko')+'</template>'));
  assert.ok(html.includes('href="https://auxtho.com'+p.route+'"'));
  for(const lang of ['en','ko'])assert.ok(html.includes('hreflang="'+lang+'" href="https://auxtho.com'+p.route+'?lang='+lang+'"'));
  assert.doesNotMatch(html,/portfolio-20261009\/app\.[a-f0-9]+\.js/);
  assert.equal(all(parsed,n=>n.tagName==='h1').length,1);
  const client=all(parsed,n=>n.tagName==='script')[0];
  assert.equal(html,renderPage(p,attr(client,'src')),'deterministic output '+p.id);
 }
});
test('Customer non-publicity commitment is bilingual and part of the trust principle, not a claimed customer result',()=>{
 for(const lang of ['en','ko']){
  const blocks=manuscript(routes[0],lang).blocks;
  const heading=blocks.findIndex(x=>x.startsWith('### 06 '));
  const next=blocks.findIndex(x=>x.startsWith('### 07 '));
  const section=blocks.slice(heading+1,next).join('\n');
  for(const phrase of lang==='en'?[
   'Our customers’ security comes before publicity.',
   'Auxtho does not use customer names, logos or the fact that they use our systems for publicity.',
   'We will earn trust through our technology and verification results, not our customers’ names.'
  ]:[
   '고객의 이름보다, 고객의 보안을 먼저 생각합니다.',
   'Auxtho는 고객사명·로고·도입 사실을 홍보에 사용하지 않습니다.',
   '우리는 고객의 이름이 아니라, 기술과 검증 결과로 신뢰를 쌓겠습니다.'
  ]){assert.ok(section.includes(phrase),lang+':'+phrase);assert.equal(blocks.join('\n').split(phrase).length-1,1);}
 }
});
test('Publication language/menu client handles bare, explicit, unknown language and preserved section hash without a browser',()=>{
 const code=read('src/publications-client.js');
 for(const p of routes)for(const query of ['', '?lang=en','?lang=ko','?lang=unknown']){
  const lang=query==='?lang=ko'?'ko':'en';
  const nodes=new Map();
  function node(key){if(nodes.has(key))return nodes.get(key);const n={dataset:{},href:'',content:'',hidden:true,handlers:{},classList:{remove(){},add(){}},setAttribute(k,v){this[k]=v},getAttribute(k){return this[k]},addEventListener(k,fn){this.handlers[k]=fn},querySelector(s){return node(s)},contains(){return true},focus(){this.focused=true},replaceChildren(x){this.replacement=x}};nodes.set(key,n);return n;}
  const body={dataset:{titleEn:manuscript(p,'en').title+' — Auxtho',titleKo:manuscript(p,'ko').title+' — Auxtho',descriptionEn:p.description.en,descriptionKo:p.description.ko}};
  const document={body,documentElement:{},title:'',querySelector:node,addEventListener(){},getElementById(){return null}};
  node('#publication-ko').content={cloneNode(){return shell(p,'ko')}};
  vm.runInNewContext(code,{document,location:{search:query,hash:'#section-2',href:'https://auxtho.com'+p.route+query+(query?'&':'?')+'readback=keep#section-2'},URL,URLSearchParams,matchMedia(){return{addEventListener(){}}},requestAnimationFrame(fn){fn()}},{timeout:1000});
  assert.equal(document.documentElement.lang,lang);
  assert.equal(document.title,body.dataset[lang==='ko'?'titleKo':'titleEn']);
  assert.equal(node('meta[name="description"]').content,p.description[lang]);
  assert.match(node('.language-link').href,new RegExp('lang='+(lang==='ko'?'en':'ko')));
  assert.ok(node('.language-link').href.includes('readback=keep'));
  assert.ok(node('.language-link').href.endsWith('#section-2'));
  if(lang==='ko')assert.equal(node('[data-publication-shell]').replacement,shell(p,'ko'));
  else assert.equal(node('[data-publication-shell]').replacement,undefined);
  node('.menu-toggle').handlers.click();
  assert.equal(node('.mobile-menu').hidden,false);
  node('.menu-toggle').handlers.click();
  assert.equal(node('.mobile-menu').hidden,true);
 }
});
test('Company and defense pages connect in both directions while retaining actual records',()=>{
 for(const lang of ['en','ko']){
  assert.ok(article(routes[0],lang).html.includes('/charter/defense/?lang='+lang));
  const defense=shell(routes[1],lang);
  for(const route of ['/charter/','/products/ardamire/','/whitecell/'])assert.ok(defense.includes(route+'?lang='+lang));
  for(const route of ['/','/products/ardamire/','/whitecell/'])assert.ok(publicationLinks(route,lang).includes('/charter/'));
  assert.ok(publicationLinks('/products/agent-runner/',lang).includes(routes[2].route+'?lang='+lang));
 }
});
test('AgentRunner article retains all supplied paragraphs, dates, view-only scope and pending Human decision',()=>{
 for(const lang of ['en','ko']){
  const result=article(routes[2],lang);
  const paragraphs=all(parse5.parseFragment(result.html),n=>n.tagName==='p').map(text);
  assert.deepEqual(paragraphs,result.doc.paragraphs);
  assert.match(result.html,/Saved company · View only/);
  assert.match(result.html,/1280/);assert.match(result.html,/720/);
  assert.ok(result.doc.meta.includes(lang==='en'?'18 October 2026':'2026년 10월 18일'));
 }
 const en=article(routes[2],'en').html;
 for(const phrase of ['six reviewed files','XO and the review-role employee','Three additional local Qwen calls','12 existing calls','Human decision for this task remains pending','does not include verification in an installed or distributed app'])assert.ok(en.includes(phrase),phrase);
 assert.equal(hash('assets/publications-20261018/agentrunner-office-xo-briefing.jpg'),'18778aaf67e6b03a8fd1f43975b07019549695d190c65228b080f2f053e51ecb');
 assert.equal(fs.statSync(path.join(root,'assets/publications-20261018/agentrunner-office-xo-briefing.jpg')).size,133422);
});
test('Public allowlist contains only the eight publication files, never internal manuscripts or handoff',()=>{
 const list=JSON.parse(read('scripts/release/public-files.json')).paths;
 const additions=list.filter(p=>p.startsWith('/charter/')||p.includes('/publications-20261018/')||p.includes('/development-record-2026-10-18/'));
 assert.equal(additions.length,8);
 assert.deepEqual(list,[...new Set(list)].sort());
 for(const p of list)assert.doesNotMatch(p,/HANDOFF|CHECKSUMS|NOTE-(?:KO|EN)|src\/publications|PRIVATE|MANUSCRIPT|REVIEW_AND_FUTURE/);
 for(const p of routes){
  const html=read(p.route.slice(1)+'index.html');
  assert.doesNotMatch(html,/org-DKq|a01-inventory-kit|executive-meeting-|Armadillo|Aromadillo|아로마딜로|withpersona|jsung@/i);
 }
});
test('New public reference hashes are bound to exact asset bytes and publication headings preserve A.O.I.',()=>{
 const list=JSON.parse(read('scripts/release/public-files.json')).paths;
 for(const p of routes){
  const html=read(p.route.slice(1)+'index.html');
  for(const m of html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)\?sha256=([a-f0-9]{64})"/g))assert.equal(hash(m[1].slice(1)),m[2],m[1]);
  for(const m of html.matchAll(/<script src="(\/assets\/[^"]+)\.([a-f0-9]{64})\.js"/g))assert.equal(hash(m[1].slice(1)+'.'+m[2]+'.js'),m[2]);
  for(const route of routes)if(html.includes(route.route+'?lang='))assert.ok(list.includes(route.route+'index.html'));
 }
 assert.ok(article(routes[0],'en').html.includes('>A.O.I. Anchor of Intellect</h2>'));
 assert.ok(article(routes[0],'ko').html.includes('>A.O.I. 지성의 닻</h2>'));
});
test('Publication menu markup stays keyboard reachable and responsive layout avoids fixed-width article constraints',()=>{
 for(const p of routes)for(const lang of ['en','ko']){
  const html=shell(p,lang);
  assert.ok(html.includes('href="#main"'));
  assert.ok(html.includes('aria-expanded="false" aria-controls="mobile-menu"'));
  assert.ok(html.includes('id="mobile-menu"'));
  assert.ok(html.includes('id="main" tabindex="-1"'));
 }
 const css=read('assets/publications-20261018/styles.css');
 assert.match(css,/@media\(max-width:900px\)/);
 assert.match(css,/minmax\(0,1fr\)/);
 assert.match(css,/max-width:100%/);
});
test('Every publication including Korean templates avoids CSP-blocked inline styles',()=>{
 function assertNoInlineStyles(html){
  function visit(node){
   assert.equal(attr(node,'style'),undefined,'inline style on '+node.nodeName);
   for(const child of node.childNodes||[])visit(child);
   if(node.content)visit(node.content);
  }
  visit(parse5.parse(html));
 }
 for(const p of routes){
  assertNoInlineStyles(read(p.route.slice(1)+'index.html'));
  for(const lang of ['en','ko']){
   const markup=shell(p,lang);
   assertNoInlineStyles(markup);
   assert.equal(markup.includes('publication-record-layout'),p.kind==='record');
   assert.equal(markup.includes('publication-record-article'),p.kind==='record');
  }
 }
 const css=read('assets/publications-20261018/record-layout.77b9c5af6d0e475ddc8dfb14fda2fbe51c7affbb6dc07adf374e959ff72dc507.css');
 assert.match(css,/\.publication-layout\.publication-record-layout\{grid-template-columns:minmax\(0,1fr\)\}/);
 assert.match(css,/\.publication-article\.publication-record-article\{max-width:1000px\}/);
 assert.throws(()=>assertNoInlineStyles('<div style="grid-template-columns:minmax(0,1fr)"></div>'),/inline style/);
 assert.throws(()=>assertNoInlineStyles('<template><article style="max-width:1000px"></article></template>'),/inline style/);
});
test('WhiteCell in-place EN→KO→EN updates the added charter panel and destination language',()=>{
 let callback,markup='';
 const element={lang:'en'};
 const main={querySelector(){return null},insertAdjacentHTML(_,html){markup=html}};
 const document={documentElement:element,querySelector(selector){return selector==='main'?main:selector==='#publication-links'&&markup?{remove(){markup=''}}:null}};
 class Observer {constructor(fn){callback=fn}observe(target,options){assert.equal(target,element);assert.deepEqual(Array.from(options.attributeFilter),['lang'])}}
 vm.runInNewContext(read('src/publication-links.js'),{document,location:{pathname:'/whitecell/',search:''},MutationObserver:Observer},{timeout:1000});
 assert.ok(markup.includes('/charter/defense/?lang=en'));
 element.lang='ko';callback();
 assert.ok(markup.includes('방어 설계 헌장 읽기'));assert.ok(markup.includes('/charter/defense/?lang=ko'));
 element.lang='en';callback();
 assert.ok(markup.includes('Read the defense charter'));assert.ok(markup.includes('/charter/defense/?lang=en'));
});
test('Bilingual sitemap declarations bind the xhtml prefix',()=>{
 const xml=read('sitemap.xml');
 assert.match(xml,/<urlset[^>]+xmlns:xhtml="http:\/\/www.w3.org\/1999\/xhtml"/);
 for(const p of routes)for(const lang of ['en','ko'])assert.ok(xml.includes('hreflang="'+lang+'" href="https://auxtho.com'+p.route+'?lang='+lang+'"'));
});
test('Home leads with the company charter after the walkthrough while defense remains contextual',()=>{
 for(const lang of ['en','ko']){
  const panel=publicationLinks('/',lang);
  assert.deepEqual(all(parse5.parseFragment(panel),n=>n.tagName==='a').map(n=>attr(n,'href')),['/charter/?lang='+lang]);
  for(const route of ['/products/ardamire/','/whitecell/'])assert.ok(publicationLinks(route,lang).includes('/charter/defense/?lang='+lang));
 }
 const home=read('index.html');
 assert.ok(home.indexOf('id="walkthrough"')<home.indexOf('id="publication-links"'));
 assert.ok(home.indexOf('id="publication-links"')<home.indexOf('id="contact"'));
});
test('Common footers gain one language-correct charter link and preserve all existing links',()=>{
 const contract=JSON.parse(read('scripts/release/brand-copy-contract.json'));
 for(const lang of ['en','ko'])for(const route of ['/',...Object.keys(contract.products).map(id=>'/products/'+id+'/')]){
  const footer=decorateFooter(render(route,lang).footer,lang);
  const info=all(parse5.parseFragment(footer),n=>attr(n,'class')==='footer-information')[0];
  assert.deepEqual(all(info,n=>n.tagName==='a').map(n=>[text(n),attr(n,'href')]),[...contract.company.informationLinks,[lang==='ko'?'AI 헌장':'AI Charter','/charter/?lang='+lang]]);
  assert.equal(decorateFooter(footer,lang),footer);
  assert.ok(read(route.slice(1)+'index.html').includes(decorateFooter(render(route,'en').footer,'en')));
 }
 for(const page of routes)for(const lang of ['en','ko'])assert.equal(all(parse5.parseFragment(shell(page,lang)),n=>n.tagName==='a'&&attr(n,'data-company-charter')!==undefined).length,1);
});
test('Home dated AgentRunner record sits beside its own product and preserves existing content',()=>{
 for(const lang of ['en','ko']){
  const original=render('/',lang).main,decorated=decorateMain(original,'/',lang),link=researchRecordLink(lang);
  assert.equal(decorated.split(link).length-1,1);
  assert.equal(decorated.replace(link,''),original);
  assert.equal(decorateMain(decorated,'/',lang),decorated);
  const technology=all(parse5.parseFragment(decorated),n=>attr(n,'id')==='technology')[0];
  const list=all(technology,n=>attr(n,'class')==='product-list')[0];
  const record=all(list,n=>attr(n,'data-research-record')!==undefined);
  assert.equal(record.length,1);
  assert.equal(attr(all(record[0],n=>n.tagName==='a')[0],'href'),'/products/agent-runner/development-record-2026-10-18/?lang='+lang);
  assert.ok(decorated.indexOf('data-product="agent-runner"')<decorated.indexOf(link));
  assert.ok(decorated.indexOf(link)<decorated.indexOf('id="technology-stage"'));
  assert.equal(decorateMain(render('/products/metdol/',lang).main,'/products/metdol/',lang),render('/products/metdol/',lang).main);
  assert.ok(link.includes('datetime="2026-10-18"'));
  assert.ok(link.includes('/products/agent-runner/development-record-2026-10-18/?lang='+lang));
 }
 assert.ok(read('index.html').includes(researchRecordLink('en')));
});
test('Added footer and record links stay singular and correct on repeated EN/KO refreshes',()=>{
 for(const route of ['/', '/products/auxtho/', '/products/moirion/', '/products/metdol/', '/products/ardamire/', '/products/agent-runner/']){
  let callback,footerHtml='',recordHtml='',panelHtml='';
  const element={lang:'en'};
  const footer={querySelector(){return footerHtml?{remove(){footerHtml=''}}:null},insertAdjacentHTML(_,html){footerHtml+=html}};
  const purpose={insertAdjacentHTML(_,html){recordHtml+=html}};
  const button={closest(){return {nextElementSibling:purpose}}};
  const main={querySelector(){return null},insertAdjacentHTML(_,html){panelHtml=html}};
  const document={documentElement:element,querySelectorAll(){return []},querySelector(selector){
   if(selector==='.footer-information nav')return footer;
   if(selector==='main')return main;
   if(selector==='#technology [data-product="agent-runner"]')return route==='/'?button:null;
   if(selector==='[data-research-record]')return recordHtml?{remove(){recordHtml=''}}:null;
   if(selector==='#publication-links')return panelHtml?{remove(){panelHtml=''}}:null;
   return null;
  }};
  class Observer{constructor(fn){callback=fn}observe(){}}
  vm.runInNewContext(read('src/publication-links.js'),{document,location:{pathname:route},MutationObserver:Observer},{timeout:1000});
  for(const lang of ['en','en','ko','ko','en']){
   element.lang=lang;callback();
   const anchors=all(parse5.parseFragment(footerHtml),n=>n.tagName==='a');
   assert.equal(anchors.length,1);
   assert.equal(attr(anchors[0],'href'),'/charter/?lang='+lang);
   assert.equal(text(anchors[0]),lang==='ko'?'AI 헌장':'AI Charter');
   if(route==='/')assert.equal(recordHtml,researchRecordLink(lang));else assert.equal(recordHtml,'');
  }
 }
});

test('AgentRunner primary CTAs, dated card and home link share the native record without changing other product content',()=>{
 const route='/products/agent-runner/';
 for(const lang of ['en','ko']){
  const original=render(route,lang).main;
  const result=decorateMain(original,route,lang);
  const anchors=all(parse5.parseFragment(result),n=>n.tagName==='a'&&attr(n,'data-agentrunner-latest-record')!==undefined);
  assert.equal(anchors.length,2);
  assert.deepEqual(anchors.map(n=>attr(n,'class')),['solid-link','line-link']);
  for(const link of anchors){assert.equal(attr(link,'href'),agentRunnerRecordUrl(lang));assert.equal(text(link),agentRunnerRecordLabel(lang));}
  const oldLinks=original.match(/<a class="(?:solid-link|line-link)" href="https:\/\/metdol\.com\/development-note#records-title">[^<]*<\/a>/g);
  assert.equal(oldLinks.length,2);
  const newLinks=result.match(/<a class="(?:solid-link|line-link)" data-agentrunner-latest-record href="[^"]+">[^<]*<\/a>/g);
  assert.equal(newLinks.length,2);
  let restored=result;
  for(const [i,link] of newLinks.entries())restored=restored.replace(link,oldLinks[i]);
  assert.equal(restored,original,'Only the two primary CTA anchors may change');
  assert.equal(decorateMain(result,route,lang),result);
  assert.ok(publicationLinks(route,lang).includes(agentRunnerRecordUrl(lang)));
  assert.ok(researchRecordLink(lang).includes(agentRunnerRecordUrl(lang)));
  assert.doesNotMatch(result,/href="https:\/\/metdol\.com\/development-note#records-title"/);
 }
 for(const route of ['/products/auxtho/','/products/moirion/','/products/metdol/','/products/ardamire/'])for(const lang of ['en','ko'])assert.equal(decorateMain(render(route,lang).main,route,lang),render(route,lang).main);
 assert.ok(read('products/agent-runner/index.html').replace(publicationLinks('/products/agent-runner/','en'),'').includes(decorateMain(render('/products/agent-runner/','en').main,'/products/agent-runner/','en')));
});

test('AgentRunner primary CTA destinations survive repeated client language changes and a fresh portfolio render',()=>{
 let callback,selection;
 const makeLink=()=>({attrs:{href:'https://metdol.com/development-note#records-title'},textContent:'old',setAttribute(k,v){this.attrs[k]=v}});
 let links=[makeLink(),makeLink()];
 const element={lang:'en'};
 const main={querySelector(){return null},insertAdjacentHTML(){}};
 const document={documentElement:element,querySelector(s){return s==='main'?main:null},querySelectorAll(s){selection=s;return links}};
 class Observer{constructor(fn){callback=fn}observe(){}}
 vm.runInNewContext(read('src/publication-links.js'),{document,location:{pathname:'/products/agent-runner/'},MutationObserver:Observer},{timeout:1000});
 for(const lang of ['en','ko','ko','en']){
  element.lang=lang;callback();
  assert.ok(selection.includes('data-agentrunner-latest-record'));
  for(const link of links){assert.equal(link.attrs.href,agentRunnerRecordUrl(lang));assert.equal(link.textContent,agentRunnerRecordLabel(lang));assert.equal(link.attrs['data-agentrunner-latest-record'],'');}
 }
 links=[makeLink(),makeLink()];element.lang='ko';callback();
 for(const link of links){assert.equal(link.attrs.href,agentRunnerRecordUrl('ko'));assert.equal(link.textContent,agentRunnerRecordLabel('ko'));}
});
