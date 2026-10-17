const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),parse5=require('parse5');
const {render}=require('../scripts/release/render-company-portfolio.cjs');
const root=path.resolve(__dirname,'..');
const routes=['/',...['auxtho','moirion','ardamire','metdol','agent-runner'].map(id=>'/products/'+id+'/')];
const attr=(n,k)=>n.attrs?.find(a=>a.name===k)?.value;
const text=n=>n.nodeName==='#text'?n.value:(n.childNodes||[]).map(text).join('');
function find(markup,predicate){const out=[];function visit(n){if(predicate(n))out.push(n);for(const c of n.childNodes||[])visit(c);}visit(parse5.parseFragment(markup));return out;}
const byId=(markup,id)=>find(markup,n=>attr(n,'id')===id)[0];

test('Bilingual main separates products, security and technology in the requested order',()=>{
 for(const lang of ['ko','en']){
  const {main,footer,nav}=render('/',lang);
  assert.ok(main.indexOf('id="software"')<main.indexOf('id="security"'));
  assert.ok(main.indexOf('id="security"')<main.indexOf('id="technology"'));
  assert.ok(main.indexOf('id="technology"')<main.indexOf('id="practice"'));
  const selected=id=>find(parse5.serialize(byId(main,id)),n=>n.tagName==='button'&&attr(n,'data-product')).map(n=>attr(n,'data-product'));
  assert.deepEqual(selected('software'),['auxtho','moirion']);
  assert.deepEqual(selected('technology'),['metdol','agent-runner']);
  const security=byId(main,'security');
  const headings=find(parse5.serialize(security),n=>n.tagName==='h3').map(text);
  assert.deepEqual(headings.slice(0,2),['Ardamire Defense Layer','Ardamire WhiteCell']);
  assert.ok(headings[2].includes(lang==='ko'?'사람':'Human'));
  const anchors=find(nav,n=>n.tagName==='a').map(n=>attr(n,'href'));
  assert.deepEqual(anchors,['#software','#security','#technology','#practice','#contact'].map(h=>'/?lang='+lang+h));
  assert.ok(footer.includes('/whitecell/?lang='+lang));
  assert.doesNotMatch(main+footer,/\/products\/(?:whitecell|bridge)\//);
 }
});

test('Bridge has a Metdol detail section, concrete supported examples and separate responsibilities',()=>{
 const expected={ko:['작업 환경 연결 — Auxtho Bridge','Finder','Xcode','Excel','책을 쓰든, 작곡을 하든, 게임을 하든','당신의 세상에 집중하세요','AI 전용 커서','화면 상단의 작업 표시','ZIP·EXE','독립적으로 대조','기기 간 연결은 Metdol이 맡습니다'],en:['Connect your work environment — Auxtho Bridge','Finder','Xcode','Excel','Write a book, compose music or play a game','Focus on your world','dedicated AI cursor','top status display','ZIP and EXE','independently checked','Metdol connects the devices']};
 for(const lang of ['ko','en']){
  const bridge=byId(render('/products/metdol/',lang).main,'bridge');assert.ok(bridge);
  const copy=text(bridge);for(const value of expected[lang])assert.ok(copy.includes(value),lang+':'+value);
  const lead=lang==='ko'?'책을 쓰든, 작곡을 하든, 게임을 하든':'Write a book, compose music or play a game';
  const heading=lang==='ko'?'당신의 세상에 집중하세요':'Focus on your world';
  const body=lang==='ko'?'AI는 허용된 작업 환경에서 맡은 일을 합니다.':'AI handles its assigned task in the permitted work environment.';
  assert.ok(copy.indexOf(lead)<copy.indexOf(heading));
  assert.ok(copy.indexOf(heading)<copy.indexOf(body));
  assert.doesNotMatch(copy,/MSI|VRAM|GPU memory pooling|완전한 입력 분리|모든 (?:앱|프로그램)|every (?:app|program)|generally available|일반 출시/);
  assert.doesNotMatch(copy,/GPT|Gemini|AppContainer|managed_task|job_[a-f0-9]|ws_[a-f0-9]/);
  assert.equal(find(parse5.serialize(bridge),n=>n.tagName==='article'&&(attr(n,'class')||'').includes('capability-card')).length,4);
  assert.ok(copy.includes(lang==='ko'?'별도로 진행한 Metdol 앱 연결 시험':'a separate Metdol app workflow'));
  for(const route of routes.filter(r=>r!=='/products/metdol/'))assert.equal(byId(render(route,lang).main,'bridge'),undefined,route);
 }
});

test('New security copy separates observation, enforcement and human approval without claiming live integration',()=>{
 for(const lang of ['ko','en']){
  const copy=text(byId(render('/',lang).main,'security'));
  assert.ok(copy.includes(lang==='ko'?'실시간 AI 방어 구조':'real-time AI defence architecture'));
  assert.ok(copy.includes(lang==='ko'?'독립된 권한과 정책':'its own authority and policies'));
  assert.ok(copy.includes(lang==='ko'?'검증한 뒤 권한 있는 사람이 승인':'validation and approval by an authorised person'));
  assert.doesNotMatch(copy,/완벽|100%|전면 보호|autonomous policy deployment|automatically deploy|bank-wide|fully integrated|currently connected/);
 }
});

test('All six indexable pages match the final runtime main, footer and navigation',()=>{
 for(const route of routes){
  const html=fs.readFileSync(path.join(root,route.slice(1)+'index.html'),'utf8');
  const output=render(route,'en');
  const {publicationLinks,decorateMain,decorateFooter}=require('../src/publication-links.js');
  const expectedMain=decorateMain(output.main,route,'en').replace('<section class="contact-section"',publicationLinks(route,'en')+'<section class="contact-section"');
  assert.ok(html.includes(expectedMain),route+':main');
  assert.ok(html.includes(decorateFooter(output.footer,'en')),route+':footer');
  assert.equal(html.split(output.nav).length-1,2,route+':desktop and mobile nav');
 }
});
