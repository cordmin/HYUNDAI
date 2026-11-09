// 하교 대화 규칙: 남은 시간별 분량과 대화 단계. 답은 화면의 버튼으로만 받는다.
// 화면과 소리는 dait-app.js가 맡고, 여기는 화면 없이 시험할 수 있는 판단만 둔다.
(function (root) {
  const FLOWS = {
    afternoon: {
      AFTER_EVENT: { clip: 'afternoon_welcome', title: '오늘은 어땠어요?', choices: ['친구랑 피구 했어', '그림 그렸어', '쉬고 싶어'] },
      AFTER_DETAIL: { clip: 'listen_ack', title: '조금 더 들려줄래요?', choices: ['재밌었어', '가족에게 물어볼래'] },
      PARENT_BRIDGE: { clip: 'listen_parent', title: '가족의 하루도 들어볼까요?', choices: ['오늘도 수고했어'] },
      ETA_SHORT: { clip: 'eta_short', title: '곧 도착해요', choices: [] },
      REST: { clip: 'rest_tired', title: '편하게 쉬어요', choices: [] },
      QUIET_END: { clip: 'rest_later', title: '원할 때 이어가요', choices: [] },
      SILENT: { clip: '', title: '조용히 함께 가요', choices: [] },
      STOPPED: { clip: 'control_stop', title: '안내를 멈출게요', choices: [] },
      DONE: { clip: 'arrival_home', title: '집에 도착했어요!', choices: [] }
    }
  };

  const FINAL_STAGES = ['DONE', 'REST', 'ETA_SHORT', 'QUIET_END', 'STOPPED', 'SILENT'];

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

  function start(ctx) {
    if (ctx.noQuestions) return 'SILENT';
    if (ctx.tier === 'arrive' || ctx.tier === 'brief') return 'ETA_SHORT';
    return 'AFTER_EVENT';
  }

  // 답하는 사이에 도착이 가까워졌으면 새 질문을 하지 않는다.
  function clamp(stage, ctx) {
    if (isDone(stage)) return stage;
    return ctx.tier === 'arrive' || ctx.tier === 'brief' ? 'ETA_SHORT' : stage;
  }

  // DONE은 도착 인사이므로 달리는 중에 대화를 마칠 때는 쓰지 않는다.
  function end(ctx) {
    return ctx.driving ? 'STOPPED' : 'DONE';
  }

  function next(stage, answer, ctx) {
    if (answer === '쉬고 싶어') return 'REST';
    if (stage === 'AFTER_EVENT') return clamp(ctx.tier === 'full' ? 'AFTER_DETAIL' : 'PARENT_BRIDGE', ctx);
    if (stage === 'AFTER_DETAIL') return clamp('PARENT_BRIDGE', ctx);
    return end(ctx);
  }

  // 질문을 건너뛴다. 답을 지어내지 않고 다음 단계로만 넘어간다.
  function skip(stage, ctx) {
    return clamp(stage === 'PARENT_BRIDGE' ? end(ctx) : 'PARENT_BRIDGE', ctx);
  }

  const Journey = { flows: FLOWS, tierFor, isDone, start, next, skip };
  root.Journey = Journey;
  if (typeof module !== 'undefined') module.exports = Journey;
})(typeof window !== 'undefined' ? window : globalThis);
