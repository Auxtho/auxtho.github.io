const parse5=require('parse5');
const {markup,heroArt,heroNote}=require('../../src/home-overview.js');
const attr=(n,k)=>(n.attrs||[]).find(x=>x.name===k)?.value;
function nodes(html){const list=[];function visit(n){list.push(n);for(const c of n.childNodes||[])visit(c);}visit(parse5.parseFragment(html,{sourceCodeLocationInfo:true}));return list;}
function refineHero(html,lang){
 const all=nodes(html),art=all.find(n=>attr(n,'class')==='hero-art'),note=all.find(n=>attr(n,'class')==='media-note');
 if(!art||!note)throw Error('Expected hero art or note missing');
 const replacements=[{n:art,s:'<div class="hero-art ah-art" aria-hidden="true">'+heroArt(lang==='ko')+'</div>'},{n:note,s:'<p class="media-note">'+heroNote(lang==='ko')+'</p>'}].sort((a,b)=>b.n.sourceCodeLocation.startOffset-a.n.sourceCodeLocation.startOffset);
 for(const {n,s} of replacements)html=html.slice(0,n.sourceCodeLocation.startOffset)+s+html.slice(n.sourceCodeLocation.endOffset);
 return html.replace('<section class="hero">','<section class="hero ah-hero">');
}
function composeHome(html,lang){
 const all=nodes(html),hero=all.find(n=>n.tagName==='section'&&attr(n,'class')==='hero'),contact=all.find(n=>attr(n,'id')==='contact'),reading=all.find(n=>attr(n,'id')==='publication-links'),record=all.find(n=>attr(n,'data-research-record')!==undefined);
 if(!hero||!contact||!reading||!record)throw Error('Required preserved home content missing');
 const raw=n=>html.slice(n.sourceCodeLocation.startOffset,n.sourceCodeLocation.endOffset);
 return refineHero(raw(hero),lang)+markup(lang==='ko').replace('<div data-as-record-slot></div>',raw(record)).replace('<div data-as-charter-slot></div>',raw(reading))+raw(contact);
}
function detailAnchors(html){return html.replace('<section class="detail-main"', '<span id="auxtho-workflow" data-as-flow-anchor aria-hidden="true"></span><span id="auxtho-insurance" data-as-flow-anchor aria-hidden="true"></span><section class="detail-main"').replace('<section class="contact-section"','<span id="auxtho-network" data-as-flow-anchor aria-hidden="true"></span><section class="contact-section"');}
module.exports={composeHome,detailAnchors};
