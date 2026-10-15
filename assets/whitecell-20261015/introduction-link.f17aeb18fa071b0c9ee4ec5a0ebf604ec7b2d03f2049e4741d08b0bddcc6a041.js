'use strict';
(() => {
  function connectWhiteCell() {
    const related = document.querySelector('#main .product-related');
    if (!related) return;
    const language = document.documentElement.lang === 'ko' ? 'ko' : 'en';
    let link = related.querySelector('[data-whitecell-introduction]');
    if (!link) {
      link = document.createElement('a');
      link.setAttribute('data-whitecell-introduction', '');
      related.appendChild(link);
    }
    const text = language === 'ko' ? 'Ardamire WhiteCell 소개 ↗' : 'Explore Ardamire WhiteCell ↗';
    const href = '/whitecell/?lang=' + language;
    if (link.textContent !== text) link.textContent = text;
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  }
  function start() {
    connectWhiteCell();
    const main = document.querySelector('#main');
    if (main && typeof MutationObserver === 'function') {
      new MutationObserver(connectWhiteCell).observe(main, {childList:true,subtree:true});
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {once:true});
  } else {
    start();
  }
})();
