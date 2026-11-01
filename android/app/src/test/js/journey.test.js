const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Journey = require('../../main/assets/dait-journey.js');
const data = require('../../main/assets/dait-rules.js');
const { rules } = data;

const full = { tier: 'full', school: true, hasPe: true, memory: {} };
let page; // 화면 코드 안에서 식을 계산한다. 아래 '끝까지 실행' 시험이 준비한다.

// 무엇을 불러도 빈 값을 돌려주는 가짜 화면 요소
function fakeElement() {
  const target = function () { return element; };
  const element = new Proxy(target, {
    get: (_, key) => (key === Symbol.toPrimitive ? () => '' : key === 'length' ? 0 : element),
    set: () => true,
    has: () => true
  });
  return element;
}

test('화면 코드가 끝까지 실행되고 시작 화면을 그린다', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../main/assets/dait-preview.html'), 'utf8');
  const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
  const element = fakeElement();
  const stage = { innerHTML: '' };
  const sandbox = {
    Journey, DAIT_RULES: data, console: { log() {} }, URLSearchParams, performance,
    setTimeout: () => 0, clearTimeout: () => {}, fetch: () => new Promise(() => {}),
    localStorage: {
      values: new Map(),
      getItem(key) { return this.values.has(key) ? this.values.get(key) : null; },
      setItem(key, value) { this.values.set(key, value); },
      removeItem(key) { this.values.delete(key); }
    },
    navigator: { userAgent: '' },
    document: {
      getElementById: id => (id === 'stageArea' ? stage : element),
      querySelector: () => null, querySelectorAll: () => [], body: element
    }
  };
  sandbox.window = Object.assign(sandbox, { location: { href: 'http://localhost/' } });
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  page = source => vm.runInContext(source, sandbox);
  assert.ok(stage.innerHTML.includes('학교를 등록해 주세요'));
  assert.strictEqual(typeof sandbox.setDrivingMode, 'function');
});

test('주차 중에 들어 본 대화는 나중의 다른 주행에 문 열림 말을 남기지 않는다', () => {
  page(`startFlow('morning'); goHome(); window.setDrivingMode(true); window.setDrivingMode(false);`);
  assert.strictEqual(page('tripForDoor'), null);
  page(`syncJourney();`);
  assert.strictEqual(page('journeyActive'), false);
});

test('신호 대기로 잠깐 멈췄다 다시 달리면 주차 시각을 지운다', () => {
  page(`startFlow('morning'); window.setDrivingMode(true); window.setDrivingMode(false);`);
  assert.ok(page('tripForDoor.parkedAt') > 0);
  page(`window.setDrivingMode(true);`);
  assert.strictEqual(page('tripForDoor.parkedAt'), 0);
  page(`window.setDrivingMode(false); window.onDoorOpened();`);
  assert.strictEqual(page('tripForDoor'), null);
  page(`goHome();`);
});

test('대화를 끝까지 마친 등교도 2분 전에 준비물을 확인하고, 그 뒤에는 반복하지 않는다', () => {
  page(`startFlow('morning'); stage = 'DONE'; speechPhase = 'idle'; demoMinutes = 2; applyNaviEta();`);
  assert.strictEqual(page('stage'), 'ETA_SHORT');
  page(`speechPhase = 'idle'; applyNaviEta(); demoMinutes = null; goHome();`);
});

test('2분 전에도 가족 대화는 끊지 않고, 도착하면 인사한다', () => {
  page(`startFlow('afternoon'); stage = 'PARENT_BRIDGE'; speechPhase = 'idle'; demoMinutes = 2; applyNaviEta();`);
  assert.strictEqual(page('stage'), 'PARENT_BRIDGE');
  page(`finishOnArrival();`);
  assert.strictEqual(page('stage'), 'DONE');
  page(`startFlow('afternoon'); stage = 'ETA_SHORT'; speechPhase = 'idle'; finishOnArrival();`);
  assert.strictEqual(page('stage'), 'DONE');
  page(`demoMinutes = null; goHome();`);
});

test('기어 D로 세운 채 문이 열려도 도착 직전이면 말하고, 달리는 중이면 말하지 않는다', () => {
  page(`startFlow('morning'); window.setDrivingMode(true); demoMinutes = 8; window.onDoorOpened();`);
  assert.ok(page('tripForDoor'));
  page(`demoMinutes = 2; window.onDoorOpened();`);
  assert.strictEqual(page('tripForDoor'), null);
  page(`demoMinutes = null; window.setDrivingMode(false); goHome();`);
});

test('앞 경로가 끝났다는 신호가 새 경로를 지우지 않는다', () => {
  page(`window.onNaviUpdate(JSON.stringify({ event: 'routeStarted', name: '학교', remainTime: 600, remainDistance: 3000 }));
        window.onNaviUpdate(JSON.stringify({ event: 'routeEnded' }));`);
  assert.strictEqual(page('naviInfo.name'), '학교');
  page(`naviInfo = null;`);
});

test('좌표를 배울 때는 이름만 비슷한 곳을 같은 곳으로 보지 않는다', () => {
  assert.strictEqual(page(`isSamePlace({ name: '피자집', address: '' }, { name: '집', address: '' })`), false);
  assert.strictEqual(page(`isSamePlace({ name: '중앙초등학교', address: '부산 동구 초량동' }, { name: '중앙초등학교', address: '서울특별시 중구 정동길 1' })`), false);
  assert.strictEqual(page(`isSamePlace({ name: '중앙초등학교', address: '중구 정동' }, { name: '중앙초등학교', address: '서울특별시 중구 정동길 1' })`), true);
  assert.strictEqual(page(`placeMatches({ name: '피자집', address: '' }, { name: '집', address: '' })`), false);
  assert.strictEqual(page(`placeMatches({ name: '목포유달중학교 정문', address: '' }, { name: '목포유달중학교', address: '' })`), true);
});

test('이름 없는 집 즐겨찾기는 쓰지 않고, 지운 집은 되살리지 않는다', () => {
  page(`learnFromNavi([{ name: '', address: '', lat: 0, lng: 0, category: 'HOME' }]);`);
  assert.strictEqual(page('homePlace'), null);
  page(`learnFromNavi([{ name: '우리집', address: '', lat: 37.5, lng: 127, category: 'HOME' }]);`);
  assert.strictEqual(page('homePlace.name'), '우리집');
  page(`clearHome(); learnFromNavi([{ name: '우리집', address: '', lat: 37.5, lng: 127, category: 'HOME' }]);`);
  assert.strictEqual(page('homePlace'), null);
});

test('일정 이름에 든 꺾쇠를 그대로 화면에 넣지 않는다', () => {
  const stageText = page(`
    schoolDays = {}; school = { name: 'A', kind: '중학교', grade: '1' };
    const when = toYmd(new Date());
    schoolDays[when] = { subjects: ['국어'], meal: '' };
    schoolEvents = { [when]: [{ name: '<b>시험', off: false }] };
    startFlow('morning');
    const shown = document.getElementById('stageArea').innerHTML;
    goHome(); school = null; schoolDays = {}; schoolEvents = {};
    shown`);
  assert.ok(!stageText.includes('<b>시험'));
});

test('쉬는 날에는 할 말이 없는 하교 대화 버튼을 보여 주지 않는다', () => {
  const shown = page(`
    school = { name: 'A', kind: '중학교', grade: '1' };
    schoolDays = { [toYmd(new Date())]: { subjects: [], meal: '' } }; schoolEvents = {};
    goHome();
    const html = document.getElementById('stageArea').innerHTML;
    school = null; schoolDays = {};
    html`);
  assert.ok(shown.includes('가 볼 만한 곳'));
  assert.ok(!shown.includes('하교 대화'));
});

test('시간표 카드의 과목 이름은 두 글자로 줄인다', () => {
  assert.strictEqual(page(`shortSubject('국어')`), '국어');
  assert.strictEqual(page(`shortSubject('기술·가정')`), '기술');
  assert.strictEqual(page(`shortSubject('자율·자치활동')`), '자율');
  assert.strictEqual(page(`shortSubject('진로와 직업')`), '진로');
});

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

test('수업이 없던 날 집에 갈 때는 학교 이야기를 묻지 않는다', () => {
  assert.strictEqual(Journey.start('afternoon', { ...full, nextDay: true }), 'SILENT');
});

test('번호가 붙은 과목도 오늘의 질문을 찾는다', () => {
  assert.strictEqual(Journey.pickQuestion(rules, ['체육①'], '중'), '체육 시간에 해 보고 싶은 게 있어?');
});

test('쉬는 날로 표시된 일정은 시험 말을 하지 않는다', () => {
  const off = { 20261110: [{ name: '3학년 시험', off: true }] };
  assert.strictEqual(Journey.pickRule(rules, { mode: 'morning', level: '중', ymd: '20261110', events: off }), null);
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
  assert.strictEqual(Journey.start('afternoon', { ...full, memory: { subject: '수학' } }), 'AFTER_SUBJECT');
  const step = Journey.subjectStep('수학', data);
  assert.strictEqual(step.title, '아침에 고른 수학, 어땠어요?');
  assert.deepStrictEqual(step.clips.map(clip => clip.replace(/^temp\//, '')), ['p_after_pick', 's_2', 'p_after_how']);
  assert.deepStrictEqual(Journey.subjectStep('시민과 사회정의', data).clips, ['afternoon_welcome']);
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

test('후보 낱말 밖의 거절도 알아듣는다', () => {
  assert.strictEqual(Journey.interpret('PREP', '<UNK>', '귀찮아', []).kind, 'quiet');
  assert.strictEqual(Journey.interpret('AFTER_EVENT', '싫어요', '싫어요', []).kind, 'quiet');
  assert.strictEqual(Journey.interpret('AFTER_EVENT', '말 안 해', '말 안 해', []).kind, 'quiet');
  assert.strictEqual(Journey.interpret('AFTER_EVENT', '숙제 안 했 어', '숙제 안 했어', []).kind, 'answer');
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

test('토요일에 목요일 시험을 월요일 일정으로 말하지 않는다', () => {
  const finals = { 20261210: [{ name: '2학기 기말고사', off: false }] };
  const rule = Journey.pickRule(rules, { mode: 'morning', level: '중', ymd: '20261207', events: finals });
  assert.strictEqual(rule.when, '앞둔 기간');
  assert.strictEqual(rule.eventYmd, '20261210');
});

test('시험이 하루 걸러 이어지면 끝났다고 말하지 않는다', () => {
  const split = { 20261207: [exam], 20261209: [exam] };
  const at = ymd => Journey.pickRule(rules, { mode: 'afternoon', level: '중', ymd, events: split }).name;
  assert.strictEqual(at('20261207'), '시험 기간 하교');
  assert.strictEqual(at('20261209'), '시험 끝나는 날 하교');
});

test('일정 이름의 띄어쓰기가 달라도 찾고, 학교평가는 시험이 아니다', () => {
  const sports = { 20261110: [{ name: '체육 대회', off: false }] };
  assert.strictEqual(Journey.pickRule(rules, { mode: 'morning', level: '초', ymd: '20261110', events: sports }).name, '체육대회 당일 등교');
  const evaluation = { 20261110: [{ name: '학교평가', off: false }] };
  assert.strictEqual(Journey.pickRule(rules, { mode: 'morning', level: '초', ymd: '20261110', events: evaluation }), null);
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
  const monday = { ...plan, ymd: '20261207' };
  const exam = Journey.nextDayStep(monday, { eventName: '2차 시험', eventYmd: '20261207' }, data);
  assert.strictEqual(exam.title, '월요일 2차 시험');
  assert.deepStrictEqual(exam.clips.map(clipName), ['p_day_1', 'p_event', 'p_check']);
  const later = Journey.nextDayStep(monday, { eventName: '기말고사', eventYmd: '20261210' }, data);
  assert.strictEqual(later.title, '월요일 준비');
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

// ---- 다니는 길 기억 ----
const openTrip = patch => ({ ymd: '20261102', day: 1, min: 500, end: 515, from: 'home', last: 'school', door: true, chosen: '', ...patch });
const trip = patch => ({ ymd: '20261026', day: 1, min: 490, end: 510, from: 'home', to: 'school', door: true, kind: 'go', ...patch });

test('좌표를 집·학교·그 밖으로만 나눈다', () => {
  const spots = { home: { lat: 37.5, lng: 127 }, school: { lat: 37.52, lng: 127 } };
  assert.strictEqual(Journey.placeLabel({ lat: 37.501, lng: 127 }, spots), 'home');
  assert.strictEqual(Journey.placeLabel({ lat: 37.519, lng: 127 }, spots), 'school');
  assert.strictEqual(Journey.placeLabel({ lat: 37.51, lng: 127 }, spots), 'other');
  assert.strictEqual(Journey.placeLabel(null, spots), '');
  assert.strictEqual(Journey.placeLabel({ lat: 37.5, lng: 127 }, {}), 'other');
});

test('가까운 집과 학교는 더 가까운 쪽으로 본다', () => {
  const spots = { home: { lat: 37.5, lng: 127 }, school: { lat: 37.502, lng: 127 } };
  assert.strictEqual(Journey.placeLabel({ lat: 37.5001, lng: 127 }, spots), 'home');
  assert.strictEqual(Journey.placeLabel({ lat: 37.5019, lng: 127 }, spots), 'school');
});

test('기록에는 구분과 10분 단위 시간만 남고 좌표는 없다', () => {
  const record = Journey.finishTrip(openTrip({ min: 503, end: 517 }));
  assert.deepStrictEqual(Object.keys(record).sort(), ['day', 'door', 'end', 'from', 'kind', 'min', 'to', 'ymd']);
  assert.strictEqual(record.min, 500);
  assert.strictEqual(record.end, 520);
  assert.strictEqual(record.kind, 'go');
});

test('출발지를 모르거나 제자리인 여정은 남기지 않는다', () => {
  assert.strictEqual(Journey.finishTrip(openTrip({ from: '' })), null);
  assert.strictEqual(Journey.finishTrip(openTrip({ last: '' })), null);
  assert.strictEqual(Journey.finishTrip(openTrip({ last: 'home' })), null);
});

test('아침에 학교에서 아이 쪽 문이 열려야 등교로 기록한다', () => {
  assert.strictEqual(Journey.finishTrip(openTrip({ door: false })).kind, '');
  assert.strictEqual(Journey.finishTrip(openTrip({ min: 800 })).kind, '');
});

test('내려 준 직후 학교를 떠나는 길은 하교가 아니고, 데리러 갔다 나오는 길은 하교다', () => {
  const dropped = { ymd: '20261102', end: 510, kind: 'go' };
  assert.strictEqual(Journey.finishTrip(openTrip({ min: 520, from: 'school', last: 'other' }), dropped).kind, '');
  assert.strictEqual(Journey.finishTrip(openTrip({ min: 870, from: 'school', last: 'other' }), dropped).kind, 'back');
  const pickup = { ymd: '20261102', end: 860, kind: '' };
  assert.strictEqual(Journey.finishTrip(openTrip({ min: 870, from: 'school', last: 'home' }), pickup).kind, 'back');
});

test('보호자가 고른 대화가 장소 판단보다 먼저다', () => {
  assert.strictEqual(Journey.finishTrip(openTrip({ from: 'other', last: 'home', chosen: 'afternoon' })).kind, 'back');
  assert.strictEqual(Journey.finishTrip(openTrip({ from: 'home', last: 'other', door: false, chosen: 'morning' })).kind, 'go');
});

test('같은 요일 비슷한 시간에 세 번 이상 반복되면 패턴으로 본다', () => {
  const now = { from: 'home', day: 1, min: 500 };
  assert.strictEqual(Journey.patternFor([trip(), trip()], now), null);
  assert.strictEqual(Journey.patternFor([trip(), trip(), trip()], now), 'morning');
  assert.strictEqual(Journey.patternFor([trip(), trip(), trip()], { ...now, min: 600 }), null);
  assert.strictEqual(Journey.patternFor([trip(), trip(), trip()], { ...now, from: 'other' }), null);
});

test('요일마다 다르면 그 요일 기록을 따른다', () => {
  const tuesdays = [1, 2, 3].map(() => trip({ day: 2, to: 'other', door: false, kind: '' }));
  const mondays = [1, 2, 3].map(() => trip());
  assert.strictEqual(Journey.patternFor([...tuesdays, ...mondays], { from: 'home', day: 1, min: 500 }), 'morning');
  assert.strictEqual(Journey.patternFor([...tuesdays, ...mondays], { from: 'home', day: 2, min: 500 }), null);
});

test('같은 요일 기록이 적으면 요일을 합쳐 다섯 번 이상일 때 본다', () => {
  const mixed = [1, 2, 3, 4].map(day => trip({ day }));
  assert.strictEqual(Journey.patternFor(mixed, { from: 'home', day: 5, min: 500 }), null);
  assert.strictEqual(Journey.patternFor([...mixed, trip({ day: 4 })], { from: 'home', day: 5, min: 500 }), 'morning');
});

test('등교와 다른 길이 섞여 뚜렷하지 않으면 판단하지 않는다', () => {
  const half = [trip(), trip(), trip({ to: 'other', door: false, kind: '' }), trip({ to: 'other', door: false, kind: '' })];
  assert.strictEqual(Journey.patternFor(half, { from: 'home', day: 1, min: 500 }), null);
});

test('학교 앞이면 오전에 일찍 끝나도 하교로 보고, 막 내려 준 뒤에는 판단하지 않는다', () => {
  const base = { place: 'school', trips: [], ymd: '20261102', day: 1, min: 690 };
  assert.strictEqual(Journey.guessMode(base), 'afternoon');
  const dropped = { ymd: '20261102', end: 510, kind: 'go' };
  assert.strictEqual(Journey.guessMode({ ...base, min: 520, last: dropped }), null);
  assert.strictEqual(Journey.guessMode({ ...base, min: 690, last: dropped }), 'afternoon');
  assert.strictEqual(Journey.guessMode({ ...base, place: '' }), null);
});

test('아침 등교 시간에는 학교에 있어도 학교에서 나와도 하교로 보지 않는다', () => {
  const base = { place: 'school', trips: [], ymd: '20261102', day: 1 };
  assert.strictEqual(Journey.guessMode({ ...base, min: 495 }), null);
  assert.strictEqual(Journey.guessMode({ ...base, min: 505 }), null);
  assert.strictEqual(Journey.finishTrip(openTrip({ min: 500, from: 'school', last: 'other', door: false })).kind, '');
});

test('지각해 내려 준 직후는 하교가 아니다', () => {
  const dropped = { ymd: '20261102', end: 590, kind: 'go' };
  assert.strictEqual(Journey.guessMode({ place: 'school', trips: [], ymd: '20261102', day: 1, min: 600, last: dropped }), null);
  assert.strictEqual(Journey.finishTrip(openTrip({ min: 600, from: 'school', last: 'other' }), dropped).kind, '');
});

test('오전 늦게 데리러 가서 문이 열려도 등교가 아니고, 그 뒤 나오는 길은 하교다', () => {
  const pickup = Journey.finishTrip(openTrip({ min: 640, end: 660, from: 'other', last: 'school' }));
  assert.strictEqual(pickup.kind, '');
  assert.strictEqual(Journey.guessMode({ place: 'school', trips: [pickup], last: pickup, ymd: '20261102', day: 1, min: 665 }), 'afternoon');
  assert.strictEqual(Journey.finishTrip(openTrip({ min: 665, from: 'school', last: 'home' }), pickup).kind, 'back');
});

test('켜지 않으면 달려도 아무것도 기록하지 않고 시간대로 판단한다', () => {
  page(`forgetTrips(); localStorage.removeItem(TRIP_MEMORY_KEY); window.onCarLocation(37.5, 127); window.setDrivingMode(true); window.setDrivingMode(false);`);
  assert.strictEqual(page('tripOpen'), null);
  assert.strictEqual(page('trips.length'), 0);
  assert.strictEqual(page('tripGuess(new Date())'), null);
});

test('집에서 학교까지 달리고 문이 열리면 등교로 기록하고 좌표는 저장하지 않는다', () => {
  page(`writeStored(TRIP_MEMORY_KEY, true);
    tripSpots = { home: { lat: 37.5, lng: 127 }, school: { lat: 37.52, lng: 127 } };
    window.onCarLocation(37.5, 127); window.setDrivingMode(true);
    tripOpen.min = 490; window.onCarLocation(37.52, 127); window.setDrivingMode(false); window.onDoorOpened();`);
  assert.strictEqual(page('trips.length'), 1);
  assert.strictEqual(page('trips[0].kind'), 'go');
  assert.strictEqual(page('tripOpen'), null);
  const stored = page(`localStorage.getItem(TRIPS_KEY)`);
  assert.ok(!stored.includes('37.5') && !stored.includes('127'));
});

test('교문 앞에서 주차하지 않고 내려도 등교를 마감하고 다음 여정을 학교에서 시작한다', () => {
  page(`forgetTrips(); window.onCarLocation(37.5, 127); window.setDrivingMode(true); tripOpen.min = 490;
    window.onCarLocation(37.52, 127); window.onDoorOpened();`);
  assert.strictEqual(page('trips[0].kind'), 'go');
  assert.strictEqual(page('tripOpen.from'), 'school');
  assert.strictEqual(page('tripOpen.chosen'), '');
});

test('신호 대기는 같은 여정으로 이어지고 오래 멈추면 다음 출발 때 마감한다', () => {
  page(`forgetTrips(); window.setDrivingMode(false); window.onCarLocation(37.5, 127); window.setDrivingMode(true); window.onCarLocation(37.51, 127);
    window.setDrivingMode(false); window.setDrivingMode(true);`);
  assert.strictEqual(page('tripOpen.from'), 'home');
  assert.strictEqual(page('trips.length'), 0);
  page(`window.setDrivingMode(false); tripOpen.parkedAt = Date.now() - STOP_GAP_MS - 1; window.setDrivingMode(true);`);
  assert.strictEqual(page('trips.length'), 1);
  assert.strictEqual(page('tripOpen.from'), 'other');
});

test('위치가 끊기면 옛 위치를 지금 위치로 믿지 않는다', () => {
  page(`forgetTrips(); window.setDrivingMode(false); window.onCarLocation(37.5, 127); window.setDrivingMode(true); carFixAt = 1;`);
  assert.strictEqual(page('freshPlace()'), '');
  page(`window.onDoorOpened(); window.setDrivingMode(false); tripOpen.parkedAt = 1; window.setDrivingMode(true);`);
  assert.strictEqual(page('tripOpen.from'), '');
  assert.strictEqual(page('trips.length'), 0);
  page(`startedOld = tripOpen.startedAt = 1; window.onCarLocation(37.51, 127);`.replace('startedOld = ', ''));
  assert.strictEqual(page('tripOpen.from'), '');
  page(`window.setDrivingMode(false); forgetTrips();`);
});

test('내비가 앱을 덮어 위치가 끊겨도 도착 신호와 문 열림으로 등교를 마감한다', () => {
  page(`window.onCarLocation(37.5, 127); school = { name: '다잇초등학교', address: '서울 산정로 171', kind: '초등학교' };
    window.onNaviUpdate(JSON.stringify({ event: 'destination', name: '다잇초등학교', address: '서울 산정로 171', remainTime: 300, remainDistance: 2000 }));
    window.setDrivingMode(true); tripOpen.min = 490; carFixAt = 1;
    window.onNaviUpdate(JSON.stringify({ event: 'status', status: 'IDLE' }));
    window.onNaviUpdate(JSON.stringify({ event: 'arrived', name: '다잇초등학교' }));
    window.onDoorOpened();`);
  assert.strictEqual(page('trips[0].kind'), 'go');
  assert.strictEqual(page('trips[0].to'), 'school');
  assert.strictEqual(page('tripOpen.from'), 'school');
  page(`window.setDrivingMode(false); forgetTrips(); school = null; naviInfo = null; goHome();`);
});

test('달리는 동안에는 시간이 지나도 판단이 바뀌지 않는다', () => {
  page(`forgetTrips(); window.onCarLocation(37.52, 127); window.setDrivingMode(true); tripOpen.min = 505; tripOpen.from = 'school';`);
  assert.strictEqual(page(`tripGuess(new Date(2026, 10, 2, 9, 5))`), null);
  assert.strictEqual(page(`tripGuess(new Date(2026, 10, 2, 10, 0))`), null);
  page(`window.setDrivingMode(false); forgetTrips();`);
});

test('집을 새 목적지로 바꾸면 옛 위치와 기록을 지운다', () => {
  page(`homePlace = null; tripSpots.home = { lat: 1, lng: 1 }; trips = [{ ymd: '20261102' }];
    naviInfo = { name: '새집아파트', address: '서울 새집로 1' }; saveHomeFromNavi();`);
  assert.strictEqual(page('tripSpots.home === undefined'), true);
  assert.strictEqual(page('trips.length'), 0);
  assert.strictEqual(page('homePlace.name'), '새집아파트');
  page(`clearHome(); naviInfo = null; writeStored(HOME_CLEARED_KEY, false); tripSpots = { home: { lat: 37.5, lng: 127 }, school: { lat: 37.52, lng: 127 } }; goHome();`);
});

test('켜기 전에 무엇을 남기는지 먼저 보여 주고, 취소하면 켜지지 않는다', () => {
  page(`writeStored(TRIP_MEMORY_KEY, false); openSettings(); toggleTripMemory();`);
  assert.strictEqual(page('settings.step'), 'memory');
  assert.strictEqual(page('tripMemoryOn()'), false);
  page(`cancelTripMemory();`);
  assert.strictEqual(page('tripMemoryOn()'), false);
  page(`toggleTripMemory(); confirmTripMemory();`);
  assert.strictEqual(page('tripMemoryOn()'), true);
  page(`goHome();`);
});

test('기억을 끄면 기록과 지정한 위치를 모두 지운다', () => {
  page(`writeStored(TRIPS_KEY, [{ ymd: '20261102' }]); trips = readStored(TRIPS_KEY); settings = {}; toggleTripMemory();`);
  assert.strictEqual(page('tripMemoryOn()'), false);
  assert.strictEqual(page('trips.length'), 0);
  assert.strictEqual(page('Object.keys(tripSpots).length'), 0);
  assert.strictEqual(page('carSpot'), null);
  page(`window.setDrivingMode(false); goHome();`);
});

test('앱을 켠 직후 고른 대화도 출발한 여정의 답으로 남는다', () => {
  page(`writeStored(TRIP_MEMORY_KEY, true); forgetTrips(); window.setDrivingMode(true); window.setDrivingMode(false); startFlow('morning'); window.setDrivingMode(true);`);
  assert.strictEqual(page('tripOpen.chosen'), 'morning');
  page(`window.setDrivingMode(false); goHome(); writeStored(TRIP_MEMORY_KEY, false); forgetTrips();`);
});
