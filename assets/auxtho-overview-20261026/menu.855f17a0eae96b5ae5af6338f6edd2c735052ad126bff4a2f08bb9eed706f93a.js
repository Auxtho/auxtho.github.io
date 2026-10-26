(function(){
  'use strict';
  function markup(ko){
    const t=(k,e)=>ko?k:e,lang=ko?'ko':'en',product=id=>'/products/'+id+'/?lang='+lang;
    const items=[['Auxtho',product('auxtho')],['Moirion',product('moirion')],['Ardamire Defense Layer',product('ardamire')],['Ardamire WhiteCell','/whitecell/?lang='+lang],['Metdol',product('metdol')],['Agent Runner',product('agent-runner')]];
    return `<div class="am-header"><div class="am-brand-slot"></div><div class="am-head-actions"><a class="am-language" data-am-language>${ko?'EN':'한국어'}</a><a class="am-contact" href="/?lang=${lang}#contact">${t('문의하기','Contact')}</a><button type="button" class="am-close" aria-label="${t('전체 메뉴 닫기','Close full menu')}"><span aria-hidden="true">×</span></button></div></div><div class="am-grid"><nav class="am-navigation" aria-label="${t('전체 메뉴','Full navigation')}"><p class="am-eyebrow">${t('탐색','NAVIGATION')}</p><ol class="am-primary-list">${items.map(([name,url],i)=>`<li><a href="${url}">${name}${i===5?`<small>${t('연구 제품','RESEARCH PRODUCT')}</small>`:''}<span aria-hidden="true"><svg class="am-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 13 13 3M3 3h10v10"/></svg></span></a></li>`).join('')}</ol><div class="am-nav-extra"><a href="#am-reading" data-am-reading>${t('공개 개발 기록 보기','View development records')} <svg class="am-arrow am-reading-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 8h12M9 3l5 5-5 5"/></svg></a><a href="/?lang=${lang}#contact">${t('업무 문의','Discuss your work')} <svg class="am-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 13 13 3M3 3h10v10"/></svg></a></div></nav><section class="am-reading" id="am-reading" aria-labelledby="am-reading-title"><div class="am-section-head"><h2 id="am-reading-title">${t('공개 개발 기록','PUBLIC DEVELOPMENT RECORDS')}</h2><span>${t('개발 과정과 확인한 범위','WHAT WE BUILT AND CHECKED')}</span></div><div class="am-cards"><article class="am-card"><a href="/products/agent-runner/development-record-2026-10-18/?lang=${lang}"><p class="am-card-date"><time datetime="2026-10-18">${t('2026.10.18','18 OCT 2026')}</time> / AGENT RUNNER</p><img src="/assets/publications-20261018/agentrunner-office-xo-briefing.jpg?sha256=18778aaf67e6b03a8fd1f43975b07019549695d190c65228b080f2f053e51ecb" alt="${t('AgentRunner 로컬 개발본의 XO 브리핑 화면','XO briefing in an AgentRunner local development build')}" width="640" height="360" loading="lazy"><h3>${t('여섯 AI의 작업을 하나의 브리핑으로','Six AI contributors, one briefing')}</h3><p>${t('작업과 검토를 마친 파일 여섯 개, 결과 회의와 브리핑을 한 업무에서 확인한 기록입니다.','A development record connecting six reviewed files, a results meeting and a briefing within one task.')}</p><small>${t('Mac 로컬 소스 개발본의 기록','Recorded in the Mac local source development build')}</small><b>${t('개발 기록 읽기','Read the development record')} <svg class="am-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 13 13 3M3 3h10v10"/></svg></b></a></article><article class="am-card"><a href="https://metdol.com/engineering-note-2026-10-12"><p class="am-card-date"><time datetime="2026-10-12">${t('2026.10.12','12 OCT 2026')}</time> / METDOL</p><div class="am-note-cover" aria-hidden="true"><strong>Metdol</strong><span>AUTHORITY<br>EXECUTION<br>EVIDENCE</span></div><h3>${t('여러 컴퓨터에 맡긴 AI 작업, 어떻게 확인할까','AI work across computers: checking what happened')}</h3><p>${t('어떤 작업을 허용했는지부터 돌아온 결과를 확인하는 방법까지, 개발 기록으로 살펴봅니다.','An engineering note on setting the permitted scope and checking the results of work delegated to another computer.')}</p><small>${t('기술 설명 · 완료된 개발 사례와 다음 단계를 구분','Engineering note · completed cases and next steps distinguished')}</small><b>${t('엔지니어링 노트 읽기','Read the engineering note')} <svg class="am-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 13 13 3M3 3h10v10"/></svg></b></a></article></div></section><aside class="am-thoughts" aria-labelledby="am-thoughts-title"><div class="am-section-head"><h2 id="am-thoughts-title">${t('생각과 원칙','IDEAS & PRINCIPLES')}</h2></div><h3>${t('사람의 가능성을 넓히는 AI','AI that expands human possibility')}</h3><p>${t('Auxtho가 지향하는 방향과, 사람이 선택의 주체로 남기 위해 지켜갈 원칙을 소개합니다.','Our direction and the principles we aim to uphold so that people retain meaningful choice.')}</p><a class="am-thought-link" href="/charter/?lang=${lang}">${t('Auxtho AI 헌장','Auxtho AI Charter')} <svg class="am-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 13 13 3M3 3h10v10"/></svg></a><a class="am-thought-link" href="/charter/defense/?lang=${lang}">${t('Ardamire × WhiteCell 방어 설계 헌장','Ardamire × WhiteCell Defense Charter')} <svg class="am-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 13 13 3M3 3h10v10"/></svg></a><div class="am-quick"><p class="am-eyebrow">${t('바로가기','QUICK LINKS')}</p><a href="/evidence-notes.html">Evidence Notes <svg class="am-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 13 13 3M3 3h10v10"/></svg></a><a href="/?lang=${lang}#practice">${t('기록된 검증 사례','Recorded verification cases')} <svg class="am-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 13 13 3M3 3h10v10"/></svg></a><a href="/privacy.html">${t('개인정보 처리방침','Privacy')} <svg class="am-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 13 13 3M3 3h10v10"/></svg></a></div></aside></div><div class="am-footer"><span>Auxtho Inc.</span><span>${t('공개된 글과 기록을 소개합니다. 각 글에서 개발·검증 범위를 확인할 수 있습니다.','Selected public writing and records. Each article states its development and verification scope.')}</span></div>`;
  }
  if(typeof module==='object'&&module.exports){module.exports={markup};return;}
  const oldTrigger=document.querySelector('.site-header .menu-toggle');
  if(!oldTrigger)return;
  const trigger=oldTrigger.cloneNode(true);oldTrigger.replaceWith(trigger);trigger.classList.add('am-menu-trigger');
  const legacy=document.querySelector('.mobile-menu');if(legacy)legacy.hidden=true;
  const dialog=document.createElement('dialog');dialog.className='am-menu';dialog.id='am-full-menu';dialog.setAttribute('aria-label','Auxtho');document.body.append(dialog);
  trigger.setAttribute('aria-controls',dialog.id);trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
  const isKo=()=>document.documentElement.lang.startsWith('ko');
  let savedScrollY=0;
  const returnStateKey='__auxthoMenuReturn';
  function rememberMenu(open,returnHref=null){
    const current=history.state&&typeof history.state==='object'?history.state:{};
    history.replaceState({...current,[returnStateKey]:open?{
      version:1,open:true,menuScrollTop:dialog.scrollTop,pageScrollY:savedScrollY,returnHref
    }:null},'');
  }
  function close(restore=true,keepReturnState=false){
    if(!dialog.open)return;
    if(!keepReturnState)rememberMenu(false);
    dialog.close();document.body.classList.remove('am-menu-open');trigger.setAttribute('aria-expanded','false');
    if(restore){trigger.focus({preventScroll:true});window.scrollTo({top:savedScrollY,behavior:'instant'});requestAnimationFrame(()=>window.scrollTo({top:savedScrollY,behavior:'instant'}));}
  }
  function open(returnState=null){
    savedScrollY=returnState?returnState.pageScrollY:window.scrollY;
    if(!dialog.open)dialog.showModal();
    document.body.classList.add('am-menu-open');trigger.setAttribute('aria-expanded','true');
    if(!returnState)rememberMenu(true);
    requestAnimationFrame(()=>{
      const previous=returnState&&[...dialog.querySelectorAll('a[href]')].find(a=>a.getAttribute('href')===returnState.returnHref&&a.getClientRects().length);
      (previous||dialog.querySelector('.am-primary-list a')).focus({preventScroll:true});
      dialog.scrollTop=returnState?returnState.menuScrollTop:0;
      if(returnState)window.scrollTo({top:savedScrollY,behavior:'instant'});
    });
  }
  function restoreFromHistory(){
    const state=history.state?.[returnStateKey];
    if(state?.version===1&&state.open&&Number.isFinite(state.pageScrollY)&&Number.isFinite(state.menuScrollTop))open(state);
    else if(dialog.open)close(false,true);
  }
  function render(){
    const ko=isKo();dialog.innerHTML=markup(ko);trigger.setAttribute('aria-label',ko?'전체 메뉴 열기':'Open full menu');
    const brand=document.querySelector('.site-header .brand').cloneNode(true);brand.setAttribute('aria-label',ko?'Auxtho 회사 홈':'Auxtho company home');dialog.querySelector('.am-brand-slot').append(brand);
    const alternate=new URL(location.href);alternate.searchParams.set('lang',ko?'en':'ko');const language=dialog.querySelector('[data-am-language]');language.href=alternate.pathname+alternate.search+alternate.hash;language.lang=ko?'en':'ko';
    dialog.querySelector('.am-close').addEventListener('click',()=>close());
  }
  render();
  trigger.addEventListener('click',()=>{if(dialog.open)close();else open();});
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('click',e=>{
    const a=e.target.closest('a');if(!a||e.defaultPrevented)return;
    if(a.hasAttribute('data-am-reading')){
      e.preventDefault();dialog.querySelector('#am-reading').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});return;
    }
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.target==='_blank'||a.hasAttribute('download'))return;
    const destination=new URL(a.href,location.href);
    const sameDocument=destination.origin===location.origin&&destination.pathname===location.pathname&&destination.search===location.search;
    let section=null;
    if(sameDocument&&destination.hash){try{section=document.getElementById(decodeURIComponent(destination.hash.slice(1)));}catch{}}
    if(section){
      e.preventDefault();
      if(destination.hash===location.hash){
        // Already at this section: close without duplicating this history entry.
        close(false);
      }else{
        // Back returns to the originating open menu; the destination stays closed.
        rememberMenu(true,a.getAttribute('href'));close(false,true);
        const current=history.state&&typeof history.state==='object'?history.state:{};
        history.pushState({...current,[returnStateKey]:null},'',destination.pathname+destination.search+destination.hash);
      }
      requestAnimationFrame(()=>section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'}));
      return;
    }
    rememberMenu(true,a.getAttribute('href'));close(false,true);
  });
  // Restore both a reloaded history entry and Safari's cached document on Back.
  window.addEventListener('pageshow',e=>{if(e.persisted||performance.getEntriesByType('navigation')[0]?.type==='back_forward')restoreFromHistory();});
  window.addEventListener('popstate',restoreFromHistory);
  dialog.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const focusable=[...dialog.querySelectorAll('a[href],button:not([disabled])')].filter(n=>n.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
  let renderedLanguage=isKo();
  new MutationObserver(()=>{if(renderedLanguage===isKo())return;renderedLanguage=isKo();close(false);render();}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
})();
