// Frame-buster for clickjacking protection.
if (window.top !== window.self) {
    try {
        window.top.location = window.self.location;
    } catch (error) {
        console.warn('Frame-buster failed:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const primaryNav = document.getElementById('primary-navigation');
    const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
    let closePrimaryNav = () => {};

    if (primaryNav && mobileNavToggle) {
        const mobileNavMedia = window.matchMedia('(max-width: 52.125em)');
        const navLinks = [...primaryNav.querySelectorAll('a')];

        const syncMobileNavAccessibility = () => {
            const shouldHide = mobileNavMedia.matches && primaryNav.getAttribute('data-visible') !== 'true';
            primaryNav.toggleAttribute('inert', shouldHide);
            primaryNav.setAttribute('aria-hidden', String(shouldHide));
        };

        closePrimaryNav = ({ restoreFocus = false } = {}) => {
            primaryNav.setAttribute('data-visible', 'false');
            mobileNavToggle.setAttribute('aria-expanded', 'false');
            document.documentElement.classList.remove('nav-open');
            document.body.classList.remove('nav-open');
            syncMobileNavAccessibility();
            if (restoreFocus && mobileNavMedia.matches) {
                mobileNavToggle.focus({ preventScroll: true });
            }
        };

        const openPrimaryNav = () => {
            primaryNav.setAttribute('data-visible', 'true');
            mobileNavToggle.setAttribute('aria-expanded', 'true');
            document.documentElement.classList.add('nav-open');
            document.body.classList.add('nav-open');
            syncMobileNavAccessibility();
            window.requestAnimationFrame(() => navLinks[0]?.focus({ preventScroll: true }));
        };

        syncMobileNavAccessibility();
        const handleMobileNavChange = () => closePrimaryNav();
        if (typeof mobileNavMedia.addEventListener === 'function') {
            mobileNavMedia.addEventListener('change', handleMobileNavChange);
        } else {
            mobileNavMedia.addListener(handleMobileNavChange);
        }

        mobileNavToggle.addEventListener('click', () => {
            const isOpen = primaryNav.getAttribute('data-visible') === 'true';
            if (isOpen) {
                closePrimaryNav({ restoreFocus: true });
            } else {
                openPrimaryNav();
            }
        });

        navLinks.forEach((link) => link.addEventListener('click', () => closePrimaryNav()));

        document.addEventListener('keydown', (event) => {
            const isOpen = mobileNavMedia.matches && primaryNav.getAttribute('data-visible') === 'true';
            if (!isOpen) {
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                closePrimaryNav({ restoreFocus: true });
                return;
            }
            if (event.key !== 'Tab') {
                return;
            }
            const focusable = [mobileNavToggle, ...navLinks];
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
    }

    const scrollNav = document.getElementById('scroll-nav');
    const scrollNavToggle = document.getElementById('scroll-nav-toggle');
    const scrollNavMenu = document.getElementById('scroll-nav-menu');
    const primaryHeader = document.querySelector('.primary-header');

    if (scrollNav && scrollNavToggle && scrollNavMenu && primaryHeader) {
        const setNavSurfaceInteractive = (surface, isInteractive) => {
            surface.toggleAttribute('inert', !isInteractive);
            surface.setAttribute('aria-hidden', String(!isInteractive));
        };

        const setScrollNavOpen = (isOpen) => {
            scrollNavMenu.classList.toggle('is-open', isOpen);
            scrollNavMenu.toggleAttribute('inert', !isOpen);
            scrollNavMenu.setAttribute('aria-hidden', String(!isOpen));
            scrollNavToggle.setAttribute('aria-expanded', String(isOpen));
        };

        const closeScrollNav = ({ restoreFocus = false } = {}) => {
            setScrollNavOpen(false);
            if (restoreFocus) {
                scrollNavToggle.focus({ preventScroll: true });
            }
        };

        let scrollNavVisible = null;
        const syncNavSurfaces = () => {
            const shouldBeVisible = window.scrollY > primaryHeader.offsetHeight;
            const visibilityChanged = shouldBeVisible !== scrollNavVisible;
            const focusWasInPrimaryHeader = primaryHeader.contains(document.activeElement);
            const focusWasInScrollNav = scrollNav.contains(document.activeElement);

            if (shouldBeVisible && visibilityChanged) {
                closePrimaryNav();
            } else if (!shouldBeVisible) {
                closeScrollNav();
            }

            primaryHeader.classList.toggle('header-behind', shouldBeVisible);
            scrollNav.classList.toggle('is-visible', shouldBeVisible);
            setNavSurfaceInteractive(primaryHeader, !shouldBeVisible);
            setNavSurfaceInteractive(scrollNav, shouldBeVisible);

            if (visibilityChanged && shouldBeVisible && focusWasInPrimaryHeader) {
                window.requestAnimationFrame(() => scrollNavToggle.focus({ preventScroll: true }));
            } else if (visibilityChanged && !shouldBeVisible && focusWasInScrollNav) {
                const primaryFocusTarget = primaryHeader.querySelector('a[href], button:not([disabled])');
                window.requestAnimationFrame(() => primaryFocusTarget?.focus({ preventScroll: true }));
            }

            scrollNavVisible = shouldBeVisible;
        };

        window.addEventListener('scroll', syncNavSurfaces, { passive: true });
        syncNavSurfaces();

        scrollNavToggle.addEventListener('click', (event) => {
            event.stopPropagation();
            const shouldOpen = scrollNavToggle.getAttribute('aria-expanded') !== 'true';
            setScrollNavOpen(shouldOpen);
        });

        scrollNavMenu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => closeScrollNav()));

        document.addEventListener('click', (event) => {
            if (!scrollNav.contains(event.target)) {
                closeScrollNav();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && scrollNavMenu.classList.contains('is-open')) {
                event.preventDefault();
                closeScrollNav({ restoreFocus: true });
            }
        });
    }

    const sampleLightbox = document.getElementById('sample-lightbox');
    const sampleLightboxImage = document.getElementById('sample-lightbox-image');
    const sampleLightboxTitle = document.getElementById('sample-lightbox-title');
    const sampleLightboxCaption = document.getElementById('sample-lightbox-caption');
    const sampleLightboxClose = document.querySelector('.sample-lightbox-close');
    const sampleLightboxImageWrap = document.querySelector('.sample-lightbox-image-wrap');
    const sampleLinks = [...document.querySelectorAll('.sample-card-media')];

    if (
        sampleLightbox &&
        typeof sampleLightbox.showModal === 'function' &&
        sampleLightboxImage &&
        sampleLightboxTitle &&
        sampleLightboxCaption &&
        sampleLightboxClose &&
        sampleLightboxImageWrap &&
        sampleLinks.length
    ) {
        let opener = null;
        const mobileLightboxMedia = window.matchMedia('(max-width: 760px)');
        const resetLightboxScroll = () => {
            sampleLightbox.scrollTop = 0;
            sampleLightboxImageWrap.scrollTop = 0;
            sampleLightboxImageWrap.scrollLeft = 0;
            if (mobileLightboxMedia.matches && sampleLightbox.classList.contains('sample-lightbox-app-overview')) {
                const maxHorizontalScroll = sampleLightboxImageWrap.scrollWidth - sampleLightboxImageWrap.clientWidth;
                sampleLightboxImageWrap.scrollLeft = Math.round(Math.max(0, maxHorizontalScroll) * 0.58);
            }
        };
        const closeLightbox = () => {
            if (sampleLightbox.open) {
                sampleLightbox.close();
            }
        };

        sampleLinks.forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                opener = link;
                const image = link.querySelector('img');
                sampleLightbox.classList.toggle('sample-lightbox-console-wide', link.dataset.lightboxMode === 'console-wide');
                sampleLightbox.classList.toggle('sample-lightbox-app-overview', link.dataset.lightboxMode === 'app-overview');
                sampleLightboxImage.addEventListener('load', () => window.requestAnimationFrame(resetLightboxScroll), { once: true });
                sampleLightboxImage.src = link.href;
                sampleLightboxImage.alt = image?.alt || '';
                sampleLightboxTitle.textContent = link.dataset.lightboxTitle || '';
                sampleLightboxCaption.textContent = link.dataset.lightboxCaption || '';
                sampleLightbox.showModal();
                document.documentElement.classList.add('sample-lightbox-open');
                document.body.classList.add('sample-lightbox-open');
                sampleLightboxClose.focus({ preventScroll: true });
                resetLightboxScroll();
            });
        });

        sampleLightboxClose.addEventListener('click', closeLightbox);
        sampleLightbox.addEventListener('click', (event) => {
            if (event.target === sampleLightbox) {
                closeLightbox();
            }
        });
        sampleLightbox.addEventListener('keydown', (event) => {
            if (event.key !== 'Tab' || !sampleLightbox.open) {
                return;
            }
            const focusable = [sampleLightboxClose, sampleLightboxImageWrap];
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const focusIsInside = sampleLightbox.contains(document.activeElement);
            if (event.shiftKey && (document.activeElement === first || !focusIsInside)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !focusIsInside)) {
                event.preventDefault();
                first.focus();
            }
        });
        sampleLightbox.addEventListener('close', () => {
            document.documentElement.classList.remove('sample-lightbox-open');
            document.body.classList.remove('sample-lightbox-open');
            sampleLightbox.classList.remove('sample-lightbox-console-wide', 'sample-lightbox-app-overview');
            sampleLightboxImage.removeAttribute('src');
            opener?.focus({ preventScroll: true });
            opener = null;
        });
    }

    const verifiedReplay = document.querySelector('[data-verified-replay]');
    if (verifiedReplay) {
        const replayTrigger = verifiedReplay.querySelector('[data-replay-trigger]');
        const replayStatus = verifiedReplay.querySelector('[data-replay-status]');
        const replayStep = verifiedReplay.querySelector('[data-replay-step]');
        const replayTitle = verifiedReplay.querySelector('[data-replay-title]');
        const replayCopy = verifiedReplay.querySelector('[data-replay-copy]');
        const replayEvent = verifiedReplay.querySelector('[data-replay-event]');
        const replayMetrics = new Map(
            [...verifiedReplay.querySelectorAll('[data-replay-metric]')].map((element) => [element.dataset.replayMetric, element])
        );
        const replayRows = [...verifiedReplay.querySelectorAll('[data-replay-row]')];
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const stages = [
            { status: '4 synthetic packets in review', step: 'Step 01', title: 'Four packets wait for human review.', copy: 'No AI action grants approval, release, or export authority.', event: 'No human decision yet', metrics: [4, 0, 0, 0], rows: ['pending', 'pending', 'pending', 'pending'] },
            { status: 'Human hold selected', step: 'Step 02', title: 'One packet is held.', copy: 'A human reviewer records a hold. The state remains visible.', event: 'Human hold selected', metrics: [3, 1, 0, 0], rows: ['pending', 'blocked', 'pending', 'pending'] },
            { status: 'Human release decision selected', step: 'Step 03', title: 'One packet becomes release-ready.', copy: 'The human decision does not export the packet.', event: 'Human release-ready decision', metrics: [2, 1, 1, 0], rows: ['pending', 'blocked', 'ready', 'pending'] },
            { status: 'Second release decision selected', step: 'Step 04', title: 'A second packet becomes release-ready.', copy: 'The packet remains inside the visible release boundary.', event: 'Human release-ready decision', metrics: [1, 1, 2, 0], rows: ['pending', 'blocked', 'ready', 'ready'] },
            { status: 'Illustrative sequence complete', step: 'Step 05', title: 'Two packets are release-ready; export stays locked.', copy: 'A release-ready state does not unlock export.', event: 'No export selected', metrics: [1, 1, 2, 0], rows: ['pending', 'blocked', 'ready', 'ready'] },
        ];
        const metricNames = ['priority', 'blocked', 'ready', 'released'];
        const stateLabels = { pending: 'Pending', blocked: 'Held', ready: 'Release-ready' };
        let timers = [];

        const clearTimers = () => {
            timers.forEach((timer) => window.clearTimeout(timer));
            timers = [];
        };

        const renderStage = (index) => {
            const stage = stages[index];
            verifiedReplay.dataset.stage = String(index);
            replayStatus.textContent = stage.status;
            replayStep.textContent = stage.step;
            replayTitle.textContent = stage.title;
            replayCopy.textContent = stage.copy;
            replayEvent.textContent = stage.event;
            metricNames.forEach((name, metricIndex) => {
                const metric = replayMetrics.get(name);
                if (metric) {
                    metric.textContent = String(stage.metrics[metricIndex]);
                }
            });
            replayRows.forEach((row, rowIndex) => {
                const state = stage.rows[rowIndex];
                row.dataset.state = state;
                const label = row.querySelector('[data-replay-row-state]');
                if (label) {
                    label.textContent = stateLabels[state];
                }
            });
        };

        const finishReplay = () => {
            if (replayTrigger) {
                replayTrigger.disabled = false;
                replayTrigger.textContent = 'Replay';
                replayTrigger.setAttribute('aria-label', 'Replay synthetic review sequence');
            }
        };

        const playReplay = () => {
            clearTimers();
            if (replayTrigger) {
                replayTrigger.disabled = true;
                replayTrigger.textContent = 'Playing';
            }
            renderStage(0);
            if (reduceMotion) {
                renderStage(stages.length - 1);
                finishReplay();
                return;
            }
            stages.slice(1).forEach((stage, index) => {
                const timer = window.setTimeout(() => {
                    renderStage(index + 1);
                    if (index === stages.length - 2) {
                        finishReplay();
                    }
                }, (index + 1) * 1000);
                timers.push(timer);
            });
        };

        replayTrigger?.addEventListener('click', playReplay);
    }

    let resizeTimer;
    window.addEventListener('resize', () => {
        document.body.classList.add('resizing');
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => document.body.classList.remove('resizing'), 250);
    });
});
