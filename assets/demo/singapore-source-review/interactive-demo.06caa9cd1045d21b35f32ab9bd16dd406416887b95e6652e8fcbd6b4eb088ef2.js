(() => {
  'use strict';

  const data = window.AuxthoInteractiveDemoData;
  if (!data) throw new Error('Interactive walkthrough data is unavailable.');

  const q = (selector) => document.querySelector(selector);
  const qa = (selector) => [...document.querySelectorAll(selector)];
  const englishTranslations = Object.fromEntries(
    qa('[data-i18n]').map((node) => [node.dataset.i18n, node.textContent.trim()]),
  );
  const translations = { en: englishTranslations, ko: data.koTranslations };
  const totalSteps = 4;
  const state = {
    language: 'en',
    selectedClaim: 'C3',
    sourceOpened: false,
    reviewerOpen: false,
    corrected: false,
    decision: null,
    changed: false,
    nextStep: 1,
    returnFocus: null,
  };

  const ui = () => data.ui[state.language];
  const translated = (key) => translations[state.language][key];
  const claim = () => data.claims[state.selectedClaim];
  const claimCopy = () => claim()[state.language];

  function setNavigation(nextStep, override) {
    state.nextStep = nextStep;
    q('[data-step-count]').textContent = String(Math.min(nextStep, totalSteps)) + ' / ' + totalSteps;
    qa('[data-step]').forEach((item) => {
      const value = Number(item.dataset.step);
      item.classList.toggle('active', value === nextStep);
      item.classList.toggle('done', value < nextStep);
    });
    qa('[data-action-step]').forEach((control) => {
      const value = Number(control.dataset.actionStep);
      control.classList.toggle('is-next-action', value === nextStep);
      control.classList.toggle('completed-action', value < nextStep);
    });
    q('[data-next-guidance] span:last-child').textContent = override || ui()['next' + nextStep];
  }

  function setCompleted() {
    q('[data-step-count]').textContent = totalSteps + ' / ' + totalSteps;
    qa('[data-step]').forEach((item) => {
      item.classList.remove('active');
      item.classList.add('done');
    });
    qa('[data-action-step]').forEach((control) => {
      control.classList.remove('is-next-action');
      control.classList.add('completed-action');
    });
    q('[data-next-guidance] span:last-child').textContent = ui().completed;
  }

  function setTerminal(message, label) {
    const completedSteps = state.corrected ? 2 : 1;
    q('[data-step-count]').textContent = label;
    qa('[data-step]').forEach((item) => {
      const value = Number(item.dataset.step);
      item.classList.remove('active');
      item.classList.toggle('done', value <= completedSteps);
    });
    qa('[data-action-step]').forEach((control) => {
      const value = Number(control.dataset.actionStep);
      control.classList.remove('is-next-action');
      control.classList.toggle('completed-action', value <= completedSteps);
    });
    q('[data-next-guidance] span:last-child').textContent = message;
  }

  function renderClaim() {
    const selected = claim();
    const copy = claimCopy();
    const renderedDraft = state.changed
      ? copy.changed
      : state.corrected
        ? copy.corrected
        : copy.draft;
    qa('[data-claim-select]').forEach((button) => {
      const isSelected = button.dataset.claimSelect === state.selectedClaim;
      button.classList.toggle('selected', isSelected);
      button.setAttribute('aria-selected', String(isSelected));
      button.disabled = state.reviewerOpen;
    });
    q('[data-review-status]').textContent = copy.status;
    q('[data-review-status]').className = 'status ' + selected.statusClass;
    q('[data-draft-label]').textContent = ui().selectedStatement + ' · ' + state.selectedClaim;
    q('[data-draft-text]').innerHTML = renderedDraft;
    q('[data-draft]').classList.toggle('corrected', state.corrected && !state.changed);
    q('[data-draft]').classList.toggle('changed', state.changed);
    q('[data-document-version]').textContent = state.changed
      ? ui().artifactChanged
      : state.corrected
        ? ui().artifactCorrected
        : ui().artifactOriginal;
    q('[data-primary-title]').textContent = copy.primaryTitle;
    q('[data-primary-status]').textContent = copy.primaryStatus;
    q('[data-primary-status]').className = 'status ' + selected.statusClass;
    q('[data-primary-explanation]').textContent = copy.primaryExplanation;
    q('[data-secondary-title]').textContent = copy.secondaryTitle;
    q('[data-secondary-status]').textContent = copy.secondaryStatus;
    q('[data-secondary-status]').className = 'status ' + (selected.reviewRequired ? 'warn' : 'ok');
    q('[data-secondary-explanation]').textContent = copy.secondaryExplanation;
    q('[data-reason-one-title]').textContent = copy.reasonOneTitle;
    q('[data-reason-one]').textContent = copy.reasonOne;
    q('[data-reason-two-title]').textContent = copy.reasonTwoTitle;
    q('[data-reason-two]').textContent = copy.reasonTwo;
    q('[data-open-source-label]').textContent = copy.openLabel;
    q('[data-open-source]').disabled = state.reviewerOpen;
    q('[data-reasons]').classList.add('visible');
    if (copy.approvedExcerpt) q('[data-approved-excerpt]').innerHTML = copy.approvedExcerpt;
    if (copy.changedExcerpt) q('[data-changed-excerpt]').innerHTML = copy.changedExcerpt;
  }

  function renderLifecycle() {
    let phase = 'Pending';
    let badgeClass = claim().statusClass;
    if (state.changed) {
      phase = 'Changed';
      badgeClass = 'stop';
    } else if (state.decision === 'APPROVE') {
      phase = 'Approved';
      badgeClass = 'ok';
    } else if (state.decision === 'HOLD') {
      phase = 'Held';
      badgeClass = 'warn';
    } else if (state.decision === 'REJECT') {
      phase = 'Rejected';
      badgeClass = 'stop';
    } else if (state.corrected) {
      phase = 'Corrected';
      badgeClass = 'warn';
    }

    const pendingCopy = phase === 'Pending' ? claimCopy() : null;
    const correctedCopy = phase === 'Corrected' ? claimCopy() : null;
    q('[data-review-title]').textContent = pendingCopy?.pendingTitle || ui()['documentTitle' + phase];
    q('[data-review-sub]').textContent = pendingCopy?.pendingSub
      || correctedCopy?.correctedSub
      || ui()['reviewSub' + phase];
    q('[data-review-status]').textContent = phase === 'Pending'
      ? claimCopy().status
      : ui()['documentStatus' + phase];
    q('[data-review-status]').className = 'status ' + badgeClass;
    q('[data-reviewer-title]').textContent = ui()['reviewerTitle' + phase];
    q('[data-reviewer-sub]').textContent = pendingCopy?.pendingSub
      || correctedCopy?.correctedSub
      || ui()['reviewSub' + phase];
    q('[data-reviewer-status]').textContent = ui()['reviewerStatus' + phase];
    q('[data-reviewer-status]').className = 'status ' + badgeClass;
    q('[data-exception-count]').textContent = pendingCopy?.pendingCount || ui()['reviewerCount' + phase];
    q('[data-reviewer-action]').textContent = pendingCopy?.pendingAction
      || correctedCopy?.correctedAction
      || ui()['reviewerAction' + phase];
  }

  function renderDecision() {
    const decided = Boolean(state.decision);
    q('[data-approve]').disabled = !state.corrected || decided;
    q('[data-correct]').disabled = state.corrected || decided;
    q('[data-hold]').disabled = decided;
    q('[data-reject]').disabled = decided;
    q('[data-approve-lock-note]').hidden = state.corrected || decided;
    if (!decided) return;

    const choices = {
      APPROVE: ['decisionApprove', 'nextApproved', 'ok'],
      HOLD: ['decisionHold', 'nextHeld', 'warn'],
      REJECT: ['decisionReject', 'nextRejected', 'stop'],
    };
    const [decisionKey, nextKey, badgeClass] = choices[state.decision];
    q('[data-decision-badge]').textContent = ui()[decisionKey];
    q('[data-decision-badge]').className = 'status ' + badgeClass;
    q('[data-decision-value]').textContent = ui()[decisionKey];
    q('[data-artifact-value]').textContent = state.corrected ? ui().artifactCorrected : ui().artifactOriginal;
    q('[data-next-value]').textContent = ui()[nextKey];
    q('[data-decision-record]').classList.add('visible');
    q('[data-check-changed]').hidden = state.decision !== 'APPROVE' || state.changed;
    q('[data-next-action]').classList.add('visible');
  }

  function renderModal() {
    const selected = claim();
    const copy = claimCopy();
    q('[data-modal-document]').textContent = copy.modalDocument;
    q('[data-modal-kicker]').textContent = copy.modalKicker;
    q('[data-modal-location]').textContent = copy.modalLocation;
    q('[data-modal-role]').textContent = copy.modalRole;
    q('[data-modal-primary-label]').textContent = copy.primaryLabel;
    q('[data-modal-primary-quote]').textContent = copy.primaryQuote;
    q('[data-modal-secondary-label]').textContent = copy.secondaryLabel;
    q('[data-modal-secondary-quote]').textContent = copy.secondaryQuote;
    q('[data-modal-secondary]').hidden = !copy.secondaryQuote;
    q('[data-modal-explanation]').textContent = copy.explanation;
    q('[data-modal-draft]').innerHTML = state.corrected ? copy.corrected : copy.draft;
    q('[data-modal-issue-one]').textContent = copy.modalReasonOne || copy.reasonOneTitle;
    q('[data-modal-issue-two]').textContent = copy.modalReasonTwo || copy.reasonTwoTitle;
    q('[data-prepared-issues-label]').textContent = copy.modalSummary || (
      selected.reviewRequired ? ui().preparedIssues : ui().sourceConfirmedSummary
    );
    q('[data-prepared-issues]').classList.toggle('confirmed', !selected.reviewRequired);
    q('[data-source-continue-label]').textContent = selected.reviewRequired ? ui().continueReviewer : ui().closeSource;
  }

  function refreshNavigation() {
    if (state.changed) setCompleted();
    else if (state.decision === 'HOLD') setTerminal(ui().terminalHold, ui().terminalHoldLabel);
    else if (state.decision === 'REJECT') setTerminal(ui().terminalReject, ui().terminalRejectLabel);
    else if (state.decision === 'APPROVE') setNavigation(4);
    else setNavigation(state.nextStep);
  }

  function setLanguage(language) {
    state.language = language;
    document.documentElement.lang = language === 'en' ? 'en-SG' : 'ko-KR';
    document.documentElement.dataset.language = language;
    document.title = ui().pageTitle;
    q('meta[name="description"]').setAttribute('content', ui().pageDescription);
    qa('[data-i18n]').forEach((node) => {
      node.textContent = translated(node.dataset.i18n);
    });
    const toggle = q('[data-language-toggle]');
    toggle.textContent = language === 'en' ? '한국어' : 'English';
    toggle.setAttribute('aria-label', language === 'en' ? 'Switch to Korean' : '영어로 전환');
    qa('[data-source-close]').forEach((button) => {
      button.setAttribute('aria-label', ui().closeSource);
    });
    renderClaim();
    renderModal();
    renderDecision();
    renderLifecycle();
    refreshNavigation();
  }

  function clearOutcome() {
    state.sourceOpened = false;
    state.reviewerOpen = false;
    state.corrected = false;
    state.decision = null;
    state.changed = false;
    q('[data-reviewer-panel]').classList.remove('visible');
    q('[data-decision-record]').classList.remove('visible');
    q('[data-changed-result]').classList.remove('visible');
    q('[data-next-action]').classList.remove('visible');
    q('[data-check-changed]').hidden = false;
    q('[data-review-stage]').hidden = false;
  }

  function selectClaim(claimId) {
    if (state.reviewerOpen) return;
    state.selectedClaim = claimId;
    clearOutcome();
    renderClaim();
    renderModal();
    renderLifecycle();
    setNavigation(1, claim().reviewRequired ? undefined : ui().supportedGuidance);
  }

  function openSource() {
    renderModal();
    const modal = q('[data-source-modal]');
    state.returnFocus = document.activeElement;
    state.sourceOpened = true;
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    setNavigation(1, claimCopy().sourceOpenGuidance || ui().sourceOpenGuidance);
    q('[data-source-close]').focus();
  }

  function closeModal() {
    const modal = q('[data-source-modal]');
    if (!modal.classList.contains('visible')) return false;
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    return true;
  }

  function dismissSource() {
    if (!closeModal()) return;
    state.sourceOpened = false;
    setNavigation(1, claim().reviewRequired ? undefined : ui().supportedGuidance);
    if (state.returnFocus && typeof state.returnFocus.focus === 'function') state.returnFocus.focus();
  }

  function continueFromSource() {
    if (!closeModal()) return;
    if (state.sourceOpened && claim().reviewRequired && !state.reviewerOpen) {
      state.reviewerOpen = true;
      q('[data-reviewer-panel]').classList.add('visible');
      q('[data-review-stage]').hidden = true;
      renderClaim();
      renderDecision();
      renderLifecycle();
      setNavigation(2);
      q('[data-reviewer-panel]').scrollIntoView({ behavior: 'smooth', block: 'center' });
      q('[data-correct]').focus({ preventScroll: true });
      return;
    }

    state.sourceOpened = false;
    setNavigation(1, claim().reviewRequired ? undefined : ui().supportedGuidance);
    if (state.returnFocus && typeof state.returnFocus.focus === 'function') state.returnFocus.focus();
  }

  function trapModalFocus(event) {
    if (event.key !== 'Tab') return;
    const modal = q('[data-source-modal]');
    if (!modal.classList.contains('visible')) return;
    const focusable = qa('[data-source-modal] a[href], [data-source-modal] button:not([disabled])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function recordDecision(decision) {
    if (decision === 'APPROVE' && !state.corrected) return;
    state.decision = decision;
    renderDecision();
    renderLifecycle();
    if (decision === 'APPROVE') setNavigation(4);
    else setTerminal(
      decision === 'HOLD' ? ui().terminalHold : ui().terminalReject,
      decision === 'HOLD' ? ui().terminalHoldLabel : ui().terminalRejectLabel,
    );
    q('[data-decision-record]').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  qa('[data-claim-select]').forEach((button) => {
    button.addEventListener('click', () => selectClaim(button.dataset.claimSelect));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const tabs = qa('[data-claim-select]:not([disabled])');
      const currentIndex = tabs.indexOf(button);
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(currentIndex + offset + tabs.length) % tabs.length];
      next.focus();
      selectClaim(next.dataset.claimSelect);
    });
  });
  q('[data-language-toggle]').addEventListener('click', () => setLanguage(state.language === 'en' ? 'ko' : 'en'));
  q('[data-open-source]').addEventListener('click', openSource);
  qa('[data-source-close]').forEach((button) => button.addEventListener('click', dismissSource));
  q('[data-source-continue]').addEventListener('click', continueFromSource);
  q('[data-source-backdrop]').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) dismissSource();
  });
  q('[data-correct]').addEventListener('click', () => {
    state.corrected = true;
    renderClaim();
    renderDecision();
    renderLifecycle();
    setNavigation(3);
  });
  q('[data-hold]').addEventListener('click', () => recordDecision('HOLD'));
  q('[data-reject]').addEventListener('click', () => recordDecision('REJECT'));
  q('[data-approve]').addEventListener('click', () => recordDecision('APPROVE'));
  q('[data-check-changed]').addEventListener('click', () => {
    if (state.decision !== 'APPROVE') return;
    state.changed = true;
    renderClaim();
    renderDecision();
    renderLifecycle();
    q('[data-changed-result]').classList.add('visible');
    q('[data-next-action]').classList.add('visible');
    setCompleted();
    q('[data-changed-result]').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  q('[data-reset]').addEventListener('click', () => {
    state.selectedClaim = 'C3';
    clearOutcome();
    const modal = q('[data-source-modal]');
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    renderClaim();
    renderModal();
    renderDecision();
    renderLifecycle();
    setNavigation(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    q('[data-open-source]').focus({ preventScroll: true });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') dismissSource();
    trapModalFocus(event);
  });

  setLanguage('en');
  setNavigation(1);
})();
