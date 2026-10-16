'use strict';
(() => {
  const copy = {
    ko: {
      skip: '본문으로 바로가기', nav: '주 메뉴', navWhitecell: 'WhiteCell', navArchitecture: '아키텍처', navCycle: '방어 흐름', navContact: '연결하기 ↗', pauseMotion: '움직임 멈추기', resumeMotion: '움직임 재생하기', reducedMotion: '동작 줄이기 적용 중', boundaryCaption: 'WhiteCell이 살피고, Ardamire가 경계를 지킵니다.',
      heroHeading: "가장 소중한 것을\n지키는 경계", heroBody: '요청의 신원과 권한, 상태와 파일을 확인하고\n허용된 행동의 경계를 지키는 Auxtho의 방어층.', heroCta: '그림자 속으로', heroFoot: '신원 · 권한 · 상태 · 행동', scroll: '스크롤하여 탐색',
      shadowHeading: "보이지 않는 곳까지\n위험을 찾아서", shadowBody: '입구와 내부 업무의 이상 신호를 살피고,\n탐지·격리·분석을 Ardamire의 대응으로 잇는\n실시간 AI 방어 아키텍처.', shadowCta: 'WhiteCell의 방어 흐름', shadowFoot: '관찰 · 격리 · 이해 · 방어 개선', animationNote: '방어 원리',
      architectureTitle: "살피는 지능\n지키는 경계", architectureIntro: '관찰과 집행은 독립된 역할입니다.\nWhiteCell은 경계 안팎을 살피고, Ardamire Defense Layer는 별도의 권한과 정책으로 실제 행동을 통제합니다.',
      whitecellTitle: "이상 신호를 읽다", whitecellBody: 'WhiteCell은 허가된 범위에서 관찰·조사하고, 신호와 근거를 연결해 격리 요청과 방어 개선안을 제시합니다. WhiteCell 자신도 경계를 넘거나 자료에 접근하고 행동하려면 Ardamire의 권한 검사를 거칩니다.', whitecellFoot: '관찰 · 조사 · 기록 · 제안',
      ardamireTitle: "행동의 경계를 지키다", ardamireBody: 'Ardamire는 독립적인 권한으로 행동을 통제하는 방어 계층입니다. WhiteCell의 신호도 현재 신원·권한·대상 상태와 미리 승인된 정책에 대조해 판단하고, 대상별 검사·보류·격리를 집행합니다. AI의 판단이 곧 행동 권한이 되지는 않습니다.', ardamireFoot: '독립 권한 · 정책 · 집행',
      authorityNote: '새로운 방어 정책과 중요한 변경·복구는 검증 후 권한 있는 사람이 승인합니다. AI가 자신의 제안을 승인하지 않습니다.', cycleChapter: '하나의 신호에서 다음 방어까지',
      cycleTitle: "가두고 이해하고\n더 강하게 지키다", cycleIntro: '이상 신호에서 출발해 격리된 환경에서 원인을 살핍니다. 방어 개선안은 검증과 승인을 거쳐 다음 대응으로 이어집니다.',
      steps: '방어 흐름 6단계', step0: '탐지', step1: '대상 격리', step2: '격리 환경 재현', step3: '패턴 분석', step4: '방어 개선안', step5: '검증 후 적용', illustration: '방어 원리', next: '다음 단계', restart: '처음부터',
      continuityChapter: '보호의 범위를 정확하게', continuityTitle: "위험의 확산은 멈추고\n허가된 일은 흐르게", continuityBody: '의심 자료의 반출은 보수적으로 제한하고, 영향을 받지 않는 허가된 업무는 유지합니다. 격리는 조직 전체가 아니라 관련 대상과 행동을 기준으로 판단합니다.', continuityCta: '방어 원칙 보기',
      flowImage: '의심 자료와 파생 결과는 제한하고, 관련 없는 허가 업무는 별도로 진행하는 개념도', flowSource: '내부 업무 흐름', flowHeld: '의심 자료\n관련 파생 결과', flowAllowed: '영향 없는\n허가된 업무', flowRestrict: '대상별 제한', flowContinue: '별도 확인 후 진행', flowNote: '오염된 내부 업무까지 계속 허용하는 것은 아닙니다.',
      principle1Title: "기본 방어는 계속", principle1Body: 'AI 분석과 별개로 인증·권한·버전·반출 검사를 유지합니다.', principle2Title: "재현은 분리된 환경에서", principle2Body: '의심 행동을 운영 환경과 분리해 살핍니다. 실험 결과를 운영 권한이나 승인으로 사용하지 않습니다.', principle3Title: "개선도 검증과 승인으로", principle3Body: '공격 사례와 정상 업무를 함께 비교합니다. 근거와 적용 범위를 확인한 개선안만 승인 절차로 잇습니다.',
      oversightChapter: '기록에서 사람의 판단까지', oversightTitle: "근거는 남기고\n책임은 분명하게", oversightIntro: 'WhiteCell의 관찰과 Ardamire의 집행 근거를 사건별로 연결하고, Auxtho Console의 Live Operator Wall을 사람의 감독과 개입 지점으로 두는 구조입니다.',
      recordTitle: "기록은 더하고 원본은 지키고", recordBody: '관찰·분석·정정은 새 기록으로 더하고, 원본과 이전 기록은 보존하는 원칙입니다. 확인된 사실과 AI의 추정을 구분하며, 판단이 바뀐 이유까지 남깁니다.',
      forensicTitle: "사건의 맥락을 끝까지", forensicBody: '자료·버전·행동의 이력을 연결해 포렌식 조사로 이어갑니다. 원본 근거와 분석, 격리 재현 결과를 구분하고 조치의 이유와 경과를 추적합니다.',
      humanTitle: "사람이 지켜보고 개입합니다", humanBody: 'Live Operator Wall에서 권한 있는 담당자가 사건·근거·조치 상태와 미확인 사항을 살핍니다. 새로운 방어 정책과 중요한 변경·복구는 검증 후 사람이 승인하며, 최종 책임도 사람이 맡습니다.',
      oversightNote: '미리 승인된 범위의 보호 대응과 사람의 감독은 함께 작동합니다. 화면을 보는 행위가 집행 권한을 대신하지는 않습니다.',
      contactEyebrow: '관찰 · 격리 · 검증 · 방어', contactTitle: "보이지 않는 경계까지\nWHITE CELL", contactBody: 'WhiteCell의 관찰. Ardamire의 집행. 사람의 책임.\nAuxtho의 AI 방어 아키텍처.', contactCta: 'Auxtho에서 더 알아보기', footer: 'ARDAMIRE / 방어 아키텍처', backTop: '맨 위로',
      description: 'Ardamire Defense Layer가 행동의 경계를 지키고, Ardamire WhiteCell은 보이지 않는 위험을 살피는 Auxtho의 AI 방어 아키텍처.'
    },
    en: {
      skip: 'Skip to content', nav: 'Main navigation', navWhitecell: 'WhiteCell', navArchitecture: 'Architecture', navCycle: 'Defence cycle', navContact: 'Connect ↗', pauseMotion: 'Pause motion', resumeMotion: 'Resume motion', reducedMotion: 'Reduced motion enabled', boundaryCaption: 'WhiteCell observes. Ardamire holds the boundary.',
      heroHeading: "A boundary for\nwhat matters most", heroBody: 'Auxtho’s defence layer checks identity, authority, state and file consistency to govern permitted actions.', heroCta: 'Into the shadows', heroFoot: 'IDENTITY · AUTHORITY · STATE · ACTION', scroll: 'Scroll to explore',
      shadowHeading: "Into the unseen\nIn search of risk", shadowBody: 'A real-time AI defence architecture for observing anomalies at the entrance and within workflows, connecting detection, containment and analysis to Ardamire’s response.', shadowCta: 'Explore the WhiteCell cycle', shadowFoot: 'OBSERVE · CONTAIN · UNDERSTAND · STRENGTHEN', animationNote: 'Defence principles',
      architectureTitle: "Intelligence that observes\nBoundaries that hold", architectureIntro: 'Observation and enforcement are independent roles. WhiteCell observes on both sides of the boundary. Ardamire Defense Layer governs actual actions under separate authority and policy.',
      whitecellTitle: "Read the anomaly", whitecellBody: 'WhiteCell observes and investigates within its authorised scope, linking signals with evidence to request containment and propose defensive improvements. WhiteCell itself must pass Ardamire’s authority checks to cross boundaries, access material or act.', whitecellFoot: 'OBSERVE · INVESTIGATE · RECORD · PROPOSE',
      ardamireTitle: "Guard the action", ardamireBody: 'Ardamire is the independent boundary authority. It checks WhiteCell signals against current identity, authority, target state and preauthorised policy, then enforces scoped checks, holds and containment. An AI judgement is not permission to act.', ardamireFoot: 'INDEPENDENT AUTHORITY · POLICY · ENFORCEMENT',
      authorityNote: 'New defence policies and consequential changes or recovery require verification and approval by authorised people. The AI does not approve its own proposals.', cycleChapter: 'From one signal to the next defence',
      cycleTitle: "Contain Understand\nStrengthen the defence", cycleIntro: 'Start with an anomaly signal, then examine its cause in isolation. Defensive improvements proceed through validation and approval before entering the next response.',
      steps: 'Six stages of the defence cycle', step0: 'Detect', step1: 'Contain the target', step2: 'Reproduce in isolation', step3: 'Analyse patterns', step4: 'Propose improvements', step5: 'Validate, then apply', illustration: 'Defence principles', next: 'Next stage', restart: 'Start again',
      continuityChapter: 'Scope the protection precisely', continuityTitle: "Stop risk spreading\nKeep authorised work moving", continuityBody: 'Restrict suspicious outbound actions conservatively while preserving unaffected, authorised work. Scope containment to relevant targets and actions rather than the entire organisation.', continuityCta: 'Explore the principles',
      flowImage: 'Concept diagram: suspicious material and related derivatives are restricted; unrelated authorised work is checked separately and continues', flowSource: 'INTERNAL WORKFLOW', flowHeld: 'Suspicious material\nRelated derivatives', flowAllowed: 'Unaffected\nAuthorised work', flowRestrict: 'SCOPED RESTRICTION', flowContinue: 'CHECK, THEN CONTINUE', flowNote: 'Contaminated internal work does not receive an automatic pass.',
      principle1Title: "Baseline defence stays active", principle1Body: 'Keep authentication, authority, version and outbound checks independent of AI analysis.', principle2Title: "Reproduce in isolation", principle2Body: 'Examine suspicious behaviour separately from operations. Experimental results do not become operational authority or approval.', principle3Title: "Validate Review Approve", principle3Body: 'Compare attack cases with legitimate work. Only proposals with checked evidence and a defined scope proceed to approval.',
      oversightChapter: 'From records to human judgement', oversightTitle: "Preserve the evidence\nKeep accountability clear", oversightIntro: 'The architecture links WhiteCell observations and Ardamire enforcement evidence by case, placing the Live Operator Wall in Auxtho Console at the point of human oversight and intervention.',
      recordTitle: "Add records Preserve originals", recordBody: 'The principle is to append observations, analyses and corrections while preserving originals and earlier records. Separate verified facts from AI inference, including the reasons for a changed assessment.',
      forensicTitle: "Follow the whole case", forensicBody: 'Link material, versions and action history for forensic investigation. Keep original evidence, analysis and isolated replay results distinct, and trace the reasons and sequence behind each response.',
      humanTitle: "People oversee and intervene", humanBody: 'Authorised operators use the Live Operator Wall to review cases, evidence, action status and unresolved questions. People verify and approve new defence policies and consequential changes or recovery, and retain final accountability.',
      oversightNote: 'Preauthorised, scoped protection and human oversight work together. Viewing the wall does not confer authority to enforce an action.',
      contactEyebrow: 'OBSERVE · CONTAIN · VALIDATE · DEFEND', contactTitle: "Into the unseen boundary\nWHITE CELL", contactBody: 'WhiteCell observes. Ardamire enforces. People remain accountable.\nAuxtho’s AI defence architecture.', contactCta: 'Discover Auxtho', footer: 'ARDAMIRE / DEFENCE ARCHITECTURE', backTop: 'Back to top',
      description: 'Ardamire Defense Layer governs the boundary of action. Ardamire WhiteCell observes anomalies within Auxtho’s AI defence architecture.'
    }
  };
  const stages = {
    ko: [
      ["평범한 흐름에서,\n다른 신호를 읽다", '요청·자료·업무의 맥락을 함께 살펴 이상 징후를 분석합니다. 관찰한 사실과 AI의 추정을 구분하고, 근거가 붙은 방어 신호를 Ardamire에 전달하는 단계입니다.'],
      ["전체가 아니라,\n영향받는 대상을", 'Ardamire가 미리 승인된 정책에 따라 해당 자료·세션·작업의 행동을 제한하는 단계입니다. 의심 자료의 반출과 관련 파생 결과를 살피고, 무관한 허가 업무는 별도로 판단합니다.'],
      ["운영과 분리해,\n같은 원인을 살피다", '격리된 복제 환경에서 의심 행동의 원인을 살핍니다. 합성 권한과 대상을 사용하고, 운영 자원과 외부 전송 경로를 분리합니다.'],
      ["반복된 문구보다,\n경계를 넘는 행동을", '관찰과 재현 근거에서 행동의 관계를 분석합니다. 비슷한 표현만으로 같은 공격이라 단정하지 않고, 공격 사례와 정상 업무의 차이를 함께 검토해 패턴 후보를 만듭니다.'],
      ["관찰한 근거를,\n제한된 개선안으로", '확인한 원인에 맞춰 방어 조건과 대응 범위를 제안합니다. 적용 대상·행동·강도를 명확히 하고, 정상 업무에 미치는 영향과 되돌릴 방법을 함께 검토합니다.'],
      ["검증한 것만,\n다음 방어에", '개선안은 격리 시험과 독립 검토를 거쳐 정확한 적용 승인을 받습니다. 내용이나 범위가 바뀌면 다시 검토하고, 적용 결과와 복원 근거를 남깁니다.']
    ],
    en: [
      ["Read the difference\nin an ordinary flow", 'Analyse requests, material and workflow context together. Separate observed facts from AI inference, then send Ardamire an evidence-linked defensive signal.'],
      ["Contain the target\nScope the impact", 'Ardamire applies preauthorised policies to restrict actions on the relevant material, session or job. Examine suspicious outbound actions and related derivatives; assess unrelated authorised work separately.'],
      ["Same cause\nA separate environment", 'Examine suspicious behaviour in an isolated replica using synthetic authority and targets. Keep the experiment separate from operational resources and outbound delivery.'],
      ["Beyond repeated words\nUnderstand the action", 'Analyse relationships in observed and reproduced behaviour. Similar wording alone does not establish the same attack. Compare attack cases with legitimate work to form evidence-backed pattern candidates.'],
      ["Turn evidence into\na scoped proposal", 'Propose defensive conditions and responses for the observed cause. Define targets, actions and intensity, and examine the effect on legitimate work alongside a way to roll back.'],
      ["Validate before\nthe next defence", 'Take each proposal through isolated testing and independent review, then obtain approval for the exact change. Review changed content or scope again, and preserve application results and recovery evidence.']
    ]
  };
  const labels = ['OBSERVE', 'CONTAIN', 'REPRODUCE', 'ANALYSE', 'PROPOSE', 'VALIDATE'];
  let language = new URLSearchParams(window.location.search).get('lang') === 'ko' ? 'ko' : 'en';
  let current = 0;
  const tabs = Array.from(document.querySelectorAll('[data-step]'));
  const panel = document.getElementById('step-panel');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionButtons = Array.from(document.querySelectorAll('[data-motion-toggle]'));
  let motionPaused = document.documentElement.dataset.motionPaused === 'true';
  function updateMotionControls() {
    motionButtons.forEach(button => {
      button.textContent = copy[language][reducedMotion.matches ? 'reducedMotion' : motionPaused ? 'resumeMotion' : 'pauseMotion'];
      button.setAttribute('aria-pressed', String(motionPaused));
      button.disabled = reducedMotion.matches;
    });
  }
  function toggleMotion() {
    motionPaused = !motionPaused;
    document.documentElement.dataset.motionPaused = String(motionPaused);
    updateMotionControls();
    document.dispatchEvent(new CustomEvent('whitecell-motion-change', { detail: { paused: motionPaused } }));
  }
  // All content comes from the fixed local dictionary. Preserve intended line breaks.
  function setText(element, text) {
    element.replaceChildren();
    text.split('\n').forEach((line, index) => {
      if (index) element.append(document.createElement('br'));
      element.append(document.createTextNode(line));
    });
  }
  function showStep(index, focusTab = false) {
    current = (index + tabs.length) % tabs.length;
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === current));
      tab.tabIndex = i === current ? 0 : -1;
    });
    panel.dataset.active = String(current);
    panel.setAttribute('aria-labelledby', tabs[current].id);
    setText(document.getElementById('step-title'), stages[language][current][0]);
    setText(document.getElementById('step-body'), stages[language][current][1]);
    document.getElementById('visual-label').textContent = `${String(current + 1).padStart(2, '0')} / ${labels[current]}`;
    document.getElementById('step-counter').textContent = `${String(current + 1).padStart(2, '0')} / 06`;
    document.getElementById('step-announcement').textContent = `${current + 1} / 6 · ${copy[language][`step${current}`]}`;
    document.querySelector('#next-step [data-i18n]').textContent = copy[language][current === 5 ? 'restart' : 'next'];
    if (focusTab) tabs[current].focus();
  }
  function setLanguage(nextLanguage) {
    language = nextLanguage;
    document.documentElement.lang = language;
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const value = copy[language][element.dataset.i18n];
      if (value !== undefined) setText(element, value);
    });
    document.querySelectorAll('[data-aria-key]').forEach(element => element.setAttribute('aria-label', copy[language][element.dataset.ariaKey]));
    const button = document.getElementById('language');
    button.textContent = language === 'ko' ? 'EN' : 'KO';
    button.lang = language === 'ko' ? 'en' : 'ko';
    button.setAttribute('aria-label', language === 'ko' ? 'Switch to English' : '한국어로 전환');
    document.querySelector('meta[name="description"]').content = copy[language].description;
    document.querySelector('.contact .button').href = `https://auxtho.com/?lang=${language}`;
    showStep(current);
    updateMotionControls();
  }
  tabs.forEach(tab => {
    tab.addEventListener('click', () => showStep(Number(tab.dataset.step)));
    tab.addEventListener('keydown', event => {
      const directions = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (Object.hasOwn(directions, event.key)) {
        event.preventDefault();
        showStep(current + directions[event.key], true);
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        showStep(event.key === 'Home' ? 0 : tabs.length - 1, true);
      }
    });
  });
  document.getElementById('next-step').addEventListener('click', () => showStep(current + 1));
  document.getElementById('language').addEventListener('click', () => setLanguage(language === 'ko' ? 'en' : 'ko'));
  motionButtons.forEach(button => button.addEventListener('click', toggleMotion));
  reducedMotion.addEventListener('change', updateMotionControls);
  setLanguage(language);

  const boundaryScene = document.querySelector('.boundary-scene');
  if ('IntersectionObserver' in window) {
    boundaryScene.dataset.motionVisible = 'false';
    const observer = new IntersectionObserver(entries => {
      boundaryScene.dataset.motionVisible = String(entries.some(entry => entry.isIntersecting));
    });
    observer.observe(boundaryScene);
  }

  const hero = document.querySelector('.hero');
  const art = document.querySelector('.hero-art');
  const precisePointer = window.matchMedia('(pointer: fine)');
  let frame = 0;
  hero.addEventListener('pointermove', event => {
    if (reducedMotion.matches || !precisePointer.matches) return;
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const bounds = hero.getBoundingClientRect();
      art.style.setProperty('--px', `${((event.clientX - bounds.left) / bounds.width - .5) * 17}px`);
      art.style.setProperty('--py', `${((event.clientY - bounds.top) / bounds.height - .5) * 13}px`);
      frame = 0;
    });
  });
  function resetArt() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    art.style.setProperty('--px', '0px');
    art.style.setProperty('--py', '0px');
  }
  hero.addEventListener('pointerleave', resetArt);
  reducedMotion.addEventListener('change', resetArt);
})();
