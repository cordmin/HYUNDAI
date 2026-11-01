const test = require('node:test');
const assert = require('node:assert');
const Journey = require('../../main/assets/dait-journey.js');
const data = require('../../main/assets/dait-rules.js');
const { rules } = data;

const full = { tier: 'full', school: true, hasPe: true, memory: {} };

test('남은 시간을 기획안 표의 네 구간으로 나눈다', () => {
  assert.deepStrictEqual([null, 12, 10, 9.9, 5, 4.9, 2.1, 2, 0].map(Journey.tierFor),
    ['full', 'full', 'full', 'medium', 'medium', 'brief', 'brief', 'arrive', 'arrive']);
});

test('10분 이상이면 준비 확인과 질문을 끝까지 한다', () => {
  assert.strictEqual(Journey.start('morning', full), 'PREP');
  assert.strictEqual(Journey.next('morning', 'PREP', '다 챙겼어', full).stage, 'SUBJECT');
  const subject = Journey.next('morning', 'SUBJECT', '과학', full);
  assert.strictEqual(subject.stage, 'SCIENCE_DETAIL');
  assert.deepStrictEqual(subject.remember, { subject: '과학' });
  assert.strictEqual(Journey.next('morning', 'SCIENCE_DETAIL', '우주', full).stage, 'DONE');
});

test('5~10분이면 짧은 질문까지만 한다', () => {
  const medium = { ...full, tier: 'medium' };
  assert.strictEqual(Journey.start('morning', medium), 'PREP');
  const subject = Journey.next('morning', 'SUBJECT', '과학', medium);
  assert.strictEqual(subject.stage, 'DONE');
  assert.deepStrictEqual(subject.remember, { subject: '과학' });
  assert.strictEqual(Journey.next('afternoon', 'AFTER_EVENT', '피구 했어', medium).stage, 'PARENT_BRIDGE');
});

test('2~5분이면 질문 없이 준비 안내 하나만 한다', () => {
  const brief = { ...full, tier: 'brief' };
  assert.strictEqual(Journey.start('morning', brief), 'BRIEF');
  assert.strictEqual(Journey.start('morning', { ...brief, hasPe: false }), 'BRIEF_BAG');
  assert.strictEqual(Journey.start('afternoon', brief), 'ETA_SHORT');
  assert.ok(Journey.isDone('BRIEF'));
});

test('2분 이하면 새 질문 없이 마무리한다', () => {
  const arrive = { ...full, tier: 'arrive' };
  assert.strictEqual(Journey.start('morning', arrive), 'ETA_SHORT');
  assert.strictEqual(Journey.next('morning', 'PREP', '다 챙겼어', arrive).stage, 'ETA_SHORT');
  assert.strictEqual(Journey.skip('morning', 'PREP', arrive), 'ETA_SHORT');
});

test('달리는 중에 하교 대화를 마칠 때는 도착 인사를 하지 않는다', () => {
  const driving = { ...full, driving: true };
  assert.strictEqual(Journey.next('afternoon', 'PARENT_BRIDGE', '오늘도 수고했어', driving).stage, 'STOPPED');
  assert.strictEqual(Journey.next('afternoon', 'PARENT_BRIDGE', '오늘도 수고했어', full).stage, 'DONE');
  assert.strictEqual(Journey.skip('afternoon', 'AFTER_DETAIL', driving), 'PARENT_BRIDGE');
  assert.strictEqual(Journey.skip('afternoon', 'PARENT_BRIDGE', driving), 'STOPPED');
  assert.strictEqual(Journey.next('afternoon', 'AFTER_EVENT', '피구 했어', { ...driving, tier: 'brief' }).stage, 'ETA_SHORT');
});

test('아침에 쉬겠다고 한 날은 하교에 묻지 않고, 등교는 준비 안내만 한다', () => {
  assert.strictEqual(Journey.start('afternoon', { ...full, memory: { rest: true } }), 'REST');
  assert.strictEqual(Journey.start('morning', { ...full, memory: { rest: true } }), 'BRIEF');
});

test('가족 설정에서 질문을 끄면 준비 안내만 하고 하교에는 조용히 간다', () => {
  const off = { ...full, noQuestions: true };
  assert.strictEqual(Journey.start('morning', off), 'BRIEF');
  assert.strictEqual(Journey.start('afternoon', off), 'SILENT');
  assert.ok(Journey.isDone('SILENT'));
  assert.deepStrictEqual(Journey.intro('morning', { ...off, etaMinutes: 12, subjects: ['국어'] }, data), []);
});

test('아침에 고른 과목으로 하교 대화를 시작한다', () => {
  assert.strictEqual(Journey.start('afternoon', { ...full, memory: { subject: '체육' } }), 'AFTER_PE');
  assert.strictEqual(Journey.start('afternoon', { ...full, memory: { subject: '과학' } }), 'AFTER_SCIENCE');
  assert.strictEqual(Journey.start('afternoon', full), 'AFTER_EVENT');
});

test('시간표와 달랐다는 답을 받아들이고 가족에게 넘긴다', () => {
  assert.strictEqual(Journey.next('afternoon', 'AFTER_PE', '시간표랑 달랐어', full).stage, 'AFTER_CHANGED');
  assert.strictEqual(Journey.next('afternoon', 'AFTER_CHANGED', '만들기 했어', full).stage, 'PARENT_BRIDGE');
  assert.strictEqual(Journey.next('afternoon', 'PARENT_BRIDGE', '오늘도 수고했어', full).stage, 'DONE');
});

test('준비물 답을 말로 알아듣는다', () => {
  const choices = Journey.flows.morning.PREP.choices;
  assert.strictEqual(Journey.interpret('PREP', '체육복 챙겼 어', '체육복 챙겼어', choices).answer, '다 챙겼어');
  assert.strictEqual(Journey.interpret('PREP', '응', '응', choices).answer, '다 챙겼어');
  assert.strictEqual(Journey.interpret('PREP', '아직 안 챙겼 어', '아직 안 챙겼어', choices).answer, '깜빡했어');
  assert.strictEqual(Journey.interpret('PREP', '체육복 없어', '체육복 없어', choices).answer, '깜빡했어');
});

test('엉뚱한 말이 후보에 끼워 맞춰지면 받지 않는다', () => {
  const choices = Journey.flows.morning.PREP.choices;
  assert.strictEqual(Journey.interpret('PREP', '챙겼 어', '오늘 날씨가 좋네', choices).kind, 'unclear');
  assert.strictEqual(Journey.interpret('PREP', '<UNK>', '오늘 날씨', choices).kind, 'unclear');
  assert.strictEqual(Journey.interpret('PREP', '', '', choices).kind, 'unclear');
  assert.strictEqual(Journey.interpret('PREP', '그만', '오늘 날씨', choices).kind, 'unclear');
});

test('시간표에서 고른 과목을 말로 알아듣는다', () => {
  const choices = ['수학', '국어', '미술'];
  assert.strictEqual(Journey.interpret('SUBJECT_TODAY', '미술 이 기대 돼', '미술이 기대돼', choices).answer, '미술');
  assert.strictEqual(Journey.interpret('SUBJECT_TODAY', '책', '책', choices).answer, '국어');
  assert.strictEqual(Journey.interpret('SUBJECT_TODAY', '체육', '체육', choices).kind, 'unclear');
});

test('쉬고 싶다거나 다시 말해 달라는 말을 알아듣는다', () => {
  assert.strictEqual(Journey.interpret('PREP', '쉬고 싶어', '쉬고 싶어', []).kind, 'quiet');
  assert.strictEqual(Journey.interpret('AFTER_EVENT', '오늘은 피곤해', '오늘은 피곤해', []).kind, 'quiet');
  assert.strictEqual(Journey.interpret('PREP', '다시 말해줘', '다시 말해줘', []).kind, 'repeat');
});

test('속상한 이야기에는 더 묻지 않는다', () => {
  assert.strictEqual(Journey.interpret('AFTER_EVENT', '친구 랑 싸웠 어', '친구랑 싸웠어', []).kind, 'sad');
});

test('하교 이야기는 자유롭게 듣고, 시간표와 달랐다는 말을 찾는다', () => {
  assert.strictEqual(Journey.interpret('AFTER_EVENT', '친구 랑 피구 했 어', '친구랑 피구 했어', []).kind, 'answer');
  assert.strictEqual(Journey.interpret('AFTER_PE', '체육 취소 됐 어', '체육 취소 됐어', []).answer, '시간표랑 달랐어');
  assert.strictEqual(Journey.interpret('AFTER_EVENT', '응', '응', []).kind, 'unclear');
});

test('에뮬레이터 음성 인식이 실제로 낸 결과를 바르게 판단한다', () => {
  const prep = Journey.flows.morning.PREP.choices;
  assert.strictEqual(Journey.interpret('PREP', '응 체육복 챙겼 어', '은 체육복 쟁 겠어', prep).answer, '다 챙겼어');
  assert.strictEqual(Journey.interpret('PREP', '아직 안 챙겼 어', '한 직판 챙겨 겠어', prep).answer, '깜빡했어');
  assert.strictEqual(Journey.interpret('SUBJECT', '과학', '과학 이다', ['체육', '과학', '독서']).answer, '과학');
  assert.strictEqual(Journey.interpret('AFTER_EVENT', '진군 한 이고 했어', '진군 한 이고 했어', []).kind, 'answer');
  assert.strictEqual(Journey.interpret('PREP', '말하기 싫어', '오닐 은 말하기 싫어', prep).kind, 'quiet');
  assert.strictEqual(Journey.interpret('PREP', '싶어 그만 체육복 챙겼 어', '각 표 근처 의 반지 비석', prep).kind, 'unclear');
});

test('단계별로 듣는 방식을 고른다', () => {
  assert.strictEqual(Journey.listenSpec('morning', 'DONE', []), '');
  assert.strictEqual(Journey.listenSpec('afternoon', 'PARENT_BRIDGE', ['오늘도 수고했어']), '');
  assert.strictEqual(Journey.listenSpec('afternoon', 'AFTER_EVENT', []), 'free');
  const words = JSON.parse(Journey.listenSpec('morning', 'SUBJECT_TODAY', ['수학', '미술']));
  assert.ok(words.includes('수학') && words.includes('미술 이 기대 돼') && words.includes('<UNK>') && words.includes('그만'));
});

// 목포유달중 2026학년도 실제 학사일정의 일부
const exam = { name: '2차 시험', off: false };
const events = {
  20261107: [{ name: '토요휴업일', off: true }],
  20261202: [exam], 20261203: [exam], 20261204: [exam],
  20261223: [{ name: '유달축제', off: false }],
  20261225: [{ name: '성탄절', off: true }]
};
const pick = (mode, ymd, level = '중') => Journey.pickRule(rules, { mode, level, ymd, events });

test('시험 날 아침에는 사인펜과 시계를 확인한다', () => {
  const rule = pick('morning', '20261202');
  assert.strictEqual(rule.name, '시험 당일 등교');
  assert.ok(rule.first.includes('컴퓨터용 사인펜') && rule.first.includes('디지털시계'));
  assert.strictEqual(rule.prep, '컴퓨터용 사인펜');
  assert.strictEqual(rule.eventName, '2차 시험');
});

test('시험 기간의 날마다 말이 달라진다', () => {
  assert.strictEqual(pick('afternoon', '20261202').name, '시험 기간 하교');
  assert.strictEqual(pick('afternoon', '20261204').name, '시험 끝나는 날 하교');
  assert.strictEqual(pick('morning', '20261204').name, '시험 당일 등교');
  assert.strictEqual(pick('afternoon', '20261201').name, '시험 전날 하교');
  assert.strictEqual(pick('morning', '20261201').name, '시험 전날 등교');
  assert.strictEqual(pick('morning', '20261127').name, '시험 앞둔 기간 등교');
  assert.strictEqual(pick('afternoon', '20261126').name, '시험 앞둔 기간 하교');
});

test('시험과 먼 날에는 시험 규칙이 나오지 않는다', () => {
  assert.strictEqual(pick('morning', '20261110'), null);
  assert.strictEqual(pick('morning', '20261207'), null);
});

test('금요일에는 다음 수업일인 월요일 일정을 전날로 본다', () => {
  const monday = { 20261207: [exam] };
  assert.strictEqual(Journey.pickRule(rules, { mode: 'afternoon', level: '중', ymd: '20261204', events: monday }).name, '시험 전날 하교');
});

test('쉬는 날을 건너뛰고 다음 수업일을 찾는다', () => {
  assert.strictEqual(Journey.nextSchoolDay('20261224', events), '20261228');
  assert.strictEqual(Journey.isSchoolDay('20261225', events), false);
  assert.strictEqual(Journey.isSchoolDay('20261202', events), true);
});

test('학교급에 맞는 규칙만 고른다', () => {
  assert.strictEqual(pick('morning', '20261202', '초').name, '시험 당일 등교(초등)');
  assert.strictEqual(Journey.pickRule(rules, { mode: 'afternoon', level: '초', ymd: '20261204', events }), null);
  assert.strictEqual(pick('morning', '20261223').name, '축제 당일 등교');
});

test('체험학습처럼 시험이 아닌 일정도 고른다', () => {
  const trip = { 20261110: [{ name: '2학년 현장체험학습', off: false }] };
  const at = (mode, ymd) => Journey.pickRule(rules, { mode, level: '초', ymd, events: trip }).name;
  assert.strictEqual(at('afternoon', '20261109'), '현장체험학습 전날 하교');
  assert.strictEqual(at('morning', '20261110'), '현장체험학습 당일 등교');
  assert.strictEqual(at('afternoon', '20261110'), '현장체험학습 당일 하교');
});

test('시험 날 대화: 확인 → 격려로 끝나고 수업 질문을 하지 않는다', () => {
  const rule = pick('morning', '20261202');
  const ctx = { ...full, rule };
  assert.strictEqual(Journey.start('morning', ctx), 'RULE_FIRST');
  const end = Journey.next('morning', 'RULE_FIRST', '다 챙겼어', ctx);
  assert.deepStrictEqual([end.stage, end.missing], ['RULE_END', false]);
  assert.ok(Journey.isDone('RULE_END'));
  assert.strictEqual(Journey.next('morning', 'RULE_FIRST', '깜빡했어', ctx).missing, true);
  const step = Journey.ruleStep('RULE_END', rule, true, 'rule_missing');
  assert.strictEqual(step.clips[0], 'rule_missing');
  assert.strictEqual(step.title, '지금까지 준비한 만큼만 보여 주면 충분해요.');
});

test('규칙 대화도 남은 시간과 쉬기를 따른다', () => {
  const rule = pick('morning', '20261202');
  assert.strictEqual(Journey.start('morning', { ...full, rule, tier: 'brief' }), 'RULE_ONLY');
  assert.strictEqual(Journey.start('morning', { ...full, rule, tier: 'arrive' }), 'ETA_SHORT');
  assert.strictEqual(Journey.start('morning', { ...full, rule, memory: { rest: true } }), 'RULE_ONLY');
  const story = pick('afternoon', '20261204');
  assert.strictEqual(Journey.start('afternoon', { ...full, rule: story, tier: 'brief' }), 'ETA_SHORT');
  assert.strictEqual(Journey.start('afternoon', { ...full, rule: story, memory: { rest: true } }), 'REST');
  const notice = pick('afternoon', '20261202');
  assert.strictEqual(Journey.start('afternoon', { ...full, rule: notice }), 'RULE_ONLY');
});

test('학교마다 다른 일정 이름도 규칙이 잡는다', () => {
  const closing = { 20261231: [{ name: '겨울방학선언', off: false }] };
  const at = mode => Journey.pickRule(rules, { mode, level: '중', ymd: '20261231', events: closing }).name;
  assert.strictEqual(at('morning'), '방학식 등교');
  assert.strictEqual(at('afternoon'), '방학식 하교');
});

test('규칙 대화의 답을 말로 알아듣는다', () => {
  const confirm = pick('morning', '20261202');
  assert.strictEqual(Journey.interpret('RULE_FIRST', '챙겼 어', '챙겼어', [], confirm).answer, '다 챙겼어');
  assert.strictEqual(Journey.interpret('RULE_FIRST', '아직', '아직', [], confirm).answer, '깜빡했어');
  const story = pick('afternoon', '20261204');
  assert.strictEqual(Journey.interpret('RULE_FIRST', '게임 하고 싶어', '게임 하고 싶어', [], story).kind, 'answer');
  assert.strictEqual(Journey.interpret('RULE_FIRST', '시험 망쳐서 속상 해', '시험 망쳐서 속상해', [], story).kind, 'sad');
  assert.strictEqual(Journey.listenSpec('morning', 'RULE_FIRST', [], story), 'free');
  assert.ok(JSON.parse(Journey.listenSpec('morning', 'RULE_FIRST', [], confirm)).includes('챙겼 어'));
});

test('오늘의 질문은 규칙표에서 고른다', () => {
  assert.strictEqual(Journey.pickQuestion(rules, ['국어', '과학'], '중'), '오늘 과학 시간엔 뭐가 궁금해?');
  assert.strictEqual(Journey.pickQuestion(rules, ['기술·가정'], '중'), '오늘 가장 기대되는 시간은 언제야?');
});

test('규칙표의 모든 대화 규칙에 음성이 있다', () => {
  rules.filter(rule => rule.type !== 'question').forEach(rule => {
    assert.ok(rule.firstClip, rule.name);
    if (rule.last) assert.ok(rule.lastClip, rule.name);
  });
});

const clipName = clip => clip.replace(/^temp\//, '');

test('실제 시간표의 과목 이름을 조각 음원으로 바꾼다', () => {
  const names = data.subjects.reduce((all, item) => ({ ...all, [clipName(item.clip)]: item.word }), {});
  const spoken = Journey.subjectClips(['도덕', '기술·가정', '역사①', '시민과 사회정의', '수학Ⅰ', '진로와 직업'], data).map(clip => names[clipName(clip)]);
  assert.deepStrictEqual(spoken, ['도덕', '기술가정', '역사', '수학']);
});

test('같은 과목이 두 시간 있어도 한 번만 말한다', () => {
  assert.strictEqual(Journey.subjectClips(['수학', '수학', '국어'], data).length, 2);
});

test('아침 첫 말에 남은 시간과 오늘 시간표를 붙인다', () => {
  const words = clips => clips.map(clipName);
  const ctx = { ...full, etaMinutes: 11.6, subjects: ['국어', '체육'] };
  assert.deepStrictEqual(words(Journey.intro('morning', ctx, data)), ['p_to_school', 'n_12', 'p_left', 'p_today', 's_1', 's_6', 'p_have']);
  assert.deepStrictEqual(words(Journey.intro('morning', { ...ctx, tier: 'medium' }, data)), ['p_to_school', 'n_12', 'p_left']);
  assert.deepStrictEqual(Journey.intro('morning', { ...ctx, tier: 'brief' }, data), []);
  assert.deepStrictEqual(words(Journey.intro('afternoon', ctx, data)), ['p_to_home', 'n_12', 'p_left']);
  assert.deepStrictEqual(words(Journey.intro('morning', { ...ctx, etaMinutes: null }, data)), ['p_today', 's_1', 's_6', 'p_have']);
  assert.deepStrictEqual(words(Journey.intro('morning', { ...ctx, etaMinutes: 37 }, data)).slice(0, 2), ['p_to_school', 'n_35']);
  assert.deepStrictEqual(words(Journey.intro('morning', { ...ctx, etaMinutes: 90, subjects: [] }, data)), []);
  assert.deepStrictEqual(words(Journey.intro('morning', { ...ctx, rule: { type: 'confirm' } }, data)), ['p_to_school', 'n_12', 'p_left']);
  assert.deepStrictEqual(Journey.intro('morning', { ...ctx, memory: { rest: true } }, data), []);
});

test('수업이 없는 날은 다음 수업일을 알려 주고 묻지 않는다', () => {
  assert.strictEqual(Journey.start('morning', { ...full, nextDay: true }), 'NEXT_DAY');
  assert.ok(Journey.isDone('NEXT_DAY'));
  const plan = { weekday: 1, label: '월요일', subjects: ['국어', '체육'], hasPe: true };
  const words = Journey.nextDayStep(plan, null, data).clips.map(clipName);
  assert.deepStrictEqual(words, ['p_day_1', 's_1', 's_6', 'p_have', 'p_pe_ready', 'p_check']);
  const exam = Journey.nextDayStep(plan, { eventName: '2차 시험' }, data);
  assert.strictEqual(exam.title, '월요일 2차 시험');
  assert.deepStrictEqual(exam.clips.map(clipName), ['p_day_1', 'p_event', 'p_check']);
  assert.deepStrictEqual(Journey.nextDayStep(null, null, data).clips.map(clipName), ['p_nodata']);
});

test('모든 단계의 음원과 문구가 비어 있지 않다', () => {
  for (const mode of ['morning', 'afternoon']) {
    for (const [name, step] of Object.entries(Journey.flows[mode])) {
      assert.ok(step.title && (step.clip || name === 'SILENT'), `${mode}.${name}`);
      assert.strictEqual(Journey.isDone(name), step.choices.length === 0, `${mode}.${name}`);
    }
  }
});
