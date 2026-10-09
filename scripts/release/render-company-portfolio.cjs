const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const script=fs.readdirSync(path.join(root,'assets/portfolio-20261009')).find(n=>/^app\.[a-f0-9]{64}\.js$/.test(n));
const code=fs.readFileSync(path.join(root,'assets/portfolio-20261009',script),'utf8');
function render(route){
 const nodes=new Map();
 function element(selector){
  if(nodes.has(selector))return nodes.get(selector);
  const node={innerHTML:'',textContent:'',hidden:false,lang:'',href:'',classList:{add(){},remove(){},toggle(){return false}},setAttribute(){},getAttribute(){return ''},addEventListener(){},querySelector(s){return element(selector+' '+s)},querySelectorAll(){return []},insertAdjacentHTML(){},scrollTo(){},scrollIntoView(){},showModal(){},close(){},focus(){}};
  nodes.set(selector,node);return node;
 }
 const document={documentElement:{},title:'',querySelector:element,querySelectorAll(){return []},addEventListener(){}};
 vm.runInNewContext(code,{document,location:{pathname:route,search:'?lang=en',hash:''},URLSearchParams,matchMedia(){return {matches:false}},requestAnimationFrame(fn){fn()}},{timeout:2000,filename:script});
 return {route,main:element('#main').innerHTML,footer:element('.site-footer').innerHTML};
}
if(require.main===module)process.stdout.write(JSON.stringify(['/',...['auxtho','moirion','agent-runner','ardamire','metdol'].map(id=>'/products/'+id+'/')].map(render)));
module.exports={render};
