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
      NEXT_DAY: { clip: 'p_nodata', title: '다음 수업일 준비', choices: [] },
      REST_SOFT: { clip: 'rest_skip', title: '편하게 쉬어가요', choices: [] },
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

  const FINAL_STAGES = ['DONE', 'REST', 'REST_SOFT', 'ETA_SHORT', 'BRIEF', 'BRIEF_BAG', 'QUIET_END', 'STOPPED', 'RULE_ONLY', 'RULE_END', 'NEXT_DAY'];
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

  function addDays(ymd, days) {
    const date = new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)) + days);
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  }

  function isSchoolDay(ymd, events) {
    const date = new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
    if (date.getDay() === 0 || date.getDay() === 6) return false;
    return !(events[ymd] || []).some(event => event.off);
  }

  function nextSchoolDay(ymd, events) {
    let next = addDays(ymd, 1);
    for (let i = 0; i < 14 && !isSchoolDay(next, events); i++) next = addDays(next, 1);
    return next;
  }

  // 그날이 학사일정 낱말에 맞는 일정에서 어떤 시점인지 찾는다.
  function eventTimings(words, ymd, events) {
    const has = day => (events[day] || []).find(event => hasAny(event.name, words));
    const today = has(ymd);
    const tomorrow = has(nextSchoolDay(ymd, events));
    if (today) return { name: today.name, timings: tomorrow ? ['당일'] : ['마지막날', '당일'] };
    if (tomorrow) return { name: tomorrow.name, timings: ['전날'] };
    for (let i = 2; i <= 7; i++) {
      const soon = has(addDays(ymd, i));
      if (soon) return { name: soon.name, timings: ['앞둔 기간'] };
    }
    return null;
  }

  // 교사 규칙표에서 지금 맞는 규칙 하나를 고른다. 순위 숫자가 작을수록 먼저다.
  function pickRule(rules, ctx) {
    const candidates = rules
      .filter(rule => rule.type !== 'question' && rule.levels.includes(ctx.level) && (rule.mode === 'both' || rule.mode === ctx.mode))
      .sort((a, b) => a.rank - b.rank || a.id - b.id);
    for (const rule of candidates) {
      const found = eventTimings(rule.words, ctx.ymd, ctx.events);
      if (found && found.timings.includes(rule.when)) return { ...rule, eventName: found.name };
    }
    return null;
  }

  function pickQuestion(rules, subjects, level) {
    const found = rules
      .filter(rule => rule.type === 'question' && rule.levels.includes(level) && subjects.includes(rule.subject))
      .sort((a, b) => a.rank - b.rank || a.id - b.id)[0];
    return found ? found.title : '오늘 가장 기대되는 시간은 언제야?';
  }

  // 규칙 대화의 단계. 말이 표에서 오므로 FLOWS에 적지 않고 규칙으로 만든다.
  function ruleStep(stage, rule, missing, missingClip) {
    const firstSentence = rule.last.split(/(?<=[.?!])\s/)[0];
    if (stage === 'RULE_END') return { clips: [...(missing ? [missingClip] : []), rule.lastClip], title: firstSentence || rule.title, choices: [] };
    if (stage === 'RULE_ONLY') return { clips: rule.type === 'notice' ? [rule.firstClip, rule.lastClip] : [rule.firstClip], title: rule.title, choices: [] };
    if (rule.type === 'confirm') return { clips: [rule.firstClip], title: rule.title, choices: ['다 챙겼어', '깜빡했어'], listen: 'grammar' };
    return { clips: [rule.firstClip], title: rule.title, choices: ['다 말했어', '쉬고 싶어'], listen: 'free' };
  }

  // 시간표 과목 이름을 조각 음원으로 바꾼다. 음원이 없는 과목은 건너뛴다. 길어지지 않게 넷까지만 말한다.
  function subjectClips(subjects, data) {
    const clips = subjects.map(subject => {
      const name = subject.replace(/[^가-힣]/g, '');
      const found = data.subjects.find(item => name.startsWith(item.word));
      return found ? found.clip : '';
    }).filter(Boolean);
    return [...new Set(clips)].slice(0, 4);
  }

  function spokenMinutes(minutes) {
    const whole = Math.max(1, Math.round(minutes));
    if (whole <= 30) return whole;
    return whole <= 60 ? Math.round(whole / 5) * 5 : null;
  }

  function etaClips(mode, minutes, data) {
    const spoken = minutes === null || minutes === undefined ? null : spokenMinutes(minutes);
    if (!spoken) return [];
    const parts = [data.extras[mode === 'morning' ? 'p_to_school' : 'p_to_home'], data.extras[`n_${spoken}`], data.extras.p_left];
    return parts.every(Boolean) ? parts : [];
  }

  // 첫 질문 앞에 붙이는 말: 남은 시간과 오늘 시간표. 조각이 하나라도 없으면 그 말은 하지 않는다.
  function intro(mode, ctx, data) {
    if (ctx.tier === 'arrive' || ctx.tier === 'brief' || (ctx.memory && ctx.memory.rest)) return [];
    const eta = etaClips(mode, ctx.etaMinutes, data);
    if (mode !== 'morning' || ctx.tier !== 'full' || ctx.rule || !ctx.subjects) return eta;
    const subjects = subjectClips(ctx.subjects, data);
    const { p_today: today, p_have: have } = data.extras;
    return subjects.length && today && have ? [...eta, today, ...subjects, have] : eta;
  }

  // 수업이 없는 날: 다음 수업일을 미리 알려 주고 묻지는 않는다.
  function nextDayStep(plan, rule, data) {
    const { extras } = data;
    if (!plan) return { clips: [extras.p_nodata], title: '학교 정보를 확인해요', choices: [] };
    const day = extras[`p_day_${plan.weekday}`];
    if (rule) return { clips: [day, extras.p_event, extras.p_check], title: `${plan.label} ${rule.eventName}`, choices: [] };
    const subjects = subjectClips(plan.subjects, data);
    const lesson = subjects.length ? [...subjects, extras.p_have] : [];
    return { clips: [day, ...lesson, plan.hasPe ? extras.p_pe_ready : '', extras.p_check], title: `${plan.label} 준비`, choices: [] };
  }

  function start(mode, ctx) {
    const memory = ctx.memory || {};
    if (ctx.nextDay && mode === 'morning') return 'NEXT_DAY';
    if (ctx.rule) {
      if (ctx.tier === 'arrive') return 'ETA_SHORT';
      if (mode === 'afternoon' && memory.rest) return 'REST';
      if (ctx.rule.type === 'notice') return 'RULE_ONLY';
      const story = ctx.rule.type === 'story';
      if (ctx.tier === 'brief' || memory.rest) {
        if (!story) return 'RULE_ONLY';
        if (mode === 'afternoon') return 'ETA_SHORT';
        return !ctx.school || ctx.hasPe ? 'BRIEF' : 'BRIEF_BAG';
      }
      return 'RULE_FIRST';
    }
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
    if (stage === 'RULE_FIRST') {
      if (answer === '쉬고 싶어') return { stage: 'REST', remember: { rest: true } };
      return { stage: 'RULE_END', missing: answer === '깜빡했어' };
    }
    const result = mode === 'morning' ? nextMorning(stage, answer, ctx) : nextAfternoon(stage, answer, ctx);
    return { ...result, stage: clamp(mode, result.stage, ctx) };
  }

  // 질문을 건너뛴다. 답을 지어내지 않고 다음 단계로만 넘어간다.
  function skip(mode, stage, ctx) {
    if (stage === 'RULE_FIRST') return 'RULE_END';
    if (mode === 'morning') return clamp(mode, stage === 'PREP' ? 'SUBJECT_TODAY' : 'DONE', ctx);
    return clamp(mode, stage === 'PARENT_BRIDGE' ? afternoonEnd(ctx) : 'PARENT_BRIDGE', ctx);
  }

  // 듣기 방식: ''은 듣지 않음, 'free'는 자유 인식, 그 외는 인식 후보 목록(JSON).
  function listenSpec(mode, stage, choices, rule) {
    const step = stage === 'RULE_FIRST' ? { listen: rule.type === 'confirm' ? 'grammar' : 'free' } : FLOWS[mode] && FLOWS[mode][stage];
    if (!step || !step.listen) return '';
    if (step.listen === 'free') return 'free';
    const words = stage === 'PREP' || stage === 'RULE_FIRST' ? PREP_WORDS
      : [...choices, ...choices.map(choice => `${choice} 이 기대 돼`), '책'];
    return JSON.stringify([...new Set([...words, ...COMMON_WORDS])]);
  }

  // 인식 결과를 대화의 답으로 바꾼다. reference는 후보 없이 자유롭게 들은 결과로,
  // 엉뚱한 말이 후보에 억지로 끼워 맞춰지지 않았는지 확인하는 데 쓴다.
  function interpret(givenStage, text, reference, choices, rule) {
    const stage = givenStage === 'RULE_FIRST' ? (rule.type === 'confirm' ? 'PREP' : 'AFTER_EVENT') : givenStage;
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

  const Journey = { flows: FLOWS, tierFor, isDone, isQuiet, start, next, skip, listenSpec, interpret, pickRule, pickQuestion, ruleStep, nextSchoolDay, isSchoolDay, intro, nextDayStep, subjectClips };
  root.Journey = Journey;
  if (typeof module !== 'undefined') module.exports = Journey;
})(typeof window !== 'undefined' ? window : globalThis);
