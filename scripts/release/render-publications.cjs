'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {render} = require('./render-company-portfolio.cjs');
const {publicationLinks,decorateMain,decorateFooter} = require('../../src/publication-links.js');
const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'src/publications');
const assetDirectory = 'assets/publications-20261018';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const escape = value => String(value).replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const routes = [
  {id:'charter',route:'/charter/',prefix:'AUXTHO_AI_CHARTER_V1_0_',kind:'charter',
   description:{en:'Auxtho’s purpose, long-term direction toward A.O.I. and eight principles for capable, human-directed AI.',ko:'사람의 가능성을 넓히는 Auxtho의 목적, A.O.I.를 향한 장기 방향과 여덟 가지 원칙.'}},
  {id:'defense',route:'/charter/defense/',prefix:'ARDAMIRE_WHITECELL_DEFENSE_CHARTER_V1_1_',kind:'charter',
   description:{en:'Ardamire and WhiteCell design principles for powerful active defense, independent enforcement and meaningful human choice.',ko:'강력한 능동 방어, 독립적인 집행과 인간의 실질적인 선택권을 위한 Ardamire와 WhiteCell의 방어 설계 원칙.'}},
  {id:'agentrunner',route:'/products/agent-runner/development-record-2026-10-18/',prefix:'AGENTRUNNER_20261018_',kind:'record',
   description:{en:'A dated AgentRunner development record connecting six reviewed files, a results meeting and an XO briefing in a Mac local source development version.',ko:'Mac 로컬 소스 개발본에서 검토된 파일 여섯 개, 결과 회의와 XO 브리핑을 연결한 2026년 10월 18일 AgentRunner 개발 기록.'}}
];
function inline(text, lang) {
  const transformed = text
    .replace(/AUXTHO_AI_CHARTER_V1_0_(?:EN|KO)\.md/g, '/charter/?lang=' + lang)
    .replace(/ARDAMIRE_WHITECELL_DEFENSE_CHARTER_V1_1_(?:EN|KO)\.md/g, '/charter/defense/?lang=' + lang)
    .replace(/https:\/\/auxtho\.com\/whitecell\/(?:\?lang=ko)?/g, '/whitecell/?lang=' + lang)
    .replace(/https:\/\/auxtho\.com\/security\/ardamire\//g, '/security/ardamire/');
  return escape(transformed).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const url = href.replace(/&amp;/g, '&');
    if (!/^(?:\/(?!\/)|https:\/\/futureoflife\.org\/)/.test(url)) throw Error('Unreviewed manuscript link: ' + url);
    return '<a href="' + href + '">' + label + '</a>';
  }).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
function manuscript(page, lang) {
  const text = fs.readFileSync(path.join(source, page.prefix + lang.toUpperCase() + (page.kind === 'record' ? '.txt' : '.md')), 'utf8').replace(/\r\n/g, '\n').trim();
  if (page.kind === 'record') {
    const blocks = text.split(/\n\n+/);
    return {title:blocks[0],meta:blocks[1].replace(/\n/g, ' · '),paragraphs:blocks.slice(2)};
  }
  const blocks = text.split(/\n\n+/);
  return {title:blocks[0].slice(2),meta:blocks[1].replace(/\*\*/g, ''),blocks:blocks.slice(2)};
}
function article(page, lang) {
  const doc = manuscript(page, lang);
  if (page.kind === 'record') {
    const image = assetDirectory + '/agentrunner-office-xo-briefing.jpg';
    const imageUrl = '/' + image + '?sha256=' + digest(fs.readFileSync(path.join(root, image)));
    const caption = lang === 'ko'
      ? 'AgentRunner 로컬 소스 개발본의 실제 화면. XO 결과 창에 검토된 업무 6개와 파일 6개, 요약·권고·미해결 사항이 표시됩니다. 최종 Human 결정은 대기 중입니다.'
      : 'An actual screen from AgentRunner’s local source development version. The XO Results window shows six reviewed tasks and six files, together with a summary, recommendation and unresolved issues. The final Human decision remains pending.';
    const scope = lang === 'ko'
      ? 'Saved company · View only: 재시작 후 보존된 결과를 열람한 화면이며, 촬영 순간 AI가 실행 중이었다는 뜻은 아닙니다. 이미지를 선택하면 원본을 볼 수 있습니다.'
      : 'Saved company · View only: retained results viewed after restart, not a claim of active model execution at capture. Select the image to view the original.';
    const figure = '<figure class="publication-figure"><a href="' + imageUrl + '" aria-label="' + (lang === 'ko' ? '원본 화면 크게 보기' : 'View the original screen') + '"><img src="' + imageUrl + '" alt="' + escape(caption) + '" width="1280" height="720"></a><figcaption>' + escape(caption) + '<span class="image-scope">' + escape(scope) + '</span></figcaption></figure>';
    return {doc, toc:'',html:doc.paragraphs.map((p,i) => '<p>' + escape(p) + '</p>' + (i === 0 ? figure : '')).join('\n')};
  }
  let index=0, purposeParagraph=0, purpose=false;
  const toc = [];
  const html = doc.blocks.map(block => {
    if (/^# /.test(block)) throw Error('Unexpected heading level');
    const heading = block.match(/^(#{2,3}) (.+)$/);
    if (heading) {
      const level = heading[1].length, id = 'section-' + (++index);
      purpose = page.id === 'charter' && index === 1;
      if (level === 2) toc.push({id,title:heading[2]});
      return '<h' + level + ' id="' + id + '">' + inline(heading[2], lang) + '</h' + level + '>';
    }
    if (block.startsWith('- ')) return '<ul>' + block.split('\n').map(line => {
      if (!line.startsWith('- ')) throw Error('Unsupported manuscript list');
      return '<li>' + inline(line.slice(2), lang) + '</li>';
    }).join('') + '</ul>';
    const cls = purpose && ++purposeParagraph <= 5 ? ' class="purpose-line' + (purposeParagraph === 1 ? ' purpose-lead' : '') + '"' : '';
    return '<p' + cls + '>' + inline(block,lang) + '</p>';
  }).join('\n');
  const tocHtml = '<aside class="publication-toc"><p>' + (lang === 'ko' ? '목차' : 'ON THIS PAGE') + '</p><ol>' + toc.map(x => '<li><a href="#' + x.id + '">' + escape(x.title) + '</a></li>').join('') + '</ol></aside>';
  return {doc,toc:tocHtml,html};
}
function header(lang) {
  const home = read('index.html');
  let html = home.slice(home.indexOf('<a class="skip-link"'), home.indexOf('<main'));
  const nav = render('/',lang).nav;
  html = html.replace(/(<nav class="desktop-nav"[^>]*>)[\s\S]*?<\/nav>/, '$1' + nav + '</nav>')
    .replace(/(<nav id="mobile-menu"[^>]*>)[\s\S]*?<\/nav>/, '$1' + nav + '</nav>')
    .replace(/(<a class="language-link"[^>]*>)[\s\S]*?<\/a>/, '<a class="language-link" href="?lang=' + (lang==='en'?'ko':'en') + '" lang="' + (lang==='en'?'ko':'en') + '">' + (lang==='en'?'한국어':'EN') + '</a>');
  if (lang === 'ko') html = html.replace('Skip to content','본문으로 이동').replace('Auxtho company home','Auxtho 회사 홈').replace('Main navigation','주 메뉴').replace('Mobile navigation','모바일 메뉴').replace('aria-label="Menu"','aria-label="메뉴"');
  return html.replace('href="/"','href="/?lang=' + lang + '"');
}
function footer(lang) {
  return decorateFooter(render('/',lang).footer,lang);
}
function shell(page,lang) {
  const {doc,toc,html} = article(page,lang);
  const related = page.id === 'charter' ? [['/charter/defense/','Ardamire × WhiteCell',lang==='ko'?'방어 설계 헌장':'Defense architecture charter']]
    : page.id === 'defense' ? [['/charter/','Auxtho AI',lang==='ko'?'헌장':'Charter'],['/products/ardamire/','Ardamire Defense Layer',''],['/whitecell/','WhiteCell','']]
    : [['/products/agent-runner/','Agent Runner',lang==='ko'?'소개':'Overview'],['/charter/','Auxtho AI',lang==='ko'?'헌장':'Charter']];
  const links = related.map(x => '<a href="'+x[0]+'?lang='+lang+'">'+escape(x[1]+' '+x[2]).trim()+'</a>').join('');
  const breadcrumb = '<a href="/?lang='+lang+'">'+(lang==='ko'?'회사 홈':'Company home')+'</a> / '+(page.kind==='record'?'<a href="/products/agent-runner/?lang='+lang+'">Agent Runner</a>':(lang==='ko'?'우리의 원칙':'Our principles'));
  return header(lang) + '<main id="main" tabindex="-1"><section class="publication-hero"><div class="breadcrumbs">'+breadcrumb+'</div><p class="eyebrow">'+(page.kind==='record'?'AGENTRUNNER / DEVELOPMENT RECORD':(lang==='ko'?'AUXTHO / 우리의 원칙':'AUXTHO / OUR PRINCIPLES'))+'</p><h1>'+escape(doc.title)+'</h1><p class="publication-meta">'+escape(doc.meta)+'</p></section><div class="publication-layout'+(page.kind==='record'?' publication-record-layout':'')+'">'+toc+'<article class="publication-article'+(page.kind==='record'?' publication-record-article':'')+'">'+html+'<nav class="publication-related" aria-label="'+(lang==='ko'?'함께 읽기':'Related reading')+'">'+links+'</nav></article></div></main><footer class="site-footer" id="company-footer">'+footer(lang)+'</footer>';
}
function renderPage(page, clientUrl) {
  const en=manuscript(page,'en'),ko=manuscript(page,'ko');
  const title = en.title + ' — Auxtho', koTitle = ko.title + ' — Auxtho';
  const cssUrl='/'+assetDirectory+'/styles.css?sha256='+digest(fs.readFileSync(path.join(root,assetDirectory,'styles.css')));
  const recordCss=page.kind==='record'?'<link rel="stylesheet" href="/'+assetDirectory+'/record-layout.77b9c5af6d0e475ddc8dfb14fda2fbe51c7affbb6dc07adf374e959ff72dc507.css?sha256=77b9c5af6d0e475ddc8dfb14fda2fbe51c7affbb6dc07adf374e959ff72dc507">':'';
  const canonical='https://auxtho.com'+page.route;
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="robots" content="index,follow"><meta name="color-scheme" content="dark light"><meta name="theme-color" content="#101110"><meta name="referrer" content="strict-origin-when-cross-origin">\n<title>'+escape(title)+'</title>\n<meta name="description" content="'+escape(page.description.en)+'">\n<link rel="icon" href="/assets/favicon.svg"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">\n<link rel="stylesheet" href="/assets/portfolio-20261009/styles.css?sha256=99a51b036c093c0a64dc0643cba8f541a1ce8d7afa38e4a292fbb74bcb78987b"><link rel="stylesheet" href="'+cssUrl+'">'+recordCss+'\n<link rel="canonical" href="'+canonical+'"><link rel="alternate" hreflang="en" href="'+canonical+'?lang=en"><link rel="alternate" hreflang="ko" href="'+canonical+'?lang=ko"><link rel="alternate" hreflang="x-default" href="'+canonical+'">\n<meta property="og:type" content="article"><meta property="og:site_name" content="Auxtho"><meta property="og:title" content="'+escape(title)+'"><meta property="og:description" content="'+escape(page.description.en)+'"><meta property="og:url" content="'+canonical+'"><meta property="og:image" content="https://auxtho.com/assets/og-image-v2-16.png">\n<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="'+escape(title)+'"><meta name="twitter:description" content="'+escape(page.description.en)+'"><meta name="twitter:image" content="https://auxtho.com/assets/og-image-v2-16.png">\n<script src="'+clientUrl+'" defer></script>\n</head>\n<body data-title-en="'+escape(title)+'" data-title-ko="'+escape(koTitle)+'" data-description-en="'+escape(page.description.en)+'" data-description-ko="'+escape(page.description.ko)+'">\n<div data-publication-shell>'+shell(page,'en')+'</div>\n<template id="publication-ko">'+shell(page,'ko')+'</template>\n<noscript><p class="noscript">This page is available in English without JavaScript. Enable JavaScript to switch to Korean. 한국어 전환에는 JavaScript가 필요합니다.</p></noscript>\n</body></html>\n';
}
function write(file,content) {const dest=path.join(root,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,content);}
function build() {
  const client=fs.readFileSync(path.join(root,'src/publications-client.js'));
  const linkBytes=fs.readFileSync(path.join(root,'src/publication-links.js'));
  const clientPath=assetDirectory+'/app.'+digest(client)+'.js';
  const linkPath=assetDirectory+'/links.'+digest(linkBytes)+'.js';
  write(clientPath,client);write(linkPath,linkBytes);
  for(const page of routes) write(page.route.slice(1)+'index.html',renderPage(page,'/'+clientPath));
  const css='/'+assetDirectory+'/styles.css?sha256='+digest(fs.readFileSync(path.join(root,assetDirectory,'styles.css')));
  for(const [file,route] of [['index.html','/'],...['auxtho','moirion','ardamire','metdol','agent-runner'].map(id=>['products/'+id+'/index.html','/products/'+id+'/']),['whitecell/index.html','/whitecell/']]) {
    let html=read(file);
    html=html.replace(/<link rel="stylesheet" href="\/assets\/publications-20261018\/styles\.css\?sha256=[a-f0-9]{64}">\n?/g,'')
      .replace(/<script src="\/assets\/publications-20261018\/links\.[a-f0-9]{64}\.js" defer><\/script>\n?/g,'')
      .replace(/<section class="publication-links" id="publication-links">[\s\S]*?<\/nav><\/section>/g,'');
    html=html.replace('</head>','<link rel="stylesheet" href="'+css+'">\n<script src="/'+linkPath+'" defer></script>\n</head>');
    if (route !== '/whitecell/') {
      const rendered = render(route,'en');
      html = html.replace(/(<main[^>]*>)[\s\S]*?(<\/main>)/, (_,open,close)=>open+decorateMain(rendered.main,route,'en')+close);
      html = html.replace(/(<footer class="site-footer"[^>]*>)[\s\S]*?(<\/footer>)/, (_,open,close)=>open+decorateFooter(rendered.footer,'en')+close);
    }
    const block=publicationLinks(route,'en');
    if(html.includes('<section class="contact-section"')) html=html.replace('<section class="contact-section"',block+'<section class="contact-section"');
    else html=html.replace('</main>',block+'</main>');
    write(file,html);
  }
  const pathsFile='scripts/release/public-files.json';
  const manifest=JSON.parse(read(pathsFile));
  const additional=[...routes.map(p=>p.route+'index.html'),'/'+clientPath,'/'+linkPath,'/'+assetDirectory+'/styles.css','/'+assetDirectory+'/record-layout.77b9c5af6d0e475ddc8dfb14fda2fbe51c7affbb6dc07adf374e959ff72dc507.css','/'+assetDirectory+'/agentrunner-office-xo-briefing.jpg'];
  const retained=manifest.paths.filter(p=>!/^\/assets\/publications-20261018\/(?:app|links)\.[a-f0-9]{64}\.js$/.test(p));
  manifest.paths=[...new Set([...retained,...additional])].sort();
  write(pathsFile,JSON.stringify(manifest,null,2)+'\n');
  let sitemap=read('sitemap.xml');
  if(!sitemap.includes('xmlns:xhtml=')) sitemap=sitemap.replace('<urlset ', '<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml" ');
  for(const page of routes) {
    const loc='https://auxtho.com'+page.route;
    if(!sitemap.includes('<loc>'+loc+'</loc>')) sitemap=sitemap.replace('</urlset>','  <url><loc>'+loc+'</loc><lastmod>2026-10-18</lastmod><xhtml:link rel="alternate" hreflang="en" href="'+loc+'?lang=en"/><xhtml:link rel="alternate" hreflang="ko" href="'+loc+'?lang=ko"/><xhtml:link rel="alternate" hreflang="x-default" href="'+loc+'"/></url>\n</urlset>');
  }
  write('sitemap.xml',sitemap);
  return {pages:routes.map(p=>p.route),assets:[clientPath,linkPath]};
}
if(require.main===module) {
  if(!process.argv.includes('--write')) throw Error('Use --write for explicit local generation');
  process.stdout.write(JSON.stringify(build(),null,2)+'\n');
}
module.exports={routes,manuscript,article,header,footer,shell,renderPage,build};
