const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Journey = require('../../main/assets/dait-journey.js');
const data = require('../../main/assets/dait-rules.js');
const Lesson = require('../../main/assets/dait-lesson.js');
const APP_LESSONS = require('../../main/assets/dait-lessons.js');
const DAIT_LESSONS = APP_LESSONS.filter(item => item.id !== 'rhythm');
const { rules } = data;

const full = { tier: 'full', school: true, hasPe: true, memory: {} };
function navHtml() { return page("document.getElementById('pearlNav').innerHTML"); }
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
  const nav = { innerHTML: '' };
  const sandbox = {
    DaitPlayback: require('../../main/assets/dait-playback.js'), Journey, DAIT_RULES: data, Lesson, DAIT_LESSONS, console: { log() {} }, URLSearchParams, performance,
    setTimeout: () => 0, clearTimeout: () => {}, fetch: () => new Promise(() => {}),
    localStorage: {
      values: new Map(),
      getItem(key) { return this.values.has(key) ? this.values.get(key) : null; },
      setItem(key, value) { this.values.set(key, value); },
      removeItem(key) { this.values.delete(key); }
    },
    navigator: { userAgent: '' },
    document: {
      getElementById: id => (id === 'stageArea' ? stage : id === 'pearlNav' ? nav : element),
      querySelector: () => null, querySelectorAll: () => [], body: element
    }
  };
  sandbox.window = Object.assign(sandbox, { location: { href: 'http://localhost/' } });
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  page = source => vm.runInContext(source, sandbox);
  assert.ok(stage.innerHTML.includes('question-title'));
  assert.ok(nav.innerHTML.includes('기록'));
  assert.ok(!stage.innerHTML.includes('등교 대화'));
  assert.strictEqual(typeof sandbox.setDrivingMode, 'function');
});

test('주차 중에 들어 본 대화는 나중의 다른 주행에 문 열림 말을 남기지 않는다', () => {
  page(`startFlow('afternoon'); goHome(); window.setDrivingMode(true); window.setDrivingMode(false);`);
  assert.strictEqual(page('tripForDoor'), null);
  page(`syncJourney();`);
  assert.strictEqual(page('journeyActive'), false);
});

test('신호 대기로 잠깐 멈췄다 다시 달리면 주차 시각을 지운다', () => {
  page(`startFlow('afternoon'); window.setDrivingMode(true); window.setDrivingMode(false);`);
  assert.ok(page('tripForDoor.parkedAt') > 0);
  page(`window.setDrivingMode(true);`);
  assert.strictEqual(page('tripForDoor.parkedAt'), 0);
  page(`window.setDrivingMode(false); window.onDoorOpened();`);
  assert.strictEqual(page('tripForDoor'), null);
  page(`goHome();`);
});

test('등교 대화는 직접 호출·예약·주행 제안 어디에서도 시작되지 않는다', () => {
  page(`goHome(); disarm(); startFlow('morning'); toggleArm('morning'); arm({ mode: 'morning' });`);
  assert.strictEqual(page('currentMode'), null);
  assert.strictEqual(page('armed'), null);
  assert.strictEqual(page('speechPhase'), 'idle');
  assert.ok(!stageHtml().includes('오늘 챙길 것'));
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
  page(`startFlow('afternoon'); window.setDrivingMode(true); demoMinutes = 8; window.onDoorOpened();`);
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
    startFlow('afternoon');
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
  assert.ok(!shown.includes('가 볼 만한 곳'));
  assert.ok(!shown.includes('하교 대화'));
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
  page(`writeStored(TRIP_MEMORY_KEY, true); forgetTrips(); window.setDrivingMode(true); window.setDrivingMode(false); startFlow('afternoon'); window.setDrivingMode(true);`);
  assert.strictEqual(page('tripOpen.chosen'), 'afternoon');
  page(`window.setDrivingMode(false); goHome(); writeStored(TRIP_MEMORY_KEY, false); forgetTrips();`);
});

function hearLesson(event, extra = '') {
  page(`window.onSpeechEvent(JSON.stringify({ event: '${event}', seq: speechSeq${extra} }));`);
}

test('수업은 조각을 차례로 틀고, 끝까지 들으면 이음과 숙제를 남긴다', () => {
  page(`localStorage.values.clear(); demoMinutes = null; lessonMinutes = 15; startLesson('dongbaek');`);
  assert.strictEqual(page(`currentMode`), 'lesson');
  assert.strictEqual(page(`lessonRun.pieces[0].id`), 'i1');
  const count = page(`lessonRun.pieces.length`);
  for (let i = 0; i < count; i++) {
    const question = page(`Lesson.isQuestion(lessonRun.pieces[lessonRun.index])`);
    hearLesson('ended');
    if (question) page(`nextLessonPiece();`); // 생각할 틈의 타이머 대신
  }
  assert.strictEqual(page(`lessonRun.finished`), true);
  assert.strictEqual(page(`lessonProgress().ieum`), 1);
  assert.ok(page(`lessonProgress().homework.title`).includes('점순이'));
  page(`goHome();`);
  assert.strictEqual(page(`lessonRun`), null);
  assert.strictEqual(page(`lessonProgress().records.length`), 1);
});

test('다음 수업은 지난 수업 복습으로 시작하고, 답 기록이 꺼져 있으면 듣지 않는다', () => {
  page(`startLesson('ai');`);
  assert.strictEqual(page(`lessonRun.pieces[0].clip`), 'lesson/dongbaek_r1');
  while (!page(`Lesson.isQuestion(lessonRun.pieces[lessonRun.index])`)) page(`skipQuestion();`);
  assert.strictEqual(page(`canRecordAnswer()`), false);
  page(`goHome();`);
});

test('수업을 넘기기만 하면 이음을 주지 않는다', () => {
  page(`localStorage.values.clear(); startLesson('dongbaek');`);
  hearLesson('ended');
  while (!page(`lessonRun.done`)) page(`skipQuestion();`);
  assert.strictEqual(page(`lessonRun.finished`), false);
  assert.strictEqual(page(`lessonProgress().ieum`), 0);
  page(`goHome();`);
});

test('수업 답은 기록을 켰을 때만 남고, 그만이라고 하면 수업을 멈춘다', () => {
  page(`localStorage.values.clear(); startLesson('dongbaek');`);
  page(`while (!Lesson.isQuestion(lessonRun.pieces[lessonRun.index])) skipQuestion();`);
  hearLesson('heard', `, text: '마음을 전하고 싶었어' `);
  assert.strictEqual(page(`lessonRun.answers.length`), 1);
  page(`while (!Lesson.isQuestion(lessonRun.pieces[lessonRun.index])) skipQuestion();`);
  hearLesson('heard', `, text: '그만' `);
  assert.strictEqual(page(`lessonRun.done`), true);
  assert.strictEqual(page(`lessonRun.finished`), false);
  page(`goHome();`);
  assert.ok(page(`lessonProgress().records[0].answers[0].text`).includes('마음'));
});

test('수업 중 도착이 다가오면 짧은 정리로 끝내고, 내비 소리를 빼앗기면 그 자리에서 기다린다', () => {
  page(`localStorage.values.clear(); startLesson('dongbaek');`);
  page(`demoMinutes = 1; applyNaviEta();`);
  assert.deepStrictEqual(JSON.parse(page(`JSON.stringify(lessonRun.pieces.map(piece => piece.id))`)), ['i1', 's1']);
  hearLesson('stopped');
  assert.strictEqual(page(`lessonRun.stopped`), true);
  assert.strictEqual(page(`lessonRun.index`), 0);
  page(`handlePrimaryAction(); demoMinutes = null; goHome();`);
});

test('마지막 조각을 넘기면 소리를 멈추고, 주차 중이면 앞쪽 작업도 내려간다', () => {
  page(`localStorage.values.clear(); startLesson('dongbaek');`);
  assert.strictEqual(page(`journeyActive`), true);
  page(`while (!lessonRun.done) skipQuestion();`);
  assert.strictEqual(page(`speechPhase`), 'idle');
  assert.strictEqual(page(`journeyActive`), false);
  page(`goHome();`);
});

test('멈춘 수업은 도착하면 닫고, 달리는 동안 저절로 다시 시작하지 않는다', () => {
  page(`localStorage.values.clear(); startLesson('dongbaek');`);
  hearLesson('stopped');
  page(`window.setDrivingMode(true); advanceWithoutMic();`);
  assert.strictEqual(page(`lessonRun.stopped`), true);
  page(`finishOnArrival();`);
  assert.strictEqual(page(`lessonRun.done`), true);
  page(`window.setDrivingMode(false); goHome();`);
});

test('다 들은 수업 화면은 다음 출발 때 닫혀 수업 제안을 가리지 않는다', () => {
  page(`localStorage.values.clear(); startLesson('dongbaek'); while (!lessonRun.done) skipQuestion();`);
  page(`window.setDrivingMode(true);`);
  assert.strictEqual(page(`currentMode`), null);
  page(`window.setDrivingMode(false);`);
});

test('등교 대화 뒤에 수업을 들으면 문 열림 말이 수업을 끊지 않는다', () => {
  page(`startFlow('afternoon'); window.setDrivingMode(true); goHome(); lessonMinutes = 15; startLesson('dongbaek');`);
  assert.strictEqual(page(`tripForDoor`), null);
  page(`window.setDrivingMode(false); window.onDoorOpened();`);
  assert.strictEqual(page(`lessonRun.index`), 0);
  page(`goHome();`);
});

test('목적지를 가까운 곳으로 바꾼 만큼은 달린 거리로 치지 않는다', () => {
  page(`startLesson('dongbaek'); naviInfo = { remainDistance: 30000 }; noteLessonNavi(); lessonRun.lastMetersAt -= 10000; naviInfo = { remainDistance: 5000 }; noteLessonNavi();`);
  assert.strictEqual(page(`lessonRun.meters <= 501`), true);
  page(`naviInfo = null; goHome();`);
});

test('주행 중 수업 화면을 닫지 않고, 고르는 화면은 닫는다', () => {
  page(`startLesson('dongbaek'); window.setDrivingMode(true);`);
  assert.strictEqual(page(`currentMode`), 'lesson');
  page(`window.setDrivingMode(false); goHome(); openLessons(); window.setDrivingMode(true);`);
  assert.strictEqual(page(`currentMode`), null);
  page(`openLessons();`);
  assert.strictEqual(page(`currentMode`), null);
  page(`window.setDrivingMode(false);`);
});

// 쉬는 시간이나 수업 끝까지 듣는다.
function hearPeriod() {
  while (!page(`lessonRun.done || isLessonResting()`)) {
    const question = page(`Lesson.isQuestion(lessonRun.pieces[lessonRun.index])`);
    hearLesson('ended');
    if (question) page(`nextLessonPiece();`); // 생각할 틈의 타이머 대신
  }
}
const stageHtml = () => page(`document.getElementById('stageArea').innerHTML`);
const lessonIds = () => JSON.parse(page(`JSON.stringify(lessonRun.pieces.map(piece => piece.id))`));

test('남은 시간이 40분이면 고르는 화면이 2교시로 짜고, 39분이면 수업 하나다', () => {
  page(`localStorage.values.clear(); demoMinutes = 39; openLessons();`);
  assert.ok(!stageHtml().includes('교시'));
  page(`goHome(); demoMinutes = 40; openLessons();`);
  assert.ok(stageHtml().includes('도착까지 40분, 2교시로 들어요'));
  assert.ok(stageHtml().includes('1교시 과학 · 2교시 국어 · 쉬는 시간 10분'));
  page(`goHome(); demoMinutes = null;`);
});

test('목적지가 없어도 고르는 화면에서 긴 이동을 고를 수 있다', () => {
  page(`localStorage.values.clear(); openLessons();`);
  assert.ok(stageHtml().includes('pickLessonTime(60)'));
  page(`pickLessonTime(90);`);
  assert.ok(stageHtml().includes('4교시 수학'));
  page(`startLesson('ai');`);
  assert.strictEqual(page(`lessonRun.lesson.id`), 'ai');
  assert.strictEqual(page(`lessonRun.trip.count`), 3);
  assert.strictEqual(lessonIds().slice(-1)[0], 'break');
  page(`goHome();`);
});

test('긴 이동은 교시마다 다른 수업을 듣고, 마친 교시는 저마다 이음과 숙제, 기록을 남긴다', () => {
  page(`localStorage.values.clear(); demoMinutes = 45; openLessons(); startLesson('dongbaek');`);
  hearPeriod();
  assert.strictEqual(page(`lessonProgress().ieum`), 1); // 쉬는 시간이 시작될 때 바로 남긴다
  assert.strictEqual(page(`lessonRun.done`), false);
  assert.strictEqual(page(`journeyActive`), true);
  assert.ok(stageHtml().includes('쉬는 시간이에요. 다음은 2교시 과학'));
  assert.ok(!stageHtml().includes('음원 준비 중'));
  assert.ok(!stageHtml().includes('다시 듣기'));
  page(`window.setDrivingMode(true);`);
  hearLesson('ended');
  assert.strictEqual(page(`lessonRun.lesson.id`), 'sky');
  assert.strictEqual(page(`lessonRun.pieces[0].clip`), 'lesson/dongbaek_r1'); // 마친 앞 교시의 복습
  assert.ok(stageHtml().includes('2교시 과학'));
  hearPeriod();
  page(`window.setDrivingMode(false);`);
  assert.strictEqual(page(`lessonRun.done`), true);
  assert.ok(stageHtml().includes('깃털 +2'));
  assert.ok(stageHtml().includes('모은 깃털 2개'));
  assert.ok(!stageHtml().includes('이음'));
  assert.ok(stageHtml().includes('data-play="1"')); // 깃털이 늘면 로고가 잇찌가 되었다가 돌아간다
  assert.strictEqual((stageHtml().match(/class="it-feather"/g) || []).length, 2); // 받은 깃털 수만큼
  page(`render();`);
  assert.ok(stageHtml().includes('data-play="0"')); // 다시 그려도 되풀이하지 않는다
  assert.strictEqual(page(`lessonProgress().ieum`), 2);
  assert.strictEqual(page(`lessonProgress().records.filter(record => record.finished).length`), 2);
  assert.ok(page(`lessonProgress().homework.title`).includes('점순이'));
  assert.ok(page(`lessonProgress().homeworkNext[0].title`).includes('하늘색'));
  page(`goHome(); demoMinutes = null;`);
  assert.strictEqual(page(`lessonProgress().records.length`), 2);
});

test('쉬는 시간은 말하지 않고 마이크도 열지 않는다. 기록을 끄면 교시 내내 듣지 않는다', () => {
  page(`localStorage.values.clear(); DAIT_LESSONS.forEach(item => item.pieces.forEach(line => { line.voiced = true; }));
    var bridgeCalls = [];
    window.AndroidBridge = { micState: () => 'ready', speak: (clips, listen) => bridgeCalls.push({ clips: JSON.parse(clips), listen }), stopSpeech() {}, setJourneyActive() {} };
    demoMinutes = 45; openLessons(); startLesson('dongbaek');`);
  hearPeriod();
  const spoken = page(`bridgeCalls.length`);
  assert.strictEqual(spoken, page(`lessonRun.pieces.length - 1`));
  assert.strictEqual(page(`bridgeCalls.every(call => call.listen === '')`), true);
  page(`goHome(); delete window.AndroidBridge; demoMinutes = null; DAIT_LESSONS.forEach(item => item.pieces.forEach(line => { delete line.voiced; }));`);
});

test('쉬는 시간은 넘기면 바로 다음 교시로 가고, 다시 듣기는 쉬는 시간을 다시 시작하지 않는다', () => {
  page(`localStorage.values.clear(); demoMinutes = 45; openLessons(); startLesson('dongbaek');
    while (!isLessonResting()) skipQuestion();`);
  page(`lessonRun.restedFrom = 1; driveReplay(); handlePrimaryAction();`);
  assert.strictEqual(page(`lessonRun.restedFrom`), 1);
  page(`skipQuestion();`);
  assert.strictEqual(page(`lessonRun.trip.number`), 2);
  assert.strictEqual(page(`isLessonResting()`), false);
  page(`goHome(); demoMinutes = null;`);
});

test('주행 중 쉬는 시간도 문장 하나와 버튼 둘이고, 이전은 잠긴다', () => {
  page(`localStorage.values.clear(); demoMinutes = 45; openLessons(); startLesson('dongbaek'); window.setDrivingMode(true);
    while (!isLessonResting()) skipQuestion();
    var realGet = document.getElementById; var driveShown = {};
    document.getElementById = id => (id.startsWith('drive') ? (driveShown[id] = driveShown[id] || {}) : realGet(id));
    updateDriveScreen(lessonRun.pieces[lessonRun.index].line);`);
  assert.strictEqual(page(`driveShown.driveSentence.textContent`), '쉬는 시간이에요. 다음은 2교시 과학');
  assert.strictEqual(page(`driveShown.driveReplay.disabled`), true);
  assert.strictEqual(page(`driveShown.driveNext.textContent`), '다음 교시 듣기');
  page(`document.getElementById = realGet; window.setDrivingMode(false); goHome(); demoMinutes = null;`);
});

test('수업 주행 화면의 버튼은 이전과 일시정지이고, 멈추면 이어 듣기로 바뀐다', () => {
  page(`localStorage.values.clear(); demoMinutes = null; lessonMinutes = 15; startLesson('prime'); window.setDrivingMode(true);
    var realGet = document.getElementById; var driveShown = {};
    document.getElementById = id => (id.startsWith('drive') ? (driveShown[id] = driveShown[id] || {}) : realGet(id));
    updateDriveScreen();`);
  assert.strictEqual(page(`driveShown.driveReplay.textContent`), '이전');
  assert.strictEqual(page(`driveShown.driveNext.textContent`), '일시정지');
  page(`driveNext();`);
  assert.strictEqual(page(`lessonRun.paused`), true);
  assert.strictEqual(page(`driveShown.driveNext.textContent`), '이어 듣기');
  assert.strictEqual(page(`driveShown.driveSub.textContent`), '잠시 멈췄어요');
  page(`driveNext();`);
  assert.strictEqual(page(`lessonRun.paused`), false);
  page(`document.getElementById = realGet; window.setDrivingMode(false); goHome();`);
});

test('30초 안에 이으면 멈춘 곳부터, 넘으면 지금 조각을 처음부터 말한다', () => {
  page(`localStorage.values.clear(); demoMinutes = null; lessonMinutes = 15;
    DAIT_LESSONS.forEach(item => item.pieces.forEach(line => { line.voiced = true; }));
    var bridgeCalls = [];
    window.AndroidBridge = { micState: () => 'none', speak: clips => bridgeCalls.push(['speak', JSON.parse(clips)]), stopSpeech() {},
      holdSpeech: () => bridgeCalls.push(['hold']), proceedSpeech: () => bridgeCalls.push(['proceed']), setJourneyActive() {} };
    startLesson('prime'); bridgeCalls.length = 0;
    pauseLesson(); lessonRun.pausedAt = Date.now() - 10 * 1000; resumeLesson();`);
  assert.strictEqual(page(`bridgeCalls.map(call => call[0]).join()`), 'hold,proceed');
  page(`bridgeCalls.length = 0; pauseLesson(); lessonRun.pausedAt = Date.now() - 40 * 1000; resumeLesson();`);
  assert.strictEqual(page(`bridgeCalls.map(call => call[0]).join()`), 'hold,speak');
  assert.strictEqual(page(`bridgeCalls[1][1].join()`), 'lesson/prime_i1');
  page(`goHome(); delete window.AndroidBridge; DAIT_LESSONS.forEach(item => item.pieces.forEach(line => { delete line.voiced; }));`);
});

test('음원 없는 조각과 발문 뒤 생각할 틈도 멈춘 만큼 기다렸다가 잇는다', () => {
  page(`localStorage.values.clear(); demoMinutes = null; lessonMinutes = 15; startLesson('prime');
    lessonRun.wait.endsAt = Date.now() + 5000; pauseLesson();`);
  assert.ok(page(`lessonRun.wait.left`) > 4000 && page(`lessonRun.wait.left`) <= 5000);
  page(`resumeLesson();`);
  assert.ok(page(`lessonRun.wait.endsAt - Date.now()`) <= 5000);
  page(`goHome();`);
});

test('일시정지와 거의 같이 조각이 끝나면 이어 듣기를 누를 때까지 다음 조각으로 넘어가지 않는다', () => {
  page(`localStorage.values.clear(); demoMinutes = null; lessonMinutes = 15;
    DAIT_LESSONS.forEach(item => item.pieces.forEach(line => { line.voiced = true; }));
    window.AndroidBridge = { micState: () => 'none', speak() {}, stopSpeech() {}, holdSpeech() {}, proceedSpeech() {}, setJourneyActive() {} };
    startLesson('prime'); pauseLesson();`);
  hearLesson('ended');
  assert.strictEqual(page(`lessonRun.paused`), true);
  assert.strictEqual(page(`lessonRun.index`), 0);
  page(`resumeLesson(); lessonRun.wait.then();`); // 시험에서는 타이머가 돌지 않아 기다린 뒤의 일을 바로 부른다
  assert.strictEqual(page(`lessonRun.index`), 1);
  page(`goHome(); delete window.AndroidBridge; DAIT_LESSONS.forEach(item => item.pieces.forEach(line => { delete line.voiced; }));`);
});

test('멈춰 둔 채 도착하면 수업을 닫고 멈춘 곳을 남긴다', () => {
  page(`localStorage.values.clear(); demoMinutes = null; lessonMinutes = 15; startLesson('prime');`);
  for (let i = 0; i < 3; i++) hearLesson('ended');
  page(`pauseLesson(); finishOnArrival();`);
  assert.strictEqual(page(`lessonRun === null || lessonRun.done`), true);
  assert.strictEqual(page(`lessonProgress().resume.lesson`), 'prime');
  page(`goHome();`);
});

test('멈춘 곳부터 잇다가 새로 들은 조각 없이 닫으면 기록과 멈춘 날짜를 그대로 둔다', () => {
  page(`localStorage.values.clear(); demoMinutes = null; lessonMinutes = 15; startLesson('prime');`);
  for (let i = 0; i < 3; i++) hearLesson('ended');
  page(`goHome(); var yesterday = toYmd(new Date(Date.now() - 86400000));
    writeStored(LESSON_KEY, { ...lessonProgress(), resume: { ...lessonProgress().resume, ymd: yesterday } });`);
  const records = page(`lessonProgress().records.length`);
  page(`startLesson('prime', true);`);
  assert.strictEqual(page(`lessonRun.heard.length`), 3);
  page(`goHome();`);
  assert.strictEqual(page(`lessonProgress().records.length`), records);
  assert.strictEqual(page(`lessonProgress().resume.ymd`), page(`yesterday`));
  page(`localStorage.values.clear();`);
});

test('이전은 조각을 조금 들었으면 그 조각을, 막 시작했으면 앞 조각을 다시 말한다', () => {
  page(`localStorage.values.clear(); demoMinutes = null; lessonMinutes = 15; startLesson('prime'); nextLessonPiece(); nextLessonPiece();`);
  assert.strictEqual(page(`lessonRun.index`), 2);
  page(`prevLessonPiece();`);
  assert.strictEqual(page(`lessonRun.index`), 1);
  page(`lessonRun.pieceStartedAt = Date.now() - 10 * 1000; prevLessonPiece();`);
  assert.strictEqual(page(`lessonRun.index`), 1);
  page(`lessonRun.index = 0; playLessonPiece(); prevLessonPiece();`);
  assert.strictEqual(page(`lessonRun.index`), 0);
  page(`goHome();`);
});

test('끝까지 못 들은 수업은 다음 이동에서 멈춘 곳부터 잇고, 앞에서 들은 것까지 합쳐 마친 수업이 된다', () => {
  page(`localStorage.values.clear(); demoMinutes = null; lessonMinutes = 15; startLesson('prime');`);
  for (let i = 0; i < 6; i++) hearLesson('ended');
  page(`goHome();`); // 들은 조각: i1 i2 b1 b2 b3, 발문 q1에서 멈춤
  const resume = page(`lessonProgress().resume`);
  assert.strictEqual(resume.lesson, 'prime');
  assert.strictEqual(resume.from, 'b4');
  assert.strictEqual(resume.short, false);
  page(`openLessons();`);
  assert.ok(stageHtml().includes('지난번 멈춘 곳부터: 소수는 어디까지 있을까'));
  assert.strictEqual(stageHtml().split(`startLesson('prime'`).length - 1, 1); // 같은 수업을 목록에 두 번 두지 않는다
  page(`startLesson('prime', true);`);
  assert.strictEqual(page(`lessonRun.pieces[0].id`), 'b4');
  assert.strictEqual(page(`lessonRun.heard.length`), 6);
  hearPeriod();
  assert.strictEqual(page(`lessonRun.finished`), true);
  assert.strictEqual(page(`lessonProgress().resume`), null);
  page(`goHome(); openLessons();`);
  assert.ok(!stageHtml().includes('지난번 멈춘 곳부터'));
  page(`goHome();`);
});

test('짧은 판에서 멈춘 수업은 짧은 판으로 잇고, 7일이 지나면 권하지 않는다', () => {
  page(`localStorage.values.clear(); demoMinutes = null; lessonMinutes = 8; startLesson('prime');`);
  for (let i = 0; i < 3; i++) hearLesson('ended');
  page(`goHome();`);
  assert.strictEqual(page(`lessonProgress().resume.short`), true);
  page(`lessonMinutes = 15; startLesson('prime', true);`);
  assert.ok(page(`lessonRun.pieces.every(line => line.short)`));
  page(`goHome(); writeStored(LESSON_KEY, { ...lessonProgress(), resume: { ...lessonProgress().resume, ymd: '2026-01-01' } });`);
  assert.strictEqual(page(`stoppedLesson(15)`), null);
  page(`localStorage.values.clear();`);
});

test('주행 중 제안은 멈춘 수업을 먼저 권하고, 누르면 멈춘 곳부터 잇는다', () => {
  page(`localStorage.values.clear(); demoMinutes = null; lessonMinutes = 15; startLesson('dongbaek');`);
  for (let i = 0; i < 3; i++) hearLesson('ended');
  page(`goHome(); demoMinutes = 20; window.setDrivingMode(true);
    var realGet = document.getElementById; var driveShown = {};
    document.getElementById = id => (id.startsWith('drive') ? (driveShown[id] = driveShown[id] || {}) : realGet(id));
    updateDriveScreen();`);
  assert.strictEqual(page(`driveShown.driveSentence.textContent`), '지난번 멈춘 곳부터 들을까요?');
  assert.ok(page(`driveShown.driveSub.textContent`).startsWith('동백꽃과 점순이 · 남은 약 '));
  page(`driveNext();`);
  assert.strictEqual(page(`lessonRun.lesson.id`), 'dongbaek');
  assert.strictEqual(page(`lessonRun.pieces[0].id`), page(`lessonProgress().resume.from`));
  page(`document.getElementById = realGet; window.setDrivingMode(false); goHome(); demoMinutes = null; localStorage.values.clear();`);
});

test('답 기록은 설정 화면에서 켜고, 마이크를 쓸 수 없으면 버튼은 짧게 두고 사정은 설명 줄에 쓴다', () => {
  page(`localStorage.values.clear(); openLessons();`);
  assert.ok(!stageHtml().includes('글로 남기기')); // 수업 고르는 화면에는 두지 않는다
  page(`writeStored(LESSON_RECORD_KEY, true); openSettings();`);
  assert.ok(stageHtml().includes('<span>수업 대답 기록</span><span class="setting-state">켜짐</span></button>'));
  assert.ok(stageHtml().includes('마이크를 쓸 수 없어 지금은 답을 남기지 못해요.'));
  page(`localStorage.values.clear(); goHome();`);
});

test('도착이 앞당겨지면 뒤 교시와 쉬는 시간이 빠지고, 늦어지면 되살아난다', () => {
  page(`localStorage.values.clear(); demoMinutes = 45; openLessons(); startLesson('dongbaek');`);
  assert.strictEqual(page(`lessonRun.trip.count`), 1);
  page(`demoMinutes = 12; applyNaviEta();`);
  assert.strictEqual(page(`lessonRun.trip.count`), 0);
  assert.ok(!lessonIds().includes('break'));
  page(`demoMinutes = 45; applyNaviEta();`);
  assert.strictEqual(page(`lessonRun.trip.count`), 1);
  assert.strictEqual(lessonIds().slice(-1)[0], 'break');
  page(`demoMinutes = 90; applyNaviEta();`);
  assert.strictEqual(page(`lessonRun.trip.count`), 2);
  page(`goHome(); demoMinutes = null;`);
});

test('2교시에 도착이 다가오면 그 교시의 짧은 정리로 끝내고, 마친 1교시는 그대로 남는다', () => {
  page(`localStorage.values.clear(); demoMinutes = 45; openLessons(); startLesson('dongbaek');`);
  hearPeriod();
  page(`window.setDrivingMode(true);`);
  hearLesson('ended');
  page(`demoMinutes = 1; applyNaviEta();`);
  assert.strictEqual(lessonIds().slice(-1)[0], 's1');
  page(`while (!lessonRun.done) skipQuestion();`);
  assert.strictEqual(page(`lessonRun.finished`), false);
  assert.strictEqual(page(`lessonProgress().ieum`), 1);
  page(`window.setDrivingMode(false); goHome(); demoMinutes = null;`);
});

test('쉬는 시간에 도착하면 바로 마치고 기록을 두 번 남기지 않는다', () => {
  page(`localStorage.values.clear(); demoMinutes = 45; openLessons(); startLesson('dongbaek');`);
  hearPeriod();
  page(`finishOnArrival();`);
  assert.strictEqual(page(`lessonRun.done`), true);
  assert.strictEqual(page(`lessonProgress().records.length`), 1);
  page(`goHome(); demoMinutes = null;`);
});

test('도착한 뒤 늦게 온 남은 시간으로 뒤 교시를 되살리지 않는다', () => {
  page(`localStorage.values.clear(); demoMinutes = 45; openLessons(); startLesson('dongbaek'); finishOnArrival(); applyNaviEta();`);
  assert.strictEqual(page(`lessonRun.trip.count`), 0);
  assert.ok(!lessonIds().includes('break'));
  page(`goHome(); demoMinutes = null;`);
});

test('쉬는 시간에 지낸 만큼은 앞으로 쉴 시간에서 뺀다', () => {
  page(`localStorage.values.clear(); demoMinutes = 45; openLessons(); startLesson('dongbaek');`);
  hearPeriod();
  page(`lessonRun.trip.later[0] = DAIT_LESSONS.find(item => item.id === 'prime');`); // 9분에 필수가 들어가는 수업으로 남은 쉬는 시간만 시험
  page(`lessonRun.restedFrom = Date.now() - 9 * 60 * 1000; demoMinutes = 10; applyNaviEta();`);
  assert.strictEqual(page(`isLessonResting()`), true);
  assert.strictEqual(page(`lessonRun.trip.count`), 1);
  page(`lessonRun.restedFrom = Date.now(); applyNaviEta();`);
  assert.strictEqual(page(`lessonRun.done`), true); // 지금부터 다 쉬면 10분 안에 2교시가 못 들어간다
  page(`goHome(); demoMinutes = null;`);
});

test('그만이라고 하면 뒤 교시까지 멈춘다', () => {
  page(`localStorage.values.clear(); writeStored(LESSON_RECORD_KEY, true); demoMinutes = 45; openLessons(); startLesson('dongbaek');
    while (!Lesson.isQuestion(lessonRun.pieces[lessonRun.index])) skipQuestion();`);
  hearLesson('heard', `, text: '그만' `);
  assert.strictEqual(page(`lessonRun.done`), true);
  assert.strictEqual(page(`lessonRun.trip.number`), 1);
  page(`goHome(); demoMinutes = null; localStorage.values.clear();`);
});

test('목적지가 없는 긴 이동은 고른 시간에서 지난 만큼을 뒤 교시에 나눈다', () => {
  page(`localStorage.values.clear(); openLessons(); pickLessonTime(60); startLesson('dongbaek');`);
  assert.strictEqual(page(`lessonRun.trip.minutes`), 25);
  page(`lessonRun.trip.endsAt = Date.now() + 15 * 60 * 1000; while (!isLessonResting()) skipQuestion(); skipQuestion();`);
  assert.strictEqual(page(`lessonRun.trip.number`), 2);
  assert.ok(Math.abs(page(`lessonRun.trip.minutes`) - 15) < 0.1);
  page(`goHome();`);
});

test('주행 중 제안도 남은 시간이 40분을 넘으면 교시로 듣는다', () => {
  page(`localStorage.values.clear(); demoMinutes = 45; window.setDrivingMode(true); lessonMinutes = Lesson.minutesFor(remainMinutes()); startLesson(lessonOffer({ kind: 'weekend' }).id);`);
  assert.strictEqual(page(`lessonRun.trip.count`), 1);
  page(`window.setDrivingMode(false); goHome(); demoMinutes = null;`);
});

test('과목 칩은 한 과목에 수업이 여럿일 때만 두고, 고른 시간에 들어가지 않는 수업은 뺀다', () => {
  page(`localStorage.values.clear(); openLessons();`);
  assert.ok(!stageHtml().includes('>전체</button>')); // 지금은 과목마다 수업이 하나다
  assert.ok(stageHtml().includes('AI는 왜 자신 있게 틀릴까요?</span>')); // 카드 큰 글은 수업의 질문
  assert.ok(/기술 · 약 \d+분 · AI는 왜 자신 있게 틀릴까/.test(stageHtml()));
  page(`DAIT_LESSONS.push({ ...DAIT_LESSONS.find(lesson => lesson.id === 'ai'), id: 'ai2', title: '둘째 기술 수업' }); render();`);
  for (const name of ['전체', '국어', '수학', '기술', '과학']) assert.ok(stageHtml().includes(`>${name}</button>`), name);
  page(`pickLessonSubject('기술');`);
  assert.ok(stageHtml().includes('둘째 기술 수업'));
  assert.ok(!stageHtml().includes('동백꽃과 점순이'));
  assert.ok(stageHtml().includes('aria-pressed="true" data-subject="기술"'));
  page(`DAIT_LESSONS.pop(); var longOnly = { ...DAIT_LESSONS.find(lesson => lesson.id === 'ai'), subject: '사회' }; longOnly.pieces = longOnly.pieces.filter(piece => !piece.short);
    DAIT_LESSONS.push({ ...longOnly, id: 'sci1' }, { ...longOnly, id: 'sci2' });
    goHome(); demoMinutes = 9; openLessons(); pickLessonSubject('사회'); demoMinutes = 5; pickLessonTime(5);`); // 고른 과목이 시간에 들어가지 않으면 전체로 돌아간다. 짧은 판이 없는 수업은 5분에 들어가지 않는다
  assert.ok(!stageHtml().includes('>사회</button>'));
  assert.strictEqual(page(`lessonSubject`), '');
  assert.ok(stageHtml().includes('소수는 어디까지'));
  page(`DAIT_LESSONS.pop(); DAIT_LESSONS.pop(); goHome(); demoMinutes = null;`);
});

test('출발하면 듣기로 고른 수업은 출발할 때 시작하고, 고르는 동안에는 말하지 않는다', () => {
  page(`localStorage.values.clear(); openLessons(); toggleLessonArm('ai');`);
  assert.strictEqual(page(`armed.mode`), 'lesson');
  assert.ok(stageHtml().includes('출발하면 들려줄게요: AI는 왜 자신 있게 틀릴까'));
  assert.ok(stageHtml().includes('예약 취소'));
  assert.strictEqual(page(`currentMode`), 'lessonPick');
  assert.strictEqual(page(`lessonRun`), null);
  assert.strictEqual(page(`speechPhase`), 'idle');
  page(`goHome();`);
  assert.ok(stageHtml().includes('수업 예약'));
  page(`window.setDrivingMode(true);`);
  assert.strictEqual(page(`currentMode`), 'lesson');
  assert.strictEqual(page(`lessonRun.lesson.id`), 'ai');
  assert.strictEqual(page(`armed`), null);
  page(`window.setDrivingMode(false); goHome();`);
});

test('예약이 없으면 출발해도 수업도 대화도 시작하지 않는다', () => {
  page(`localStorage.values.clear(); goHome(); window.setDrivingMode(true);`);
  assert.strictEqual(page(`currentMode`), null);
  assert.strictEqual(page(`lessonRun`), null);
  assert.strictEqual(page(`speechPhase`), 'idle');
  page(`window.setDrivingMode(false);`);
});

test('수업 예약은 다시 누르면 취소되고, 다른 수업을 누르면 바뀐다', () => {
  page(`openLessons(); toggleLessonArm('ai'); toggleLessonArm('ai');`);
  assert.strictEqual(page(`armed`), null);
  page(`toggleLessonArm('ai'); toggleLessonArm('prime');`);
  assert.strictEqual(page(`armed.lesson`), 'prime');
  page(`disarm(); goHome();`);
});

test('수업 예약은 30분이 지나면 풀려 고르는 화면에도 바로 보인다', () => {
  page(`var armTimers = []; var realTimeout = setTimeout; setTimeout = (run, ms) => { armTimers.push({ run, ms }); return 1; };
    openLessons(); toggleLessonArm('ai'); setTimeout = realTimeout;`);
  assert.strictEqual(page(`armTimers[armTimers.length - 1].ms`), 30 * 60 * 1000);
  page(`armTimers[armTimers.length - 1].run();`);
  assert.strictEqual(page(`armed`), null);
  assert.ok(!stageHtml().includes('예약 취소'));
  page(`window.setDrivingMode(true);`);
  assert.strictEqual(page(`lessonRun`), null);
  page(`window.setDrivingMode(false); goHome();`);
});

test('예약할 때 고른 시간을 쓰되, 출발할 때 남은 시간을 알면 그 시간을 쓴다', () => {
  page(`localStorage.values.clear(); openLessons(); pickLessonTime(30); toggleLessonArm('ai'); window.setDrivingMode(true);`);
  assert.strictEqual(page(`lessonRun.lesson.id`), 'ai');
  assert.ok(Math.abs(page(`lessonRun.trip.minutes + lessonRun.trip.laterMinutes`) - 30) < 0.01); // AI 수업 뒤 남는 시간은 이어 붙일 수업 몫
  page(`window.setDrivingMode(false); goHome(); openLessons(); toggleLessonArm('ai'); goHome(); demoMinutes = 45; window.setDrivingMode(true);`);
  assert.strictEqual(page(`lessonRun.trip.count`), 1); // 40분이 넘으면 교시로 듣는다
  page(`window.setDrivingMode(false); goHome(); demoMinutes = null;`);
});

test('출발할 때 남은 시간에 들어가지 않는 예약은 말하지 않고 지운다', () => {
  page(`localStorage.values.clear(); openLessons(); toggleLessonArm('dongbaek'); goHome(); demoMinutes = 2; window.setDrivingMode(true);`);
  assert.strictEqual(page(`armed`), null);
  assert.strictEqual(page(`lessonRun`), null);
  assert.strictEqual(page(`speechPhase`), 'idle');
  page(`window.setDrivingMode(false); demoMinutes = null;`);
});

test('수업 예약은 답 기록을 켠 사람에게만 마이크를 묻고, 주행 중에는 고를 수 없다', () => {
  page(`localStorage.values.clear(); var micAsks = 0; micAsked = false;
    window.AndroidBridge = { micState: () => 'ask', requestMic() { micAsks++; window.onMicAnswered(); }, speak() {}, stopSpeech() {}, setJourneyActive() {} };
    openLessons(); toggleLessonArm('ai');`);
  assert.strictEqual(page(`micAsks`), 0);
  page(`disarm(); writeStored(LESSON_RECORD_KEY, true); toggleLessonArm('ai');`);
  assert.strictEqual(page(`micAsks`), 1);
  assert.strictEqual(page(`armed.lesson`), 'ai');
  page(`disarm(); localStorage.values.clear(); delete window.AndroidBridge; micAsked = false; goHome(); window.setDrivingMode(true); toggleLessonArm('ai');`);
  assert.strictEqual(page(`armed`), null);
  page(`window.setDrivingMode(false);`);
});

test('하교 대화 예약은 유지하고 수업 예약으로 바꿀 수 있다', () => {
  page(`localStorage.values.clear(); goHome(); toggleArm('afternoon');`);
  assert.strictEqual(page(`armed.mode`), 'afternoon');
  page(`window.setDrivingMode(true);`);
  assert.strictEqual(page(`currentMode`), 'afternoon');
  page(`window.setDrivingMode(false); goHome(); openLessons(); toggleLessonArm('prime');`);
  assert.strictEqual(page(`armed.mode`), 'lesson');
  page(`disarm(); goHome();`);
});

test('쉬는 시간에 주차하면 수업을 닫고, 주차 중에 쉬는 시간이 끝나도 다음 교시를 말하지 않는다', () => {
  page(`localStorage.values.clear(); lessonMinutes = 60; startLesson('dongbaek'); window.setDrivingMode(true);`);
  page(`lessonRun.index = lessonRun.pieces.findIndex(Lesson.isBreak); playLessonPiece(); window.setDrivingMode(false);`);
  assert.strictEqual(page(`lessonRun.done`), true);
  assert.strictEqual(page(`speechPhase`), 'idle');
  page(`goHome(); lessonMinutes = 60; startLesson('dongbaek');`);
  page(`lessonRun.index = lessonRun.pieces.findIndex(Lesson.isBreak); playLessonPiece();`);
  hearLesson('ended');
  assert.strictEqual(page(`lessonRun.done`), true);
  page(`goHome(); lessonMinutes = 15;`);
});

test('쉬는 시간을 사람이 넘기면 주차 중이어도 다음 교시로 간다', () => {
  page(`localStorage.values.clear(); lessonMinutes = 60; startLesson('dongbaek');`);
  page(`lessonRun.index = lessonRun.pieces.findIndex(Lesson.isBreak); playLessonPiece(); skipQuestion();`);
  assert.strictEqual(page(`lessonRun.done`), false);
  assert.notStrictEqual(page(`lessonRun.lesson.id`), 'dongbaek');
  page(`goHome(); lessonMinutes = 15;`);
});

test('시간이 모자라 시작하지 못한 수업 예약은 첫 화면에서 사라진다', () => {
  page(`localStorage.values.clear(); goHome(); arm({ mode: 'lesson', lesson: 'dongbaek', minutes: 15 }); renderStage();`);
  assert.ok(page(`document.getElementById('stageArea').innerHTML`).includes('수업 예약'));
  page(`demoMinutes = 2; window.setDrivingMode(true);`);
  assert.strictEqual(page(`armed`), null);
  assert.ok(!page(`document.getElementById('stageArea').innerHTML`).includes('수업 예약'));
  page(`window.setDrivingMode(false); demoMinutes = null;`);
});

test('수업 예약은 등하교 예약과 말이 다르고, 시간을 바꾸면 예약 시간도 따라간다', () => {
  page(`arm({ mode: 'lesson', lesson: 'ai', minutes: 60 });`);
  assert.ok(page(`lessonCardHtml(DAIT_LESSONS[2], DAIT_LESSONS[2])`).includes('수업 예약 취소')); // 수업 카드
  assert.strictEqual(page(`armLabel({ mode: 'morning' })`), '출발하면 대화할게요'); // 대화 카드는 「대화」라고 쓴다
  page(`pickLessonTime(15);`);
  assert.strictEqual(page(`armed.minutes`), 15);
  page(`disarm(); currentMode = null; render(); lessonMinutes = 15;`);
});

test('학교 등록 전 첫 화면은 빈 칸 없이 수업의 질문을 보여 주고, 도착 시간을 모르면 도착을 약속하지 않는다', () => {
  page(`localStorage.values.clear(); goHome(); demoMinutes = null; lessonMinutes = 15; renderStage();`);
  const html = page(`document.getElementById('stageArea').innerHTML`);
  assert.ok(html.includes('왜 낮 하늘은 파랗고 노을은 붉을까?'));
  assert.ok(html.includes('분이면 답을 알게 돼요'));
  assert.ok(!html.includes('등록 필요'));
  assert.ok(!html.includes('하교 대화'));
  page(`demoMinutes = 20; renderStage();`);
  assert.ok(page(`document.getElementById('stageArea').innerHTML`).includes('도착할 때쯤 답을 알게 돼요'));
  page(`demoMinutes = 3; renderStage();`);
  assert.ok(page(`document.getElementById('stageArea').innerHTML`).includes('다음에 들려 드릴게요'));
  page(`demoMinutes = null; lessonMinutes = 15; renderStage();`);
});

test('주행 제안은 등교 대신 수업을 권하고 하교 제안은 유지한다', () => {
  page(`window.setDrivingMode(true); updateDriveScreen();`);
  assert.ok(page(`lessonOffer(currentTrip()).question`).endsWith('?'));
  page(`school = { name: '시험학교' };`);
  assert.ok(page(`lessonOffer({ mode: 'morning', kind: 'school', known: true })`));
  assert.strictEqual(page(`lessonOffer({ mode: 'afternoon', kind: 'home', known: true })`), null);
  page(`school = null; window.setDrivingMode(false); render();`);
});

test('출발하면 듣기를 예약하면 첫 화면 로고의 점이 깜빡인다', () => {
  page(`localStorage.values.clear(); goHome();`);
  assert.ok(!navHtml().includes('dait-brand-badge waiting'));
  page(`toggleLessonArm('dongbaek'); goHome();`);
  assert.ok(navHtml().includes('dait-brand-badge waiting'));
  page(`disarm(); localStorage.values.clear(); goHome();`);
});

test('30분 이동은 동백꽃 뒤에 쉬지 않고 다른 수업을 이어 듣고, 주차 중이어도 끊지 않는다', () => {
  page(`localStorage.values.clear(); demoMinutes = 30; openLessons();`);
  assert.ok(stageHtml().includes('도착까지 30분, 수업을 이어 들어요'));
  assert.ok(stageHtml().includes('고른 수업이 끝나고 남는 시간은 다른 수업으로 이어 채워요'));
  assert.ok(!stageHtml().includes('교시'));
  page(`startLesson('dongbaek'); while (!isLessonResting()) skipQuestion();`);
  assert.ok(stageHtml().includes('이어서 과학 수업 맛보기예요')); // 남은 약 9분은 과학 짧은 판으로 채운다
  assert.ok(stageHtml().includes('국어 수업 마침'));
  assert.ok(stageHtml().includes('다음 수업 듣기'));
  page(`onLessonSpeech({ event: 'ended' });`); // 잠깐 보여 준 뒤 넘어간다. 주차 중이어도 사람이 그대로 있다
  assert.strictEqual(page(`lessonRun.done`), false);
  assert.strictEqual(page(`lessonRun.lesson.id`), 'sky');
  assert.notStrictEqual(page(`lessonRun.pieces[0].kind`), '복습'); // 방금 들은 동백꽃을 「지난 시간에는」으로 되풀이하지 않는다
  assert.ok(stageHtml().includes('과학 수업'));
  assert.ok(!stageHtml().includes('2교시'));
  page(`goHome(); demoMinutes = null;`);
});

test('학교를 등록해도 수업 중심 화면을 쓰고 준비물·등교 버튼은 없다', () => {
  const shown = JSON.parse(page(`school = { name: 'A', kind: '중학교', grade: '1' };
    schoolDays = { [toYmd(new Date())]: { subjects: ['체육'], meal: '카레' } }; schoolEvents = {};
    goHome(); var pearlHomeSnapshot = { html: document.getElementById('stageArea').innerHTML, mode: currentTrip().mode, weekend: currentTrip().kind === 'weekend' };
    school = null; schoolDays = {}; schoolEvents = {}; JSON.stringify(pearlHomeSnapshot)`));
  assert.ok(shown.html.includes('question-title'));
  assert.ok(!shown.html.includes('등교 대화'));
  assert.ok(!shown.html.includes('준비물'));
  assert.ok(!shown.html.includes('체육복'));
  assert.ok(!shown.html.includes('가 볼 만한 곳'));
  assert.ok(!shown.html.includes('카레'));
  if (shown.mode === 'afternoon' && !shown.weekend) assert.ok(shown.html.includes('하교 대화'));
  page(`goHome();`);
});

test('가 볼 만한 곳은 관광공사의 지금 시도 코드로 찾는다. 전남과 광주는 합쳐진 코드, 세종은 36110', () => {
  const codes = JSON.parse(page(`
    var saved = school;
    var found = ['전라남도 목포시', '광주광역시 북구', '전남광주통합특별시 여수시', '세종특별자치시 한누리대로', '서울특별시 종로구'].map(address => { school = { name: 'A', address }; return schoolRegion().code; });
    school = saved;
    JSON.stringify(found)`));
  assert.deepStrictEqual(codes, ['12', '12', '12', '36110', '11']);
});

test('가 볼 만한 곳을 누르면 그곳으로 내비 길 안내를 시작하고 첫 화면으로 돌아간다', () => {
  const rows = JSON.parse(page(`JSON.stringify(tourRows({ response: { header: { resultCode: '0000' }, body: { items: { item: [
    { title: '국립광주과학관', addr1: '전남광주통합특별시 북구', contenttypeid: '14', mapx: '126.89', mapy: '35.22' },
    { title: '좌표 없는 곳', addr1: '어딘가', contenttypeid: '14', mapx: '', mapy: '' }
  ] } } } }))`));
  assert.deepStrictEqual(rows[0], { name: '국립광주과학관', address: '전남광주통합특별시 북구', lat: 35.22, lng: 126.89 });
  page(`localStorage.values.clear(); var routes = [];
    window.AndroidBridge = { micState: () => 'none', locationState: () => 'none', speak() {}, stopSpeech() {}, setJourneyActive() {}, setLocationOn() {}, startRoute: json => routes.push(JSON.parse(json)) };
    currentMode = 'places'; places = { topic: '과학관', rows: ${JSON.stringify(rows)}, sample: false, message: '' }; render();`);
  assert.strictEqual(stageHtml().split('여기로 안내').length - 1, 1); // 좌표가 없는 곳에는 버튼을 두지 않는다
  page(`routeToPlace(0);`);
  assert.deepStrictEqual(JSON.parse(page(`JSON.stringify(routes)`)), [{ name: '국립광주과학관', address: '전남광주통합특별시 북구', lat: 35.22, lng: 126.89 }]);
  assert.notStrictEqual(page(`currentMode`), 'places');
  page(`delete window.AndroidBridge; goHome();`);
  page(`currentMode = 'places'; places = { topic: '과학관', rows: ${JSON.stringify(rows)}, sample: true, message: '' }; render();`);
  assert.ok(!stageHtml().includes('여기로 안내')); // 브라우저 미리보기에서는 내비가 없다
  page(`goHome();`);
});

test('가 볼 만한 곳은 지금 위치, 없으면 학교에서 가까운 순으로 줄 세우고 거리를 붙인다', () => {
  const rows = [
    { name: '먼 곳', address: '가', lat: 35.0, lng: 127.5 },
    { name: '좌표 없음', address: '나', lat: 0, lng: 0 },
    { name: '가까운 곳', address: '다', lat: 37.51, lng: 127.01 }
  ];
  const run = setup => JSON.parse(page(`${setup}; var near = nearestFirst(${JSON.stringify(rows)}); carSpot = null; routePlaces = {}; tripSpots = {};
    JSON.stringify({ names: near.rows.map(row => row.name), from: near.from, km: near.rows[0].km })`));
  const none = run('carSpot = null; routePlaces = {}; tripSpots = {}');
  assert.deepStrictEqual(none.names, ['먼 곳', '좌표 없음', '가까운 곳']); // 기준이 없으면 받은 차례 그대로
  assert.strictEqual(none.from, '');
  const car = run('carSpot = { lat: 37.5, lng: 127.0 }');
  assert.deepStrictEqual(car.names, ['가까운 곳', '먼 곳', '좌표 없음']);
  assert.strictEqual(car.from, '지금 위치에서 가까운 순');
  assert.ok(car.km > 1 && car.km < 2, String(car.km));
  const school = run('carSpot = null; routePlaces = { school: { lat: 35.01, lng: 127.49 } }');
  assert.deepStrictEqual(school.names[0], '먼 곳');
  assert.strictEqual(school.from, '학교에서 가까운 순');
  assert.strictEqual(page(`kmText(1.234) + ' ' + kmText(12.6)`), '1.2km 13km');
});

test('학교를 등록하기 전 첫 화면에서도 가 볼 만한 곳을 보여 주지 않는다', () => {
  page(`localStorage.values.clear(); school = null; goHome();`);
  assert.ok(!stageHtml().includes('openPlaces()'));
});


test('음악을 골라 재생하고 멈춤·이어 듣기·이전·완료 기록까지 연결한다', () => {
  page(`DAIT_LESSONS.push(${JSON.stringify(APP_LESSONS.find(item => item.id === 'rhythm'))});
    localStorage.values.clear(); demoMinutes = null; window.setDrivingMode(false);
    openLessons(); pickLessonTime(8); pickLessonSubject('음악');`);
  assert.ok(stageHtml().includes('같은 네 박인데 왜 다르게 들릴까?'));
  page(`var musicCalls = [];
    window.AndroidBridge = { micState: () => 'none', speak: clips => musicCalls.push(JSON.parse(clips)), stopSpeech() {},
      holdSpeech: () => musicCalls.push('hold'), proceedSpeech: () => musicCalls.push('resume'), setJourneyActive() {} };
    startLesson('rhythm');`);
  assert.strictEqual(page('musicCalls[0][0]'), 'lesson/rhythm_m1');
  page('pauseLesson(); resumeLesson();');
  assert.strictEqual(page("musicCalls.includes('hold') && musicCalls.includes('resume')"), true);
  hearLesson('ended');
  assert.strictEqual(page('lessonRun.pieces[lessonRun.index].id'), 'm2');
  page('lessonRun.pieceStartedAt = Date.now(); prevLessonPiece();');
  assert.strictEqual(page('lessonRun.index'), 0);
  hearPeriod();
  assert.strictEqual(page('lessonRun.finished'), true);
  assert.strictEqual(page("lessonProgress().records.some(row => row.lesson === 'rhythm' && row.finished)"), true);
  page('goHome(); delete window.AndroidBridge;');
});


test('처음부터 듣기는 멈춤·답·중단지점을 초기화하고 현재 수업을 한 번만 완료 처리한다', () => {
  page(`localStorage.values.clear(); demoMinutes = null; window.setDrivingMode(false);
    openLessons(); pickLessonTime(8);
    var restartClips = [];
    window.AndroidBridge = { micState: () => 'none', speak: clips => restartClips.push(JSON.parse(clips)), stopSpeech() {},
      holdSpeech() {}, proceedSpeech() {}, setJourneyActive() {} };
    startLesson('rhythm');`);
  assert.ok(stageHtml().includes('class="pearl-transport"')); // 처음부터 듣기는 설정 팝업으로 이동했다.
  for (let i = 0; i < 3; i++) hearLesson('ended');
  page(`lessonRun.answers.push({text:'이전 시도의 답'}); lessonRun.meters = 1200; pauseLesson();
    writeStored(LESSON_KEY, Lesson.keepResume(lessonProgress(), Lesson.resumePoint(lessonRun.lesson, lessonRun.heard, toYmd(new Date()))));
    var oldSeq = speechSeq; var oldRun = lessonRun; var beforeRestartEnd = lessonRun.trip.endsAt;
    restartLesson();`);
  assert.strictEqual(page('lessonRun === oldRun'), false);
  assert.strictEqual(page('lessonRun.index'), 0);
  assert.strictEqual(page('lessonRun.pieces[0].id'), 'm1');
  assert.strictEqual(page('lessonRun.trip.minutes'), 8);
  assert.ok(page('lessonRun.trip.endsAt >= beforeRestartEnd'));
  assert.strictEqual(page('lessonRun.heard.length + lessonRun.answers.length'), 0);
  assert.strictEqual(page('lessonRun.meters'), 1200);
  assert.strictEqual(page('lessonRun.paused'), false);
  assert.strictEqual(page('lessonProgress().resume'), null);
  assert.strictEqual(page('lessonProgress().records.length'), 0);
  assert.strictEqual(page('lessonProgress().ieum'), 0);
  assert.strictEqual(page('restartClips.at(-1)[0]'), 'lesson/rhythm_m1');
  page(`window.onSpeechEvent(JSON.stringify({event:'ended',seq:oldSeq}));`);
  assert.strictEqual(page('lessonRun.index'), 0);
  hearPeriod();
  assert.strictEqual(page('lessonProgress().records.length'), 1);
  assert.strictEqual(page('lessonProgress().ieum'), 1);
  assert.ok(!stageHtml().includes('onclick="restartLesson()"'));
  page('restartLesson(); goHome(); delete window.AndroidBridge;');
});

test('처음부터 듣기는 앞 교시의 기록을 보존하고 주행 중에는 실행하지 않는다', () => {
  page(`localStorage.values.clear(); demoMinutes = 60; window.setDrivingMode(false); openLessons(); startLesson('rhythm');`);
  hearPeriod();
  page('nextLessonPiece();');
  const firstRecord = page('JSON.stringify(lessonProgress().records)');
  const earned = page('lessonRun.trip.earned');
  const lessonId = page('lessonRun.lesson.id');
  hearLesson('ended');
  page('restartLesson();');
  assert.strictEqual(page('lessonRun.lesson.id'), lessonId);
  assert.strictEqual(page('lessonRun.trip.earned'), earned);
  assert.strictEqual(page('JSON.stringify(lessonProgress().records)'), firstRecord);
  assert.strictEqual(page('lessonRun.index'), 0);
  page('window.setDrivingMode(true); renderStage(); var drivingRun = lessonRun; restartLesson();');
  assert.strictEqual(page('lessonRun === drivingRun'), true);
  assert.ok(!stageHtml().includes('onclick="restartLesson()"'));
  page('window.setDrivingMode(false); demoMinutes = null; goHome();');
});


test('진행바는 음원 경계를 표시하고 구간·초 단위 탐색과 일시정지를 유지한다', () => {
  page(`localStorage.values.clear(); demoMinutes = null; window.setDrivingMode(false);
    openLessons(); pickLessonTime(8);
    var seekCalls = []; window.AndroidBridge = { micState: () => 'none', speak() {}, stopSpeech() {}, holdSpeech() {}, proceedSpeech() {},
      setJourneyActive() {}, seekSpeech: (ms, seq) => seekCalls.push({ms,seq}), reportSpeechPosition() {} };
    startLesson('rhythm'); var seekTimeline = lessonTimeline(lessonRun);`);
  assert.ok(stageHtml().includes('aria-label="수업 재생 위치"'));
  assert.strictEqual(page('seekTimeline.sections.length'), 11);
  assert.ok(Math.abs(page('seekTimeline.seconds') - 440.64) < .01);
  page('seekLessonSection(2);');
  assert.strictEqual(page('lessonRun.index'), 2);
  assert.strictEqual(page('lessonRun.heard.length'), 0); // 건너뛴 조각을 들었다고 기록하지 않는다.
  page('pauseLesson(); seekLessonAt(lessonTimeline(lessonRun).sections[2].start + 12.5);');
  assert.strictEqual(page('lessonRun.paused'), true);
  assert.strictEqual(page('seekCalls.at(-1).ms'), 12500);
  assert.strictEqual(page('lessonRun.partialPiece'), 'm3');
  page(`window.onSpeechEvent(JSON.stringify({event:'position',seq:speechSeq,position:12500}));`);
  assert.strictEqual(page('lessonRun.positionSeconds'), 12.5);
  page('resumeLesson();');
  hearLesson('ended');
  assert.strictEqual(page("lessonRun.heard.some(item => item.id === 'm3')"), false); // 조각 뒤쪽만 듣고 전체 분량을 얻지 않는다.
  page(`seekLessonSection(lessonRun.pieces.length - 1);`);
  hearLesson('ended');
  assert.strictEqual(page('lessonProgress().ieum'), 0); // 마지막 구간만 들으면 수업 완료 보상이 생기지 않는다.
  page('goHome(); delete window.AndroidBridge;');
});

test('브라우저 탐색은 새 음원 metadata 뒤에도 정확한 위치를 적용하고 생각할 틈으로도 이동한다', () => {
  page(`localStorage.values.clear(); demoMinutes = null; window.setDrivingMode(false); openLessons(); pickLessonTime(8);
    var audioStub = { currentTime:0, readyState:4, play: () => Promise.resolve(), pause() {}, set src(value) { this.currentTime = 0; },
      get src() { return ''; } };
    var beforeAudioLookup = document.getElementById;
    document.getElementById = id => id === 'audioPlayer' ? audioStub : beforeAudioLookup(id);
    startLesson('rhythm');
    seekLessonAt(lessonTimeline(lessonRun).sections[2].start + 10);
    audioStub.currentTime = 0; audioStub.onloadedmetadata();`);
  assert.strictEqual(page('audioStub.currentTime'), 10); // 이전 readyState가 남아 있어도 새 파일에 offset을 적용한다.
  page(`var questionSection = lessonTimeline(lessonRun).sections.find(item => item.piece.kind === '발문');
    seekLessonAt(questionSection.start + Lesson.speechSeconds(questionSection.piece) + 3);`);
  assert.ok(page('lessonRun.wait.endsAt - Date.now()') <= 6001);
  assert.strictEqual(page('lessonRun.partialPiece'), page('questionSection.piece.id'));
  page('window.setDrivingMode(true); renderStage(); var seekBeforeDriving = lessonRun.index; seekLessonSection(0);');
  assert.strictEqual(page('lessonRun.index'), page('seekBeforeDriving'));
  assert.ok(!stageHtml().includes('aria-label="수업 재생 위치"'));
  page('window.setDrivingMode(false); goHome(); document.getElementById = beforeAudioLookup;');
});


test('기록 화면은 실제 수업 기록을 보여 주며 배지는 미획득 미리보기로 구분한다', () => {
  page(`localStorage.values.clear(); goHome(); openPearlTab('records');`);
  assert.ok(stageHtml().includes('수업을 들으면 여기에 쌓여요'));
  page(`writeStored(LESSON_KEY, { ...lessonProgress(), records: [{ lesson: 'ai', title: '<b>수업', ymd: '20261106', finished: true, answers: [] }] }); render();`);
  assert.ok(stageHtml().includes('&#60;b&#62;수업'));
  assert.ok(!stageHtml().includes('<b>수업'));
  page(`selectRecordTab('badges');`);
  assert.ok(stageHtml().includes('받는 방법은 준비 중'));
  assert.strictEqual((stageHtml().match(/<img /g) || []).length, 6);
  page(`selectRecordTab('lessons'); goHome(); localStorage.values.clear();`);
});

test('기록 탭은 주행 중 열리지 않고 수업을 닫을 때 중단 위치를 남긴다', () => {
  page(`lessonMinutes = 15; startLesson('ai');`);
  page(`openPearlTab('lessons');`);
  assert.strictEqual(page('currentMode'), 'lesson');
  page(`window.setDrivingMode(true); openPearlTab('records');`);
  assert.strictEqual(page('currentMode'), 'lesson');
  page(`window.setDrivingMode(false); openPearlTab('records');`);
  assert.strictEqual(page('currentMode'), 'records');
  assert.strictEqual(page('lessonRun'), null);
  assert.strictEqual(page('speechPhase'), 'idle');
  page(`goHome(); localStorage.values.clear(); lessonMinutes = 15; startLesson('ai'); openSettings();`);
  assert.strictEqual(page('currentMode'), 'lesson');
  assert.strictEqual(page('schoolSettingsOpen'), true);
  assert.ok(page('lessonRun'));
  page('closeSchoolSettings();');
  page(`goHome(); localStorage.values.clear();`);
});

test('제거한 준비물 기능은 Gleo와 문 열림으로도 말하지 않는다', () => {
  const assets = path.join(__dirname, '../../main/assets');
  const schema = JSON.parse(fs.readFileSync(path.join(assets, 'schema.json'), 'utf8'));
  assert.deepStrictEqual(schema.actionCalls.map(x => x.function.name), ['START_LESSON', 'CONTROL_LESSON']);
  const native = fs.readFileSync(path.join(__dirname, '../../main/java/io/dait/app/GleoBridge.kt'), 'utf8');
  assert.ok(!native.includes('GET_SCHOOL_PREP'));
  const html = fs.readFileSync(path.join(assets, 'dait-preview.html'), 'utf8');
  assert.ok(!html.includes('function saveSchoolBrief'));
  assert.ok(!html.includes('speak([DAIT_RULES.extras.p_door_bag]'));
  page(`goHome(); var removedReply; window.AndroidBridge = { gleoRespond(v) { removedReply = JSON.parse(v); } }; window.onGleoAction('GET_SCHOOL_PREP', '{}'); delete window.AndroidBridge;`);
  assert.strictEqual(page('removedReply.status'), 'fail');
});


test('시간 이동은 구간 경계를 넘고 일시정지를 유지하며 주행 중 자유 탐색은 막는다', () => {
  page(`localStorage.values.clear(); demoMinutes = null; window.setDrivingMode(false); goHome(); lessonMinutes = 15; startLesson('sky'); pauseLesson();
    var timeBoundary = lessonTimeline(lessonRun).sections[1].start;
    seekLessonAt(timeBoundary - 5); seekLessonBy(15);`);
  assert.strictEqual(page('lessonRun.index'), 1);
  assert.ok(Math.abs(page('lessonRun.positionSeconds') - 10) < .1);
  assert.strictEqual(page('lessonRun.paused'), true);
  page('seekLessonBy(-3600);');
  assert.strictEqual(page('lessonRun.index'), 0);
  assert.strictEqual(page('lessonRun.positionSeconds'), 0);
  page('window.setDrivingMode(true); seekLessonBy(30); var drivePosition = lessonRun.positionSeconds; seekLessonAt(100);');
  assert.strictEqual(page('lessonRun.positionSeconds'), page('drivePosition'));
  assert.ok(stageHtml().includes('aria-label="수업 진행 시간"'));
  assert.ok(!stageHtml().includes('수업 구간'));
  page('window.setDrivingMode(false); goHome();');
});

test('재생 속도는 음원과 무음 대기·남은 시간에 반영하고 주행 중 설정은 저장하지 않는다', () => {
  page(`lessonMinutes = 15; startLesson('sky');
    var prefsSaved = saveLessonPlaybackPrefs({back:60,forward:120,rate:2});
    lessonWait(10000, nextLessonPiece);`);
  assert.strictEqual(page('prefsSaved'), true);
  assert.strictEqual(page('lessonRun.wait.rate'), 2);
  assert.ok(page('lessonRun.wait.endsAt - Date.now()') <= 5000);
  page('pauseLesson();');
  assert.ok(page('lessonRun.wait.left') > 9800);
  page('window.setDrivingMode(true);');
  assert.strictEqual(page('saveLessonPlaybackPrefs({back:15,forward:30,rate:1})'), false);
  assert.strictEqual(page('lessonPlaybackPrefs.rate'), 2);
  page('window.setDrivingMode(false); goHome(); saveLessonPlaybackPrefs({back:15,forward:30,rate:1});');
});

test('오디오 중단은 화면과 차량 상태에 반영하고 수동 일시정지 뒤에는 시스템 신호로 재개하지 않는다', () => {
 page(`goHome(); lessonMinutes=15; startLesson('sky'); onSpeechEvent(JSON.stringify({event:'paused',seq:speechSeq}));`);
 assert.equal(page('lessonRun.playback.state'),'interrupted');
 assert.ok(stageHtml().includes('aria-label="이어 듣기"'));
 assert.ok(!stageHtml().includes('pearl-player is-playing'));
 page(`pauseLesson(); onSpeechEvent(JSON.stringify({event:'resumed',seq:speechSeq}));`);
 assert.equal(page('lessonRun.playback.state'),'paused');
 page('goHome();');
});
test('학교 설정을 열고 닫아도 같은 수업과 멈춤 위치를 유지한다', () => {
 page(`startLesson('sky'); pauseLesson(); var schoolLesson = lessonRun; var schoolSpeechSeq = speechSeq; openSettings();`);
 assert.equal(page('currentMode'),'lesson'); assert.equal(page('lessonRun === schoolLesson'),true);
 assert.equal(page('speechSeq'),page('schoolSpeechSeq')); assert.equal(page('lessonRun.paused'),true);
 page('closeSchoolSettings();'); assert.equal(page('lessonRun === schoolLesson'),true);
 page('goHome();');
});
test('네이티브 미디어에 실제 배속·위치를 전달하고 핸들의 앞으로 버튼도 시간 기준으로 이동한다', () => {
 page(`var mediaSnapshots=[]; window.AndroidBridge={speak(){},stopSpeech(){},holdSpeech(){},proceedSpeech(){},micState(){return 'none'},setJourneyActive(){},setLessonPlayback(...args){mediaSnapshots.push(args)}};
   startLesson('sky'); var mediaPiece=lessonRun.pieces[lessonRun.index], mediaVoiced=mediaPiece.voiced; mediaPiece.voiced=true; lessonRun.wait=null; saveLessonPlaybackPrefs({back:15,forward:30,rate:1.5});
   onSpeechEvent(JSON.stringify({event:'position',seq:speechSeq,position:10000})); syncLessonMedia();`);
 assert.equal(page('mediaSnapshots.at(-1)[4]'),10000); assert.equal(page('mediaSnapshots.at(-1)[6]'),1.5);
  assert.equal(page('mediaSnapshots.at(-1)[7]'),true);
  page('setDrivingMode(true);'); assert.equal(page('mediaSnapshots.at(-1)[7]'),false);
  page('setDrivingMode(false);');
 page(`onMediaKey('next');`); assert.ok(page('lessonRun.index')>=1);
 page(`goHome(); mediaPiece.voiced=mediaVoiced; delete window.AndroidBridge; saveLessonPlaybackPrefs({back:15,forward:30,rate:1});`);
});
test('질문 뒤 대기는 2배속에서도 그대로 남고 설정 저장·멈춤·재개로 줄어들지 않는다', () => {
 page(`startLesson('sky'); saveLessonPlaybackPrefs({back:15,forward:30,rate:2});
   lessonWait(10000,nextLessonPiece,'thinking');`);
 assert.equal(page('lessonRun.wait.rate'),1); assert.ok(page('lessonRun.wait.endsAt-Date.now()')>9900);
 page(`pauseLesson(); saveLessonPlaybackPrefs({back:15,forward:30,rate:1.5}); resumeLesson();`);
 assert.equal(page('lessonRun.wait.rate'),1); assert.ok(page('lessonRun.wait.endsAt-Date.now()')>9800);
 page('goHome();saveLessonPlaybackPrefs({back:15,forward:30,rate:1});');
});
