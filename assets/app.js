// Frame-buster for clickjacking protection.
if (window.top !== window.self) {
    try {
        window.top.location = window.self.location;
    } catch (e) {
        console.warn("Frame-buster failed:", e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Mobile navigation toggle handler.
    // NOTE: 원본은 ID 선택자였지만, 실제 마크업은 class(.primary-navigation)인 경우가 많아 보강함.
    const primaryNav = document.querySelector('.primary-navigation') || document.getElementById('primary-navigation');
    const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
    if (primaryNav && mobileNavToggle) {
        mobileNavToggle.addEventListener('click', () => {
            const isVisible = primaryNav.getAttribute('data-visible') === 'true';
            primaryNav.setAttribute('data-visible', String(!isVisible));
            mobileNavToggle.setAttribute('aria-expanded', String(!isVisible));
            document.documentElement.classList.toggle('nav-open', !isVisible);
        });

        primaryNav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (primaryNav.getAttribute('data-visible') === 'true' && link.getAttribute('href')?.startsWith('#')) {
                    primaryNav.setAttribute('data-visible', 'false');
                    mobileNavToggle.setAttribute('aria-expanded', 'false');
                    document.documentElement.classList.remove('nav-open');
                }
            });
        });
    }

    // Sticky scroll navigation handler. (보강: 토글/메뉴가 없어도 가시성 동작)
    const scrollNav = document.getElementById('scroll-nav');
    const scrollNavToggle = document.getElementById('scroll-nav-toggle');
    const scrollNavMenu = document.getElementById('scroll-nav-menu');
    const primaryHeader = document.querySelector('.primary-header');

    if (scrollNav && primaryHeader) {
        const threshold = Math.min(primaryHeader.offsetHeight || 120, 120);

        const onScroll = () => {
            const shouldBeVisible = window.scrollY > threshold;
            scrollNav.classList.toggle('is-visible', shouldBeVisible);
            if (!shouldBeVisible && scrollNavMenu && scrollNavToggle) {
                scrollNavMenu.classList.remove('is-open');
                scrollNavToggle.setAttribute('aria-expanded', 'false');
            }
        };

        onScroll(); // 초기 상태 동기화
        window.addEventListener('scroll', onScroll, { passive: true });

        if (scrollNavToggle && scrollNavMenu) {
            scrollNavToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = scrollNavToggle.getAttribute('aria-expanded') === 'true';
                scrollNavToggle.setAttribute('aria-expanded', String(!isExpanded));
                scrollNavMenu.classList.toggle('is-open');
            });

            document.addEventListener('click', (e) => {
                if (!scrollNav.contains(e.target) && scrollNavMenu.classList.contains('is-open')) {
                    scrollNavMenu.classList.remove('is-open');
                    scrollNavToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
    }

    // Demo video player handler. (원본 유지)
    const demoPlayer = document.querySelector('.demo-player');
    if (demoPlayer) {
        const play = () => {
            const YT_ID = "7Sc8csboxcU";
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const autoplay = reduceMotion ? 0 : 1;
            const YT_SRC = `https://www.youtube-nocookie.com/embed/${YT_ID}?autoplay=${autoplay}&rel=0&modestbranding=1`;

            const iframe = document.createElement('iframe');
            iframe.src = YT_SRC;
            iframe.title = 'Auxtho Demo Video';
            iframe.loading = 'lazy';
            iframe.frameBorder = '0';
            iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
            iframe.setAttribute('allowfullscreen', '');
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
            iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            demoPlayer.innerHTML = '';
            demoPlayer.appendChild(iframe);
        };
        demoPlayer.addEventListener('click', play, { once: true });
        demoPlayer.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                play();
            }
        }, { once: true });
    }

    // Debounce resize events for performance.
    let resizeTimer;
    window.addEventListener('resize', () => {
        document.body.classList.add('resizing');
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            document.body.classList.remove('resizing');
        }, 250);
    });
});
