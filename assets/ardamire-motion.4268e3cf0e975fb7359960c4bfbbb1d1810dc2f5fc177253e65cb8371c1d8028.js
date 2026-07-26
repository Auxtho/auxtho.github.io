(() => {
  const stageNames = [
    'Detect',
    'Quarantine',
    'Analyze + Profile',
    'Harden proposal',
    'Human review',
    'Verify before rollout',
  ];
  const intervalMs = 1050;
  const humanReviewIndex = 4;
  const verificationIndex = 5;

  for (const root of document.querySelectorAll('[data-ardamire-motion]')) {
    const stages = [...root.querySelectorAll('[data-ardamire-stage]')];
    const play = root.querySelector('[data-ardamire-play]');
    const pause = root.querySelector('[data-ardamire-pause]');
    const replay = root.querySelector('[data-ardamire-replay]');
    const continueToVerification = root.querySelector('[data-ardamire-continue]');
    const status = root.querySelector('[data-ardamire-status]');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let activeIndex = -1;
    let timer = null;

    const render = () => {
      stages.forEach((stage, index) => {
        stage.classList.toggle('is-complete', index < activeIndex);
        stage.classList.toggle('is-active', index === activeIndex);
      });
      continueToVerification.hidden = activeIndex !== humanReviewIndex;
      continueToVerification.disabled = activeIndex !== humanReviewIndex;
      if (activeIndex === humanReviewIndex) {
        root.dataset.state = 'awaiting-review';
        status.textContent = 'Human review required - continue only after a person decides';
        play.disabled = true;
        pause.disabled = true;
        return;
      }
      if (activeIndex === verificationIndex) {
        root.dataset.state = 'verification';
        status.textContent = 'Verification stage shown - rollout is not shown';
        play.disabled = false;
        pause.disabled = true;
        return;
      }
      if (activeIndex >= 0) status.textContent = stageNames[activeIndex];
    };

    const stopTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };

    const advance = () => {
      activeIndex += 1;
      render();
      if (activeIndex < humanReviewIndex) timer = window.setTimeout(advance, intervalMs);
    };

    const start = (reset = false) => {
      stopTimer();
      if (reset || activeIndex >= humanReviewIndex) activeIndex = -1;
      root.dataset.state = 'playing';
      play.disabled = true;
      pause.disabled = false;
      advance();
    };

    const pauseSequence = () => {
      if (root.dataset.state !== 'playing') return;
      stopTimer();
      root.dataset.state = 'paused';
      status.textContent = activeIndex >= 0
        ? `${stageNames[activeIndex]} - paused`
        : 'Sequence paused';
      play.disabled = false;
      pause.disabled = true;
    };

    if (reducedMotion) {
      activeIndex = -1;
      stages.forEach((stage) => {
        stage.classList.remove('is-active', 'is-complete');
      });
      root.dataset.state = 'static';
      status.textContent = 'Static illustration - human review remains required';
      play.disabled = true;
      pause.disabled = true;
      replay.disabled = true;
      continueToVerification.hidden = true;
      continueToVerification.disabled = true;
    } else {
      play.addEventListener('click', () => start(false));
      pause.addEventListener('click', pauseSequence);
      replay.addEventListener('click', () => start(true));
      continueToVerification.addEventListener('click', () => {
        stopTimer();
        activeIndex = verificationIndex;
        render();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) pauseSequence();
      });
    }
  }
})();
