const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { appScripts, appSource } = require('./app-files.js');
const Lesson = require('../../main/assets/dait-lesson.js');
// 어떤 수업이 몇 교시에 오는지는 수업 길이에 따라 바뀐다. 시험은 같은 계획 함수의 답과 화면이 맞는지 본다.
const plan = (minutes, first) => Lesson.periods(Lesson.planTrip(Lesson.tripOrder(DAIT_LESSONS, [], first, { series: true }), minutes, { series: true }));
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
    DaitPlaylist: require('../../main/assets/dait-playlist.js'), DaitPlayback: require('../../main/assets/dait-playback.js'), Lesson, DAIT_LESSONS, console: { log() {} }, URLSearchParams, performance,
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
  // 시험을 빨리 진행하는 도우미는 앱에 싣지 않는다. 실제 UI의 이동 경로는 seekLessonAt이다.
  page(`function skipLessonPiece() { if (currentMode === 'lesson' && lessonRun && !lessonRun.done) nextLessonPiece(true); }
    function hearWholeLesson() { const last = lessonRun && lessonTimeline(lessonRun).sections.at(-1); if (last) lessonRun.furthest = { piece: last.piece, offset: last.seconds }; }
    function seekLessonSection(index) { const section = lessonRun && lessonTimeline(lessonRun).sections.find(item => item.index === index); if (section) { hearWholeLesson(); seekLessonAt(section.start); } }`);
  // 수업은 들은 곳까지만 앞으로 간다. 이동 시험들은 hearWholeLesson으로 끝까지 들은 것처럼 해 두고 이동한다.
  // 남은 시간은 내비가 알려 준 값으로만 정해진다. 시험에서는 내비 값을 꾸며 넣는다.
  page(`function setEta(minutes) { naviInfo = minutes === null ? null : { name: '', remainTime: minutes * 60, remainDistance: NaN, at: Date.now() }; }`);
  assert.ok(stage.innerHTML.includes('question-title'));
  assert.ok(nav.innerHTML.includes('기록'));
  assert.ok(!stage.innerHTML.includes('등교 대화'));
  assert.strictEqual(typeof sandbox.setDrivingMode, 'function');
});

test('앞 경로가 끝났다는 신호가 새 경로를 지우지 않는다', () => {
  page(`window.onNaviUpdate(JSON.stringify({ event: 'routeStarted', name: '학교', remainTime: 600, remainDistance: 3000 }));
        window.onNaviUpdate(JSON.stringify({ event: 'routeEnded' }));`);
  assert.strictEqual(page('naviInfo.name'), '학교');
  page(`naviInfo = null;`);
});

test('제거한 학교·장소·위치·마이크·문 열림·하교 대화 기능의 진입점이 없다', () => {
  const asset = name => fs.readFileSync(path.join(__dirname, '../../main/assets', name), 'utf8');
  const source = appSource() + asset('dait-preview.html') + asset('dait-appearance.js');
  for (const gone of ['neisGet', 'tourGet', 'micState', 'requestMic', 'onCarLocation', 'onDoorOpened', 'startRoute', 'dait-rules.js', 'renderPlaces', '말로 답하기', 'dait-journey.js', 'startFlow', 'renderDialogueFlow', '대화 중 질문', 'voices/nika']) {
    assert.ok(!source.includes(gone), gone);
  }
});


function hearLesson(event, extra = '') {
  page(`window.onSpeechEvent(JSON.stringify({ event: '${event}', seq: speechSeq${extra} }));`);
  // Existing journey tests advance the new five-second handoff explicitly.
  if(page('lessonRun?.nextAt>0'))page('nextLessonCountdownTick(lessonRun,lessonRun.nextAt);');
}

test('수업은 조각을 차례로 틀고, 끝까지 들으면 기록을 남기고 숙제는 남기지 않는다', () => {
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
  assert.strictEqual(page(`lessonProgress().homework`), undefined); // 숙제 기능은 뺐다(2026-11-09)
  page(`goHome();`);
  assert.strictEqual(page(`lessonRun`), null);
  assert.strictEqual(page(`lessonProgress().records.length`), 1);
});

test('다음 수업은 지난 수업 복습 없이 그 수업 도입으로 시작한다', () => {
  page(`startLesson('ai');`);
  assert.strictEqual(page(`lessonRun.pieces[0].kind`), '도입');
  while (!page(`Lesson.isQuestion(lessonRun.pieces[lessonRun.index])`)) page(`skipLessonPiece();`);
  page(`goHome();`);
});

test('수업을 넘기기만 하면 이음을 주지 않는다', () => {
  page(`localStorage.values.clear(); startLesson('dongbaek');`);
  hearLesson('ended');
  while (!page(`lessonRun.done`)) page(`skipLessonPiece();`);
  assert.strictEqual(page(`lessonRun.finished`), false);
  assert.strictEqual(page(`lessonProgress().ieum`), undefined);
  page(`goHome();`);
});

test('수업 기록에는 대답 칸이 없고, 예전에 남은 대답도 지운다', () => {
  page(`localStorage.values.clear(); writeStored(LESSON_KEY, { records: [{ lesson: 'ai', title: 'AI', ymd: '20261101', finished: true, answers: [{ text: '예전 답' }] }] });
    lessonMinutes = 15; startLesson('dongbaek'); while (!lessonRun.done) skipLessonPiece();`);
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
  page(`playLessonPiece(); setEta(null); goHome();`);
});

test('마지막 조각을 넘기면 소리를 멈추고, 주차 중이면 앞쪽 작업도 내려간다', () => {
  page(`localStorage.values.clear(); startLesson('dongbaek');`);
  assert.strictEqual(page(`journeyActive`), true);
  page(`while (!lessonRun.done) skipLessonPiece();`);
  assert.strictEqual(page(`speechPhase`), 'idle');
  assert.strictEqual(page(`journeyActive`), false);
  page(`goHome();`);
});

test('멈춘 수업은 도착하면 닫고, 달리는 동안 저절로 다시 시작하지 않는다', () => {
  page(`localStorage.values.clear(); startLesson('dongbaek');`);
  hearLesson('stopped');
  page(`window.setDrivingMode(true);`);
  assert.strictEqual(page(`lessonRun.stopped`), true);
  page(`finishOnArrival();`);
  assert.strictEqual(page(`lessonRun.done`), true);
  page(`window.setDrivingMode(false); goHome();`);
});

test('다 들은 수업 화면은 다음 출발 때 닫혀 수업 제안을 가리지 않는다', () => {
  page(`localStorage.values.clear(); startLesson('dongbaek'); while (!lessonRun.done) skipLessonPiece();`);
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
  assert.ok(stageHtml().includes(`1교시 ${plan(40)[0].subject} · 2교시 ${plan(40)[1].subject} · 쉬는 시간 10분`));
  page(`goHome(); setEta(null);`);
});

test('목적지가 없을 때 긴 시간이면 교시로 나눈다', () => {
  page(`localStorage.values.clear(); openLessons();`);
  page(`lessonMinutes = 90; render();`);
  assert.ok(stageHtml().includes(`4교시 ${plan(90)[3].subject}`));
  page(`startLesson('ai');`);
  assert.strictEqual(page(`lessonRun.lesson.id`), 'ai');
  assert.strictEqual(page(`lessonRun.trip.count`), 3);
  assert.strictEqual(lessonIds().slice(-1)[0], 'break');
  page(`goHome();`);
});

test('긴 이동은 교시마다 다른 수업을 듣고, 보상·숙제 없이 기록을 남긴다', () => {
  page(`localStorage.values.clear(); setEta(45); openLessons(); startLesson('dongbaek');`);
  hearPeriod();
  assert.strictEqual(page(`lessonProgress().ieum`), undefined); // 쉬는 시간이 시작될 때 바로 남긴다
  assert.strictEqual(page(`lessonRun.done`), false);
  assert.strictEqual(page(`journeyActive`), true);
  const second = plan(45, 'dongbaek')[1];
  assert.ok(stageHtml().includes(`쉬는 시간이에요. 다음은 2교시 ${second.subject}`));
  assert.ok(!stageHtml().includes('음원 준비 중'));
  assert.ok(!stageHtml().includes('다시 듣기'));
  page(`window.setDrivingMode(true);`);
  hearLesson('ended');
  assert.strictEqual(page(`lessonRun.lesson.id`), second.id);
  assert.notStrictEqual(page(`lessonRun.pieces[0].kind`), '복습'); // 앞 교시를 「지난 시간에는」으로 되짚지 않는다
  assert.ok(stageHtml().includes(`2교시 ${second.subject}`));
  hearPeriod();
  page(`window.setDrivingMode(false);`);
  assert.strictEqual(page(`lessonRun.done`), true);
  assert.ok(stageHtml().includes('수업을 마쳤어요'));
  assert.ok(!/깃털|도토리|배지|it-feather/.test(stageHtml()));
  page(`render();`);
  assert.ok(stageHtml().includes('수업을 마쳤어요'));
  assert.strictEqual(page(`lessonProgress().ieum`), undefined);
  assert.strictEqual(page(`lessonProgress().records.filter(record => record.finished).length`), 2);
  assert.strictEqual(page(`lessonProgress().homework`), undefined);
  assert.strictEqual(page(`lessonProgress().homeworkNext`), undefined);
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

test('발문 뒤 생각할 틈과 쉬는 시간에만 배경음을 깔고, 멈추거나 말을 시작하면 끈다', () => {
  page(`localStorage.values.clear(); DAIT_LESSONS.forEach(item => item.pieces.forEach(line => { line.voiced = true; }));
    var bedCalls = [];
    bedAdapter.on = false;
    window.AndroidBridge = { speak() {}, stopSpeech() {}, setJourneyActive() {}, startBed: () => bedCalls.push('start'), stopBed: () => bedCalls.push('stop') };
    setEta(45); openLessons(); startLesson('dongbaek');`);
  const last = () => page(`bedCalls[bedCalls.length - 1]`);
  assert.notStrictEqual(last(), 'start'); // 말하는 동안에는 깔지 않는다
  page(`while (!Lesson.isQuestion(lessonRun.pieces[lessonRun.index])) skipLessonPiece();`);
  assert.notStrictEqual(last(), 'start'); // 발문을 말하는 동안에도 깔지 않는다
  hearLesson('ended');
  assert.strictEqual(page(`lessonRun.wait.kind`), 'thinking');
  assert.strictEqual(last(), 'start');
  page(`pauseLesson();`);
  assert.strictEqual(last(), 'stop');
  page(`resumeLesson();`);
  assert.strictEqual(last(), 'start');
  page(`nextLessonPiece();`); // 생각할 틈이 끝나 다음 말을 시작한다
  assert.strictEqual(last(), 'stop');
  page(`while (!isLessonResting()) skipLessonPiece();`);
  assert.strictEqual(last(), 'start'); // 교시 사이 쉬는 시간
  page(`goHome();`);
  page(`if (lessonRun && !lessonRun.done) endLesson();`);
  assert.strictEqual(last(), 'stop');
  page(`delete window.AndroidBridge; setEta(null); DAIT_LESSONS.forEach(item => item.pieces.forEach(line => { delete line.voiced; }));`);
});

test('쉬는 시간은 넘기면 바로 다음 교시로 가고, 다시 듣기는 쉬는 시간을 다시 시작하지 않는다', () => {
  page(`localStorage.values.clear(); setEta(45); openLessons(); startLesson('dongbaek');
    while (!isLessonResting()) skipLessonPiece();`);
  page(`lessonRun.restedFrom = 1; driveReplay(); if (!isLessonResting()) playLessonPiece();`);
  assert.strictEqual(page(`lessonRun.restedFrom`), 1);
  page(`skipLessonPiece();`);
  assert.strictEqual(page(`lessonRun.trip.number`), 2);
  assert.strictEqual(page(`isLessonResting()`), false);
  page(`goHome(); setEta(null);`);
});

test('주행 중 쉬는 시간도 문장 하나와 버튼 둘이고, 이전은 잠긴다', () => {
  page(`localStorage.values.clear(); setEta(45); openLessons(); startLesson('dongbaek'); window.setDrivingMode(true);
    while (!isLessonResting()) skipLessonPiece();
    var realGet = document.getElementById; var driveShown = {};
    document.getElementById = id => (id.startsWith('drive') ? (driveShown[id] = driveShown[id] || {}) : realGet(id));
    updateDriveScreen(lessonRun.pieces[lessonRun.index].line);`);
  assert.strictEqual(page(`driveShown.driveSentence.textContent`), `쉬는 시간이에요. 다음은 2교시 ${plan(45, 'dongbaek')[1].subject}`);
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
  assert.strictEqual(page(`driveShown.driveSub.textContent`), '');
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
  const stopAt = page(`lessonRun.pieces[lessonRun.index].id`); // 여섯 조각을 듣고 일곱째 조각 앞에서 멈춘다
  page(`goHome();`);
  const resume = page(`lessonProgress().resume`);
  assert.strictEqual(resume.lesson, 'prime');
  assert.strictEqual(resume.from, stopAt);
  assert.strictEqual(resume.short, false);
  page(`openLessons();`);
  assert.ok(stageHtml().includes('지난번 멈춘 곳부터: 소수는 어디까지 있을까'));
  assert.strictEqual(stageHtml().split(`startLesson('prime'`).length - 1, 1); // 같은 수업을 목록에 두 번 두지 않는다
  page(`startLesson('prime', true);`);
  // 멈춘 곳부터 잇는다. 이번 시간에 들어가지 않는 더 듣기 조각은 건너뛸 수 있다.
  const order = page(`DAIT_LESSONS.find(item => item.id === 'prime').pieces.map(piece => piece.id)`);
  assert.ok(order.indexOf(page(`lessonRun.pieces[0].id`)) >= order.indexOf(stopAt));
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
  page(`while (!lessonRun.done) skipLessonPiece();`);
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
  page(`lessonRun.trip.later[0] = DAIT_LESSONS.find(item => item.id === 'prime'); lessonRun.trip.series = false;`); // 시리즈 규칙(원래 판만)은 따로 시험한다. 9분에 필수가 들어가는 수업으로 남은 쉬는 시간만 시험
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
  page(`lessonRun.trip.endsAt = Date.now() + 15 * 60 * 1000; while (!isLessonResting()) skipLessonPiece(); skipLessonPiece();`);
  assert.strictEqual(page(`lessonRun.trip.number`), 2);
  assert.ok(Math.abs(page(`lessonRun.trip.minutes`) - 15) < 0.1);
  page(`goHome();`);
});

test('주행 중 제안도 남은 시간이 40분을 넘으면 교시로 듣는다', () => {
  page(`localStorage.values.clear(); setEta(45); window.setDrivingMode(true); lessonMinutes = Lesson.minutesFor(remainMinutes()); startLesson(lessonOffer().id);`);
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
  assert.ok(/<span class="lesson-meta"[^>]*>기술 · 약 \d+분<\/span>/.test(stageHtml()));
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


test('예약이 없으면 출발해도 수업도 대화도 시작하지 않는다', () => {
  page(`localStorage.values.clear(); goHome(); window.setDrivingMode(true);`);
  assert.strictEqual(page(`currentMode`), null);
  assert.strictEqual(page(`lessonRun`), null);
  assert.strictEqual(page(`speechPhase`), 'idle');
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
  page(`lessonRun.index = lessonRun.pieces.findIndex(Lesson.isBreak); playLessonPiece(); skipLessonPiece();`);
  assert.strictEqual(page(`lessonRun.done`), false);
  assert.notStrictEqual(page(`lessonRun.lesson.id`), 'dongbaek');
  page(`goHome(); lessonMinutes = 15;`);
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
  assert.ok(page(`lessonOffer().question`).endsWith('?'));
  page(`window.setDrivingMode(false); render();`);
});


test('30분 이동은 동백꽃 뒤에 쉬지 않고 다른 수업을 이어 듣고, 주차 중이어도 끊지 않는다', () => {
  page(`localStorage.values.clear(); setEta(30); openLessons();`);
  assert.ok(stageHtml().includes('도착까지 30분, 수업을 이어 들어요'));
  assert.ok(stageHtml().includes('고른 수업이 끝나고 남는 시간은 다른 수업으로 이어 채워요'));
  assert.ok(!stageHtml().includes('교시'));
  page(`startLesson('dongbaek'); while (!isLessonResting()) skipLessonPiece();`);
  const next = plan(30, 'dongbaek')[1];
  assert.ok(stageHtml().includes(`이어서 ${next.subject} 수업 맛보기예요`)); // 남은 약 9분은 다른 수업의 짧은 판으로 채운다
  assert.ok(stageHtml().includes('국어 수업 마침'));
  assert.ok(stageHtml().includes('다음 수업 듣기'));
  page(`onLessonSpeech({ event: 'ended' });nextLessonCountdownTick(lessonRun,lessonRun.nextAt);`); // 새 종료 화면의 5초를 지난 뒤 잇는다
  assert.strictEqual(page(`lessonRun.done`), false);
  assert.strictEqual(page(`lessonRun.lesson.id`), next.id);
  assert.notStrictEqual(page(`lessonRun.pieces[0].kind`), '복습'); // 방금 들은 동백꽃을 「지난 시간에는」으로 되풀이하지 않는다
  assert.ok(stageHtml().includes(`${next.subject} 수업`));
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
  page('nextLessonPiece();nextLessonCountdownTick(lessonRun,lessonRun.nextAt);');
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
  assert.ok(Math.abs(page('seekTimeline.seconds') - page('Lesson.totalSeconds(lessonRun.pieces)')) < .01);
  page('seekLessonSection(2);');
  assert.strictEqual(page('lessonRun.index'), 2);
  assert.strictEqual(page('lessonRun.heard.length'), 0); // 건너뛴 조각을 들었다고 기록하지 않는다.
  page('pauseLesson(); hearWholeLesson(); seekLessonAt(lessonTimeline(lessonRun).sections[2].start + 12.5);');
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
    startLesson('rhythm'); hearWholeLesson();
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


test('기록 화면은 기존 여섯 배지와 승인된 확장 네 배지를 둘러보기로 보여 준다', () => {
  page(`goHome(); localStorage.values.clear(); openPearlTab('records');`);
  assert.ok(!stageHtml().includes('내 배움 보관함'));
  assert.ok(stageHtml().includes('>배움 기록</button>'));
  assert.ok(stageHtml().includes('>배지 둘러보기</button>'));
  page(`selectRecordTab('badges');`);
  assert.equal((stageHtml().match(/<img src="badges\//g) || []).length, 10);
  for (const id of ['first-discovery','korean','math','science','technology','music','exploration','well-rounded-explorer','everyday-discoverer','series-completion']) {
    assert.ok(fs.existsSync(path.join(__dirname, '../../main/assets/badges', id + '.png')));
    assert.ok(stageHtml().includes(`src="badges/${id}.png"`));
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

test('배움 기록은 날짜·수업명·상태 링·재생 버튼을 표시하고 상태 문구는 중복하지 않는다', () => {
  page(`goHome(); localStorage.values.clear(); writeStored(LESSON_KEY, { ...Lesson.normalize(), records: [
    { lesson: 'prime', title: '소수 기록', ymd: '20261106', finished: true },
    { lesson: 'ai', title: 'AI 기록', ymd: '2026-11-09', finished: false }
  ] }); openPearlTab('records');`);
  assert.match(stageHtml(), /11월 6일<\/span><strong>소수 기록<\/strong>/);
  assert.ok(stageHtml().includes('pearl-record-state-ring is-complete'));
  assert.match(stageHtml(), /11월 9일<\/span><strong>AI 기록<\/strong>/);
  assert.ok(stageHtml().includes('aria-label="듣던 수업 처음부터 듣기"'));
  const visible=stageHtml().replace(/<[^>]*>/g,'');
  assert.ok(!/배움 완료|듣던 수업/.test(visible));
  assert.ok(!stageHtml().includes('마저 듣기'));
  assert.ok(!stageHtml().includes('20261106'));
  assert.ok(!stageHtml().includes('마친 수업'));
  page(`resumeRecord(1);`);
  assert.strictEqual(page('currentMode'), 'lesson');
  assert.strictEqual(page('lessonRun.lesson.id'), 'ai');
  page(`goHome(); localStorage.values.clear();`);
});

test('중복 중단 기록을 읽을 때 저장소도 정리하고 최신 기록 버튼이 그 위치를 이어 듣는다', () => {
  page(`goHome(); localStorage.values.clear(); var latestRecordPoint = { lesson:'prime', from:'b4', heard:['i1','i2'], ymd:toYmd(new Date()), offset:7 };
    writeStored(LESSON_KEY, { records: [
      {lesson:'prime',title:'옛 소수',finished:false,ymd:'20261101',resume:{...latestRecordPoint,from:'b1',offset:1}},
      {lesson:'ai',title:'AI',finished:false,ymd:'20261102'},
      {lesson:'prime',title:'최신 소수',finished:false,ymd:latestRecordPoint.ymd,resume:latestRecordPoint}
    ] }); openPearlTab('records');`);
  assert.ok(!stageHtml().includes('옛 소수'));
  assert.match(stageHtml(), /최신 소수/);
  assert.strictEqual(page(`readStored(LESSON_KEY).records.length`), 2);
  page(`resumeRecord(1);`);
  assert.strictEqual(page('lessonRun.lesson.id'), 'prime');
  assert.strictEqual(page('lessonRun.pieces[0].id'), 'b4');
  assert.strictEqual(page('lessonRun.positionSeconds'), 7);
  page(`goHome(); localStorage.values.clear();`);
});

test('배움 기록의 마저 듣기는 다른 수업을 들은 뒤에도 그 기록의 구간과 초부터 재생한다', () => {
  page(`goHome(); localStorage.values.clear(); setEta(null); lessonMinutes = 15; startLesson('prime');
    lessonRun.wait.endsAt = Date.now() + (lessonRun.wait.endPosition - 2.5) * 1000;
    pauseLesson(); goHome(); openPearlTab('records');`);
  const point = page(`lessonProgress().records[0].resume`);
  assert.strictEqual(point.lesson, 'prime');
  assert.ok(Math.abs(point.offset - 2.5) < .1);
  page(`startLesson('ai');`);
  for (let i = 0; i < 3; i++) hearLesson('ended');
  page(`goHome(); openPearlTab('records');`);
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

test('기록 탐색은 수업을 끝내지 않고 주행하면 재생 화면으로 돌아간다', () => {
  page(`lessonMinutes = 15; startLesson('ai');`);
  page(`openPearlTab('lessons');`);
  assert.strictEqual(page('currentMode'), 'lesson');
  page(`window.setDrivingMode(true); openPearlTab('records');`);
  assert.strictEqual(page('currentMode'), 'lesson');
  page(`window.setDrivingMode(false); openPearlTab('records');`);
  assert.strictEqual(page('currentMode'), 'lesson');
  assert.strictEqual(page('lessonView'), 'records');
  assert.ok(page('lessonRun'));
  assert.strictEqual(page('lessonRun.done'), false);
  page(`window.setDrivingMode(true);`);
  assert.strictEqual(page('lessonView'), null);
  page(`window.setDrivingMode(false); goHome(); localStorage.values.clear();`);
});


test('시간 이동은 구간 경계를 넘고 일시정지를 유지하며 주행 중 자유 탐색은 막는다', () => {
  page(`localStorage.values.clear(); setEta(null); window.setDrivingMode(false); goHome(); lessonMinutes = 15; startLesson('sky'); pauseLesson();
    var timeBoundary = lessonTimeline(lessonRun).sections[1].start;
    hearWholeLesson(); seekLessonAt(timeBoundary - 5); seekLessonBy(15);`);
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

test('수업은 앞으로 건너뛸 수 없고 들은 곳까지만 다시 돌아간다', () => {
  page(`localStorage.values.clear(); setEta(null); window.setDrivingMode(false); goHome(); lessonMinutes = 15; startLesson('sky'); pauseLesson();
    var heardTimeline = lessonTimeline(lessonRun);
    seekLessonAt(heardTimeline.seconds - 1);`);
  assert.strictEqual(page('lessonRun.index'), 0); // 처음 듣는 수업은 재생바로 뒤쪽에 갈 수 없다
  assert.strictEqual(page('lessonRun.positionSeconds || 0'), 0);
  page('seekLessonBy(15); window.onMediaKey("next"); window.onMediaKey("seek", 600000);');
  assert.strictEqual(page('lessonRun.index'), 0); // 앞으로 버튼·차의 다음 버튼·차 재생바도 마찬가지다
  assert.strictEqual(page('lessonRun.positionSeconds || 0'), 0);
  page('skipLessonPiece(); skipLessonPiece(); seekLessonBy(-3600);'); // 두 조각을 듣고 처음으로 돌아간다
  assert.strictEqual(page('lessonRun.index'), 0);
  page('seekLessonAt(heardTimeline.seconds - 1);');
  assert.strictEqual(page('lessonRun.index'), 2); // 들은 끝까지는 한 번에 돌아온다
  assert.strictEqual(page('lessonRun.positionSeconds || 0'), 0);
  page('seekLessonBy(15);');
  assert.strictEqual(page('lessonRun.index'), 2);
  assert.strictEqual(page('lessonRun.positionSeconds || 0'), 0);
  page(`seekLessonBy(-3600); var heardSlider = { value: String(heardTimeline.seconds) }; previewLessonSeek(heardSlider);`);
  assert.ok(Math.abs(Number(page('heardSlider.value')) - page('lessonTimeline(lessonRun).sections.find(item => item.index === 2).start')) < .01); // 손잡이는 들은 끝에서 멈춘다
  page('cancelLessonScrub(); window.setDrivingMode(false); goHome();');
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
 page(`onMediaKey('next');`); assert.equal(page('lessonRun.index'),0); // 안 들은 곳으로는 넘어가지 않는다
 page(`hearWholeLesson(); onMediaKey('next');`); assert.ok(page('lessonRun.index')>=1);
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
  assert.ok(page('lessonRun.pieces.every(piece => piece.voiced || !piece.seconds)')); // 아직 녹음 전인 새 조각만 음원이 없다
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
  assert.ok(!navHtml().includes('togglePearlTheme'));
  assert.ok(navHtml().includes('aria-label="재생목록"'));
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
  page(`localStorage.values.clear();  lessonMinutes = 15; var __random = Math.random;`);
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

test('추천·수업·기록을 탐색해도 같은 재생 세션과 오디오 순번을 유지한다', () => {
  page(`goHome(); localStorage.values.clear(); lessonMinutes=15; startLesson('prime'); var browsingRun=lessonRun; var browsingSeq=speechSeq;
    openPearlTab('now'); openPearlTab('records'); openPearlTab('lessons');`);
  assert.strictEqual(page('lessonRun === browsingRun'), true);
  assert.equal(page('currentMode'), 'lesson');
  assert.equal(page('lessonView'), 'lessons');
  assert.equal(page('speechSeq'), page('browsingSeq'));
  assert.equal(page('lessonRun.done'), false);
  page(`pauseLesson(); var pausedBrowseSeq=speechSeq; returnToLesson(); startLesson('prime');`);
  assert.equal(page('lessonView'), null);
  assert.equal(page('lessonRun === browsingRun'), true);
  assert.equal(page('lessonRun.paused'), true);
  assert.equal(page('speechSeq'), page('pausedBrowseSeq'));
  page('goHome(); localStorage.values.clear();');
});

test('탐색 중 핸들 시간 이동·수동 멈춤을 유지하고 주행하면 같은 수업의 전체화면으로 돌아간다', () => {
  page(`goHome(); lessonMinutes=15; startLesson('prime'); openPearlTab('records'); window.onMediaKey('pause'); window.onMediaKey('next');`);
  assert.equal(page('lessonView'), 'records');
  assert.equal(page('lessonRun.paused'), true);
  assert.equal(page('currentMode'), 'lesson');
  page('window.setDrivingMode(true); openPearlTab("records");');
  assert.equal(page('lessonView'), null);
  assert.equal(page('lessonRun.done'), false);
  assert.equal(page('lessonRun.paused'), true);
  page('window.setDrivingMode(false); goHome();');
});

test('탐색하다 다른 수업을 시작하면 이전 구간·초를 저장하고 새 수업으로 전환한다', () => {
  page(`goHome(); localStorage.values.clear(); lessonMinutes=15; startLesson('prime');
    lessonRun.wait.endsAt=Date.now()+(lessonRun.wait.endPosition-2.5)*1000; pauseLesson(); openPearlTab('now'); startLesson('ai');`);
  assert.equal(page('lessonRun.lesson.id'), 'ai');
  assert.equal(page('lessonView'), null);
  assert.equal(page('lessonProgress().records[0].resume.lesson'), 'prime');
  assert.ok(Math.abs(page('lessonProgress().records[0].resume.offset')-2.5)<.1);
  page('openPearlTab("records"); stopLessonFromDock();');
  assert.equal(page('lessonRun'), null);
  assert.equal(page('currentMode'), 'records');
  assert.equal(page('speechPhase'), 'idle');
  page('goHome(); localStorage.values.clear();');
});

test('사람이 멈춘 수업은 문구 없이 재생 조작으로 표시하고 시스템 중단 안내와 구분한다', () => {
  page(`goHome(); localStorage.values.clear(); lessonMinutes=15; startLesson('prime'); openPearlTab('records');`);
  assert.equal(page('lessonDockState(lessonRun)'), '듣는 중');
  // 앱의 재생기(VoiceSession.hold)는 사람이 멈출 때도 paused를 알린다.
  page(`pauseLesson(); window.onSpeechEvent(JSON.stringify({ event: 'paused', seq: speechSeq }));`);
  assert.equal(page('lessonRun.playback.interrupted'), true);
  assert.equal(page('lessonDockState(lessonRun)'), '');
  page(`resumeLesson(); window.onSpeechEvent(JSON.stringify({ event: 'resumed', seq: speechSeq }));`);
  assert.equal(page('lessonDockState(lessonRun)'), '듣는 중');
  // 길 안내·통화가 소리를 가져간 때만 다른 소리 안내를 보여 준다.
  page(`window.onSpeechEvent(JSON.stringify({ event: 'paused', seq: speechSeq }));`);
  assert.equal(page('lessonDockState(lessonRun)'), '다른 소리가 끝나면 이어 들어요');
  page(`window.onSpeechEvent(JSON.stringify({ event: 'resumed', seq: speechSeq })); goHome(); localStorage.values.clear();`);
});

test('음원이 없는 조각만 재생 화면에 음원 준비 중으로 알린다', () => {
  page(`goHome(); localStorage.values.clear(); lessonMinutes=15; startLesson('prime'); var unvoicedPiece = lessonRun.pieces[0]; var unvoicedWas = unvoicedPiece.voiced;`);
  page(`unvoicedPiece.voiced = false;`);
  assert.equal(page('lessonPieceUnvoiced(lessonRun)'), true);
  page(`unvoicedPiece.voiced = true;`);
  assert.equal(page('lessonPieceUnvoiced(lessonRun)'), false);
  page(`if (unvoicedWas === undefined) delete unvoicedPiece.voiced; else unvoicedPiece.voiced = unvoicedWas; goHome(); localStorage.values.clear();`);
});

test('뒤로 가기는 수업을 종료하지 않고 추천으로 이동하며 루트에서는 시스템에 넘긴다', () => {
  page(`goHome(); lessonMinutes=15; startLesson('prime'); var backPlaybackSeq=speechSeq;`);
  assert.equal(page('window.handleAppBack()'), true);
  assert.equal(page('lessonView'), 'now');
  assert.equal(page('window.handleAppBack()'), false);
  assert.equal(page('lessonRun.done'), false);
  assert.equal(page('speechSeq'), page('backPlaybackSeq'));
  page('goHome();');
});


function resetPlaylistTest(){page(`window.setDrivingMode(false);goHome();localStorage.values.clear();setEta(null);lessonMinutes=8;lessonQueue.items=[];lessonQueue.series=[];lessonQueue.autoNext=true;lessonQueue.followSeries=true;lessonQueue.cues=true;`)}
function finishPlaylistTestLesson(advance=true){page(`lessonRun.heard=lessonRun.pieces.filter(piece=>!Lesson.isBreak(piece));lessonRun.reachedEnd=true;lessonRun.index=lessonRun.pieces.length-1;nextLessonPiece();`);if(advance&&page('lessonRun.nextAt>0'))page('nextLessonCountdownTick(lessonRun,lessonRun.nextAt)')}

test('출발 예약 진입점은 제거하고 목록을 담아도 출발만으로 소리를 시작하지 않는다',()=>{
  resetPlaylistTest();page(`addLessonToQueue('ai','last');window.setDrivingMode(true);`);
  assert.equal(page('lessonRun'),null);assert.equal(page('speechPhase'),'idle');
  const source=appSource();assert.ok(!/toggleLessonArm|startArmed|let armed/.test(source));
  resetPlaylistTest();
});
test('듣는 중 목록을 편집해도 같은 세션과 수동 멈춤을 유지하며 영구 저장한다',()=>{
  resetPlaylistTest();page(`startLesson('dongbaek');pauseLesson();var queueRun=lessonRun;addLessonToQueue('ai','last');addLessonToQueue('prime','next');`);
  assert.equal(page('lessonRun===queueRun'),true);assert.equal(page('lessonRun.paused'),true);
  assert.deepEqual(Array.from(page(`readStored(PLAYLIST_KEY).items.map(i=>i.lesson)`)),['prime','ai']);
  resetPlaylistTest();
});
test('자연 종료에서만 사용자가 넣은 다음 수업으로 넘어가고 사용한 항목만 뺀다',()=>{
  resetPlaylistTest();page(`addLessonToQueue('ai','last');addLessonToQueue('prime','last');startLesson('dongbaek');`);finishPlaylistTestLesson();
  assert.equal(page('lessonRun.lesson.id'),'ai');assert.deepEqual(Array.from(page('lessonQueue.items.map(i=>i.lesson)')),['prime']);
  assert.equal(page(`lessonProgress().records.some(i=>i.lesson==='dongbaek'&&i.finished)`),true);
  resetPlaylistTest();
});
test('자동 재생을 끄거나 사용자가 끝내면 다음 목록을 보존하고 멈춘다',()=>{
  resetPlaylistTest();page(`addLessonToQueue('ai','last');lessonQueue.autoNext=false;startLesson('dongbaek');`);finishPlaylistTestLesson();
  assert.equal(page('lessonRun.done'),true);assert.equal(page('lessonQueue.items.length'),1);
  page(`goHome();lessonQueue.autoNext=true;startLesson('dongbaek');endLesson();`);
  assert.equal(page('lessonRun.done'),true);assert.equal(page('lessonQueue.items.length'),1);
  resetPlaylistTest();
});
test('도착했거나 남은 시간에 다음 수업이 들어가지 않으면 목록을 소비하지 않는다',()=>{
  resetPlaylistTest();page(`addLessonToQueue('ai','last');startLesson('dongbaek');setEta(2);`);finishPlaylistTestLesson();
  assert.equal(page('lessonRun.lesson.id'),'dongbaek');assert.equal(page('lessonRun.done'),true);assert.equal(page('lessonQueue.items.length'),1);
  resetPlaylistTest();page(`addLessonToQueue('ai','last');startLesson('dongbaek');hasArrived=true;`);finishPlaylistTestLesson();
  assert.equal(page('lessonRun.done'),true);assert.equal(page('lessonQueue.items.length'),1);resetPlaylistTest();
});
test('수업 순서는 강제하지 않고 먼저 듣기 안내를 선택한 뒤에만 재생한다',()=>{
  resetPlaylistTest();page(`lessonQueue.series=new DaitPlaylist.Playlist(DAIT_LESSONS,{},[{title:'시험 시리즈',lessons:['dongbaek','starry']}]).series;var seriesPrompt=null;window.showSeriesOrderPrompt=(id,opts)=>{seriesPrompt={id,opts}};startLesson('starry');`);
  assert.equal(page('seriesPrompt.id'),'starry');assert.equal(page('lessonRun'),null);
  page(`startLesson('starry',false,null,{skipSeriesPrompt:true});delete window.showSeriesOrderPrompt;`);
  assert.equal(page('lessonRun.lesson.id'),'starry');resetPlaylistTest();
});
test('직접 고른 목록은 시리즈 자동 다음 편보다 먼저 재생한다',()=>{
  resetPlaylistTest();page(`lessonQueue.series=new DaitPlaylist.Playlist(DAIT_LESSONS,{},[{title:'시험 시리즈',lessons:['dongbaek','starry']}]).series;addLessonToQueue('ai','last');startLesson('dongbaek');`);finishPlaylistTestLesson();
  assert.equal(page('lessonRun.lesson.id'),'ai');resetPlaylistTest();
});
test('최신 팀 결정대로 시리즈를 골라도 지난 수업 복습은 다시 붙이지 않는다',()=>{
 resetPlaylistTest();page(`lessonQueue.series=new DaitPlaylist.Playlist(DAIT_LESSONS,{},[{title:'시험',lessons:['dongbaek','starry']}]).series;writeStored(LESSON_KEY,{records:[{lesson:'dongbaek',finished:true}]});startLesson('starry',false,null,{skipSeriesPrompt:true});`);
 assert.ok(!page(`lessonRun.pieces.some(p=>p.kind==='복습')`));resetPlaylistTest();
});

test('시리즈 예고 음원은 같은 시리즈를 순서대로 이어 들을 때만 연결할 자리를 준비한다',()=>{
 resetPlaylistTest();page(`lessonQueue.series=new DaitPlaylist.Playlist(DAIT_LESSONS,{},[{title:'시험',lessons:['dongbaek','starry'],outros:{dongbaek:{clip:'lesson/series_demo_outro',seconds:3,text:'다음 시간에는 다음 작품을 만나 봅니다.'}}}]).series;startLesson('dongbaek');`);
 assert.ok(page('lessonRun.pieces.some(piece=>piece.seriesOutro)'));
 page(`goHome();lessonQueue.cues=false;startLesson('dongbaek');`);assert.ok(!page('lessonRun.pieces.some(piece=>piece.seriesOutro)'));
 resetPlaylistTest();
});

test('명시적으로 같은 수업을 다시 담으면 한 번 재생하고 이미 소비한 항목을 반복하지 않는다',()=>{
 resetPlaylistTest();page(`addLessonToQueue('dongbaek','last');startLesson('dongbaek');var firstQueuedRun=lessonRun;`);finishPlaylistTestLesson();
 assert.equal(page('lessonRun.lesson.id'),'dongbaek');assert.equal(page('lessonRun===firstQueuedRun'),false);assert.equal(page('lessonQueue.items.length'),0);
 assert.equal(page('lessonRun.trip.count'),0);resetPlaylistTest();
});
test('끝나는 순간 일시정지나 시스템 중단이 있으면 다음 목록을 소비하지 않는다',()=>{
 resetPlaylistTest();page(`addLessonToQueue('ai','last');startLesson('dongbaek');pauseLesson();`);hearLesson('ended');
 assert.equal(page('lessonRun.lesson.id'),'dongbaek');assert.equal(page('lessonQueue.items.length'),1);
 resetPlaylistTest();page(`addLessonToQueue('ai','last');startLesson('dongbaek');lessonRun.playback.interrupt();`);finishPlaylistTestLesson();
 assert.equal(page('lessonRun.done'),true);assert.equal(page('lessonQueue.items.length'),1);resetPlaylistTest();
});

test('+는 기본 맨 뒤 추가이고 토스트 전환은 방금 넣은 항목만 옮기며 재생을 건드리지 않는다',()=>{
 resetPlaylistTest();page(`startLesson('dongbaek');pauseLesson();var quickRun=lessonRun,quickSeq=speechSeq,quickNotice;window.playlistNotice=(message,action)=>{quickNotice={message,action}};addLessonToQueue('ai');addLessonToQueue('prime');addLessonToQueue('ai');var quickKeys=lessonQueue.items.map(i=>i.key),quickAction=quickNotice.action;`);
 assert.deepEqual(Array.from(page('lessonQueue.items.map(i=>i.lesson)')),['ai','prime','ai']);
 assert.equal(page('quickNotice.action.label'),'바로 다음에 재생');assert.equal(page('quickNotice.action.title'),DAIT_LESSONS.find(x=>x.id==='ai').title);assert.equal(page('quickNotice.action.count'),3);page('quickAction.onClick();');
 assert.deepEqual(Array.from(page('lessonQueue.items.map(i=>i.key)')),Array.from(page('[quickKeys[2],quickKeys[0],quickKeys[1]]')));
 assert.equal(page('lessonRun===quickRun&&speechSeq===quickSeq&&lessonRun.paused'),true);assert.equal(page('lessonQueue.items.length'),3);
 page(`lessonQueue.remove(quickKeys[2]);quickAction.onClick();`);assert.equal(page('lessonQueue.items[0].key'),page('quickKeys[0]'));
 page('delete window.playlistNotice;');resetPlaylistTest();
});
test('토스트를 누르기 전에 주행으로 바뀌면 순서를 변경하지 않는다',()=>{
 resetPlaylistTest();page(`addLessonToQueue('ai');addLessonToQueue('prime');var quickBefore=JSON.stringify(lessonQueue.items);window.setDrivingMode(true);promoteQueuedLesson(lessonQueue.items[1].key);`);
 assert.equal(page('JSON.stringify(lessonQueue.items)'),page('quickBefore'));resetPlaylistTest();
});

test('시리즈 차례대로 듣기는 처음에 켜져 있고, 켜면 매미를 마친 뒤 첫 화면 수업이 소수다', () => {
  page(`localStorage.values.clear(); lessonQueue.followSeries=true; setDrivingMode(false); lessonMinutes = 15;`);
  assert.strictEqual(page(`seriesOn()`), true);
  page(`writeStored(LESSON_KEY, { records: [{ lesson: 'cicada', title: '매미와 소수', ymd: '20261109', finished: true }] }); homePick = null; openPearlTab('now');`);
  assert.strictEqual(page(`homeLesson().lesson.id`), 'prime');
  assert.strictEqual(page(`toggleSeries()`), true);
  assert.strictEqual(page(`seriesOn()`), false);
  assert.strictEqual(page(`lessonRules().series`), false);
  page(`toggleSeries(); localStorage.values.clear();`);
});


test('종료 화면은 비활성 구간 대신 5초 대기 뒤 한 항목만 소비한다',()=>{
 resetPlaylistTest();page(`addLessonToQueue('ai');addLessonToQueue('prime');startLesson('starry',false,null,{skipSeriesPrompt:true});`);finishPlaylistTestLesson(false);
 assert.equal(page('lessonRun.done'),true);assert.equal(page('lessonRun.nextSeconds'),5);assert.equal(page('lessonQueue.items.length'),2);
 assert.ok(!stageHtml().includes('lesson-progress-track'));assert.ok(!stageHtml().includes('lesson-sections'));assert.ok(stageHtml().includes('5초 후 재생'));
 page('nextLessonCountdownTick(lessonRun,lessonRun.nextAt-1000)');assert.equal(page('lessonRun.nextSeconds'),1);assert.equal(page('lessonQueue.items.length'),2);
 page('nextLessonCountdownTick(lessonRun,lessonRun.nextAt)');assert.equal(page('lessonRun.lesson.id'),'ai');assert.equal(page('lessonQueue.items.length'),1);resetPlaylistTest();
});
test('종료 화면 취소·끄기·도착·목록 변경은 오래된 자동 실행을 무효화한다',()=>{
 for(const cancel of ['cancelNextLessonAutoplay()','toggleNextLessonAutoplay()','finishOnArrival()','addLessonToQueue(\'prime\')','goHome()']){
  resetPlaylistTest();page(`addLessonToQueue('ai');startLesson('starry',false,null,{skipSeriesPrompt:true});`);finishPlaylistTestLesson(false);
  page('var canceledRun=lessonRun,canceledAt=lessonRun.nextAt;'+cancel+';nextLessonCountdownTick(canceledRun,canceledAt+1000)');
  assert.ok(page("lessonRun?.lesson.id!=='ai'"),cancel);assert.ok(page("lessonQueue.items.some(i=>i.lesson==='ai')"),cancel);
 }resetPlaylistTest();
});
test('수동 종료는 5초 자동 재생을 시작하지 않으며 완료 직후 중단 신호도 취소한다',()=>{
 resetPlaylistTest();page(`addLessonToQueue('ai');startLesson('starry',false,null,{skipSeriesPrompt:true});endLesson();`);
 assert.ok(!page('lessonRun.nextAt'));assert.equal(page('lessonQueue.items.length'),1);
 resetPlaylistTest();page(`addLessonToQueue('ai');startLesson('starry',false,null,{skipSeriesPrompt:true});`);finishPlaylistTestLesson(false);
 page(`window.onSpeechEvent(JSON.stringify({event:'paused',seq:speechSeq}));nextLessonCountdownTick(lessonRun,Date.now()+6000)`);
 assert.equal(page('lessonRun.done'),true);assert.equal(page('lessonQueue.items.length'),1);page('speechPaused=false');resetPlaylistTest();
});


test('제작자 시리즈 다음 편은 원래 판이 들어갈 때만 자동 전환 후보로 삼는다',()=>{
 resetPlaylistTest();page(`lessonQueue.series=new DaitPlaylist.Playlist(DAIT_LESSONS,{},[{title:'소수 이야기',lessons:['cicada','prime']}]).series;var authorRun={lesson:{id:'cicada'},trip:{count:0}};lessonMinutes=8;`);
 assert.equal(page('nextLessonCandidate(authorRun)'),null);page('lessonMinutes=20');assert.equal(page('nextLessonCandidate(authorRun).lesson'),'prime');resetPlaylistTest();
});

test('카드가 선택한 8분 분량은 같은 수업의 기존 15분 세션으로 돌아가지 않는다',()=>{
 page(`window.setDrivingMode(false);goHome();localStorage.values.clear();setEta(null);lessonMinutes=15;startLesson('dongbaek');pauseLesson();lessonMinutes=8;startLesson('dongbaek',false,null,{minutes:8});`);
 assert.equal(page('lessonRun.trip.minutes'),8);
 assert.ok(page('lessonTimeline(lessonRun).seconds')<8*60);
 page('goHome();localStorage.values.clear();');
});
test('완료 수업의 재생 버튼은 복습을 시작하고 다시 들어도 배지의 최초 날짜를 바꾸지 않는다',()=>{
 page(`goHome();localStorage.values.clear();writeStored(LESSON_KEY,{...Lesson.normalize(),records:[{lesson:'dongbaek',title:'동백꽃',ymd:'20261101',finished:true}]});openPearlTab('records');syncBadgeLedger();resumeRecord(0);`);
 assert.equal(page('lessonRun.lesson.id'),'dongbaek');assert.equal(page('lessonView'),null);
 assert.equal(page('readStored(BADGE_KEY).awards.korean.day'),'20261101');
 page('goHome();localStorage.values.clear();');
});
test('앞으로 이동 한계는 같은 조각을 다시 조립하거나 마지막 들은 조각이 빠져도 남은 청취 이력으로 계산한다',()=>{
 page(`goHome();localStorage.values.clear();setEta(null);lessonMinutes=15;startLesson('sky');pauseLesson();
   var firstHeardPiece=lessonRun.pieces[0];lessonRun.wait=null;lessonRun.positionSeconds=4;noteLessonHeard(lessonRun);
   lessonRun.index=1;lessonRun.positionSeconds=6;noteLessonHeard(lessonRun);
   lessonRun.pieces=lessonRun.pieces.map(p=>({...p}));seekLessonBy(-3600);`);
 assert.ok(page('lessonHeardLimit(lessonRun)')>6);
 page(`lessonRun.pieces=lessonRun.pieces.filter((p,i)=>i!==1);`);
 assert.ok(Math.abs(page('lessonHeardLimit(lessonRun)')-4)<.01);
 page('seekLessonBy(30);');assert.ok(page('lessonRun.positionSeconds')<=4.001);assert.ok(page('lessonRun.positionSeconds')>3.9);
 page('goHome();localStorage.values.clear();');
});


test('기록의 진행 링은 저장한 실제 재생 위치를 쓰며 완료 전에는 가득 차지 않는다',()=>{
 assert.equal(page('recordFraction({elapsedSeconds:25,totalSeconds:100,finished:false},null)'),.25);
 assert.equal(page('recordFraction({elapsedSeconds:120,totalSeconds:100,finished:false},null)'),.999);
 assert.equal(page('recordFraction({finished:true},null)'),1);
 assert.equal(page('recordFraction({finished:false},null)'),0);
 page(`goHome();localStorage.values.clear();setEta(null);lessonMinutes=15;startLesson('sky');pauseLesson();lessonRun.wait=null;lessonRun.positionSeconds=4;endLesson();`);
 assert.equal(page('lessonProgress().records.at(-1).elapsedSeconds'),4);
 assert.ok(page('lessonProgress().records.at(-1).totalSeconds')>4);
 page('goHome();localStorage.values.clear();');
});
