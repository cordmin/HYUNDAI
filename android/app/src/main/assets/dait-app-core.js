// 다잇 화면의 바탕: 공통 상태, 저장소·글자 도구, 화면 고르기, 도착 처리.
// 불러오는 차례: dait-app-core → audio → home → lesson → player → car → start (dait-preview.html).
// 수업 조립 규칙은 dait-lesson.js, 재생·주행 제한 부품은 dait-playback.js에 있다.

const appEvents = new DaitPlayback.Events();
const vehiclePolicy = new DaitPlayback.VehiclePolicy();
const settingsStore = new DaitPlayback.SettingsStore(localStorage);
const audioAdapter = new DaitPlayback.AudioAdapter(() => window.AndroidBridge, () => document.getElementById('audioPlayer'));
const bedAdapter = new DaitPlayback.BedAdapter(() => window.AndroidBridge, () => document.getElementById('bedPlayer'));
const arrivalPlanner = new DaitPlayback.ArrivalPlanner(Lesson);

let currentMode = null; // null(추천) | 'lessonPick'(수업 고르기) | 'lesson'(수업 듣기) | 'records'(기록)
let isDrivingMode = false;
let speechPhase = 'idle'; // 'idle' | 'speaking'
let speechSeq = 0; // 지난 말에 대한 늦은 알림을 가려내는 순번
let previewQueue = []; // 브라우저 미리보기에서 이어 틀 음원
let speechPaused = false; // 길 안내나 통화가 소리를 가져간 동안
let closeTimer = null;
let routeStartedAt = 0;
let hasArrived = false;
let journeyActive = false;
const ARRIVAL_CLOSE_MS = 4000;
const ROUTE_SWAP_MS = 3000;

// ========================================================
// 공통 도구
// ========================================================

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

// ========================================================
// 화면 고르기
// ========================================================

function render() {
  renderStage();
  syncJourney();
}

function renderStage() {
  try {
  const stageArea = document.getElementById('stageArea');
  const browsing = hasActiveLesson() && lessonView;
  document.body.classList.toggle('lesson-playing', !!(hasActiveLesson() && !lessonView && !isLessonResting()));
  document.body.classList.toggle('lesson-browsing', !!browsing);
  renderPearlNav();
  if (browsing) {
    if (browsing === 'lessons') renderLessonPick(stageArea);
    else if (browsing === 'records') renderRecords(stageArea);
    else renderHome(stageArea);
    return;
  }
  if (currentMode === 'records') { renderRecords(stageArea); return; }

  // 1. Home Screen (단일 완성형 스마트 벤토)
  if (!currentMode) {
    renderHome(stageArea);
    return;
  }

  // 2. Lessons
  if (currentMode === 'lessonPick') {
    renderLessonPick(stageArea);
    return;
  }
  if (currentMode === 'lesson') renderLesson(stageArea);
  } finally { renderLessonDock(); appEvents.emit('rendered'); }
}

function isParkedScreen() {
  return currentMode === 'lessonPick' || currentMode === 'records';
}

function goHome() {
  appEvents.emit('closeOverlays');
  if (currentMode === 'lesson') closeLesson();
  lessonView = null;
  stopSpeech();
  currentMode = null;
  hasArrived = false;
  render();
  updateDriveScreen();
}

// 지금 듣는 수업을 다 들었는가.
function isLessonDone() {
  return currentMode === 'lesson' && !!lessonRun && lessonRun.done;
}

// 지금 조각을 건너뛴다.
function skipLessonPiece() {
  if (currentMode === 'lesson' && lessonRun && !lessonRun.done) nextLessonPiece();
}

function remainMinutes() {
  return naviRemainMinutes();
}

// 여정 동안에는 내비가 앱을 덮어도 소리를 낼 수 있게 앱을 유지한다.
// 달리는 중에 내려놓으면 내비 뒤에서 다시 올릴 수 없으므로 주차하거나 수업을 닫을 때까지 둔다.
function syncJourney() {
  const finishedParked = isLessonDone() && speechPhase === 'idle' && !isDrivingMode;
  const active = (currentMode === 'lesson' && !finishedParked);
  if (active === journeyActive) return;
  journeyActive = active;
  if (window.AndroidBridge) window.AndroidBridge.setJourneyActive(active);
}

// 도착하면 진행 중이던 질문을 마치고 인사한 뒤 첫 화면으로 돌아간다.
function finishOnArrival() {
  if (currentMode !== 'lesson') return;
  hasArrived = true;
  if (lessonRun.done) closeAfterArrival();
  else if (lessonRun.stopped || lessonRun.paused) endLesson(); // 멈춰 둔 채 도착하면 이어 말하지 않고 기록을 남긴다
  else fitLessonToEta(0);
}

function closeAfterArrival() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => { if (hasArrived) goHome(); }, ARRIVAL_CLOSE_MS);
}
