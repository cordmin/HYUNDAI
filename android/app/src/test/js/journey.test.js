const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { appScripts, appSource } = require('./app-files.js');
const Journey = require('../../main/assets/dait-journey.js');
const Lesson = require('../../main/assets/dait-lesson.js');
const APP_LESSONS = require('../../main/assets/dait-lessons.js');
const STARRY_LESSON = JSON.parse(JSON.stringify(APP_LESSONS.find(item => item.id === 'starry')));
const DAIT_LESSONS = APP_LESSONS.filter(item => item.id !== 'rhythm');

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
  const element = fakeElement();
  const stage = { innerHTML: '' };
  const nav = { innerHTML: '' };
  const sandbox = {
    DaitPlayback: require('../../main/assets/dait-playback.js'), Journey, Lesson, DAIT_LESSONS, console: { log() {} }, URLSearchParams, performance,
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
  for (const { name, code } of appScripts()) vm.runInContext(code, sandbox, { filename: name });
  page = source => vm.runInContext(source, sandbox);
  // 남은 시간은 내비가 알려 준 값으로만 정해진다. 시험에서는 내비 값을 꾸며 넣는다.
  page(`function setEta(minutes) { naviInfo = minutes === null ? null : { name: '', remainTime: minutes * 60, remainDistance: NaN, at: Date.now() }; }`);
  assert.ok(stage.innerHTML.includes('question-title'));
  assert.ok(nav.innerHTML.includes('기록'));
  assert.ok(!stage.innerHTML.includes('등교 대화'));
  assert.strictEqual(typeof sandbox.setDrivingMode, 'function');
});

test('2분 전에도 가족 대화는 끊지 않고, 도착하면 인사한다', () => {
  page(`startFlow('afternoon'); stage = 'PARENT_BRIDGE'; speechPhase = 'idle'; setEta(2); applyNaviEta();`);
  assert.strictEqual(page('stage'), 'PARENT_BRIDGE');
  page(`finishOnArrival();`);
  assert.strictEqual(page('stage'), 'DONE');
  page(`startFlow('afternoon'); stage = 'ETA_SHORT'; speechPhase = 'idle'; finishOnArrival();`);
  assert.strictEqual(page('stage'), 'DONE');
  page(`setEta(null); goHome();`);
});

test('앞 경로가 끝났다는 신호가 새 경로를 지우지 않는다', () => {
  page(`window.onNaviUpdate(JSON.stringify({ event: 'routeStarted', name: '학교', remainTime: 600, remainDistance: 3000 }));
        window.onNaviUpdate(JSON.stringify({ event: 'routeEnded' }));`);
  assert.strictEqual(page('naviInfo.name'), '학교');
  page(`naviInfo = null;`);
});

test('남은 시간을 기획안 표의 네 구간으로 나눈다', () => {
  assert.deepStrictEqual([null, 12, 10, 9.9, 5, 4.9, 2.1, 2, 0].map(Journey.tierFor),
    ['full', 'full', 'full', 'medium', 'medium', 'brief', 'brief', 'arrive', 'arrive']);
});

test('하교 대화는 남은 시간에 따라 질문 수를 줄이고, 질문을 끄면 조용히 간다', () => {
  const ctx = tier => ({ tier, driving: false, noQuestions: false });
  assert.strictEqual(Journey.start(ctx('full')), 'AFTER_EVENT');
  assert.strictEqual(Journey.next('AFTER_EVENT', '그림 그렸어', ctx('full')), 'AFTER_DETAIL');
  assert.strictEqual(Journey.next('AFTER_EVENT', '그림 그렸어', ctx('medium')), 'PARENT_BRIDGE');
  assert.strictEqual(Journey.next('AFTER_DETAIL', '재밌었어', ctx('full')), 'PARENT_BRIDGE');
  assert.strictEqual(Journey.next('PARENT_BRIDGE', '오늘도 수고했어', ctx('full')), 'DONE');
  assert.strictEqual(Journey.next('AFTER_EVENT', '쉬고 싶어', ctx('full')), 'REST');
  assert.strictEqual(Journey.start(ctx('brief')), 'ETA_SHORT');
  assert.strictEqual(Journey.next('AFTER_EVENT', '그림 그렸어', ctx('arrive')), 'ETA_SHORT');
  assert.strictEqual(Journey.start({ ...ctx('full'), noQuestions: true }), 'SILENT');
});

test('하교 대화를 달리는 중에 마치면 도착 인사 대신 멈춤 인사를 한다', () => {
  const driving = { tier: 'full', driving: true, noQuestions: false };
  assert.strictEqual(Journey.skip('AFTER_EVENT', driving), 'PARENT_BRIDGE');
  assert.strictEqual(Journey.skip('PARENT_BRIDGE', driving), 'STOPPED');
  assert.strictEqual(Journey.skip('PARENT_BRIDGE', { ...driving, driving: false }), 'DONE');
});

test('하교 대화의 모든 단계에 문구가 있고, 음원 파일이 앱에 있다', () => {
  const voices = path.join(__dirname, '../../main/assets/voices/nika');
  for (const [name, step] of Object.entries(Journey.flows.afternoon)) {
    assert.ok(step.title, name);
    if (step.clip) assert.ok(fs.existsSync(path.join(voices, `${step.clip}.wav`)), step.clip);
  }
});

test('제거한 학교·장소·위치·마이크·문 열림 기능의 진입점이 없다', () => {
  const asset = name => fs.readFileSync(path.join(__dirname, '../../main/assets', name), 'utf8');
  const source = appSource() + asset('dait-preview.html') + asset('dait-appearance.js');
  for (const gone of ['neisGet', 'tourGet', 'micState', 'requestMic', 'onCarLocation', 'onDoorOpened', 'startRoute', 'dait-rules.js', 'renderPlaces', '말로 답하기']) {
    assert.ok(!source.includes(gone), gone);
  }
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

const clipName = clip => clip.replace(/^temp\//, '');

// ---- 다니는 길 기억 ----
const openTrip = patch => ({ ymd: '20261102', day: 1, min: 500, end: 515, from: 'home', last: 'school', door: true, chosen: '', ...patch });
const trip = patch => ({ ymd: '20261026', day: 1, min: 490, end: 510, from: 'home', to: 'school', door: true, kind: 'go', ...patch });

function hearLesson(event, extra = '') {
  page(`window.onSpeechEvent(JSON.stringify({ event: '${event}', seq: speechSeq${extra} }));`);
}

test('수업은 조각을 차례로 틀고, 끝까지 들으면 이음과 숙제를 남긴다', () => {
  page(`localStorage.values.clear(); setEta(null); lessonMinutes = 15; startLesson('dongbaek');`);
  assert.strictEqual(page(`currentMode`), 'lesson');
  assert.strictEqual(page(`lessonRun.pieces[0].id`), 'i1');
  const count = page(`lessonRun.pieces.length`);
  for (let i = 0; i < count; i++) {
    const question = page(`Lesson.isQuestion(lessonRun.pieces[lessonRun.index])`);
    hearLesson('ended');
    if (question) page(`nextLessonPiece();`); // 생각할 틈의 타이머 대신
  }
  assert.strictEqual(page(`lessonRun.finished`), true);
  assert.strictEqual(page(`lessonProgress().ieum`), undefined);
  assert.ok(page(`lessonProgress().homework.title`).includes('점순이'));
  page(`goHome();`);
  assert.strictEqual(page(`lessonRun`), null);
  assert.strictEqual(page(`lessonProgress().records.length`), 1);
});

test('다음 수업은 지난 수업 복습으로 시작하고, 답 기록이 꺼져 있으면 듣지 않는다', () => {
  page(`startLesson('ai');`);
  assert.strictEqual(page(`lessonRun.pieces[0].clip`), 'lesson/dongbaek_r1');
  while (!page(`Lesson.isQuestion(lessonRun.pieces[lessonRun.index])`)) page(`skipQuestion();`);
  page(`goHome();`);
});

test('수업을 넘기기만 하면 이음을 주지 않는다', () => {
  page(`localStorage.values.clear(); startLesson('dongbaek');`);
  hearLesson('ended');
  while (!page(`lessonRun.done`)) page(`skipQuestion();`);
  assert.strictEqual(page(`lessonRun.finished`), false);
  assert.strictEqual(page(`lessonProgress().ieum`), undefined);
  page(`goHome();`);
});

test('수업 기록에는 대답 칸이 없고, 예전에 남은 대답도 지운다', () => {
  page(`localStorage.values.clear(); writeStored(LESSON_KEY, { records: [{ lesson: 'ai', title: 'AI', ymd: '20261101', finished: true, answers: [{ text: '예전 답' }] }] });
    lessonMinutes = 15; startLesson('dongbaek'); while (!lessonRun.done) skipQuestion();`);
  assert.ok(page('lessonProgress().records.length') >= 1);
  assert.ok(page(`lessonProgress().records.every(record => !('answers' in record))`));
  page('goHome();');
});

test('수업 중 도착이 다가오면 짧은 정리로 끝내고, 내비 소리를 빼앗기면 그 자리에서 기다린다', () => {
  page(`localStorage.values.clear(); startLesson('dongbaek');`);
  page(`setEta(1); applyNaviEta();`);
  assert.deepStrictEqual(JSON.parse(page(`JSON.stringify(lessonRun.pieces.map(piece => piece.id))`)), ['i1', 's1']);
  hearLesson('stopped');
  assert.strictEqual(page(`lessonRun.stopped`), true);
  assert.strictEqual(page(`lessonRun.index`), 0);
  page(`handlePrimaryAction(); setEta(null); goHome();`);
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
  page(`window.setDrivingMode(true); skipWhileDriving();`);
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
  page(`localStorage.values.clear(); setEta(39); openLessons();`);
  assert.ok(!stageHtml().includes('교시'));
  page(`goHome(); setEta(40); openLessons();`);
  assert.ok(stageHtml().includes('도착까지 40분, 2교시로 들어요'));
  assert.ok(stageHtml().includes('1교시 과학 · 2교시 국어 · 쉬는 시간 10분'));
  page(`goHome(); setEta(null);`);
});

test('목적지가 없을 때 긴 시간이면 교시로 나눈다', () => {
  page(`localStorage.values.clear(); openLessons();`);
  page(`lessonMinutes = 90; render();`);
  assert.ok(stageHtml().includes('4교시 국어'));
  page(`startLesson('ai');`);
  assert.strictEqual(page(`lessonRun.lesson.id`), 'ai');
  assert.strictEqual(page(`lessonRun.trip.count`), 3);
  assert.strictEqual(lessonIds().slice(-1)[0], 'break');
  page(`goHome();`);
});

test('긴 이동은 교시마다 다른 수업을 듣고, 보상 없이 숙제와 기록을 남긴다', () => {
  page(`localStorage.values.clear(); setEta(45); openLessons(); startLesson('dongbaek');`);
  hearPeriod();
  assert.strictEqual(page(`lessonProgress().ieum`), undefined); // 쉬는 시간이 시작될 때 바로 남긴다
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
  assert.ok(stageHtml().includes('수업을 마쳤어요'));
  assert.ok(!/깃털|도토리|배지|it-feather/.test(stageHtml()));
  page(`render();`);
  assert.ok(stageHtml().includes('수업을 마쳤어요'));
  assert.strictEqual(page(`lessonProgress().ieum`), undefined);
  assert.strictEqual(page(`lessonProgress().records.filter(record => record.finished).length`), 2);
  assert.ok(page(`lessonProgress().homework.title`).includes('점순이'));
  assert.ok(page(`lessonProgress().homeworkNext[0].title`).includes('하늘색'));
  page(`goHome(); setEta(null);`);
  assert.strictEqual(page(`lessonProgress().records.length`), 2);
});

test('쉬는 시간은 말하지 않는다', () => {
  page(`localStorage.values.clear(); DAIT_LESSONS.forEach(item => item.pieces.forEach(line => { line.voiced = true; }));
    var bridgeCalls = [];
    window.AndroidBridge = { speak: clips => bridgeCalls.push({ clips: JSON.parse(clips) }), stopSpeech() {}, setJourneyActive() {} };
    setEta(45); openLessons(); startLesson('dongbaek');`);
  hearPeriod();
  const spoken = page(`bridgeCalls.length`);
  assert.strictEqual(spoken, page(`lessonRun.pieces.length - 1`));
  page(`goHome(); delete window.AndroidBridge; setEta(null); DAIT_LESSONS.forEach(item => item.pieces.forEach(line => { delete line.voiced; }));`);
});

test('쉬는 시간은 넘기면 바로 다음 교시로 가고, 다시 듣기는 쉬는 시간을 다시 시작하지 않는다', () => {
  page(`localStorage.values.clear(); setEta(45); openLessons(); startLesson('dongbaek');
    while (!isLessonResting()) skipQuestion();`);
  page(`lessonRun.restedFrom = 1; driveReplay(); handlePrimaryAction();`);
  assert.strictEqual(page(`lessonRun.restedFrom`), 1);
  page(`skipQuestion();`);
  assert.strictEqual(page(`lessonRun.trip.number`), 2);
  assert.strictEqual(page(`isLessonResting()`), false);
  page(`goHome(); setEta(null);`);
});

test('주행 중 쉬는 시간도 문장 하나와 버튼 둘이고, 이전은 잠긴다', () => {
  page(`localStorage.values.clear(); setEta(45); openLessons(); startLesson('dongbaek'); window.setDrivingMode(true);
    while (!isLessonResting()) skipQuestion();
    var realGet = document.getElementById; var driveShown = {};
    document.getElementById = id => (id.startsWith('drive') ? (driveShown[id] = driveShown[id] || {}) : realGet(id));
    updateDriveScreen(lessonRun.pieces[lessonRun.index].line);`);
  assert.strictEqual(page(`driveShown.driveSentence.textContent`), '쉬는 시간이에요. 다음은 2교시 과학');
  assert.strictEqual(page(`driveShown.driveReplay.disabled`), true);
  assert.strictEqual(page(`driveShown.driveNext.textContent`), '다음 교시 듣기');
  page(`document.getElementById = realGet; window.setDrivingMode(false); goHome(); setEta(null);`);
});

test('수업 주행 화면의 버튼은 이전과 일시정지이고, 멈추면 이어 듣기로 바뀐다', () => {
  page(`localStorage.values.clear(); setEta(null); lessonMinutes = 15; startLesson('prime'); window.setDrivingMode(true);
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
  page(`localStorage.values.clear(); setEta(null); lessonMinutes = 15;
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
  page(`localStorage.values.clear(); setEta(null); lessonMinutes = 15; startLesson('prime');
    lessonRun.wait.endsAt = Date.now() + 5000; pauseLesson();`);
  assert.ok(page(`lessonRun.wait.left`) > 4000 && page(`lessonRun.wait.left`) <= 5000);
  page(`resumeLesson();`);
  assert.ok(page(`lessonRun.wait.endsAt - Date.now()`) <= 5000);
  page(`goHome();`);
});

test('일시정지와 거의 같이 조각이 끝나면 이어 듣기를 누를 때까지 다음 조각으로 넘어가지 않는다', () => {
  page(`localStorage.values.clear(); setEta(null); lessonMinutes = 15;
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
  page(`localStorage.values.clear(); setEta(null); lessonMinutes = 15; startLesson('prime');`);
  for (let i = 0; i < 3; i++) hearLesson('ended');
  page(`pauseLesson(); finishOnArrival();`);
  assert.strictEqual(page(`lessonRun === null || lessonRun.done`), true);
  assert.strictEqual(page(`lessonProgress().resume.lesson`), 'prime');
  page(`goHome();`);
});

test('멈춘 곳부터 잇다가 새로 들은 조각 없이 닫으면 기록과 멈춘 날짜를 그대로 둔다', () => {
  page(`localStorage.values.clear(); setEta(null); lessonMinutes = 15; startLesson('prime');`);
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
  page(`localStorage.values.clear(); setEta(null); lessonMinutes = 15; startLesson('prime'); nextLessonPiece(); nextLessonPiece();`);
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
  page(`localStorage.values.clear(); setEta(null); lessonMinutes = 15; startLesson('prime');`);
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
  page(`localStorage.values.clear(); setEta(null); lessonMinutes = 8; startLesson('prime');`);
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
  page(`localStorage.values.clear(); setEta(null); lessonMinutes = 15; startLesson('dongbaek');`);
  for (let i = 0; i < 3; i++) hearLesson('ended');
  page(`goHome(); setEta(20); window.setDrivingMode(true);
    var realGet = document.getElementById; var driveShown = {};
    document.getElementById = id => (id.startsWith('drive') ? (driveShown[id] = driveShown[id] || {}) : realGet(id));
    updateDriveScreen();`);
  assert.strictEqual(page(`driveShown.driveSentence.textContent`), '지난번 멈춘 곳부터 들을까요?');
  assert.ok(page(`driveShown.driveSub.textContent`).startsWith('동백꽃과 점순이 · 남은 약 '));
  page(`driveNext();`);
  assert.strictEqual(page(`lessonRun.lesson.id`), 'dongbaek');
  assert.strictEqual(page(`lessonRun.pieces[0].id`), page(`lessonProgress().resume.from`));
  page(`document.getElementById = realGet; window.setDrivingMode(false); goHome(); setEta(null); localStorage.values.clear();`);
});

test('학교 설정과 수업 대답 기록의 화면·호출 경로가 없다', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../main/assets/dait-preview.html'), 'utf8') + appSource();
  const appearance = fs.readFileSync(path.join(__dirname, '../../main/assets/dait-appearance.js'), 'utf8');
  assert.ok(!/수업 대답 기록|학교 지우기|학교 · 다니는 길|schoolSettingsOpened|toggleLessonRecord/.test(html + appearance));
  assert.equal(page('typeof openSettings'), 'undefined');
  assert.equal(page('typeof toggleLessonRecord'), 'undefined');
});

test('도착이 앞당겨지면 뒤 교시와 쉬는 시간이 빠지고, 늦어지면 되살아난다', () => {
  page(`localStorage.values.clear(); setEta(45); openLessons(); startLesson('dongbaek');`);
  assert.strictEqual(page(`lessonRun.trip.count`), 1);
  page(`setEta(12); applyNaviEta();`);
  assert.strictEqual(page(`lessonRun.trip.count`), 0);
  assert.ok(!lessonIds().includes('break'));
  page(`setEta(45); applyNaviEta();`);
  assert.strictEqual(page(`lessonRun.trip.count`), 1);
  assert.strictEqual(lessonIds().slice(-1)[0], 'break');
  page(`setEta(90); applyNaviEta();`);
  assert.strictEqual(page(`lessonRun.trip.count`), 2);
  page(`goHome(); setEta(null);`);
});

test('2교시에 도착이 다가오면 그 교시의 짧은 정리로 끝내고, 마친 1교시는 그대로 남는다', () => {
  page(`localStorage.values.clear(); setEta(45); openLessons(); startLesson('dongbaek');`);
  hearPeriod();
  page(`window.setDrivingMode(true);`);
  hearLesson('ended');
  page(`setEta(1); applyNaviEta();`);
  assert.strictEqual(lessonIds().slice(-1)[0], 's1');
  page(`while (!lessonRun.done) skipQuestion();`);
  assert.strictEqual(page(`lessonRun.finished`), false);
  assert.strictEqual(page(`lessonProgress().ieum`), undefined);
  page(`window.setDrivingMode(false); goHome(); setEta(null);`);
});

test('쉬는 시간에 도착하면 바로 마치고 기록을 두 번 남기지 않는다', () => {
  page(`localStorage.values.clear(); setEta(45); openLessons(); startLesson('dongbaek');`);
  hearPeriod();
  page(`finishOnArrival();`);
  assert.strictEqual(page(`lessonRun.done`), true);
  assert.strictEqual(page(`lessonProgress().records.length`), 1);
  page(`goHome(); setEta(null);`);
});

test('도착한 뒤 늦게 온 남은 시간으로 뒤 교시를 되살리지 않는다', () => {
  page(`localStorage.values.clear(); setEta(45); openLessons(); startLesson('dongbaek'); finishOnArrival(); applyNaviEta();`);
  assert.strictEqual(page(`lessonRun.trip.count`), 0);
  assert.ok(!lessonIds().includes('break'));
  page(`goHome(); setEta(null);`);
});

test('쉬는 시간에 지낸 만큼은 앞으로 쉴 시간에서 뺀다', () => {
  page(`localStorage.values.clear(); setEta(45); openLessons(); startLesson('dongbaek');`);
  hearPeriod();
  page(`lessonRun.trip.later[0] = DAIT_LESSONS.find(item => item.id === 'prime');`); // 9분에 필수가 들어가는 수업으로 남은 쉬는 시간만 시험
  page(`lessonRun.restedFrom = Date.now() - 9 * 60 * 1000; setEta(10); applyNaviEta();`);
  assert.strictEqual(page(`isLessonResting()`), true);
  assert.strictEqual(page(`lessonRun.trip.count`), 1);
  page(`lessonRun.restedFrom = Date.now(); applyNaviEta();`);
  assert.strictEqual(page(`lessonRun.done`), true); // 지금부터 다 쉬면 10분 안에 2교시가 못 들어간다
  page(`goHome(); setEta(null);`);
});

test('목적지가 없는 긴 이동은 고른 시간에서 지난 만큼을 뒤 교시에 나눈다', () => {
  page(`localStorage.values.clear(); openLessons(); lessonMinutes = 60; render(); startLesson('dongbaek');`);
  assert.strictEqual(page(`lessonRun.trip.minutes`), 25);
  page(`lessonRun.trip.endsAt = Date.now() + 15 * 60 * 1000; while (!isLessonResting()) skipQuestion(); skipQuestion();`);
  assert.strictEqual(page(`lessonRun.trip.number`), 2);
  assert.ok(Math.abs(page(`lessonRun.trip.minutes`) - 15) < 0.1);
  page(`goHome();`);
});

test('주행 중 제안도 남은 시간이 40분을 넘으면 교시로 듣는다', () => {
  page(`localStorage.values.clear(); setEta(45); window.setDrivingMode(true); lessonMinutes = Lesson.minutesFor(remainMinutes()); startLesson(lessonOffer({ kind: 'weekend' }).id);`);
  assert.strictEqual(page(`lessonRun.trip.count`), 1);
  page(`window.setDrivingMode(false); goHome(); setEta(null);`);
});

test('수업 시간은 기록 화면 같은 탭에서 8분·15분·20분만 고른다', () => {
  page(`localStorage.values.clear(); openLessons();`);
  assert.ok(!stageHtml().includes('data-lesson-filter'));
  assert.ok(!stageHtml().includes('>전체</button>'));
  assert.match(stageHtml(), /class="pearl-record-tabs lesson-time-tabs" role="tablist" aria-label="수업 시간">/);
  assert.match(stageHtml(), /class="lesson-pick pearl-record-content"/);
  assert.match(stageHtml(), /aria-selected="true" onclick="pickLessonTime\(8\)"/); // 처음 열면 8분 탭
  for (const minutes of [8,15,20]) assert.ok(stageHtml().includes(`onclick="pickLessonTime(${minutes})"`));
  assert.ok(!stageHtml().includes('onclick="pickLessonTime(30)"'));
  assert.ok(stageHtml().includes('id="lessonList"'));
  assert.ok(stageHtml().includes('id="lessonScrollDown"'));
  assert.ok(stageHtml().includes(`onclick="scrollList(1, 'lessonList')"`));
  assert.ok(stageHtml().includes('AI는 왜 자신 있게 틀릴까요?</span>')); // 카드 큰 글은 수업의 질문
  assert.ok(/<span class="lesson-meta"[^>]*>기술 · 약 \d+분 · AI는 왜 자신 있게 틀릴까<\/span>/.test(stageHtml()));
  page(`pickLessonTime(8);`);
  assert.strictEqual(page('lessonMinutes'), 8);
  assert.match(stageHtml(), /aria-selected="true" onclick="pickLessonTime\(8\)"/);
  page(`pickLessonTime(20); pickLessonTime(30);`);
  assert.strictEqual(page('lessonMinutes'), 20);
  page(`isDrivingMode = true; pickLessonTime(15); isDrivingMode = false;`);
  assert.strictEqual(page('lessonMinutes'), 20);
  page(`naviInfo = {remainTime:480,at:Date.now()}; pickLessonTime(15);`);
  assert.strictEqual(page('lessonMinutes'), 20);
  page(`render();`);
  assert.ok(!stageHtml().includes('lesson-time-tabs'));
  page(`naviInfo = null;`);
  page(`goHome();`);
});

test('출발하면 듣기로 고른 수업은 출발할 때 시작하고, 고르는 동안에는 말하지 않는다', () => {
  page(`localStorage.values.clear(); openLessons(); toggleLessonArm('ai');`);
  assert.strictEqual(page(`armed.mode`), 'lesson');
  assert.ok(!stageHtml().includes('출발하면 들려줄게요')); // 예약은 버튼 글자(예약 취소)로만 보여 준다
  assert.ok(stageHtml().includes(`onclick="toggleLessonArm('ai')">예약 취소</button>`));
  assert.strictEqual(page(`currentMode`), 'lessonPick');
  assert.strictEqual(page(`lessonRun`), null);
  assert.strictEqual(page(`speechPhase`), 'idle');
  page(`goHome();`);
  assert.strictEqual(page(`armed.lesson`), 'ai');
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
  assert.ok(!stageHtml().includes('출발하면 들려줄게요'));
  page(`window.setDrivingMode(true);`);
  assert.strictEqual(page(`lessonRun`), null);
  page(`window.setDrivingMode(false); goHome();`);
});

test('예약할 때 고른 시간을 쓰되, 출발할 때 남은 시간을 알면 그 시간을 쓴다', () => {
  page(`localStorage.values.clear(); openLessons(); lessonMinutes = 30; render(); toggleLessonArm('ai'); window.setDrivingMode(true);`);
  assert.strictEqual(page(`lessonRun.lesson.id`), 'ai');
  assert.ok(Math.abs(page(`lessonRun.trip.minutes + lessonRun.trip.laterMinutes`) - 30) < 0.01); // AI 수업 뒤 남는 시간은 이어 붙일 수업 몫
  page(`window.setDrivingMode(false); goHome(); openLessons(); toggleLessonArm('ai'); goHome(); setEta(45); window.setDrivingMode(true);`);
  assert.strictEqual(page(`lessonRun.trip.count`), 1); // 40분이 넘으면 교시로 듣는다
  page(`window.setDrivingMode(false); goHome(); setEta(null);`);
});

test('출발할 때 남은 시간에 들어가지 않는 예약은 말하지 않고 지운다', () => {
  page(`localStorage.values.clear(); openLessons(); toggleLessonArm('dongbaek'); goHome(); setEta(2); window.setDrivingMode(true);`);
  assert.strictEqual(page(`armed`), null);
  assert.strictEqual(page(`lessonRun`), null);
  assert.strictEqual(page(`speechPhase`), 'idle');
  page(`window.setDrivingMode(false); setEta(null);`);
});

test('수업 예약은 옛 답 기록 설정과 무관하게 마이크를 묻지 않고 주행 중에는 고를 수 없다', () => {
  page(`localStorage.values.clear(); var micAsks = 0; micAsked = false;
    window.AndroidBridge = { micState: () => 'ask', requestMic() { micAsks++; window.onMicAnswered(); }, speak() {}, stopSpeech() {}, setJourneyActive() {} };
    openLessons(); toggleLessonArm('ai');`);
  assert.strictEqual(page(`micAsks`), 0);
  page(`disarm(); writeStored('dait.lessonRecord', true); toggleLessonArm('ai');`);
  assert.strictEqual(page(`micAsks`), 0);
  assert.strictEqual(page(`armed.lesson`), 'ai');
  page(`disarm(); localStorage.values.clear(); delete window.AndroidBridge; micAsked = false; goHome(); window.setDrivingMode(true); toggleLessonArm('ai');`);
  assert.strictEqual(page(`armed`), null);
  page(`window.setDrivingMode(false);`);
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

test('시간이 모자라 시작하지 못한 수업 예약은 출발할 때 지운다', () => {
  page(`localStorage.values.clear(); goHome(); arm({ mode: 'lesson', lesson: 'dongbaek', minutes: 15 }); renderStage();`);
  page(`setEta(2); window.setDrivingMode(true);`);
  assert.strictEqual(page(`armed`), null);
  page(`window.setDrivingMode(false); setEta(null);`);
});

test('학교 등록 전 첫 화면은 빈 칸 없이 수업의 질문을 보여 주고, 도착 시간을 모르면 도착을 약속하지 않는다', () => {
  page(`localStorage.values.clear(); goHome(); setEta(null); lessonMinutes = 15; renderStage();`);
  const html = page(`document.getElementById('stageArea').innerHTML`);
  assert.ok(html.includes(page('escapeHtml(homePick.question)'))); // 추천 수업은 무작위다
  assert.ok(html.includes('분이면 답을 알게 돼요'));
  assert.ok(!html.includes('등록 필요'));
  assert.ok(!html.includes('하교 대화'));
  page(`setEta(20); renderStage();`);
  assert.ok(page(`document.getElementById('stageArea').innerHTML`).includes('도착할 때쯤 답을 알게 돼요'));
  page(`setEta(3); renderStage();`);
  assert.ok(page(`document.getElementById('stageArea').innerHTML`).includes('다음에 들려 드릴게요'));
  page(`setEta(null); lessonMinutes = 15; renderStage();`);
});

test('주행 제안은 시간대와 관계없이 수업을 권한다', () => {
  page(`window.setDrivingMode(true); updateDriveScreen();`);
  assert.ok(page(`lessonOffer(currentTrip()).question`).endsWith('?'));
  assert.ok(page(`lessonOffer({ mode: 'afternoon', kind: 'afternoon' })`));
  page(`window.setDrivingMode(false); render();`);
});

test('출발하면 듣기를 예약하면 첫 화면 로고의 점이 깜빡인다', () => {
  page(`localStorage.values.clear(); goHome();`);
  assert.ok(!navHtml().includes('dait-brand-badge waiting'));
  page(`toggleLessonArm('dongbaek'); goHome();`);
  assert.ok(navHtml().includes('dait-brand-badge waiting'));
  page(`disarm(); localStorage.values.clear(); goHome();`);
});

test('30분 이동은 동백꽃 뒤에 쉬지 않고 다른 수업을 이어 듣고, 주차 중이어도 끊지 않는다', () => {
  page(`localStorage.values.clear(); setEta(30); openLessons();`);
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
  page(`goHome(); setEta(null);`);
});


test('음악을 골라 재생하고 멈춤·이어 듣기·이전·완료 기록까지 연결한다', () => {
  page(`DAIT_LESSONS.push(${JSON.stringify(APP_LESSONS.find(item => item.id === 'rhythm'))});
    localStorage.values.clear(); setEta(null); window.setDrivingMode(false);
    openLessons(); lessonMinutes = 8; render();`);
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


test('처음부터 듣기는 멈춤·중단지점을 초기화하고 현재 수업을 한 번만 완료 처리한다', () => {
  page(`localStorage.values.clear(); setEta(null); window.setDrivingMode(false);
    openLessons(); lessonMinutes = 8; render();
    var restartClips = [];
    window.AndroidBridge = { micState: () => 'none', speak: clips => restartClips.push(JSON.parse(clips)), stopSpeech() {},
      holdSpeech() {}, proceedSpeech() {}, setJourneyActive() {} };
    startLesson('rhythm');`);
  assert.ok(stageHtml().includes('class="pearl-transport"')); // 처음부터 듣기는 설정 팝업으로 이동했다.
  for (let i = 0; i < 3; i++) hearLesson('ended');
  page(`lessonRun.meters = 1200; pauseLesson();
    writeStored(LESSON_KEY, Lesson.keepResume(lessonProgress(), Lesson.resumePoint(lessonRun.lesson, lessonRun.heard, toYmd(new Date()))));
    var oldSeq = speechSeq; var oldRun = lessonRun; var beforeRestartEnd = lessonRun.trip.endsAt;
    restartLesson();`);
  assert.strictEqual(page('lessonRun === oldRun'), false);
  assert.strictEqual(page('lessonRun.index'), 0);
  assert.strictEqual(page('lessonRun.pieces[0].id'), 'm1');
  assert.strictEqual(page('lessonRun.trip.minutes'), 8);
  assert.ok(page('lessonRun.trip.endsAt >= beforeRestartEnd'));
  assert.strictEqual(page('lessonRun.heard.length'), 0);
  assert.strictEqual(page('lessonRun.meters'), 1200);
  assert.strictEqual(page('lessonRun.paused'), false);
  assert.strictEqual(page('lessonProgress().resume'), null);
  assert.strictEqual(page('lessonProgress().records.length'), 0);
  assert.strictEqual(page('lessonProgress().ieum'), undefined);
  assert.strictEqual(page('restartClips.at(-1)[0]'), 'lesson/rhythm_m1');
  page(`window.onSpeechEvent(JSON.stringify({event:'ended',seq:oldSeq}));`);
  assert.strictEqual(page('lessonRun.index'), 0);
  hearPeriod();
  assert.strictEqual(page('lessonProgress().records.length'), 1);
  assert.strictEqual(page('lessonProgress().ieum'), undefined);
  assert.ok(!stageHtml().includes('onclick="restartLesson()"'));
  page('restartLesson(); goHome(); delete window.AndroidBridge;');
});

test('처음부터 듣기는 앞 교시의 기록을 보존하고 주행 중에는 실행하지 않는다', () => {
  page(`localStorage.values.clear(); setEta(60); window.setDrivingMode(false); openLessons(); startLesson('rhythm');`);
  hearPeriod();
  page('nextLessonPiece();');
  const firstRecord = page('JSON.stringify(lessonProgress().records)');
  const lessonId = page('lessonRun.lesson.id');
  hearLesson('ended');
  page('restartLesson();');
  assert.strictEqual(page('lessonRun.lesson.id'), lessonId);
  assert.strictEqual(page('lessonRun.trip.earned'), undefined);
  assert.strictEqual(page('JSON.stringify(lessonProgress().records)'), firstRecord);
  assert.strictEqual(page('lessonRun.index'), 0);
  page('window.setDrivingMode(true); renderStage(); var drivingRun = lessonRun; restartLesson();');
  assert.strictEqual(page('lessonRun === drivingRun'), true);
  assert.ok(!stageHtml().includes('onclick="restartLesson()"'));
  page('window.setDrivingMode(false); setEta(null); goHome();');
});


test('진행바는 음원 경계를 표시하고 구간·초 단위 탐색과 일시정지를 유지한다', () => {
  page(`localStorage.values.clear(); setEta(null); window.setDrivingMode(false);
    openLessons(); lessonMinutes = 8; render();
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
  assert.strictEqual(page('lessonProgress().ieum'), undefined); // 마지막 구간만 들으면 수업 완료 보상이 생기지 않는다.
  page('goHome(); delete window.AndroidBridge;');
});

test('브라우저 탐색은 새 음원 metadata 뒤에도 정확한 위치를 적용하고 생각할 틈으로도 이동한다', () => {
  page(`localStorage.values.clear(); setEta(null); window.setDrivingMode(false); openLessons(); lessonMinutes = 8; render();
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


test('기록 화면은 수업 기록과 기존 배지 여섯 장을 보여 준다', () => {
  page(`goHome(); localStorage.values.clear(); openPearlTab('records');`);
  assert.ok(!stageHtml().includes('내 배움 보관함'));
  assert.ok(stageHtml().includes('>배움 기록</button>'));
  assert.ok(stageHtml().includes('>획득 배지</button>'));
  page(`selectRecordTab('badges');`);
  assert.equal((stageHtml().match(/<img src="badges\//g) || []).length, 6);
  for (const id of ['first-discovery','korean','math','exploration','well-rounded-explorer','everyday-discoverer']) {
    assert.ok(fs.existsSync(path.join(__dirname, '../../main/assets/badges', id + '.png')));
  }
  assert.ok(!stageHtml().includes('받는 방법은 준비 중'));
  page(`selectRecordTab('lessons'); goHome();`);
});

test('기록의 큰 위아래 버튼은 화면 높이만큼 이동하고 끝·주행 중 조작을 막는다', () => {
  const result = page(`(() => {
    const original = document.getElementById;
    const up = {}, down = {}, positions = [];
    const panel = {scrollTop:0,scrollHeight:1000,clientHeight:300,scrollBy({top}) { this.scrollTop = Math.max(0, Math.min(700, this.scrollTop + top)); }};
    const thumb = {style:{setProperty(key,value){positions.push(value)}}};
    document.getElementById = id => ({recordPanel:panel,recordScrollUp:up,recordScrollDown:down,recordScrollThumb:thumb,lessonList:panel,lessonScrollUp:up,lessonScrollDown:down,lessonScrollThumb:thumb}[id] || original(id));
    try {
      updateListScroll(); const atStart = up.disabled && !down.disabled;
      scrollList(1); updateListScroll(); const moved = panel.scrollTop;
      panel.scrollTop = 700; updateListScroll(); const atEnd = down.disabled && !up.disabled;
      isDrivingMode = true; scrollList(-1); updateListScroll();
      const blocked = panel.scrollTop===700 && up.disabled && down.disabled;
      isDrivingMode = false; panel.scrollTop = 0;
      updateListScroll('lessonList','lessonScroll'); const lessonAtStart = up.disabled && !down.disabled;
      scrollList(1,'lessonList'); const lessonMoved = panel.scrollTop;
      isDrivingMode = true; scrollList(-1,'lessonList'); updateListScroll('lessonList','lessonScroll');
      return {atStart,moved,atEnd,blocked,lessonAtStart,lessonMoved,lessonBlocked:panel.scrollTop===240 && up.disabled && down.disabled};
    } finally {document.getElementById = original; isDrivingMode = false;}
  })()`);
  assert.strictEqual(result.atStart, true);
  assert.strictEqual(result.moved, 240);
  assert.strictEqual(result.atEnd, true);
  assert.strictEqual(result.blocked, true);
  assert.strictEqual(result.lessonAtStart, true);
  assert.strictEqual(result.lessonMoved, 240);
  assert.strictEqual(result.lessonBlocked, true);
});

test('배움 기록은 날짜를 제목 위에 월·일로 표시하고 완료 문구를 바꾼다', () => {
  page(`goHome(); localStorage.values.clear(); writeStored(LESSON_KEY, { ...Lesson.normalize(), records: [
    { lesson: 'prime', title: '소수 기록', ymd: '20261106', finished: true },
    { lesson: 'ai', title: 'AI 기록', ymd: '2026-11-09', finished: false }
  ] }); openPearlTab('records');`);
  assert.match(stageHtml(), /11월 6일<\/span><strong>소수 기록<\/strong><span class="pearl-record-complete">배움 완료!/);
  assert.match(stageHtml(), /11월 9일<\/span><strong>AI 기록<\/strong>/);
  assert.match(stageHtml(), /<span class="pearl-record-status">듣던 수업<\/span><\/div><button class="pearl-record-resume"[^>]*aria-label="이어 들을 위치가 없는 기록" disabled><span class="lesson-play"/);
  assert.ok(!stageHtml().includes('마저 듣기'));
  assert.ok(!stageHtml().includes('20261106'));
  assert.ok(!stageHtml().includes('마친 수업'));
  page(`resumeRecord(1);`);
  assert.strictEqual(page('currentMode'), 'records');
  page(`goHome(); localStorage.values.clear();`);
});

test('배움 기록의 마저 듣기는 다른 수업을 들은 뒤에도 그 기록의 구간과 초부터 재생한다', () => {
  page(`goHome(); localStorage.values.clear(); setEta(null); lessonMinutes = 15; startLesson('prime');
    lessonRun.wait.endsAt = Date.now() + (lessonRun.wait.endPosition - 2.5) * 1000;
    pauseLesson(); openPearlTab('records');`);
  const point = page(`lessonProgress().records[0].resume`);
  assert.strictEqual(point.lesson, 'prime');
  assert.ok(Math.abs(point.offset - 2.5) < .1);
  page(`startLesson('ai');`);
  for (let i = 0; i < 3; i++) hearLesson('ended');
  page(`openPearlTab('records');`);
  assert.strictEqual(page(`lessonProgress().resume.lesson`), 'ai');
  page(`resumeRecord(0);`);
  assert.strictEqual(page('lessonRun.lesson.id'), 'prime');
  assert.strictEqual(page('lessonRun.pieces[0].id'), point.from);
  assert.ok(Math.abs(page('lessonRun.positionSeconds') - point.offset) < .1);
  page(`goHome(); window.setDrivingMode(true); resumeRecord(0);`);
  assert.strictEqual(page('currentMode'), null);
  page(`window.setDrivingMode(false); goHome(); localStorage.values.clear();`);
});

test('배움 기록에서 구형 중단 위치도 연결하며 네이티브 음원을 저장된 초로 이동한다', () => {
  page(`localStorage.values.clear(); var legacyPoint = {lesson:'prime',from:'b4',heard:['i1','i2'],ymd:toYmd(new Date()),offset:3};
    writeStored(LESSON_KEY, { ...Lesson.normalize(), resume: legacyPoint, records: [{lesson:'prime',title:'소수',ymd:legacyPoint.ymd,finished:false}] });
    var recordSeek = null; DAIT_LESSONS.find(item => item.id === 'prime').pieces.forEach(piece => piece.voiced = true);
    window.AndroidBridge = {micState:()=> 'none',speak(){},stopSpeech(){},setJourneyActive(){},seekSpeech(ms){recordSeek=ms}};
    openPearlTab('records'); resumeRecord(0);`);
  assert.strictEqual(page('lessonRun.pieces[0].id'), 'b4');
  assert.strictEqual(page('recordSeek'), 3000);
  page(`goHome(); delete window.AndroidBridge; DAIT_LESSONS.find(item => item.id === 'prime').pieces.forEach(piece => delete piece.voiced); localStorage.values.clear();`);
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

  page(`goHome(); localStorage.values.clear();`);
});


test('시간 이동은 구간 경계를 넘고 일시정지를 유지하며 주행 중 자유 탐색은 막는다', () => {
  page(`localStorage.values.clear(); setEta(null); window.setDrivingMode(false); goHome(); lessonMinutes = 15; startLesson('sky'); pauseLesson();
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
test('제거한 학교 설정의 진입점은 남아 있지 않다', () => {
  assert.equal(page('typeof searchSchools'), 'undefined');
  assert.equal(page('typeof pickSchool'), 'undefined');
  assert.equal(page('typeof clearSchool'), 'undefined');
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


test('옛 보상 값은 저장소에서도 제거하고 수업 기록은 보존한다', () => {
  page(`localStorage.values.clear(); writeStored(LESSON_KEY, { ieum: 12, records: [{ lesson: 'ai', title: 'AI', ymd: '20261108', finished: true, answers: [] }] }); goHome();`);
  assert.strictEqual(page("Object.hasOwn(readStored(LESSON_KEY), 'ieum')"), false);
  assert.strictEqual(page('lessonProgress().records.length'), 1);
  assert.ok(!/깃털|도토리|배지/.test(stageHtml()));
  page('localStorage.values.clear(); goHome(); openLessons();');
  assert.ok(!stageHtml().includes('lesson-side'));
  page('goHome();');
});


test('별 헤는 밤은 국어 목록에서 고르고 재생·멈춤·구간 이동·이어 듣기가 된다', () => {
  page(`Object.assign(DAIT_LESSONS.find(item => item.id === 'starry'), ${JSON.stringify(STARRY_LESSON)});`);
  page(`localStorage.values.clear(); window.setDrivingMode(false); goHome(); setEta(null); lessonMinutes = 15; openLessons(); render();`);
  assert.ok(stageHtml().includes('별을 헤는데 왜 숫자가 없을까요?'));
  assert.ok(stageHtml().includes("startLesson('starry')"));
  page(`startLesson('starry');`);
  assert.strictEqual(page('lessonRun.lesson.id'), 'starry');
  assert.ok(page('lessonRun.pieces.every(piece => piece.voiced)'));
  page('pauseLesson();');
  assert.strictEqual(page('lessonRun.paused'), true);
  page('resumeLesson(); seekLessonSection(2);');
  assert.strictEqual(page('lessonRun.index'), 2);
  page('window.setDrivingMode(true); seekLessonSection(0);');
  assert.strictEqual(page('lessonRun.index'), 2);
  page(`window.setDrivingMode(false); goHome(); lessonMinutes = 8; startLesson('starry');`);
  assert.strictEqual(page('lessonRun.short'), true);
  page(`lessonRun.heard = lessonRun.pieces.slice(0, 2); goHome(); startLesson('starry', true);`);
  assert.strictEqual(page('lessonRun.lesson.id'), 'starry');
  assert.strictEqual(page('lessonRun.short'), true);
  assert.notStrictEqual(page('lessonRun.pieces[0].id'), 's_i1');
  page('goHome(); localStorage.values.clear(); setEta(null); lessonMinutes = 15;');
});


test('상단 로고를 누르면 인트로 없이 메인 화면으로 가고 주행 중에는 움직이지 않는다', () => {
  page(`goHome(); window.setDrivingMode(false); var originalSplash = playSplashIntro; var logoReplays = 0; playSplashIntro = () => { logoReplays++; }; openPearlTab('records');`);
  const handler = navHtml().match(/class="pearl-brand"[^>]*onclick="([^"]+)"/)[1];
  page(handler);
  assert.strictEqual(page('currentMode'), null);
  assert.ok(navHtml().includes(`aria-current="page" onclick="openPearlTab('now')"`));
  assert.ok(!navHtml().includes('pearl-eta')); // 15분 수업 버튼은 없다
  assert.ok(navHtml().includes('onclick="togglePearlTheme()"'));
  assert.strictEqual(page('logoReplays'), 0);
  page(`openPearlTab('records'); window.setDrivingMode(true);`);
  const before = page('currentMode');
  page(handler);
  assert.strictEqual(page('currentMode'), before);
  page('window.setDrivingMode(false); playSplashIntro = originalSplash; goHome();');
});

test('메인 카드는 수업마다 주제 무늬와 과목 꼬리표를 단다', () => {
  assert.strictEqual(page(`DAIT_LESSONS.filter(lesson => !LESSON_PATTERNS[lesson.id]).map(lesson => lesson.id).join(',')`), '');
  page(`localStorage.values.clear(); goHome();`);
  assert.match(stageHtml(), /class="home-card start question-card pearl-hero" data-pattern="\w+" style="--pattern:url\(&quot;data:image\/svg\+xml,/);
  assert.match(stageHtml(), /<span class="pearl-subject">[^<]+<\/span>/);
});

test('추천 탭은 시간에 맞는 수업 중 안 들은 수업에서 무작위로 고르고, 다 들었으면 전체에서 고른다', () => {
  assert.ok(navHtml().includes(`onclick="openPearlTab('now')">추천</button>`));
  page(`localStorage.values.clear(); disarm(); lessonMinutes = 15; var __random = Math.random;`);
  const fitting = JSON.parse(page(`JSON.stringify(Lesson.recommend(DAIT_LESSONS, 15, []).map(lesson => lesson.id))`));
  assert.ok(fitting.length > 2);
  const record = id => `{ lesson: '${id}', ymd: '20261109', title: '${id}', finished: true }`;
  // 하나만 안 들었으면 무작위 값과 상관없이 그 수업이다.
  const left = fitting[fitting.length - 1];
  for (const value of [0, .5, .99]) {
    page(`writeStored(LESSON_KEY, { records: [${fitting.slice(0, -1).map(record).join(',')}] }); Math.random = () => ${value}; openPearlTab('now');`);
    assert.strictEqual(page(`homePick.id`), left);
  }
  // 다 들었으면 시간에 맞는 수업 전체에서 고른다. 다시 그려도 바뀌지 않는다.
  page(`writeStored(LESSON_KEY, { records: [${fitting.map(record).join(',')}] }); Math.random = () => .99; openPearlTab('now');`);
  assert.strictEqual(page(`homePick.id`), fitting[fitting.length - 1]);
  page(`Math.random = () => 0; render();`);
  assert.strictEqual(page(`homePick.id`), fitting[fitting.length - 1]);
  page(`openPearlTab('now');`);
  assert.strictEqual(page(`homePick.id`), fitting[0]);
  page(`Math.random = __random; localStorage.values.clear();`);
});
