(() => {
  'use strict';
  const lang = new URLSearchParams(location.search).get('lang') === 'ko' ? 'ko' : 'en';
  const shell = document.querySelector('[data-publication-shell]');
  const template = document.querySelector('#publication-ko');
  if (lang === 'ko') shell.replaceChildren(template.content.cloneNode(true));
  document.documentElement.lang = lang;
  document.title = document.body.dataset[lang === 'ko' ? 'titleKo' : 'titleEn'];
  const description = document.body.dataset[lang === 'ko' ? 'descriptionKo' : 'descriptionEn'];
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
    document.querySelector(selector).content = description;
  }
  for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) document.querySelector(selector).content = document.title;
  const language = shell.querySelector('.language-link');
  const other = new URL(location.href);
  other.searchParams.set('lang', lang === 'en' ? 'ko' : 'en');
  language.href = other.pathname + other.search + other.hash;
  const button = shell.querySelector('.menu-toggle');
  const menu = shell.querySelector('.mobile-menu');
  const navigation = shell.querySelector('.site-navigation');
  const compact = matchMedia('(max-width:760px)');
  function close(restore) {
    button.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
    navigation.classList.remove('menu-open');
    if (restore) button.focus();
  }
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-expanded') === 'true') return close(true);
    button.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
    navigation.classList.add('menu-open');
    menu.querySelector('a')?.focus();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') close(true);
  });
  document.addEventListener('click', e => { if (!navigation.contains(e.target)) close(false); });
  document.addEventListener('focusin', e => { if (!navigation.contains(e.target)) close(false); });
  menu.addEventListener('click', e => { if (e.target.closest('a')) close(false); });
  compact.addEventListener('change', () => close(false));
  if (location.hash) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) requestAnimationFrame(() => target.scrollIntoView());
  }
})();
