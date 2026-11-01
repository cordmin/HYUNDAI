const test = require('node:test');
const assert = require('node:assert');
const Journey = require('../../main/assets/dait-journey.js');

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

test('모든 단계의 음원과 문구가 비어 있지 않다', () => {
  for (const mode of ['morning', 'afternoon']) {
    for (const [name, step] of Object.entries(Journey.flows[mode])) {
      assert.ok(step.clip && step.title, `${mode}.${name}`);
      assert.strictEqual(Journey.isDone(name), step.choices.length === 0, `${mode}.${name}`);
    }
  }
});
