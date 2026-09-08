(() => {
  'use strict';
  const data = window.AuxthoInteractiveDemoData;
  if (!data) throw new Error('Source-review evidence data is unavailable.');
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const initialAria=new Map(qa('[aria-label]').map(e=>[e,e.getAttribute('aria-label')]));
  const initialAlt=new Map(qa('img[alt]').map(e=>[e,e.alt]));
  const english = Object.fromEntries(qa('[data-i18n]').map((e) => [e.dataset.i18n, e.textContent.trim()]));
  english.title = 'Inspect the source. Make the decision. Open the record again.';
  const ko = {
    skip:'워크스루로 바로 이동', library:'Capability Library',
    eyebrow:'금융 보고서의 검토부터 결과 기록까지',
    title:'근거를 확인하고 결정합니다. 나중에도 그 기록을 다시 엽니다.',
    intro:'보고서의 검토 대상 문장을 Auxtho가 원문과 대조합니다. 수정하거나 판단할 항목을 이유와 함께 정리하고, 담당자가 검토해 최종 결정합니다.',
    format:'보고서 검토 체험 · 실제 제품 화면',start:'보고서 검토 시작 →',
    step1:'검토할 업무',step2:'원문과 검토 항목',step3:'담당자의 결정',step4:'처리 결과 기록',step5:'과거 검토 기록',step6:'당시 과정 확인',reset:'처음부터',
    exampleLabel:'검토 체험 · MAS 원문 검토',workTitle:'데이터 백업에 관한 보고서를 검토합니다.',
    workIntro:'보고서가 원문보다 더 강한 요구사항을 담고 있습니다. 근거와 수정안을 확인하고, 승인 여부를 결정해 보세요.',
    documentLabel:'AI가 작성을 도운 초안 · 버전 1.0',documentTitle:'데이터 백업 검토 보고서',
    documentContext:'검토할 부분: 백업 관련 제안을 설명한 문장.',
    preparedTitle:'Auxtho가 준비한 검토 내용',
    prepared1:'규정의 근거, 보충 설명, 제안 자료를 구분했습니다.',
    prepared2:'검토 대상 문장을 원문의 정확한 문구와 대조했습니다.',
    prepared3:'원문과 다른 부분과 판단이 필요한 이유를 정리했습니다.',
    humanRole:'담당자는 정리된 근거를 보고 수정·승인·보류·거절을 결정합니다.',
    sourceSetTitle:'어떤 자료를 사용하나요?',
    sourceSet:'이 예시는 검토 대상 문장 3개와 버전을 고정한 MAS 공개 자료 3개를 사용합니다. 백업 관련 제안을 설명한 문장(C3)부터 살펴봅니다.',
    noticeRole:'이 자료 묶음에서 규정의 주된 근거로 쓰는 문서',faqRole:'보충 설명',proposalRole:'제안 단계 · 의견수렴 종료',
    toSources:'Auxtho가 정리한 검토 항목 확인 →',
    choiceC3:'백업 제안 · 문제 2개',choiceC2:'FAQ 출처 · 문제 1개',choiceC1:'시간 한도·기간 일치',
    selectedText:'보고서에서 선택한 문장',explanationLabel:'이해를 위한 Auxtho의 비공식 한국어 설명',
    sourceProof:'원문 자료와 검증 기록 보기 ↗',
    originalTitle:'실제 제품의 원문 페이지 화면 보기',
    originalContext:'이 공개 제품 캡처는 Notice 3쪽의 C1을 보여줍니다. FAQ를 다룬 C2와 의견수렴 자료 6쪽의 C3은 별도의 문장과 원문입니다.',
    sourceWording:'대조한 원문 표현',originalPage:'원문 페이지와 노란색 표시',
    enlarge:'제품 화면을 원래 크기로 열기 ↗',
    supported:'C1에는 추가 판단이 필요한 항목이 없습니다. 최종 승인 여부는 담당자가 결정합니다. 검토 체험을 계속하려면 C2 또는 C3을 선택하세요.',
    back:'이전',toReview:'이 항목 검토하기 →',
    decisionTitle:'검토한 버전을 승인·보류·거절합니다.',
    decisionIntro:'준비된 수정안을 원문과 비교해 보세요. 검토를 마친 수정본을 승인하거나, 보고서를 보류·거절할 수 있습니다.',
    before:'수정 전 · 버전 1.0',apply:'수정안 적용',attest:'원문과 수정안을 검토했음을 확인',
    approve:'수정본 1.1 승인',hold:'보류',reject:'거절',exampleDecision:'검토 체험에서 선택한 결정',
    decision:'담당자 결정',reviewedVersion:'검토한 버전',permission:'허용한 다음 처리',
    browserChoice:'체험용 선택 · 실제 기록 저장이나 보고서 전송으로 이어지지 않습니다.',
    toResult:'제품에 남은 처리 결과 보기 →',
    releaseCase:'제품 화면 · 별도의 보고서 전달 시험',
    resultTitle:'승인한 보고서와 처리 결과를 함께 기록합니다.',
    resultIntro:'담당자가 예시 보고서를 승인했습니다. 시험 수신기가 허용된 전달 요청을 처리했고, Auxtho가 수신기의 처리 확인 기록을 대조한 뒤 성공 결과를 기록했습니다.',
    caseTransition:'여기부터는 기능별로 검증한 제품 화면을 살펴봅니다. 앞의 검토 체험과 구분된 각각의 사례입니다.',
    resultDecision:'담당자가 예시 보고서를 검토하고 승인했습니다.',
    resultAction:'시험 수신기가 허용된 보고서 전달 요청을 처리했습니다.',
    resultLabel:'기록된 결과',resultReadback:'Auxtho가 수신기의 처리 확인 기록을 대조한 뒤 성공 결과를 남겼습니다.',
    releaseCaption:'실제 제품 화면 · 예시 데이터로 수행한 로컬 전달 시험. EXTERNAL_DELIVERY는 이 시험에서 사용한 처리 유형입니다.',
    toAudit:'과거 검토 기록 다시 열기 →',
    auditCase:'제품 화면 · 과거 검토 기록',auditTitle:'누가 무엇을 승인했는지 다시 확인합니다.',
    auditIntro:'권한 있는 담당자가 과거 검토 기록을 엽니다. Auxtho는 저장된 연결 정보를 다시 확인하고, 검토한 버전과 근거 문서, 당시 결정을 보여줍니다.',
    auditQuestion:'어떤 자료를 보고, 어느 버전을 승인했을까요?',
    auditExplain:'검토한 버전, 승인 기록, 근거 문서를 한곳에서 확인합니다.',
    openAudit:'기록된 검토 화면 열기',
    auditProjection:'실제 제품의 Audit 화면에 예시 데이터를 표시했습니다.',
    auditCaption:'과거 검토 기록 예시 · 앞의 전달 시험과는 별도 사례입니다.',
    auditProof:'검토 기록의 검증 근거 보기 →',toReconstruction:'당시 과정을 다시 확인하기 →',
    incidentCase:'제품 화면 · 별도의 보고서 변경 사례',
    reconstructionTitle:'문제가 제기되면 당시 과정을 다시 확인합니다.',
    reconstructionIntro:'보고서 변경 신호에서 관련 처리 기록 1건을 찾았습니다. Auxtho는 그때 사용한 보고서·근거·기준과 담당자의 결정, 허용한 처리, 결과를 연결해 보여줍니다. 담당자는 이를 보고 대응과 마무리 여부를 결정합니다.',
    fieldDocument:'검토한 문서',fieldSources:'원문과 기준',fieldPerson:'담당자와 결정',fieldAction:'허용한 처리와 결과',
    affected:'관련 처리 기록을 찾습니다',response:'담당자의 대응 결정과 조치 계획을 기록합니다.',
    incidentCaption:'같은 사건의 세 가지 제품 화면입니다. 관련 기록과 담당자의 결정, 조치 계획을 함께 보존합니다.',
    takeawayTitle:'업무가 끝난 뒤 무엇이 남을까요?',
    takeaway:'어떤 근거로 어느 버전을 승인했고, 이후 어떤 처리 결과가 남았는지 다시 확인할 수 있습니다.',
    branchTitle:'변경이나 결과 미확인 상황도 살펴보세요',
    changedQuestion:'승인 뒤 문서가 바뀌면?',unknownQuestion:'처리 결과를 확인할 수 없으면?',
    fullLibrary:'Capability Library 전체 보기 →',incidentProof:'재구성과 복구 검증 근거 확인 →',
    contact:'우리 업무에 맞는 데모 요청',returnAudit:'과거 검토 기록 다시 보기',
    sourceNoteTitle:'데모 안내',
    sourceNote:'예시 데이터와 기능별 검증 화면으로 Auxtho의 원문 검토, 담당자 결정, 결과 기록과 사건 재구성 과정을 살펴보는 안내형 데모입니다.',
    manifest:'이미지 출처와 검증 기록 보기 ↗',
    packDate:'원문 자료 묶음 기준일 · 2026년 8월 29일',scrollCue:'제품 패널을 옆으로 스크롤해 전체 내용을 확인하세요.',
    fieldCue:'항목을 선택하거나 옆으로 스크롤해 제품 패널을 확인하세요.',viewDecision:'담당자 결정',viewAction:'허용한 요청',viewOutcome:'처리 확인 결과',viewTrace:'근거 문서 정보',viewReopen:'원문 다시 열기 영역',
    notificationTitle:'담당자가 판단할 통보 사항을 남깁니다',notificationCopy:'이 사례의 통보 기준은 추가 확인이 필요합니다. Auxtho가 해당 항목을 따로 표시하고, 담당자가 적용할 기준과 대응을 결정합니다.',
    detailsTitle:'데모 구성과 검증 근거 보기',
    exerciseTitle:'검토 체험의 구성',
    exerciseNote:'버튼으로 선택하는 검토 체험은 정해진 예시로 진행됩니다. 선택은 브라우저 안에서만 반영되며 실제 기록 저장이나 보고서 전송으로 이어지지 않습니다. 뒤에 나오는 제품 화면은 별도로 검증한 사례입니다.',
    proofTitle:'제품 화면의 검증 범위',
    proofEnvironment:'제품 증거는 로컬 환경에서 예시용 합성 데이터를 사용해 검증했으며, 외부 AI 모델 제공자를 호출하지 않았습니다. 고객 운영과 호스팅된 프로덕션의 성과는 이 증거의 검증 범위에 포함되지 않습니다.',
    proofCases:'과거 검토 기록 화면은 실제 제품 화면에 예시 데이터를 표시한 것입니다. 저장된 기록의 재검증·재열람 동작은 별도의 제품 테스트로 검증했습니다. 이미지 출처, 사례 구분과 테스트 근거는 아래 기록에서 확인할 수 있습니다.',
    inspectionMeaning:'제품의 검토 확인 기록은 인증된 담당자가 근거를 검토했다고 남긴 진술입니다. 브라우저의 확인 버튼은 그 절차를 체험하는 예시입니다.',
    materialsTitle:'MAS 원문 자료',
    materialsNote:'Auxtho가 MAS 공개 문서를 사용해 독립적으로 구성한 예시입니다. 자료의 역할은 2026년 8월 29일 자료 묶음 기준으로 고정돼 있습니다. MAS의 제휴·승인, 법률 자문 또는 규제 준수 판정을 의미하지 않습니다.'
  };
  const state = { language:'en', stage:1, claim:'C3', corrected:false, inspected:false, decision:null, auditOpen:false, dialogKind:null, returnFocus:null, resultView:'outcome', auditView:'trace' };
  const t = (key) => (state.language === 'ko' ? ko : english)[key] || english[key];
  const local = (en, kr) => state.language === 'ko' ? kr : en;
  function copy() {
    const original=data.claims[state.claim][state.language];
    if(state.claim==='C1') return {...original,
      pendingTitle:local('The limit and period match the source.','시간 한도와 기간이 원문과 일치합니다.'),
      pendingSub:local('Auxtho matched the selected four-hour limit and twelve-month period to paragraph 5.','Auxtho가 선택된 4시간 한도와 12개월 기간을 문단 5와 대조했습니다.'),
      reasonOneTitle:local('Limit and period match','시간 한도와 기간 일치'),
      reasonOne:local('The preserved statement uses the same numerical limit and period as paragraph 5.','보존된 예시 문장은 문단 5와 같은 시간 한도와 기간을 사용합니다.'),
      reasonTwo:local('This frozen pack uses the Notice as the primary source for the comparison.','이 동결 자료 묶음에서는 Notice를 대조의 주된 근거로 사용합니다.'),
      modalRole:local('Primary source in this frozen pack','이 동결 자료 묶음의 주된 근거'),
      explanation:local('Paragraph 5 states the four-hour limit over twelve months. Inspect the source-scope note below.','문단 5에서 12개월 동안의 4시간 한도를 확인할 수 있습니다. 아래에서 원문의 적용 범위 설명도 확인하세요.')
    };
    if(state.claim==='C2') return {...original,
      pendingTitle:local('One source attribution needs correction.','인용 출처 1곳을 바로잡아야 합니다.'),
      reasonOneTitle:local('Reason 1 · Notice attribution','이유 1 · Notice 인용'),
      reasonTwoTitle:local('Reason 2 · Supporting FAQ','이유 2 · 보충 설명인 FAQ'),
      modalRole:local('Supporting FAQ in this frozen pack','이 동결 자료 묶음의 보충 설명인 FAQ'),
      explanation:local('The detail is in the FAQ. This example corrects its attribution rather than treating it as wording in the Notice.','이 설명은 FAQ에 있습니다. 이 예시는 해당 설명을 Notice의 문구로 쓰지 않고 인용 출처를 바로잡습니다.')
    };
    return original;
  }
  function scopeNote() {
    if(state.claim==='C1') return local('Paragraph 5 applies to downtime affecting the bank’s operations or service to customers. This preserved example demonstrates the limit-and-period comparison.','문단 5는 은행 업무나 고객 서비스에 영향을 주는 중단 시간을 다룹니다. 이 보존 예시는 시간 한도와 기간의 대조를 보여줍니다.');
    if(state.claim==='C2') return local('This example corrects source attribution. A10.1 concerns a critical-system malfunction that disrupts operations or customer service.','이 예시는 인용 출처를 바로잡습니다. A10.1은 중요 시스템의 오작동으로 업무나 고객 서비스가 중단된 경우를 다룹니다.');
    return '';
  }
  function focusEvidenceField(kind,value) {
    const isResult=kind==='result';
    const region=q(isResult?'[data-result-evidence]':'[data-audit-figure] .evidence-scroll');
    const offsets=isResult?{decision:0,action:640,outcome:958}:{trace:0,reopen:270};
    if(isResult) state.resultView=value;else state.auditView=value;
    region.scrollLeft=offsets[value] || 0;
    qa(isResult?'[data-result-view]':'[data-audit-view]').forEach(b=>b.setAttribute('aria-pressed',String((isResult?b.dataset.resultView:b.dataset.auditView)===value)));
  }
  const evidence = {
    source:{src:'/assets/proof/singapore-source-review/exact-source-page.png?sha256=7210f9c77a162aa0f720ed490b383f94c5bed35672f426ebfb47902956a5e6c7',title:'C1 · Notice page 3',alt:'Accepted product Evidence screen for C1, showing the original Notice page 3 and yellow geometry highlight.'},
    release:{src:'/assets/capabilities/incident-recovery/release-receipt-readback.png?sha256=0a741d2ed3814c2682b613d58270b3d3a2b41619c2f019f0cb1ca9696090229f',title:'M125 · Local recorded result',alt:'Local synthetic result panel with human decision, permitted action and receipt outcome.'},
    audit:{src:'/assets/capabilities/audit-history/decision-receipt.png?sha256=36551671e0418bedcb060c804f26064da5a763034dd57a3e7bcf27497dff7a76',title:'Audit · Public-safe synthetic UI projection',alt:'Audit receipt example with source trace and recorded bindings.'}
  };
  function render() {
    const c = copy();
    qa('[data-stage]').forEach((e) => { e.hidden = Number(e.dataset.stage) !== state.stage; });
    qa('[data-step]').forEach((e) => {
      const step = Number(e.dataset.step);
      if (step === state.stage) e.setAttribute('aria-current','step'); else e.removeAttribute('aria-current');
      e.classList.toggle('done',step < state.stage);
    });
    q('[data-progress]').textContent = state.stage + ' / 6 · ' + t('step' + state.stage);
    qa('[data-draft]').forEach((e) => { e.innerHTML = c.draft; });
    q('[data-source-title]').textContent = c.pendingTitle;
    q('[data-source-summary]').textContent = c.pendingSub;
    q('[data-reason-one-title]').textContent = c.reasonOneTitle;
    q('[data-reason-one]').textContent = c.reasonOne;
    q('[data-reason-two-title]').textContent = c.reasonTwoTitle;
    q('[data-reason-two]').textContent = c.reasonTwo;
    q('[data-source-location]').textContent = c.modalLocation;
    q('[data-source-document]').textContent = c.modalDocument;
    q('[data-source-role]').textContent = c.modalRole;
    q('[data-primary-quote]').textContent = c.primaryQuote;
    q('[data-secondary-quote]').textContent = c.secondaryQuote;
    q('[data-secondary-quote]').hidden = !c.secondaryQuote;
    q('[data-source-explanation]').textContent = c.explanation;
    q('[data-scope-note]').textContent=scopeNote();q('[data-scope-note]').hidden=!scopeNote();
    q('[data-correction-scope]').textContent=scopeNote();q('[data-correction-scope]').hidden=state.claim!=='C2';
    q('[data-original-title]').textContent=state.claim==='C1'?local('Original-page product screen · C1 / Notice page 3','실제 제품의 원문 화면 · C1 / Notice 3쪽'):local('Separate original-page example · C1 / Notice page 3','별도의 원문 화면 예시 · C1 / Notice 3쪽');
    qa('[data-claim]').forEach((e) => e.setAttribute('aria-pressed',String(e.dataset.claim === state.claim)));
    q('[data-supported]').hidden = data.claims[state.claim].reviewRequired;
    q('[data-review-next]').disabled = !data.claims[state.claim].reviewRequired;
    q('[data-before]').innerHTML = c.draft;
    q('[data-correction]').innerHTML = c.corrected;
    q('[data-correction-label]').textContent = state.corrected
      ? local('Applied correction · version 1.1','적용한 수정안 · 버전 1.1')
      : local('Prepared correction · proposed version 1.1','준비된 수정안 · 적용하면 버전 1.1');
    q('[data-correct]').disabled = state.corrected || Boolean(state.decision);
    q('[data-correct]').textContent = state.corrected ? local('Correction applied','수정안 적용 완료') : t('apply');
    q('[data-attest]').disabled = Boolean(state.decision);
    q('[data-attest]').setAttribute('aria-pressed',String(state.inspected));
    q('[data-approve]').disabled = !state.corrected || !state.inspected || Boolean(state.decision);
    q('[data-hold]').disabled = Boolean(state.decision);
    q('[data-reject]').disabled = Boolean(state.decision);
    q('[data-decision-help]').textContent = state.decision
      ? local('The example decision applies only to the version shown below.','예시 결정은 아래에 표시된 버전에만 적용됩니다.')
      : local('Apply the correction and confirm your inspection of the source and correction to approve this version.','수정안을 적용하고 원문·수정안 검토를 확인하면 이 버전을 승인할 수 있습니다.');
    q('[data-example-record]').hidden = !state.decision;
    q('[data-after-decision]').disabled = !state.decision;
    if (state.decision) {
      q('[data-decision]').textContent = state.decision === 'APPROVE' ? local('Approved','승인') : state.decision === 'HOLD' ? t('hold') : t('reject');
      q('[data-reviewed-version]').textContent = state.corrected ? '1.1' : '1.0';
      q('[data-permission]').textContent = state.decision === 'APPROVE'
        ? local('Prepare the evaluation result','검토 결과 준비')
        : local('No next action permitted','후속 처리 허용 안 됨');
    }
    q('[data-audit-figure]').hidden = !state.auditOpen;
    q('[data-open-audit]').textContent = state.auditOpen ? local('Recorded panel opened','검토 기록 열림') : t('openAudit');
    q('[data-open-audit]').disabled = state.auditOpen;
    q('[data-audit-announcement]').textContent=state.auditOpen?local('Recorded Audit example opened. Inspect the source trace and source-reopening detail.','과거 검토 기록을 열었습니다. 근거 문서 정보와 원문 다시 열기 영역을 확인하세요.'):'';
    if(state.stage===4) focusEvidenceField('result',state.resultView);
    if(state.stage===5 && state.auditOpen) focusEvidenceField('audit',state.auditView);
  }
  function focusStage() {
    const title = q('[data-stage="' + state.stage + '"] h2');
    title.focus({preventScroll:true});
    q('.workbench').scrollIntoView({block:'start',behavior:'instant'});
  }
  function go(stage) {
    if (stage < 1 || stage > 6 || (stage > 3 && !state.decision)) return;
    if (stage === 3 && !data.claims[state.claim].reviewRequired) return;
    if (stage === 1) {
      state.claim='C3';state.corrected=false;state.inspected=false;state.decision=null;state.auditOpen=false;
      q('[data-original-details]').open=false;
      setCrop('page');
    }
    state.stage = stage;
    render();
    focusStage();
  }
  function reset() {
    state.stage=1; state.claim='C3'; state.corrected=false; state.inspected=false; state.decision=null; state.auditOpen=false;
    q('[data-original-details]').open=false;
    setCrop('page');
    render();
    window.scrollTo({top:0,behavior:'instant'});
    q('[data-start]').focus({preventScroll:true});
  }
  function setLanguage(language) {
    state.language=language;
    document.documentElement.lang=language === 'en' ? 'en-SG' : 'ko-KR';
    document.documentElement.dataset.language=language;
    qa('[data-i18n]').forEach((e) => { e.textContent=t(e.dataset.i18n); });
    initialAria.forEach((value,e)=>e.setAttribute('aria-label',value));
    initialAlt.forEach((value,e)=>{e.alt=value;});
    if(language==='ko') {
      const labels={'.site-header nav':'사이트 메뉴','.path-nav':'워크스루 진행 단계','.claim-choices':'검토할 원문 사례 선택','.original-proof .image-tabs':'원문 화면에서 확인할 영역','.source-window':'원문 페이지 증거. 옆으로 스크롤하여 확인하세요.','[data-result-views]':'처리 결과에서 확인할 영역','[data-result-evidence]':'처리 결과 제품 화면. 옆으로 스크롤하여 확인하세요.','[data-audit-views]':'과거 검토 기록에서 확인할 영역','[data-audit-figure] .evidence-scroll':'과거 검토 기록 화면. 옆으로 스크롤하여 확인하세요.'};
      for(const [selector,label] of Object.entries(labels)) q(selector).setAttribute('aria-label',label);
      qa('[data-stage="6"] .evidence-scroll').forEach(e=>e.setAttribute('aria-label','사고 대응 제품 화면. 옆으로 스크롤하여 확인하세요.'));
      const alts={'exact-source-page.png':'C1의 실제 제품 원문 화면. Notice 3쪽의 해당 문구가 노란색으로 표시돼 있습니다.','release-receipt-readback.png':'합성 로컬 처리 결과. 담당자 결정, 허용된 행동과 처리 확인 결과가 연결돼 있습니다.','decision-receipt.png':'원문 추적 정보와 검토 연결 정보를 보여주는 Audit 기록 화면 예시입니다.','impact-inventory.png':'합성 로컬 사고에서 영향을 받은 처리 기록 1건을 표시한 제품 화면입니다.','notification-boundary.png':'적용할 통보 기준이 확인되지 않아 책임 있는 담당자가 판단하도록 남긴 제품 화면입니다.','response-package.png':'합성 로컬 사고의 대응 기록과 해당 기록 식별정보를 확인한 제품 화면입니다.'};
      qa('img[alt]').forEach(e=>{const key=Object.keys(alts).find(k=>e.src.includes(k));if(key)e.alt=alts[key];});
    }
    q('[data-language-toggle]').textContent=local('한국어','English');
    q('[data-language-toggle]').setAttribute('aria-label',local('Switch to Korean','영어로 전환'));
    q('[data-close]').setAttribute('aria-label',local('Close detail','상세 화면 닫기'));
    document.title=local('Auxtho | From source review to a record you can reopen','Auxtho | 원문 검토부터 다시 열 수 있는 기록까지');
    q('meta[name="description"]').content=local('Follow a financial report through prepared source exceptions and a human decision, then inspect recorded product evidence of results, Audit history and reconstruction.','금융 보고서의 원문 검토와 담당자 결정을 체험하고, 처리 결과·과거 결정·재구성을 보여주는 검증된 제품 화면을 확인하세요.');
    render();
  }
  function decide(value) {
    if (state.stage !== 3 || state.decision) return;
    if (value === 'APPROVE' && (!state.corrected || !state.inspected)) return;
    state.decision=value;
    render();
    q('[data-example-record]').scrollIntoView({block:'center',behavior:'instant'});
    q('[data-after-decision]').focus({preventScroll:true});
  }
  function setCrop(kind) {
    q('.source-window').classList.toggle('wording',kind === 'wording');
    q('.source-window').scrollLeft=0;
    qa('[data-crop]').forEach((b) => b.setAttribute('aria-pressed',String(b.dataset.crop === kind)));
  }
  function node(tag, text, className) {
    const el=document.createElement(tag);
    if (text) el.textContent=text;
    if (className) el.className=className;
    return el;
  }
  function openDialog(kind) {
    state.returnFocus=document.activeElement;
    state.dialogKind=kind;
    const content=q('[data-dialog-content]');
    content.replaceChildren();
    if (evidence[kind]) {
      const ev=evidence[kind];
      q('#dialog-title').textContent=local(ev.title,{source:'C1 · Notice 3쪽',release:'보고서 전달 시험 · 처리 결과 기록',audit:'과거 검토 기록 · 예시 데이터 화면'}[kind]);
      const viewport=node('div',null,'image-full');
      viewport.tabIndex=0;
      viewport.setAttribute('role','region');
      viewport.setAttribute('aria-label',local('Full-size product evidence; scroll to inspect','원래 크기의 제품 증거. 스크롤하여 확인하세요.'));
      const img=node('img'); img.src=ev.src; img.alt=local(ev.alt,{source:'C1의 실제 제품 원문 화면. Notice 3쪽의 해당 문구가 노란색으로 표시돼 있습니다.',release:'합성 로컬 처리 결과. 담당자 결정, 허용된 행동과 처리 확인 결과가 연결돼 있습니다.',audit:'원문 추적 정보와 검토 연결 정보를 보여주는 Audit 기록 화면 예시입니다.'}[kind]);
      viewport.append(img);content.append(viewport);
      content.append(node('p',kind === 'source' ? t('originalContext') : kind === 'audit' ? t('auditProjection') : t('releaseCaption'),'small-note'));
    } else if (kind === 'changed') {
      q('#dialog-title').textContent=t('changedQuestion');
      if (state.decision !== 'APPROVE') {
        content.append(node('p',local('This branch requires an approved example version. Your held or rejected draft has no approval to reuse. Restart the example to choose an approval.','이 분기는 승인된 예시 버전이 있어야 합니다. 보류·거절한 초안에는 재사용할 승인이 없습니다. 처음부터 다시 시작해 승인을 선택할 수 있습니다.')));
      } else {
        content.append(node('p',local('Changed version requires a new review','변경본은 새 검토가 필요합니다'),'branch-status'));
        content.append(node('p',local('Interactive MAS example · the decision on version 1.1 remains a past decision. It does not authorise version 1.2.','MAS 검토 체험 · 버전 1.1에 대한 결정은 과거 결정으로 남으며 버전 1.2의 처리를 허용하지 않습니다.')));
        const compare=node('div',null,'two-columns');
        for (const [label,html] of [['1.1',copy().corrected],['1.2',copy().changed]]) {
          const card=node('article',null,'paper');
          card.append(node('h3',local('Version ','버전 ')+label));
          const quote=node('blockquote');quote.innerHTML=html;card.append(quote);compare.append(card);
        }
        content.append(compare);
        content.append(node('p',local('Prior decision cannot be reused. The reviewer must inspect and decide on the changed document.','이전 결정을 재사용할 수 없습니다. 담당자가 변경된 문서를 검토하고 새로 결정해야 합니다.')));
      }
    } else {
      q('#dialog-title').textContent=t('unknownQuestion');
      content.append(node('p',local('Result unconfirmed · UNKNOWN','처리 결과 미확인 · UNKNOWN'),'branch-status'));
      content.append(node('p',local('Separate frozen recovery case: the exact receipt is missing or does not match. Auxtho preserves the uncertainty and does not dispatch the action again automatically.','별도로 검증한 복구 사례입니다. 처리 확인 기록이 없거나 맞지 않으면 Auxtho는 결과를 미확인 상태로 남기고, 같은 요청을 자동으로 다시 실행하지 않습니다.')));
      content.append(node('p',local('UNKNOWN is not a confirmed failure or success. The accountable person determines how to reconcile the missing or conflicting evidence before any newly authorised action.','UNKNOWN은 아직 성공 여부를 확인할 수 없다는 뜻입니다. 담당자는 빠지거나 맞지 않는 기록을 확인한 뒤, 다음 처리를 허용할지 결정합니다.')));
      const steps=node('ol');
      for (const text of [local('Preserve the reviewed version, decision and permitted action.','검토본, 결정, 허용된 행동을 보존합니다.'),local('Record the missing or mismatched confirmation.','처리 확인 기록의 누락이나 불일치를 남깁니다.'),local('Prepare reconciliation without automatic retry.','자동 재시도 없이 확인·조정을 준비합니다.')]) steps.append(node('li',text));
      content.append(steps);
      const link=node('a',t('incidentProof'));link.href='/capabilities/incident-reconstruction-recovery/#recovery-case';content.append(link);
    }
    q('[data-dialog]').showModal();
    document.body.classList.add('dialog-open');
    q('[data-close]').focus();
  }
  q('[data-dialog]').addEventListener('close',() => {
    document.body.classList.remove('dialog-open');
    state.dialogKind=null;
    if (state.returnFocus?.isConnected) state.returnFocus.focus();
  });
  q('[data-dialog]').addEventListener('keydown',(event) => {
    if (event.key !== 'Tab') return;
    const dialog=q('[data-dialog]');
    const items=Array.from(dialog.querySelectorAll('button:not([disabled]),a[href],[tabindex="0"]')).filter(e=>e.getClientRects().length);
    const first=items[0],last=items[items.length-1];
    if (event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
    else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
  });
  q('[data-close]').addEventListener('click',() => q('[data-dialog]').close());
  q('[data-language-toggle]').addEventListener('click',() => setLanguage(state.language === 'en' ? 'ko':'en'));
  q('[data-start]').addEventListener('click',() => go(1));
  qa('[data-next]').forEach((b) => b.addEventListener('click',() => go(Number(b.dataset.next))));
  qa('[data-back]').forEach((b) => b.addEventListener('click',() => go(Number(b.dataset.back))));
  q('[data-reset]').addEventListener('click',reset);
  qa('[data-claim]').forEach((b) => b.addEventListener('click',() => {
    state.claim=b.dataset.claim;state.corrected=false;state.inspected=false;state.decision=null;state.auditOpen=false;
    q('[data-original-details]').open=state.claim === 'C1';render();
  }));
  q('[data-correct]').addEventListener('click',() => { if (state.stage === 3 && !state.decision) {state.corrected=true;render();} });
  q('[data-attest]').addEventListener('click',() => { if (!state.decision) {state.inspected=!state.inspected;render();} });
  q('[data-approve]').addEventListener('click',() => decide('APPROVE'));
  q('[data-hold]').addEventListener('click',() => decide('HOLD'));
  q('[data-reject]').addEventListener('click',() => decide('REJECT'));
  q('[data-open-audit]').addEventListener('click',() => {
    state.auditOpen=true;render();
    const region=q('[data-audit-figure] .evidence-scroll');
    region.focus({preventScroll:true});region.scrollIntoView({block:'center',behavior:'instant'});
  });
  qa('[data-result-view]').forEach(b=>b.addEventListener('click',()=>focusEvidenceField('result',b.dataset.resultView)));
  qa('[data-audit-view]').forEach(b=>b.addEventListener('click',()=>focusEvidenceField('audit',b.dataset.auditView)));
  q('[data-go-audit]').addEventListener('click',() => {state.auditOpen=true;go(5);});
  qa('[data-crop]').forEach((b) => b.addEventListener('click',() => setCrop(b.dataset.crop)));
  qa('[data-zoom]').forEach((b) => b.addEventListener('click',() => openDialog(b.dataset.zoom)));
  qa('[data-branch]').forEach((b) => b.addEventListener('click',() => openDialog(b.dataset.branch)));
  window.addEventListener('resize',()=>{
    if(state.stage===4) focusEvidenceField('result',state.resultView);
    if(state.stage===5 && state.auditOpen) focusEvidenceField('audit',state.auditView);
  });
  setLanguage(new URLSearchParams(window.location.search).get('lang') === 'ko' ? 'ko' : 'en');
})();
