const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),parse5=require('parse5');
const {render}=require('../scripts/release/render-company-portfolio.cjs');
const root=path.resolve(__dirname,'..');
const contract=require('../scripts/release/brand-copy-contract.json');
const routes=['/',...Object.keys(contract.products).map(id=>'/products/'+id+'/')];
const assetFile=(dir)=>fs.readdirSync(path.join(root,dir)).find(n=>/^app\.[a-f0-9]{64}\.js$/.test(n));
const portfolio=fs.readFileSync(path.join(root,'assets/portfolio-20261009',assetFile('assets/portfolio-20261009')),'utf8');
const authored=name=>JSON.parse(portfolio.split(/\r?\n/).find(l=>l.startsWith('const '+name+'=')).slice(('const '+name+'=').length).replace(/;$/,''));
const copy=authored('copy'),products=authored('products');
const attr=(n,k)=>n.attrs?.find(a=>a.name===k)?.value;
const text=n=>n.nodeName==='#text'?n.value:n.tagName==='br'?'\n':(n.childNodes||[]).map(text).join('');
const clean=n=>text(n).replace(/[ \t]+/g,' ').trim();
const hasClass=(n,c)=>(attr(n,'class')||'').split(/\s+/).includes(c);
function find(markup,predicate){
 const out=[];function walk(n){if(predicate(n))out.push(n);for(const c of n.childNodes||[])walk(c);}
 walk(typeof markup==='string'?parse5.parseFragment(markup):markup);return out;
}
const links=n=>find(n,x=>x.tagName==='a').map(x=>[clean(x),attr(x,'href')]);
const heading=s=>s.replace(/\.(?=\s|<|$)/g,'');
const expectedHeading=s=>clean(parse5.parseFragment(heading(s)));

test('Company hero and footer slogans remain the reviewed bilingual brand, not feature-update copy',()=>{
 for(const lang of ['ko','en']){
  const fixed=contract.company[lang];
  for(const key of ['heroEyebrow','heroTitle','heroLead','footerLine'])assert.equal(copy[lang][key],fixed[key],lang+':'+key);
  const main=render('/',lang).main;
  assert.equal(clean(find(main,n=>n.tagName==='h1')[0]),fixed.heroRendered);
  for(const route of routes){
   const {footer}=render(route,lang);
   const company=find(footer,n=>hasClass(n,'footer-company'))[0];assert.ok(company);
   assert.equal(clean(find(company,n=>n.tagName==='p')[0]),fixed.footerRendered,route+':footer slogan');
   assert.equal(clean(find(company,n=>hasClass(n,'footer-company-name'))[0]),contract.company.legalName);
   assert.deepEqual(links(company).at(-1),[contract.company.contact,'mailto:'+contract.company.contact]);
   assert.equal(clean(find(footer,n=>hasClass(n,'footer-copyright'))[0]),contract.company.copyright);
   const info=find(footer,n=>hasClass(n,'footer-information'))[0];
   assert.deepEqual(links(info),contract.company.informationLinks);
  }
 }
});

test('All six portfolio pages share the same stable header order and three footer families',()=>{
 for(const lang of ['ko','en'])for(const route of routes){
  const {main,footer,nav}=render(route,lang);
  assert.deepEqual(links(nav),contract.navigation[lang].map((label,i)=>[label,'/?lang='+lang+contract.navigation.anchors[i]]),lang+':'+route);
  const groups=find(footer,n=>hasClass(n,'footer-group'));assert.equal(groups.length,3);
  contract.groups.forEach((g,i)=>{
   assert.equal(clean(find(groups[i],n=>hasClass(n,'eyebrow'))[0]),g[lang]);
   assert.deepEqual(links(groups[i]),g.members.map(([name,url])=>[name,url+'?lang='+lang]));
  });
  if(route==='/'){
   const order=contract.groups.map(g=>main.indexOf('id="'+g.id+'"'));
   assert.ok(order.every(n=>n>=0));assert.deepEqual([...order].sort((a,b)=>a-b),order);
  }
 }
});

test('Each product keeps its own fixed name and tagline across detail pages',()=>{
 for(const [id,fixed] of Object.entries(contract.products))for(const lang of ['ko','en']){
  const product=products.find(p=>p.id===id);assert.ok(product);
  assert.equal(product[lang].name,fixed.name,id+':name');
  assert.equal(product[lang].title,fixed[lang],id+':authored tagline');
  assert.equal(clean(find(render('/products/'+id+'/',lang).main,n=>n.tagName==='h1')[0]),expectedHeading(fixed[lang]),id+':rendered tagline');
 }
});

test('The selected Bridge benefit stays inside Metdol and never becomes the company slogan',()=>{
 for(const lang of ['ko','en']){
  const fixed=contract.bridge[lang];
  const main=render('/products/metdol/',lang).main;
  const bridge=find(main,n=>attr(n,'id')==='bridge')[0];assert.ok(bridge);
  const feature=find(bridge,n=>hasClass(n,'capability-card')).find(n=>clean(n).includes(fixed.lead));assert.ok(feature);
  assert.equal(clean(find(feature,n=>n.tagName==='h3')[0]),fixed.title);
  const paragraphs=find(feature,n=>n.tagName==='p').map(clean);
  assert.ok(paragraphs.includes(fixed.lead));
  assert.ok(paragraphs.some(s=>s.startsWith(fixed.bodyPrefix)));
  for(const route of routes){
   const result=render(route,lang);
   assert.ok(!result.footer.includes(fixed.title)&&!result.nav.includes(fixed.title));
   if(route!=='/products/metdol/')assert.ok(!result.main.includes(fixed.title),route);
  }
 }
});

test('WhiteCell retains its approved dedicated navigation, product slogans and company ownership',()=>{
 const file=assetFile('assets/whitecell-20261015');
 const source=fs.readFileSync(path.join(root,'assets/whitecell-20261015',file),'utf8');
 const marker='  const stages =';assert.ok(source.includes(marker));
 const scope={};vm.runInNewContext(source.slice(0,source.indexOf(marker))+'globalThis.value=copy;})();',scope,{timeout:1000});
 for(const lang of ['ko','en'])for(const [key,value] of Object.entries(contract.whitecell[lang]))assert.equal(scope.value[lang][key],value,lang+':'+key);
 const html=fs.readFileSync(path.join(root,'whitecell/index.html'),'utf8');
 const footer=find(html,n=>n.tagName==='footer')[0];assert.ok(footer);
 assert.ok(clean(footer).includes('© 2026 Auxtho Inc.'));
 const footerLinks=links(footer).map(x=>x[1]);
 for(const url of ['https://auxtho.com/privacy.html','https://auxtho.com/terms.html','https://auxtho.com/products/ardamire/'])assert.ok(footerLinks.includes(url),url);
 assert.ok(html.includes('https://auxtho.com/'));
});

test('The private brand contract and review tests are excluded from public allowlist',()=>{
 const manifest=require('../scripts/release/public-files.json');
 for(const name of ['brand-copy-contract','brand-consistency.spec','PRIVATE','manual-preview'])assert.ok(manifest.paths.every(p=>!p.includes(name)),name);
 assert.equal(contract.privateOnly,true);
});
