// 다잇 화면: 수업 진행(시작·멈춤·이어 듣기·이동·도착 맞춤·기록 남기기).
// 수업 조립과 판단은 dait-lesson.js, 화면 그리기는 dait-app-player.js가 맡는다. 발문 뒤에는 생각할 시간을 둔다.
const LESSON_KEY = 'dait.lessonProgress';
let lessonRun = null; // 지금 듣는 교시: { lesson, trip, pieces, index, heard, reachedEnd, done, finished, stopped, saved }
let lessonView = null; // null: 재생 화면. 'now'·'lessons'·'records': 수업을 멈추지 않고 그 화면을 둘러보는 중
let lessonMinutes = Lesson.DEFAULT_MINUTES;
let lessonTimer = null;
let lessonProgressTimer = null;
const PLAYBACK_KEY = 'dait.pearl.playback.v2';
const LESSON_RATES = [.8, 1, 1.2, 1.5, 2];

function readLessonPlaybackPrefs() {
  const prefs = settingsStore.read(PLAYBACK_KEY, null);
  return prefs && ['back', 'forward'].every(key => Number.isInteger(prefs[key]) && prefs[key] >= 1 && prefs[key] <= 3600)
    ? { back: prefs.back, forward: prefs.forward, rate: LESSON_RATES.includes(prefs.rate) ? prefs.rate : 1 }
    : { back: 15, forward: 30, rate: 1 };
}

let lessonPlaybackPrefs = readLessonPlaybackPrefs();

function applyLessonAudioRate() {
  const rate = currentMode === 'lesson' && lessonRun && !isLessonResting() ? lessonPlaybackPrefs.rate : 1;
  audioAdapter.setRate(rate);
}

function saveLessonPlaybackPrefs(prefs) {
  if (isDrivingMode || !['back', 'forward'].every(key => Number.isInteger(prefs[key]) && prefs[key] >= 1 && prefs[key] <= 3600) || !LESSON_RATES.includes(prefs.rate)) return false;
  settingsStore.write(PLAYBACK_KEY, prefs);
  const run = lessonRun, wait = run?.wait;
  const left = wait && !run.paused ? Math.max(0, wait.endsAt - Date.now()) * (wait.rate || 1) : null;
  lessonPlaybackPrefs = { ...prefs };
  applyLessonAudioRate();
  if (left !== null) lessonWait(left, wait.then, wait.kind);
  if (currentMode === 'lesson' && run && !run.done) { fitLessonToEta(hasArrived ? 0 : remainMinutes()); renderStage(); }
  return true;
}

const LESSON_RESUME_MS = 30 * 1000; // 이보다 오래 멈추면 이어 들을 때 지금 조각을 처음부터 다시 말한다
const LESSON_BACK_MS = 3000; // 조각을 이만큼 들었으면 「이전」은 그 조각을 처음부터, 덜 들었으면 앞 조각을 말한다
const TRIP_CAP_MS = 2 * 60 * 60 * 1000; // 차 상태가 멈춰도 앞쪽 작업이 끝없이 남지 않게 수업을 닫는 시간
const TOP_SPEED_MPS = 50; // 이보다 빨리 줄어든 남은 거리는 달린 것이 아니라 목적지를 바꾼 것이다

// 시리즈 차례대로 듣기(설정). 처음에는 켜져 있다. 끄면 시리즈와 상관없이 시간에 맞는 수업을 고른다.
const SERIES_KEY = 'dait.lesson.series';

function seriesOn() {
  return lessonQueue.followSeries;
}

function lessonRules() {
  return { series: seriesOn() };
}

function toggleSeries() {
  if (isDrivingMode) return false;
  lessonQueue.followSeries=!seriesOn();persistPlaylist();
  homePick = null; // 첫 화면 수업도 새 규칙으로 다시 고른다
  if (!hasActiveLesson()) render();
  return true;
}

function lessonProgress() {
  const stored = readStored(LESSON_KEY);
  const progress = Lesson.normalize(stored);
  if (stored && Object.hasOwn(stored, 'ieum')) writeStored(LESSON_KEY, progress);
  return progress;
}

function openLessons() {
  if (isDrivingMode) return;
  const eta = remainMinutes();
  lessonMinutes = eta !== null ? Lesson.minutesFor(eta) : 8; // 수업 화면은 8분 탭부터 보여 준다
  if (hasActiveLesson()) lessonView = 'lessons';
  else currentMode = 'lessonPick';
  render();
}

function pickLessonTime(minutes) {
  if (isDrivingMode || remainMinutes() !== null || ![8, 15, 20].includes(minutes)) return;
  lessonMinutes = minutes;
  render();
}

// 고른 수업을 맨 앞에 두고 다른 수업을 줄 세운다. 긴 이동이면 교시로 나누고,
// 짧은 이동이어도 고른 수업 뒤에 5분 넘게 남으면 다른 수업을 쉬지 않고 이어 붙인다.
function lessonTripFor(lessonId,skipKey,explicitOnly=false) {
  return Lesson.planTrip(playlistTripOrder(lessonId,skipKey,explicitOnly), lessonMinutes, lessonRules());
}

function currentLessonPosition(run) {
  const piece = run.pieces[run.index];
  if (!piece || run.done) return 0;
  if (run.wait && (!piece.voiced || (Lesson.isQuestion(piece) && speechPhase !== 'speaking'))) {
    const left = run.paused ? run.wait.left : Math.max(0, run.wait.endsAt - Date.now()) * (run.wait.rate || 1);
    return (run.wait.endPosition ?? Lesson.totalSeconds([piece])) - left / 1000;
  }
  if (!window.AndroidBridge && piece.voiced) {
    const player = document.getElementById('audioPlayer'), time = player.currentTime;
    if (player.readyState >= 1 && Number.isFinite(time)) return time;
  }
  return run.positionSeconds || 0;
}

function seekLessonAt(seconds) {
  if (!vehiclePolicy.allows('seek-absolute')) return;
  moveLessonTo(seconds);
}

function seekLessonBy(delta) {
  const run = lessonRun;
  if (!run || !Number.isFinite(delta)) return;
  const section = lessonTimeline(run).sections.find(item => item.index === run.index);
  if (section) moveLessonTo(section.start + currentLessonPosition(run) + delta);
}

function moveLessonTo(seconds) {
  const run = lessonRun;
  if (!run || run.done || isLessonResting() || !Number.isFinite(seconds)) return;
  const timeline = lessonTimeline(run);
  const wanted = Math.max(0, Math.min(seconds, timeline.seconds - .05));
  const section = timeline.sections.find(item => wanted < item.start + item.seconds);
  if (!section) return;
  const paused = run.playback.state !== 'playing';
  stopSpeech();
  clearTimeout(lessonTimer);
  run.scrubbing = false;
  run.reachedEnd = false;
  run.index = section.index;
  playLessonPiece(wanted - section.start);
  if (paused) pauseLesson();
}

function seekLessonSection(index) {
  const section = lessonRun && lessonTimeline(lessonRun).sections.find(item => item.index === index);
  if (section) seekLessonAt(section.start);
}

function isLessonResting() {
  return !!lessonRun && !lessonRun.done && Lesson.isBreak(lessonRun.pieces[lessonRun.index]);
}

// fromStop이면 지난번 멈춘 곳부터 잇는다.
function startLesson(lessonId, fromStop, recordPoint, options = {}) {
  if (!options.automatic && hasActiveLesson() && lessonRun.lesson.id === lessonId && !fromStop && !recordPoint) { returnToLesson(); return; }
  if (!options.skipSeriesPrompt && !fromStop && !recordPoint && !isDrivingMode && lessonQueue.prior(lessonId,lessonProgress().records) && window.showSeriesOrderPrompt) {
    window.showSeriesOrderPrompt(lessonId,options); return;
  }
  if (Number.isFinite(options.minutes)) lessonMinutes=options.minutes;
  const recordLesson = recordPoint && DAIT_LESSONS.find(item => item.id === lessonId);
  const trip = recordLesson ? { ...Lesson.planTrip([recordLesson], lessonMinutes), resume: recordPoint }
    : fromStop ? stopTrip(lessonId) : lessonTripFor(lessonId,options.queueKey,options.explicitOnly);
  if (!trip || !trip.lesson || !(trip.resume || Lesson.fits(trip.lesson, trip.minutes))) return;
  if (hasActiveLesson()) endLesson(); // 다른 수업으로 바꾸기 전에 듣던 수업의 기록과 멈춘 곳을 남긴다
  lessonView = null;
  consumePlaylistStart(options);
  currentMode = 'lesson';
  hasArrived = false;
  startPeriod({ ...trip, endsAt: Date.now() + lessonMinutes * 60 * 1000 });
  syncJourney();
}

// 끝까지 못 들은 수업이 있고 이 시간에 이어 들을 수 있으면 그 수업을 돌려준다.
function stoppedLesson(minutes) {
  const resume = lessonProgress().resume;
  if (!Lesson.resumeFresh(resume, toYmd(new Date()))) return null;
  const lesson = DAIT_LESSONS.find(item => item.id === resume.lesson);
  return lesson && Lesson.resumeFits(lesson, resume, minutes) ? lesson : null;
}

// 멈춘 곳부터 이어 들을 때 남은 분. 처음부터 듣는 길이와 다르다.
function stopMinutesLeft(lesson, minutes) {
  return Math.max(1, Math.round(Lesson.totalSeconds(Lesson.resumePlan(lesson, lessonProgress().resume, minutes)) / 60));
}

// 멈춘 곳부터 듣는 수업은 교시로 나누지 않고 그 수업 하나만 잇는다.
function stopTrip(lessonId) {
  const lesson = stoppedLesson(lessonMinutes);
  if (!lesson || lesson.id !== lessonId) return null;
  return { ...Lesson.planTrip([lesson], lessonMinutes), resume: lessonProgress().resume };
}

// 교시마다 기록을 따로 남기려고 교시마다 새로 시작한다. 지난 수업 복습은 붙이지 않는다.
// 멈춘 곳부터 이을 때는 멈춘 조각부터 말하고, 앞에서 들은 조각도 들은 것으로 센다.
function startPeriod(trip) {
  trip={...trip,lesson:lessonWithSeriesOutro(trip.lesson)};
  const before = trip.resume ? Lesson.resumeHeard(trip.lesson, trip.resume) : [];
  const records = trip.number > 1 && !trip.rest ? [] : lessonProgress().records;
  const pieces = trip.resume ? Lesson.resumePlan(trip.lesson, trip.resume, trip.minutes)
    : Lesson.plan(trip.lesson, DAIT_LESSONS, trip.minutes, records, { after: trip.number > 1 && !trip.rest ? trip.prev : null });
  const run = {
    lesson: trip.lesson, trip, pieces: Lesson.withBreak(pieces, trip), plannedSeconds: Lesson.lessonSeconds([...before, ...pieces]), short: Lesson.isShort([...before, ...pieces]),
    index: 0, heard: before, heardBefore: before.length, meters: 0, lastMeters: null, lastMetersAt: 0, startedAt: Date.now(),
    reachedEnd: false, done: false, finished: false, stopped: false, saved: false
  };
  run.playback = new DaitPlayback.LessonSession();
  run.playback.attach(run);
  lessonRun = run;
  setTimeout(() => { if (lessonRun === run) endLesson(); }, TRIP_CAP_MS); // 차 상태가 멈춰도 앞쪽 작업이 끝없이 남지 않게 한다
  noteLessonNavi();
  fitLessonToEta(remainMinutes());
  playLessonPiece(Math.max(0, Number(trip.resume?.offset) || 0));
}

// 길 안내가 있으면 남은 시간을, 없으면 고른 시간에서 지난 만큼 뺀 시간을 뒤 교시에 나눈다.
function tripSeconds(trip) {
  const eta = remainMinutes();
  return eta !== null ? eta * 60 : (trip.endsAt - Date.now()) / 1000;
}

function playLessonPiece(offset = 0) {
  const run = lessonRun;
  if (!run || run.done) return;
  clearTimeout(lessonTimer);
  run.playback.start();
  run.wait = null;
  run.pieceStartedAt = Date.now() - offset * 1000;
  run.positionSeconds = offset;
  run.partialPiece = offset > 0 ? run.pieces[run.index].id : null;
  const piece = run.pieces[run.index];
  if (piece.seriesOutro && !playlistOutroEligible(run.lesson.id)) { nextLessonPiece(); return; }
  if (Lesson.isClosing(piece)) run.reachedEnd = true;
  if (Lesson.isBreak(piece)) {
    saveLesson(run); // 마친 교시는 쉬는 시간이 시작될 때 바로 남긴다
    run.restedFrom = Date.now();
  }
  speakLessonPiece(piece, offset);
  renderStage();
  updateDriveScreen(piece.line);
}

// 음원이 오기 전에는 대사 길이만큼 소리 없이 기다려, 흐름과 시간 맞춤을 그대로 시험한다.
function speakLessonPiece(piece, offset = 0) {
  const speechSeconds = Lesson.speechSeconds(piece);
  if (offset >= speechSeconds && Lesson.isQuestion(piece)) {
    lessonWait(Math.max(0, Lesson.totalSeconds([piece]) - offset) * 1000, nextLessonPiece, 'thinking');
    return;
  }
  if (piece.voiced) {
    speak([piece.clip], '');
    if (offset > 0) {
      const seq = speechSeq;
      audioAdapter.seek(Math.round(offset * 1000), seq, () => seq === speechSeq);
    }
    return;
  }
  stopSpeech();
  speechPhase = 'speaking';
  const seq = speechSeq;
  lessonWait(Math.max(0, speechSeconds - offset) * 1000, () => window.onSpeechEvent(JSON.stringify({ event: 'ended', seq })));
}

// 소리 없이 기다리는 동안(음원 없는 조각, 발문 뒤 생각할 틈)은 타이머로 잰다. 일시정지하면 남은 만큼 다시 잰다.
function lessonWait(ms, then, kind = 'speech') {
  const run = lessonRun;
  clearTimeout(lessonTimer);
  const rate = kind === 'thinking' || isLessonResting() ? 1 : lessonPlaybackPrefs.rate;
  const piece = run.pieces[run.index];
  const endPosition = kind === 'thinking' ? Lesson.totalSeconds([piece]) : Lesson.speechSeconds(piece);
  run.wait = { then, rate, kind, endPosition, endsAt: Date.now() + ms / rate };
  lessonTimer = setTimeout(() => { if (lessonRun === run && !run.paused) { run.wait = null; then(); } }, ms / rate);
  syncLessonBed();
}

// 말이 멈춘 동안(발문 뒤 생각할 틈, 쉬는 시간)에는 배경음을 작게 깔아 끊긴 것으로 오해하지 않게 한다(2026-11-09).
// 사람이 멈췄거나, 길 안내·통화가 소리를 가져갔거나, 음원이 아직 없는 조각을 기다리는 동안에는 깔지 않는다.
function lessonBedWanted() {
  const run = lessonRun;
  if (!run || run.done || run.paused || run.stopped || run.playback.interrupted || speechPaused || !run.wait) return false;
  return run.wait.kind === 'thinking' || isLessonResting();
}

function syncLessonBed() {
  const voice = document.getElementById('audioPlayer');
  const volume = voice && Number.isFinite(voice.volume) ? (voice.muted ? 0 : voice.volume * 100) : 100;
  bedAdapter.set(lessonBedWanted(), volume);
}

// 사람이 누른 일시정지. 앱이 먼저 다시 말을 걸지 않고, 이어 듣기를 누를 때까지 기다린다.
function pauseLesson() {
  const run = lessonRun;
  if (!run || run.done || run.paused || run.stopped || isLessonResting()) return;
  run.paused = true;
  run.pausedAt = Date.now();
  if (run.wait) {
    clearTimeout(lessonTimer);
    run.wait.left = Math.max(0, run.wait.endsAt - run.pausedAt) * (run.wait.rate || 1);
  } else holdSpeech();
  syncLessonBed();
  renderStage();
  updateDriveScreen();
}

// 30초 안이면 멈춘 곳에서, 넘으면 지금 조각을 처음부터 잇는다. 멈춘 동안 도착이 가까워졌으면 뒤쪽 조각부터 뺀다.
function resumeLesson() {
  const run = lessonRun;
  if (!run || run.done || !run.paused) return;
  const away = Date.now() - run.pausedAt;
  run.paused = false;
  run.pieceStartedAt += away;
  fitLessonToEta(hasArrived ? 0 : remainMinutes());
  if (run.done) return;
  if (away > LESSON_RESUME_MS) { playLessonPiece(); return; }
  if (run.wait) lessonWait(run.wait.left, run.wait.then, run.wait.kind);
  else proceedSpeech();
  renderStage();
  updateDriveScreen();
}

// 현재 교시만 처음부터 다시 듣는다. 중간 시도는 기록·보상으로 확정하지 않는다.
function restartLesson() {
  const run = lessonRun;
  if (!run || run.done || isLessonResting() || isDrivingMode) return;
  clearTimeout(lessonTimer);
  stopSpeech();
  const progress = lessonProgress();
  if (progress.resume && progress.resume.lesson === run.lesson.id) {
    writeStored(LESSON_KEY, Lesson.keepResume(progress, null));
  }
  const trip = { ...run.trip, resume: null };
  // 목적지 없이 고른 시간은 새로 센다. 길 안내 중이면 실제 남은 시간으로 다시 맞춘다.
  if (Number.isFinite(trip.endsAt)) trip.endsAt += Date.now() - run.startedAt;
  startPeriod(trip);
  lessonRun.meters = run.meters;
}

// 「이전」: 조각을 조금 들었으면 그 조각을 처음부터, 막 시작했으면 앞 조각을 다시 말한다. 지난 교시로는 돌아가지 않는다.
function prevLessonPiece() {
  const run = lessonRun;
  if (!run || run.done || isLessonResting()) return;
  const listened = (run.paused ? run.pausedAt : Date.now()) - run.pieceStartedAt;
  if (listened < LESSON_BACK_MS && run.index > 0) run.index--;
  playLessonPiece();
  fitLessonToEta(hasArrived ? 0 : remainMinutes()); // 다시 듣는 만큼 뒤쪽 선택 조각을 뺀다
}

// 수업 화면 오른쪽 버튼: 쉬는 시간이면 다음 교시, 멈췄으면 잇기, 아니면 일시정지.
function lessonMainAction() {
  const run = lessonRun;
  if (!run || run.done) return;
  if (isLessonResting()) nextLessonPiece();
  else if (run.stopped) playLessonPiece();
  else if (run.paused) resumeLesson();
  else if (run.playback.interrupted) proceedSpeech();
  else pauseLesson();
}

function nextLessonPiece() {
  const run = lessonRun;
  if (!run || run.done) return;
  clearTimeout(lessonTimer);
  const rested = Lesson.isBreak(run.pieces[run.index]);
  run.index++;
  if (rested) {
    if (!lessonQueue.autoNext) { endLesson(); return; }
    const explicit = lessonQueue.next(run.lesson.id);
    if (explicit) { if (!nextPlaylistLesson(run)) endLesson(); }
    else if (lessonQueue.seriesFor(run.lesson.id)) endLesson();
    else startPeriod(Lesson.nextPeriod(run.trip, tripSeconds(run.trip)));
  }
  else if (run.index >= run.pieces.length) endLesson(true);
  else if (Lesson.isBreak(run.pieces[run.index]) && !lessonQueue.autoNext) endLesson();
  else playLessonPiece();
}

function onLessonSpeech(info) {
  const run = lessonRun;
  if (!run || run.done) return;
  if (run.paused && info.event !== 'stopped') { run.wait = { then: () => onLessonSpeech(info), left: 0 }; return; } // 일시정지와 거의 같이 조각이 끝났으면 이어 듣기를 누른 뒤에 넘어간다
  const piece = run.pieces[run.index];
  if (Lesson.isBreak(piece) && !isDrivingMode && run.trip.rest) { endLesson(); return; } // 쉬는 시간이 끝났을 때 주차 중이면 사람 없는 차에서 말을 시작하지 않는다. 바로 이어 붙인 수업은 사람이 그대로 있다
  if (info.event === 'stopped') {
    run.stopped = true; // 음악이나 통화가 소리를 돌려주지 않으면 사람이 이어 듣기를 누를 때까지 멈춘다
    renderStage();
    updateDriveScreen();
    return;
  }
  if (Lesson.isBreak(piece)) { nextLessonPiece(); return; }
  if (run.partialPiece !== piece.id && !run.heard.includes(piece)) run.heard.push(piece);
  if (Lesson.isQuestion(piece)) lessonWait(piece.wait * 1000, nextLessonPiece, 'thinking'); // 생각할 틈
  else nextLessonPiece();
}

// 내비의 남은 거리로 이번 수업에서 달린 거리를 잰다. 길 안내가 없으면 거리를 더하지 않는다.
function noteLessonNavi() {
  const run = lessonRun;
  if (!run || !naviInfo || !Number.isFinite(naviInfo.remainDistance)) return;
  const now = Date.now();
  if (run.lastMeters !== null) {
    const reachable = TOP_SPEED_MPS * (now - run.lastMetersAt) / 1000;
    run.meters += Math.min(Math.max(0, run.lastMeters - naviInfo.remainDistance), reachable);
  }
  run.lastMeters = naviInfo.remainDistance;
  run.lastMetersAt = now;
}

function fitLessonToEta(minutes) {
  const run = lessonRun;
  if (!run || run.done || minutes === null) return;
  // 쉬는 시간을 지낸 만큼은 앞으로 쉴 시간이 아니므로 남은 시간에 도로 더해 맞춘다.
  const rested = isLessonResting() ? (Date.now() - run.restedFrom) / 1000 : 0;
  const fitted = arrivalPlanner.fit(run, minutes * 60, lessonPlaybackPrefs.rate, rested);
  run.pieces = fitted.pieces;
  run.trip.count = fitted.count;
  if (run.index >= run.pieces.length) endLesson(); // 쉬는 시간에 뒤 교시가 다 빠졌다
}

function endLesson(natural = false) {
  const run = lessonRun;
  if (!run || run.done) return;
  clearTimeout(lessonTimer);
  run.savedPosition = currentLessonPosition(run);
  stopSpeech();
  run.done = true;
  syncLessonBed();
  saveLesson(run);
  if (natural && run.finished && maybeContinuePlaylist(run)) return;
  render();
  updateDriveScreen();
  if (hasArrived) closeAfterArrival();
}

// 교시마다 한 번만 수업 기록을 남긴다.
function saveLesson(run) {
  if (run.saved) return;
  run.saved = true;
  run.finished = Lesson.countsAsFinished(run);
  const position = run.savedPosition ?? currentLessonPosition(run);
  if (run.heard.length > run.heardBefore || position >= 1) {
    const ymd = toYmd(new Date());
    const progress = Lesson.finishLesson(lessonProgress(), run.lesson, ymd, run.finished, run.meters / 1000, run.short);
    const point = run.finished ? null : Lesson.resumePoint(run.lesson, run.heard, ymd); // 다음 이동에서 멈춘 곳부터 잇게 한다
    const piece = run.pieces[run.index];
    if (!run.finished && piece && run.lesson.pieces.some(item => item.id === piece.id)) {
      progress.records[progress.records.length - 1].resume = {
        lesson: run.lesson.id, from: piece.id, heard: run.heard.map(item => item.id), short: run.short, ymd,
        offset: Math.max(0, Math.min(Number(position) || 0, Lesson.totalSeconds([piece]) - .05))
      };
    } else if (point) progress.records[progress.records.length - 1].resume = point;
    writeStored(LESSON_KEY, point ? Lesson.keepResume(progress, point) : progress);
  }
}

// 처음으로 돌아갈 때 듣던 수업을 정리한다.
function closeLesson() {
  endLesson();
  lessonRun = null;
  lessonView = null;
}

// 듣는 중인 수업이 있는가. 둘러보기는 그 수업의 다른 화면일 뿐 새 재생이 아니다.
function hasActiveLesson() {
  return currentMode === 'lesson' && !!lessonRun && !lessonRun.done;
}

function returnToLesson() {
  if (isDrivingMode || !hasActiveLesson()) return;
  lessonView = null;
  renderStage();
}

// 미니 플레이어의 끝내기: 수업을 닫고 보던 화면에 머문다.
function stopLessonFromDock() {
  if (isDrivingMode || !hasActiveLesson()) return;
  const view = lessonView;
  closeLesson();
  currentMode = view === 'records' ? 'records' : view === 'lessons' ? 'lessonPick' : null;
  render();
}

// 주행 중에는 고르는 화면을 열지 않고, 가는 길에 들어갈 수업 하나를 버튼 하나로 제안한다.
function lessonOffer() {
  const minutes = Lesson.minutesFor(remainMinutes());
  return stoppedLesson(minutes) || Lesson.recommend(DAIT_LESSONS, minutes, lessonProgress().records, lessonRules())[0] || null;
}
