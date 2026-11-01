// 여정 규칙: 남은 시간별 분량, 대화 단계, 아이의 말 해석.
// 화면과 소리는 dait-preview.html이 맡고, 여기는 화면 없이 시험할 수 있는 판단만 둔다.
(function (root) {
  const FLOWS = {
    morning: {
      PREP: { clip: 'talk_prepare', title: '체육복 챙겼나요?', choices: ['다 챙겼어', '깜빡했어', '가방에 있어'], listen: 'grammar' },
      SUBJECT: { clip: 'talk_ready', title: '어떤 수업이 기대돼요?', choices: ['체육', '과학', '독서'], listen: 'grammar' },
      SUBJECT_MISSING: { clip: 'talk_missing', title: '어떤 수업이 기대돼요?', choices: ['체육', '과학', '독서'], listen: 'grammar' },
      SUBJECT_TODAY: { clip: 'morning_question', title: '어떤 수업이 기대돼요?', choices: ['체육', '과학', '독서'], listen: 'grammar' },
      SCIENCE_DETAIL: { clip: 'school_science', title: '무엇이 궁금해요?', choices: ['우주가 궁금해', '실험이 기대돼', '다녀올게요'], listen: 'free' },
      READING_DETAIL: { clip: 'school_reading', title: '기억나는 이야기 있어?', choices: ['주인공이 멋졌어', '마법 이야기', '다녀올게요'], listen: 'free' },
      BRIEF: { clip: 'morning_short', title: '체육복을 확인해요', choices: [] },
      BRIEF_BAG: { clip: 'arrival_bag', title: '가방과 준비물을 챙겨요', choices: [] },
      ETA_SHORT: { clip: 'arrival_bag', title: '가방과 준비물을 챙겨요', choices: [] },
      REST: { clip: 'rest_tired', title: '편하게 쉬어요', choices: [] },
      QUIET_END: { clip: 'rest_later', title: '원할 때 이어가요', choices: [] },
      DONE: { clip: 'arrival_goodbye', title: '잘 다녀와요!', choices: [] }
    },
    afternoon: {
      AFTER_EVENT: { clip: 'afternoon_welcome', title: '오늘은 어땠어요?', choices: ['친구랑 피구 했어', '그림 그렸어', '쉬고 싶어'], listen: 'free' },
      AFTER_PE: { clip: 'afternoon_pe', title: '아침에 기대한 체육, 어땠어요?', choices: ['재밌었어', '시간표랑 달랐어', '쉬고 싶어'], listen: 'free' },
      AFTER_SCIENCE: { clip: 'afternoon_welcome', title: '아침에 궁금해한 과학, 어땠어요?', choices: ['재밌었어', '시간표랑 달랐어', '쉬고 싶어'], listen: 'free' },
      AFTER_DETAIL: { clip: 'listen_ack', title: '조금 더 들려줄래요?', choices: ['재밌었어', '시간표랑 달랐어', '가족에게 물어볼래'], listen: 'free' },
      AFTER_CHANGED: { clip: 'afternoon_changed', title: '시간표와 달랐군요', choices: ['만들기 했어', '책 읽었어', '가족에게 물어볼래'], listen: 'free' },
      // 가족에게 대화를 넘기는 단계라 다잇은 듣지 않는다.
      PARENT_BRIDGE: { clip: 'listen_parent', title: '가족의 하루도 들어볼까요?', choices: ['오늘도 수고했어'] },
      ETA_SHORT: { clip: 'eta_short', title: '곧 도착해요', choices: [] },
      REST: { clip: 'rest_tired', title: '편하게 쉬어요', choices: [] },
      REST_SOFT: { clip: 'rest_skip', title: '편하게 쉬어가요', choices: [] },
      QUIET_END: { clip: 'rest_later', title: '원할 때 이어가요', choices: [] },
      STOPPED: { clip: 'control_stop', title: '안내를 멈출게요', choices: [] },
      DONE: { clip: 'arrival_home', title: '집에 도착했어요!', choices: [] }
    }
  };

  const FINAL_STAGES = ['DONE', 'REST', 'REST_SOFT', 'ETA_SHORT', 'BRIEF', 'BRIEF_BAG', 'QUIET_END', 'STOPPED'];
  const QUESTION_STAGES_AFTER = ['AFTER_EVENT', 'AFTER_PE', 'AFTER_SCIENCE'];
  const QUIET_WORDS = ['그만', '쉬고', '쉴래', '쉬자', '피곤', '말하기싫', '하기싫', '귀찮', '안할래'];
  const SAD_WORDS = ['속상', '슬퍼', '슬펐', '싸웠', '싫었', '힘들'];
  const CHANGED_WORDS = ['다르', '달라', '달랐', '안했', '취소', '바뀌'];
  const MISSING_WORDS = ['아직', '안챙', '못챙', '안가져', '없어', '아니', '깜빡'];
  const READY_WORDS = ['챙', '가져', '있어', '맞아'];
  const PREP_EVIDENCE = ['챙', '챈', '체육복', '아직', '아니', '가져', '깜빡', '없어', '있어'];
  const SHORT_YES = ['응', '네', '예'];

  // 말 인식 후보. '챙겼 어'처럼 띄어 쓴 것은 음성 인식 모델의 낱말 단위다.
  const COMMON_WORDS = ['다시 말해줘', '그만', '쉬고 싶어', '말하기 싫어', '피곤해', '<UNK>'];
  const PREP_WORDS = ['응', '네', '예', '챙겼 어', '다 챙겼 어', '응 체육복 챙겼 어', '체육복 챙겼 어', '아직', '아니',
    '안 챙겼 어', '아직 안 챙겼 어', '아직 못 챙겼 어', '깜빡 했 어', '가져왔 어', '안 가져왔 어', '체육복 없어', '가방 에 있어'];

  const compact = text => String(text || '').replace(/\s/g, '');
  const hasAny = (text, words) => words.some(word => text.includes(word));

  // 기획안 '남은 시간에 맞춘 안내 분량' 표. 남은 시간을 모르면 줄이지 않는다.
  function tierFor(minutes) {
    if (minutes === null || minutes === undefined) return 'full';
    if (minutes <= 2) return 'arrive';
    if (minutes < 5) return 'brief';
    if (minutes < 10) return 'medium';
    return 'full';
  }

  function isDone(stage) {
    return FINAL_STAGES.includes(stage);
  }

  function isQuiet(text) {
    return hasAny(compact(text), QUIET_WORDS);
  }

  function start(mode, ctx) {
    const memory = ctx.memory || {};
    if (mode === 'afternoon') {
      if (memory.rest) return 'REST';
      if (ctx.tier === 'arrive' || ctx.tier === 'brief') return 'ETA_SHORT';
      if (memory.subject === '체육') return 'AFTER_PE';
      if (memory.subject === '과학') return 'AFTER_SCIENCE';
      return 'AFTER_EVENT';
    }
    if (ctx.tier === 'arrive') return 'ETA_SHORT';
    if (memory.rest || ctx.tier === 'brief') return !ctx.school || ctx.hasPe ? 'BRIEF' : 'BRIEF_BAG';
    return ctx.school && !ctx.hasPe ? 'SUBJECT_TODAY' : 'PREP';
  }

  // 답하는 사이에 도착이 가까워졌으면 새 질문을 하지 않는다.
  function clamp(mode, stage, ctx) {
    if (isDone(stage)) return stage;
    if (ctx.tier === 'arrive') return 'ETA_SHORT';
    if (ctx.tier === 'brief') return mode === 'morning' ? 'DONE' : 'ETA_SHORT';
    return stage;
  }

  // 하교의 DONE은 도착 인사이므로 달리는 중에 대화를 마칠 때는 쓰지 않는다.
  function afternoonEnd(ctx) {
    return ctx.driving ? 'STOPPED' : 'DONE';
  }

  function nextMorning(stage, answer, ctx) {
    if (stage === 'PREP') return { stage: answer === '깜빡했어' ? 'SUBJECT_MISSING' : 'SUBJECT' };
    if (stage === 'SUBJECT' || stage === 'SUBJECT_MISSING' || stage === 'SUBJECT_TODAY') {
      const remember = { subject: answer };
      if (ctx.tier !== 'full') return { stage: 'DONE', remember };
      if (answer === '과학') return { stage: 'SCIENCE_DETAIL', remember };
      if (answer === '독서' || answer === '국어') return { stage: 'READING_DETAIL', remember };
      return { stage: 'DONE', remember };
    }
    return { stage: 'DONE' };
  }

  function nextAfternoon(stage, answer, ctx) {
    if (answer === '쉬고 싶어') return { stage: 'REST', remember: { rest: true } };
    const changed = answer === '시간표랑 달랐어';
    if (QUESTION_STAGES_AFTER.includes(stage) || stage === 'AFTER_DETAIL') {
      if (ctx.tier !== 'full') return { stage: 'PARENT_BRIDGE' };
      if (changed) return { stage: 'AFTER_CHANGED' };
      return { stage: stage === 'AFTER_DETAIL' ? 'PARENT_BRIDGE' : 'AFTER_DETAIL' };
    }
    if (stage === 'AFTER_CHANGED') return { stage: 'PARENT_BRIDGE' };
    return { stage: afternoonEnd(ctx) };
  }

  function next(mode, stage, answer, ctx) {
    const result = mode === 'morning' ? nextMorning(stage, answer, ctx) : nextAfternoon(stage, answer, ctx);
    return { ...result, stage: clamp(mode, result.stage, ctx) };
  }

  // 질문을 건너뛴다. 답을 지어내지 않고 다음 단계로만 넘어간다.
  function skip(mode, stage, ctx) {
    if (mode === 'morning') return clamp(mode, stage === 'PREP' ? 'SUBJECT_TODAY' : 'DONE', ctx);
    return clamp(mode, stage === 'PARENT_BRIDGE' ? afternoonEnd(ctx) : 'PARENT_BRIDGE', ctx);
  }

  // 듣기 방식: ''은 듣지 않음, 'free'는 자유 인식, 그 외는 인식 후보 목록(JSON).
  function listenSpec(mode, stage, choices) {
    const step = FLOWS[mode] && FLOWS[mode][stage];
    if (!step || !step.listen) return '';
    if (step.listen === 'free') return 'free';
    const words = stage === 'PREP' ? PREP_WORDS
      : [...choices, ...choices.map(choice => `${choice} 이 기대 돼`), '책'];
    return JSON.stringify([...new Set([...words, ...COMMON_WORDS])]);
  }

  // 인식 결과를 대화의 답으로 바꾼다. reference는 후보 없이 자유롭게 들은 결과로,
  // 엉뚱한 말이 후보에 억지로 끼워 맞춰지지 않았는지 확인하는 데 쓴다.
  function interpret(stage, text, reference, choices) {
    const value = compact(text);
    const free = compact(reference);
    if (!value || value.includes('<UNK>')) return { kind: 'unclear' };
    if (hasAny(value, QUIET_WORDS)) return hasAny(free, QUIET_WORDS) ? { kind: 'quiet' } : { kind: 'unclear' };
    if (value.includes('다시')) return free.includes('다시') ? { kind: 'repeat' } : { kind: 'unclear' };

    if (stage === 'PREP') {
      if (!hasAny(free, PREP_EVIDENCE) && !SHORT_YES.includes(free)) return { kind: 'unclear' };
      if (hasAny(value, MISSING_WORDS)) return { kind: 'answer', answer: '깜빡했어' };
      if (hasAny(value, READY_WORDS) || SHORT_YES.includes(value)) return { kind: 'answer', answer: '다 챙겼어' };
      return { kind: 'unclear' };
    }
    if (stage === 'SUBJECT' || stage === 'SUBJECT_MISSING' || stage === 'SUBJECT_TODAY') {
      const picked = choices.find(choice => value.includes(compact(choice)) && free.includes(compact(choice)));
      if (picked) return { kind: 'answer', answer: picked };
      const book = value.includes('책') && free.includes('책') && choices.find(choice => choice === '독서' || choice === '국어');
      return book ? { kind: 'answer', answer: book } : { kind: 'unclear' };
    }
    // 자유 이야기는 인식이 부정확하므로 내용을 화면에 옮기지 않는다(heard: '').
    if (QUESTION_STAGES_AFTER.includes(stage) || stage === 'AFTER_DETAIL' || stage === 'AFTER_CHANGED') {
      if (hasAny(value, SAD_WORDS)) return { kind: 'sad' };
      if (stage !== 'AFTER_CHANGED' && hasAny(value, CHANGED_WORDS)) return { kind: 'answer', answer: '시간표랑 달랐어' };
      return value.length >= (QUESTION_STAGES_AFTER.includes(stage) ? 3 : 2) ? { kind: 'answer', answer: value, heard: '' } : { kind: 'unclear' };
    }
    return value.length >= 2 ? { kind: 'answer', answer: value, heard: '' } : { kind: 'unclear' };
  }

  const Journey = { flows: FLOWS, tierFor, isDone, isQuiet, start, next, skip, listenSpec, interpret };
  root.Journey = Journey;
  if (typeof module !== 'undefined') module.exports = Journey;
})(typeof window !== 'undefined' ? window : globalThis);
