(function () {
  'use strict';
  function publicationLinks(route, lang) {
    const ko = lang === 'ko';
    const charter = '/charter/?lang=' + lang;
    const defense = '/charter/defense/?lang=' + lang;
    let title, description, links;
    if (route === '/products/agent-runner/') {
      title = ko ? '여섯 직원의 결과물을 XO 브리핑까지' : 'Six employees’ results, connected to an XO briefing';
      description = ko ? '2026년 10월 18일 개발 기록 · Mac 로컬 소스 개발본. 검토된 파일 여섯 개, 결과 회의와 XO 브리핑을 같은 업무에서 연결했습니다. 최종 Human 결정은 대기 중입니다.' : 'Development record · 18 October 2026 · Mac local source development version. Six reviewed files, a results meeting and an XO briefing within the same task. The final Human decision remains pending.';
      links = [['/products/agent-runner/development-record-2026-10-18/?lang=' + lang, ko ? '새 개발 기록 읽기' : 'Read the new development record']];
    } else if (route === '/products/ardamire/' || route === '/whitecell/') {
      title = ko ? 'Ardamire × WhiteCell 방어 설계 헌장' : 'Ardamire × WhiteCell Defense Architecture Charter';
      description = ko ? '강력한 능동 방어, 독립적인 집행, 인간의 실질적인 선택권을 위한 설계 원칙입니다.' : 'Our design principles for powerful active defense, independent enforcement and meaningful human choice.';
      links = [[defense, ko ? '방어 설계 헌장 읽기' : 'Read the defense charter'], [charter, ko ? 'Auxtho AI 헌장' : 'Auxtho AI Charter']];
    } else if (route === '/') {
      title = ko ? '사람의 가능성을 넓히는 AI' : 'AI that expands human possibility';
      description = ko ? '지능이 더 커져도 인간이 자기 삶의 주체로 남을 수 있도록. Auxtho의 목적과 우리가 지켜갈 원칙을 소개합니다.' : 'So that as intelligence grows, people remain authors of their own lives. Explore Auxtho’s purpose and the principles we will uphold.';
      links = [[charter, ko ? 'Auxtho AI 헌장 읽기' : 'Read the Auxtho AI Charter']];
    } else return '';
    return '<section class="publication-links" id="publication-links"><p class="eyebrow">' + (route === '/products/agent-runner/' ? 'AGENTRUNNER / 18 OCT 2026' : (ko ? '우리의 원칙' : 'OUR PRINCIPLES')) + '</p><h2>' + title + '</h2><p>' + description + '</p><nav aria-label="' + (ko ? '관련 문서' : 'Related reading') + '">' + links.map(x => '<a class="line-link" href="' + x[0] + '">' + x[1] + '</a>').join('') + '</nav></section>';
  }
  function charterFooterLink(lang) {
    return '<a data-company-charter href="/charter/?lang=' + lang + '">' + (lang === 'ko' ? 'AI 헌장' : 'AI Charter') + '</a>';
  }
  function researchRecordLink(lang) {
    const ko = lang === 'ko';
    return '<p class="research-record" data-research-record><a href="/products/agent-runner/development-record-2026-10-18/?lang=' + lang + '"><time datetime="2026-10-18">' + (ko ? '2026년 10월 18일 · 개발 기록' : '18 Oct 2026 · Development record') + '</time><span>' + (ko ? '여섯 직원의 결과물을 XO 브리핑까지' : 'Six employees’ results → XO briefing') + '</span></a></p>';
  }
  function decorateMain(markup, route, lang) {
    if (route !== '/') return markup;
    const clean = markup.replace(/<p class="research-record" data-research-record>[\s\S]*?<\/p>/g, '');
    return clean.replace(/(<div class="product-row"><button class="product-select" data-product="agent-runner"[\s\S]*?<\/div><p class="product-purpose">[\s\S]*?<\/p>)/, '$1' + researchRecordLink(lang));
  }
  function decorateFooter(markup, lang) {
    const clean = markup.replace(/<a data-company-charter[^>]*>[\s\S]*?<\/a>/g, '');
    return clean.replace(/(<div class="footer-information">[\s\S]*?<nav class="footer-links"[^>]*>[\s\S]*?)(<\/nav>)/, '$1' + charterFooterLink(lang) + '$2');
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { publicationLinks, charterFooterLink, researchRecordLink, decorateMain, decorateFooter };
  if (typeof document === 'undefined') return;
  const route = location.pathname.endsWith('/index.html') ? location.pathname.slice(0, -10) : location.pathname;
  function refresh() {
    const lang = document.documentElement.lang === 'ko' ? 'ko' : 'en';
    const footer = document.querySelector('.footer-information nav');
    if (footer) {
      footer.querySelector('[data-company-charter]')?.remove();
      footer.insertAdjacentHTML('beforeend', charterFooterLink(lang));
    }
    if (route === '/') {
      document.querySelector('[data-research-record]')?.remove();
      const row = document.querySelector('#technology [data-product="agent-runner"]')?.closest('.product-row');
      row?.nextElementSibling?.insertAdjacentHTML('afterend', researchRecordLink(lang));
    }
    const markup = publicationLinks(route, lang);
    if (!markup) return;
    const existing = document.querySelector('#publication-links');
    if (existing) existing.remove();
    const main = document.querySelector('main');
    const contact = main.querySelector('.contact-section');
    if (contact) contact.insertAdjacentHTML('beforebegin', markup);
    else main.insertAdjacentHTML('beforeend', markup);
  }
  refresh();
  new MutationObserver(refresh).observe(document.documentElement, {attributes:true,attributeFilter:['lang']});
})();
