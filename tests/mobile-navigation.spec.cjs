const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'assets/portfolio-20261009/app.1998cf9b8bbc86cf60f162a52e3742e603bb71d3a2e053ac1ea83b2f03399986.js'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/portfolio-20261009/styles.css'),'utf8');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');

test('All six routes share one sticky navigation wrapper without preview-only markers',()=>{
 for(const file of ['index.html',...['auxtho','moirion','ardamire','metdol','agent-runner'].map(x=>'products/'+x+'/index.html')]){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  assert.equal((html.match(/class="site-navigation"/g)||[]).length,1);
  assert.match(html,/<div class="site-navigation">[\s\S]*?<\/header>\s*<nav id="mobile-menu"[\s\S]*?<\/nav>\s*<\/div>/);
  assert.match(html,/index,follow/);
  assert.doesNotMatch(html,/noindex|LOCAL DESIGN PREVIEW/);
 }
 assert.match(css,/\.site-navigation\{position:sticky;top:0;z-index:60/);
 assert.match(css,/scroll-padding-top:calc\(var\(--header-height\) \+ 18px\)/);
 assert.match(css,/\.product-stage\{top:calc\(var\(--header-height\) \+ 24px\)/);
});
test('Action links are text-only and the two-line menu uses fixed geometry',()=>{
 assert.doesNotMatch(js,/↗/);
 const menuSetup=js.slice(js.indexOf("const menu=document.querySelector"),js.indexOf('function captureButton('));
 assert.doesNotMatch(menuSetup,/＋|−/);
 assert.doesNotMatch(js,/const arrow=|class="arrow"/);
 assert.match(js,/menu.innerHTML=menuMark/);
 assert.match(js,/const zoomIcon='<svg class="zoom-icon"/);
 assert.equal((js.match(/auxtho-toggle-line auxtho-line-[12]/g)||[]).length,2);
 assert.doesNotMatch(js,/auxtho-line-[34]/);
 assert.match(css,/--auxtho-red:#ed1c24/);
 assert.match(css,/rotate\(-45deg\)/);
 assert.match(css,/rotate\(45deg\)/);
 assert.match(css,/left:4px;top:11px;width:18px;height:2px/);
 assert.match(css,/transition:transform 300ms cubic-bezier\(\.4,0,\.2,1\)/);
 assert.match(css,/\.solid-link\{background:transparent;color:inherit;border-bottom:1px solid currentColor/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.auxtho-toggle-line\{transition:none\}\}/);
});
test('Image enlargement hint is compact, outside the image and never a hover-only instruction',()=>{
 const hint=js.slice(js.indexOf('function captureHint()'),js.indexOf('function heroLink('));
 for(const lang of ['en','ko']){
  const render=vm.runInNewContext(hint+';captureHint',{lang,zoomIcon:'<svg aria-hidden="true"></svg>'});
  assert.match(render(),lang==='ko'?/확대/:/Enlarge/);
  assert.doesNotMatch(render(),/Open full-size/);
 }
 assert.match(css,/\.capture-hint\{position:static;align-self:flex-end/);
 assert.match(css,/\.stage-visual\.moirion \.moirion-composition \.capture-open img\{position:static/);
 assert.match(js,/accessibleLabel=label/);
 assert.match(js,/data-enlarge/);
});

function menuFixture(){
 const state={attributes:new Map(),label:{},focus:0,linkFocus:0,menu:{hidden:true}};
 const menu={setAttribute:(k,v)=>state.attributes.set(k,v),querySelector:()=>state.label,focus:()=>state.focus++};
 const mobileMenu={set hidden(v){state.menu.hidden=v},get hidden(){return state.menu.hidden},querySelector:()=>({focus:()=>state.linkFocus++})};
 const fragment=js.slice(js.indexOf('function setMenuOpen('),js.indexOf('setMenuOpen(false);'));
 const set=vm.runInNewContext(fragment+';setMenuOpen',{menu,mobileMenu,c:{menu:'Menu',close:'Close'},displayCopy:String,requestAnimationFrame:f=>f()});
 return {state,set};
}
test('Menu state, labels and focus follow explicit open/close state',()=>{
 const {state,set}=menuFixture();
 set(true,{moveFocus:true});
 assert.equal(state.attributes.get('aria-expanded'),'true');
 assert.equal(state.attributes.get('aria-label'),'Close');
 assert.match(js,/menu.setAttribute\('aria-label',open\?c.close:c.menu\)/);
 assert.equal(state.menu.hidden,false);
 assert.equal(state.linkFocus,1);
 set(false,{restoreFocus:true});
 assert.equal(state.attributes.get('aria-expanded'),'false');
 assert.equal(state.attributes.get('aria-label'),'Menu');
 assert.equal(state.menu.hidden,true);
 assert.equal(state.focus,1);
 assert.match(js,/e.key==='Escape'[\s\S]*?restoreFocus:true/);
 assert.match(js,/compactNavigation.addEventListener\('change'/);
});

function productFixture({compact=true,stageTop=220,listBottom=100}={}){
 const records={scroll:[],focus:[],renders:[]};
 const groups=['software','technology'].map((id,index)=>{
  const stage={innerHTML:'initial',getBoundingClientRect:()=>({top:stageTop})};
  const group={id,buttons:[],stage,querySelectorAll:()=>group.buttons,querySelector:sel=>sel==='.product-list'?{getBoundingClientRect:()=>({bottom:listBottom})}:{scrollIntoView:options=>records.scroll.push({id,options})}};
  const ids=index===0?['auxtho','moirion']:['ardamire','metdol'];
  group.buttons=ids.map((product,i)=>{
   const attrs=new Map([['aria-pressed',String(i===0)],['aria-controls',id+'-stage']]);
   const events={};
   const b={dataset:{product},getAttribute:k=>attrs.get(k),setAttribute:(k,v)=>attrs.set(k,v),closest:()=>group,addEventListener:(type,fn)=>events[type]=fn,focus:options=>records.focus.push({product,options}),click:()=>events.click(),key:key=>{let prevented=false;events.keydown({key,preventDefault:()=>prevented=true});return prevented}};
   return b;
  });
  return group;
 });
 const all=groups.flatMap(g=>g.buttons);
 const document={querySelectorAll:()=>all,getElementById:id=>groups.find(g=>g.id+'-stage'===id)?.stage};
 const products=all.map(b=>({id:b.dataset.product}));
 const fragment=js.slice(js.indexOf('function bindProductSelectors(){'),js.indexOf('function familyContext('));
 const bind=vm.runInNewContext(fragment+';bindProductSelectors',{document,products,matchMedia:()=>({matches:compact}),stage:p=>{records.renders.push(p.id);return 'selected:'+p.id}});
 bind();
 return {groups,records};
}
test('Changing product at the selection bar does not force a jump',()=>{
 const {groups,records}=productFixture();
 groups[0].buttons[1].click();
 assert.equal(groups[0].buttons[0].getAttribute('aria-pressed'),'false');
 assert.equal(groups[0].buttons[1].getAttribute('aria-pressed'),'true');
 assert.equal(groups[0].stage.innerHTML,'selected:moirion');
 assert.equal(records.scroll.length,0);
 assert.equal(groups[1].stage.innerHTML,'initial');
 groups[0].buttons[1].click();
 assert.equal(records.renders.length,1);
});
test('Changing product while reading below returns to the selector, never past it to the image',()=>{
 const {groups,records}=productFixture({stageTop:-250});
 groups[0].buttons[1].click();
 assert.equal(records.scroll.length,1);
 assert.equal(records.scroll[0].id,'software');
 assert.equal(records.scroll[0].options.block,'start');
 assert.equal(records.scroll[0].options.behavior,'instant');
});
test('Desktop product selection preserves the existing two-column position',()=>{
 const {groups,records}=productFixture({compact:false,stageTop:-250});
 groups[0].buttons[1].click();
 assert.equal(records.scroll.length,0);
});
test('Keyboard product selection is grouped and retains focus without browser scrolling',()=>{
 const {groups,records}=productFixture();
 assert.equal(groups[0].buttons[0].key('ArrowRight'),true);
 assert.equal(records.focus[0].product,'moirion');
 assert.equal(records.focus[0].options.preventScroll,true);
 assert.equal(groups[0].buttons[1].getAttribute('aria-pressed'),'true');
 assert.equal(groups[1].buttons[0].getAttribute('aria-pressed'),'true');
 assert.equal(groups[0].buttons[1].key('Home'),true);
 assert.equal(groups[0].buttons[0].getAttribute('aria-pressed'),'true');
});

