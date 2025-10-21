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
    const primaryNav = document.getElementById('primary-navigation');
    const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
    if (primaryNav && mobileNavToggle) {
        mobileNavToggle.addEventListener('click', () => {
            const isVisible = primaryNav.getAttribute('data-visible') === 'true';
            primaryNav.setAttribute('data-visible', String(!isVisible));
            mobileNavToggle.setAttribute('aria-expanded', String(!isVisible));

            // [수정] <html>과 <body> 모두에 클래스를 토글하여 스크롤을 막습니다.
            document.documentElement.classList.toggle('nav-open', !isVisible);
            document.body.classList.toggle('nav-open', !isVisible);
        });

        primaryNav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                const isVisible = primaryNav.getAttribute('data-visible') === 'true';
                // [수정] 외부 페이지 링크(/story.html 등)가 아닐 때만 메뉴를 닫습니다.
                if (isVisible && !link.getAttribute('href').startsWith('/')) {
                    primaryNav.setAttribute('data-visible', 'false');
                    mobileNavToggle.setAttribute('aria-expanded', 'false');
                    document.documentElement.classList.remove('nav-open');
                    document.body.classList.remove('nav-open');
                }
            });
        });
    }

    // Sticky scroll navigation handler.
    const scrollNav = document.getElementById('scroll-nav');
    const scrollNavToggle = document.getElementById('scroll-nav-toggle');
    const scrollNavMenu = document.getElementById('scroll-nav-menu');
    const primaryHeader = document.querySelector('.primary-header');
    
    if (scrollNav && scrollNavToggle && scrollNavMenu && primaryHeader) {
        window.addEventListener('scroll', () => {
            const currentScrollY = window.scrollY;
            
            // 헤더 높이(약 80-90px)보다 많이 스크롤했는지 확인
            const shouldBeVisible = currentScrollY > primaryHeader.offsetHeight;

            // [최종 수정] 스크롤 네비가 보여야 할 때, 메인 헤더(z-50)를 뒤로 보냅니다 (z-30).
            primaryHeader.classList.toggle('header-behind', shouldBeVisible);
            
            // 스크롤 네비(z-40)를 보여줍니다.
            scrollNav.classList.toggle('is-visible', shouldBeVisible);

            // 스크롤 네비가 안 보일 때는, 펼쳐진 메뉴도 닫음
            if (!shouldBeVisible) {
                scrollNavMenu.classList.remove('is-open');
                scrollNavToggle.setAttribute('aria-expanded', 'false');
            }
        });

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

    // Demo video player handler. (이 코드는 변경 없음)
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

    // Debounce resize events for performance. (이 코드는 변경 없음)
    let resizeTimer;
    window.addEventListener('resize', () => {
        document.body.classList.add('resizing');
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            document.body.classList.remove('resizing');
        }, 250);
    });
});