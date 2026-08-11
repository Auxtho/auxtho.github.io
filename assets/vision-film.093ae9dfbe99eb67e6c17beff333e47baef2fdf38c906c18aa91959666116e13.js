(() => {
  const films = document.querySelectorAll('[data-vision-film]');
  if (!films.length) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const portraitLayout = window.matchMedia('(max-width: 760px), (orientation: portrait)');

  films.forEach((film) => {
    const video = film.querySelector('video');
    const toggle = film.querySelector('[data-vision-film-toggle]');
    const toggleLabel = film.querySelector('[data-vision-film-label]');
    if (!video || !toggle || !toggleLabel) return;

    let inView = true;
    let userPaused = false;
    let hasPlayed = false;

    const selectedPoster = () => (
      portraitLayout.matches
        ? film.dataset.mobilePoster
        : film.dataset.desktopPoster
    );

    const updateControl = () => {
      const paused = video.paused;
      toggle.dataset.state = paused ? 'paused' : 'playing';
      toggle.setAttribute('aria-label', paused ? 'Play film' : 'Pause film');
      toggleLabel.textContent = paused ? 'Play film' : 'Pause film';
    };

    const play = async (explicit = false) => {
      if (!inView || (!explicit && (reducedMotion.matches || userPaused))) return;
      try {
        await video.play();
      } catch {
        updateControl();
      }
    };

    const syncPoster = (reloadMedia = false) => {
      const nextPoster = selectedPoster();
      if (nextPoster && video.getAttribute('poster') !== nextPoster) {
        video.setAttribute('poster', nextPoster);
      }
      if (reloadMedia) {
        const resume = !video.paused && !reducedMotion.matches && !userPaused;
        video.pause();
        video.load();
        if (resume) void play();
      }
    };

    toggle.addEventListener('click', () => {
      if (video.paused) {
        userPaused = false;
        void play(true);
      } else {
        userPaused = true;
        video.pause();
      }
    });

    video.addEventListener('playing', () => {
      hasPlayed = true;
      film.classList.add('has-film-frame');
      updateControl();
    });
    video.addEventListener('pause', updateControl);
    video.addEventListener('ended', updateControl);

    const observer = new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.2);
      if (!inView) {
        video.pause();
      } else if (!userPaused && !reducedMotion.matches) {
        void play();
      }
    }, { threshold: [0, 0.2, 0.65] });
    observer.observe(film);

    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches) {
        video.pause();
        if (!hasPlayed) film.classList.remove('has-film-frame');
      } else if (inView && !userPaused) {
        void play();
      }
      updateControl();
    });

    portraitLayout.addEventListener('change', () => syncPoster(true));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        video.pause();
      } else if (inView && !userPaused && !reducedMotion.matches) {
        void play();
      }
    });

    syncPoster();
    updateControl();
    if (!reducedMotion.matches) void play();
  });
})();
