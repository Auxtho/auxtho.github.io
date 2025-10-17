// moved from the bottom inline <script> ... (content preserved as-is)

// Frame-buster for clickjacking protection (best-effort for GitHub Pages)
if (window.top !== window.self) {
    try { window.top.location = window.self.location; } catch(e) { console.warn("Frame-buster failed:", e); }
}

document.addEventListener('DOMContentLoaded', () => {
    const primaryNav = document.getElementById('primary-navigation');
    const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
    if (primaryNav && mobileNavToggle) {
        mobileNavToggle.addEventListener('click', () => {
            const isVisible = primaryNav.getAttribute('data-visible') === 'true';
            if (isVisible) {
                primaryNav.setAttribute('data-visible', 'false');
                mobileNavToggle.setAttribute('aria-expanded', 'false');
                document.documentElement.classList.remove('nav-open');
            } else {
                primaryNav.setAttribute('data-visible', 'true');
                mobileNavToggle.setAttribute('aria-expanded', 'true');
                document.documentElement.classList.add('nav-open');
            }
        });
        primaryNav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (primaryNav.getAttribute('data-visible') === 'true' && link.getAttribute('href').startsWith('#')) {
                    primaryNav.setAttribute('data-visible', 'false');
                    mobileNavToggle.setAttribute('aria-expanded', 'false');
                    document.documentElement.classList.remove('nav-open');
                }
            });
        });
    }
    
    const scrollNav = document.getElementById('scroll-nav');
    const scrollNavToggle = document.getElementById('scroll-nav-toggle');
    const scrollNavMenu = document.getElementById('scroll-nav-menu');
    const primaryHeader = document.querySelector('.primary-header');
    
    if (scrollNav && scrollNavToggle && scrollNavMenu && primaryHeader) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > primaryHeader.offsetHeight) {
                scrollNav.classList.add('is-visible');
            } else {
                scrollNav.classList.remove('is-visible');
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

        scrollNavMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                scrollNavMenu.classList.remove('is-open');
                scrollNavToggle.setAttribute('aria-expanded', 'false');
            });
        });

        document.addEventListener('click', (e) => {
            if (!scrollNav.contains(e.target) && scrollNavMenu.classList.contains('is-open')) {
                scrollNavMenu.classList.remove('is-open');
                scrollNavToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    const demoPlayer = document.querySelector('.demo-player');
    if (demoPlayer) {
        const play = () => {
            const YT_ID = "7Sc8csboxcU";
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const autoplay = reduce ? 0 : 1;
            const YT_SRC = `https://www.youtube-nocookie.com/embed/${YT_ID}?autoplay=${autoplay}&rel=0&modestbranding=1`;

            try {
                const iframe = document.createElement('iframe');
                iframe.src = YT_SRC;
                iframe.title = 'Auxtho Demo Video';
                iframe.loading = 'lazy';
                iframe.frameBorder = '0';
                iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
                iframe.setAttribute('allowfullscreen', '');
                iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation');
                iframe.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
                demoPlayer.innerHTML = '';
                demoPlayer.appendChild(iframe);

                setTimeout(() => {
                    try {
                        const loaded = iframe.contentWindow && iframe.contentWindow.length !== undefined;
                        if (!loaded) {
                            window.location.href = 'mailto:hello@auxtho.com?subject=Demo%20Access%20Request';
                        }
                    } catch (e) {
                        window.location.href = 'mailto:hello@auxtho.com?subject=Demo%20Access%20Request';
                    }
                }, 4000);
            } catch (e) {
                window.location.href = 'mailto:hello@auxtho.com?subject=Demo%20Access%20Request';
            }
        };
        demoPlayer.addEventListener('click', play, { once: true });
        demoPlayer.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                play();
            }
        }, { once: true });
    }

    let resizeTimer;
    window.addEventListener('resize', () => {
        document.body.classList.add('resizing');
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { document.body.classList.remove('resizing'); }, 250);
    });
});
