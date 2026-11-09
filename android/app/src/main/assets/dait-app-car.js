// 다잇 화면: Gleo 음성 비서, 차 미디어 버튼·주행·내비 연결. dait-app-lesson.js 다음에 불러온다.
// ========================================================
// Gleo 음성 비서 (assets/schema.json)
// Gleo가 부른 기능을 처리하고 AndroidBridge.gleoRespond로 답한다. message는 Gleo 규칙대로 영어 한 문장이다.
// ========================================================
function gleoReply(functionName, status, message, mode) {
  if (window.AndroidBridge && AndroidBridge.gleoRespond) AndroidBridge.gleoRespond(JSON.stringify({ functionName, status, message, mode: mode || 'voice' }));
}

window.onGleoAction = function(functionName, paramsText) {
  let params = {};
  try { params = JSON.parse(paramsText) || {}; } catch (e) {}
  if (functionName === 'START_LESSON') gleoStartLesson(params);
  else if (functionName === 'CONTROL_LESSON') gleoControlLesson(params);
  else gleoReply(functionName, 'fail', 'DAIT does not know this request.');
};

// 길 안내 중이면 도착까지 남은 시간을 넘지 않게 듣는다. 수업이 바로 말을 시작하므로 Gleo는 말하지 않는다.
function gleoStartLesson(params) {
  const fn = 'START_LESSON';
  const run = lessonRun;
  if (run && !run.done && currentMode === 'lesson') {
    if (run.paused || run.stopped || isLessonResting()) { gleoResume(run); gleoReply(fn, 'success', 'Resumed the DAIT lesson.', 'silent'); }
    else gleoReply(fn, 'success', 'A DAIT lesson is already playing.', 'beep');
    return;
  }
  const eta = remainMinutes();
  const asked = Math.floor(Number(params.minutes));
  const wanted = asked > 0 ? asked : null;
  lessonMinutes = eta !== null ? Math.min(Lesson.minutesFor(eta), wanted || Infinity) : (wanted || Lesson.DEFAULT_MINUTES);
  const lesson = Lesson.forRequest(DAIT_LESSONS, lessonMinutes, lessonProgress().records, params.subject);
  if (!lesson) { gleoReply(fn, 'fail', 'There is no DAIT lesson that fits this time.'); return; }
  const before = lessonRun;
  startLesson(lesson.id);
  if (lessonRun && lessonRun !== before && !lessonRun.done) gleoReply(fn, 'success', `Started the ${lesson.subject} lesson.`, 'silent');
  else gleoReply(fn, 'fail', 'DAIT could not start a lesson for this time.');
}

// 쉬는 시간이면 다음 교시를 시작한다.
function gleoResume(run) {
  if (isLessonResting()) nextLessonPiece();
  else if (run.stopped) playLessonPiece();
  else if (run.paused) resumeLesson();
  else if (run.playback.interrupted) proceedSpeech();
}

function gleoControlLesson(params) {
  const fn = 'CONTROL_LESSON';
  const run = lessonRun;
  if (!run || run.done || currentMode !== 'lesson') { gleoReply(fn, 'fail', 'No DAIT lesson is playing right now.'); return; }
  if (params.command === 'pause') {
    if (run.paused || run.stopped) gleoReply(fn, 'success', 'The DAIT lesson is already paused.', 'beep');
    else if (isLessonResting()) gleoReply(fn, 'fail', 'The DAIT lesson is on a break now.');
    else { pauseLesson(); gleoReply(fn, 'success', 'Paused the DAIT lesson.', 'beep'); }
  } else if (params.command === 'resume') {
    gleoResume(run);
    gleoReply(fn, 'success', 'Resumed the DAIT lesson.', 'silent');
  } else gleoReply(fn, 'asking', 'Should DAIT pause or resume the lesson?');
}

// ========================================================
// 공통 도구
// ========================================================
function readStored(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}

function writeStored(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.log('Storage error:', e); }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

function toYmd(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}${month}${day}`;
}

// 앱을 다시 볼 때 첫 화면도 지금 시각으로 다시 그린다.
window.onAppResumed = function() {
  refreshHomeIfIdle();
};

// 지금이 하교 시간대인지 정한다. 주말은 하교로 보지 않는다.
function currentTrip() {
  const now = new Date();
  const weekend = now.getDay() === 0 || now.getDay() === 6;
  const afternoon = now.getHours() >= 12;
  return { mode: afternoon ? 'afternoon' : 'morning', kind: weekend ? 'weekend' : afternoon ? 'afternoon' : 'morning' };
}

function isParkedScreen() {
  return currentMode === 'lessonPick' || currentMode === 'records';
}

function toggleQuestions() {
  writeStored(QUESTIONS_KEY, readStored(QUESTIONS_KEY) === false);
  render();
}

document.getElementById('audioPlayer').addEventListener('ended', playPreviewClip);

// In-App Detection & Driving Restriction API
if (window.location.href.includes('android_asset') || navigator.userAgent.includes('Android') || new URLSearchParams(window.location.search).has('app')) {
  document.body.classList.add('in-app');
}

// 주행 중: 상세 화면을 닫고 문장 하나와 큰 버튼 둘만 보여 준다. 재생 중인 음성은 이어 간다.
// 대화 중이 아니면(첫 화면·설정) 조작할 것이 없으므로 "주차 후 이어갈게요"만 보여 준다.
window.setDrivingMode = function(isDriving, isRealDriving) {
  const departing = isDriving && !isDrivingMode;
  isDrivingMode = isDriving;
  vehiclePolicy.update(isDriving);
  appEvents.emit('vehicleChanged', { driving: isDriving });
  document.body.classList.toggle('driving', isDriving);
  document.body.classList.toggle('real-driving', !!isRealDriving);
  if (isDriving && (isParkedScreen() || (departing && currentMode === 'lesson' && isDialogueDone()))) goHome();
  if (!isDriving && isLessonResting() && lessonRun.trip.rest) endLesson(); // 쉬는 시간에 주차하면 내린 것으로 보고 수업을 닫는다
  if (departing && armed) startArmed();
  else if (departing && speechPhase === 'idle') skipWhileDriving();
  if (currentMode === 'lesson' && lessonRun && !lessonRun.done) { lessonRun.scrubbing = false; renderStage(); }
  updateDriveScreen();
  syncJourney();
};

function updateDriveScreen(sentence) {
  const inDialogue = currentMode && !isParkedScreen();
  const trip = inDialogue ? null : currentTrip();
  const offer = inDialogue ? null : lessonOffer(trip);
  const canStart = !inDialogue && (!!offer || (trip.mode === 'afternoon' && trip.kind !== 'weekend'));
  const minutes = Lesson.minutesFor(remainMinutes());
  const fromStop = !!offer && offer === stoppedLesson(minutes);
  const text = inDialogue ? (sentence || document.querySelector('.main-question')?.textContent || '')
    : offer ? (fromStop ? '지난번 멈춘 곳부터 들을까요?' : offer.question)
    : canStart ? '하교 이야기를 들을까요?' : '주차 후 이어갈게요';
  document.getElementById('driveSentence').textContent = text;
  const paused = inDialogue && currentMode === 'lesson' && lessonRun && lessonRun.paused;
  const offerLine = !offer ? '' : fromStop ? `${offer.title} · 남은 약 ${stopMinutesLeft(offer, minutes)}분` : lessonPromise(offer, minutes);
  document.getElementById('driveSub').textContent = inDialogue ? (paused ? '잠시 멈췄어요' : heardLineText()) : offer ? offerLine : (canStart ? '' : '설정과 자세한 내용은 주차한 뒤 열어요');
  const done = inDialogue && isDialogueDone();
  const lessonOn = inDialogue && currentMode === 'lesson' && !done;
  const replay = document.getElementById('driveReplay');
  replay.textContent = lessonOn ? '이전' : '다시 듣기';
  replay.disabled = !inDialogue || isLessonResting();
  replay.hidden = canStart;
  const next = document.getElementById('driveNext');
  next.textContent = canStart ? '듣기' : done ? '마치기' : lessonOn ? lessonMainLabel(lessonRun) : '넘기기';
  next.disabled = !inDialogue && !canStart;
  syncLessonMedia();
}

// ========================================================
// 핸들 버튼과 차의 미디어 화면 (앱의 LessonMedia.kt)
// 듣는 수업이 있을 때만 차가 다잇을 재생 중인 오디오로 보고, 핸들의 재생·멈춤·이전 버튼을 수업 화면의 버튼과 같게 처리한다.
// ========================================================
let sentLessonMedia = '';
function syncLessonMedia() {
  if (!window.AndroidBridge) return;
  const run = lessonRun, active = !!run && !run.done && currentMode === 'lesson';
  const state = active ? (isLessonResting() ? 'paused' : run.playback.state) : 'ended';
  const playing = state === 'playing';
  const title = active ? run.lesson.title : '', subtitle = active ? (isLessonResting() ? '쉬는 시간' : `${run.lesson.subject} 수업`) : '';
  const timeline = active ? lessonTimeline(run) : { sections: [], seconds: 0 };
  const section = timeline.sections.find(item => item.index === run.index);
  const position = active && section ? section.start + currentLessonPosition(run) : 0;
  const rate = active && run.wait?.kind !== 'thinking' ? lessonPlaybackPrefs.rate : 1;
  const canSeek = vehiclePolicy.allows('seek-absolute');
  const modern = !!AndroidBridge.setLessonPlayback;
  const text = JSON.stringify(modern ? [active, state, title, subtitle, Math.floor(position), timeline.seconds, rate, canSeek] : [active, playing, title, subtitle]);
  if (text === sentLessonMedia) return;
  sentLessonMedia = text;
  if (modern) AndroidBridge.setLessonPlayback(active, state, title, subtitle, Math.round(position * 1000), Math.round(timeline.seconds * 1000), rate, canSeek);
  else if (AndroidBridge.setLessonMedia) AndroidBridge.setLessonMedia(active, playing, title, subtitle);
}
window.onMediaKey = function(command, positionMs) {
  const run = lessonRun;
  if (!run || run.done || currentMode !== 'lesson') return;
  if (command === 'pause') pauseLesson();
  else if (command === 'play') gleoResume(run);
  else if (command === 'previous' || command === 'rewind') seekLessonBy(-lessonPlaybackPrefs.back);
  else if (command === 'next' || command === 'forward') seekLessonBy(lessonPlaybackPrefs.forward);
  else if (command === 'seek') seekLessonAt(Number(positionMs) / 1000);
  updateDriveScreen();
};
window.handleAppBack = function () {
  if (appEvents.emit('back').some(Boolean)) return true;
  if (currentMode) { goHome(); return true; }
  return false;
};

function driveReplay() {
  if (currentMode === 'lesson') { if (!isDialogueDone()) seekLessonBy(-lessonPlaybackPrefs.back); }
  else if (currentMode && !isParkedScreen()) render();
}

function driveNext() {
  if (!currentMode || isParkedScreen()) {
    const trip = currentTrip();
    const offer = lessonOffer(trip);
    if (offer) { lessonMinutes = Lesson.minutesFor(remainMinutes()); startLesson(offer.id, offer === stoppedLesson(lessonMinutes)); }
    else if (trip.mode === 'afternoon' && trip.kind !== 'weekend') startFlow('afternoon');
  } else if (isDialogueDone()) goHome();
  else if (currentMode === 'lesson') lessonMainAction();
  else skipQuestion();
  updateDriveScreen();
}

let naviInfo = null;

window.onNaviUpdate = function(jsonText) {
  let info;
  try { info = JSON.parse(jsonText); } catch (e) { return; }
  if (info.event === 'routeEnded' && performance.now() - routeStartedAt < ROUTE_SWAP_MS) return; // 경로를 바꾸면 옛 경로의 종료 신호가 뒤따른다
  if (info.event === 'destination' || info.event === 'routeStarted') {
    if (info.event === 'routeStarted') routeStartedAt = performance.now();
    // 길 안내가 없을 때는 이름 없이 0으로 오므로 도착 직전과 구분한다.
    if (!info.name && !(Number(info.remainTime) > 0)) { const had = !!naviInfo; naviInfo = null; if (had) refreshHomeIfIdle(); return; }
    const changed = !naviInfo || naviInfo.name !== (info.name || '');
    naviInfo = { name: info.name || '', remainTime: Number(info.remainTime), remainDistance: Number(info.remainDistance), at: Date.now() };
    applyNaviEta();
    if (changed) refreshHomeIfIdle();
  } else if (info.event === 'routeCancelled' || info.event === 'routeEnded' || info.event === 'arrived' || info.event === 'unavailable') {
    // 내비에 따라 도착 신호 없이 안내 종료만 올 수 있으므로, 거의 다 온 때의 종료도 도착으로 본다.
    const reached = info.event === 'arrived' || (info.event === 'routeEnded' && Journey.tierFor(naviRemainMinutes()) === 'arrive');
    naviInfo = null;
    refreshHomeIfIdle();
    if (reached) finishOnArrival();
  } else if (info.event === 'status' && info.status !== 'ROUTE_DRIVE') {
    naviInfo = null;
    refreshHomeIfIdle();
  }
};

function refreshHomeIfIdle() {
  if (isIntroPlaying) { homeStale = true; return; }
  if (!currentMode) render();
}

// 남은 시간은 초, 남은 거리는 m 단위다. 에뮬레이터에서 판교→서울시청 1740초·26000m로 확인했다.
function naviRemainMinutes() {
  if (!naviInfo || !Number.isFinite(naviInfo.remainTime)) return null;
  return naviInfo.remainTime / 60;
}

// 도착이 가까워지면 말하던 문장은 끝까지 하고, 다음 내비 응답 때 마무리로 넘어간다.
function applyNaviEta() {
  if (currentMode === 'lesson') { noteLessonNavi(); fitLessonToEta(hasArrived ? 0 : remainMinutes()); return; } // 도착한 뒤 늦게 온 남은 시간으로 교시를 되살리지 않는다
  if (!currentMode || isParkedScreen() || speechPhase === 'speaking' || speechPaused || hasArrived) return;
  if (Journey.tierFor(remainMinutes()) !== 'arrive') return;
  if (stage === 'ETA_SHORT' || stage === 'PARENT_BRIDGE') return; // 가족 대화는 끊지 않는다
  if (!isDialogueDone()) setStage('ETA_SHORT');
}
