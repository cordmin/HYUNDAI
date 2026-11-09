// 다잇 화면 동작: 상태, 화면 그리기, 수업·대화 재생, 주행 연결. 수업 규칙은 dait-lesson.js, 대화 규칙은 dait-journey.js가 맡는다.
// State
const appEvents = new DaitPlayback.Events();
const vehiclePolicy = new DaitPlayback.VehiclePolicy();
const settingsStore = new DaitPlayback.SettingsStore(localStorage);
const audioAdapter = new DaitPlayback.AudioAdapter(() => window.AndroidBridge, () => document.getElementById('audioPlayer'));
const arrivalPlanner = new DaitPlayback.ArrivalPlanner(Lesson);
const voice = 'nika';
let currentMode = null; // null(추천) | 'lessonPick' | 'lesson' | 'records' | 'afternoon'(하교 대화)
let stage = '';
let heard = ''; // 하교 대화에서 고른 답
let isDrivingMode = false;
let currentChoices = [];
let speechPhase = 'idle'; // 'idle' | 'speaking'
let speechSeq = 0; // 지난 말에 대한 늦은 알림을 가려내는 순번
let previewQueue = []; // 브라우저 미리보기에서 이어 틀 음원
let speechPaused = false; // 길 안내나 통화가 소리를 가져간 동안
let tripMuted = false; // 이번 대화는 소리를 내지 않음
let driveSkipTimer = null;
let closeTimer = null;
let routeStartedAt = 0;
let armed = null; // 출발하면 들려주기: { mode, timer }. 수업이면 mode는 'lesson'이고 lesson과 minutes를 함께 둔다
let hasArrived = false;
let journeyActive = false;
const QUESTIONS_KEY = 'dait.questions';
const ARM_MS = 30 * 60 * 1000;
const ARRIVAL_CLOSE_MS = 4000;
const DRIVE_SKIP_MS = 8000; // 달리는 동안에는 답을 누를 수 없으므로 이만큼 기다렸다가 다음 단계로 간다
const ROUTE_SWAP_MS = 3000;

// DAIT 공식 확정 캘리그래피 로고 (시안 2 커넥티드 리본 + i Dot)
const DAIT_LOGO_PATH = 'M10 26 C12 10, 16 6, 22 6 C28 6, 32 12, 30 20 C28 28, 20 28, 16 28 C26 28, 38 28, 42 20 C44 14, 48 14, 50 18 C52 24, 48 28, 54 28 C60 28, 62 18, 62 14 C62 26, 68 28, 72 28 C76 28, 80 18, 80 10 M74 16 h12';

// 첫 화면 로고: 「출발하면 듣기」를 예약해 두면 i 점이 숨 쉬듯 깜빡인다.
function getDaitLogoHtml() {
  return `
    <div class="dait-brand-badge${armed ? ' waiting' : ''}" onclick="event.stopPropagation(); playSplashIntro();">
      <svg width="94" height="28" viewBox="0 0 100 32" fill="none">
        <path d="${DAIT_LOGO_PATH}"
              stroke="url(#flowGradBadge)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <circle class="brand-dot" cx="62" cy="7.5" r="2.8" fill="var(--logo-start)"/>
        <defs>
          <linearGradient id="flowGradBadge" x1="0" y1="0" x2="100" y2="0" gradientUnits="userSpaceOnUse">
            <stop stop-color="var(--logo-start)"/>
            <stop offset="0.6" stop-color="var(--logo-mid)"/>
            <stop offset="1" stop-color="var(--logo-end)"/>
          </linearGradient>
        </defs>
      </svg>
    </div>
  `;
}

function render() {
  renderStage();
  syncJourney();
}

function renderStage() {
  try {
  const stageArea = document.getElementById('stageArea');
  document.body.classList.toggle('lesson-playing', !!(currentMode === 'lesson' && lessonRun && !lessonRun.done && !isLessonResting()));
  renderPearlNav();
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
  if (currentMode === 'lesson') {
    renderLesson(stageArea);
    return;
  }

  // 3. 하교 대화
  renderDialogueFlow(stageArea);
  } finally { appEvents.emit('rendered'); }
}

// 추천 화면: 큰 수업 카드 하나.
function renderHome(container) {
  const { lesson, reserved } = homeLesson();
  container.innerHTML = `<div class="pearl-home">${lessonCardHtml(lesson, reserved)}</div>`;
}

// 추천 화면의 수업: 예약한 수업이 있으면 그 수업이다. 없으면 시간(남은 시간, 모르면 고른 시간)에 맞는 수업 가운데
// 아직 안 들은 수업에서 하나를 무작위로 고른다. 다 들었으면 맞는 수업 전체에서 고른다.
// 고른 수업은 다시 그려도 그대로 두고, 추천 탭을 다시 누르거나 고른 수업이 더는 맞지 않을 때 새로 뽑는다.
let homePick = null;
function homeLesson() {
  const eta = remainMinutes();
  if (eta !== null) lessonMinutes = Lesson.minutesFor(eta);
  else if (!Lesson.TIME_CHOICES.includes(lessonMinutes)) lessonMinutes = Lesson.DEFAULT_MINUTES;
  const reserved = armed && armed.lesson ? DAIT_LESSONS.find(item => item.id === armed.lesson) : null;
  if (reserved) return { reserved, lesson: reserved };
  const records = lessonProgress().records;
  const fitting = Lesson.recommend(DAIT_LESSONS, lessonMinutes, records);
  const heard = new Set(records.map(record => record.lesson)); // 짧은 판으로 들었어도 들은 수업이다
  const fresh = fitting.filter(lesson => !heard.has(lesson.id));
  const pool = fresh.length ? fresh : fitting;
  if (!pool.includes(homePick)) homePick = pool[Math.floor(Math.random() * pool.length)] || null;
  return { reserved: null, lesson: homePick };
}

// 메인 카드 오른쪽의 은은한 그림: 수업 주제마다 크게 한 장(되풀이하지 않음). 400×300 안에 오른쪽으로 몰아 그리고,
// 모양만 쓰며 색은 테마(--lilac)를 따른다.
const SPARKLE = (x, y, r) => `<path transform="translate(${x} ${y})" d="M0 ${-r}C${r * .18} ${-r * .18} ${r * .18} ${-r * .18} ${r} 0C${r * .18} ${r * .18} ${r * .18} ${r * .18} 0 ${r}C${-r * .18} ${r * .18} ${-r * .18} ${r * .18} ${-r} 0C${-r * .18} ${-r * .18} ${-r * .18} ${-r * .18} 0 ${-r}z"/>`;
const FLOWER = (x, y, r) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map(a => `<circle cy="${-r * .62}" r="${r * .5}" transform="rotate(${a})"/>`).join('')}</g>`;
const NOTE = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse rx="13" ry="9.5" transform="rotate(-20)"/><path d="M11 -3V-58" stroke="#000" stroke-width="4" stroke-linecap="round" fill="none"/></g>`;
const LESSON_PATTERNS = {
  // 소수: 크고 작은 소수와 끝없음
  prime: '<g font-family="Georgia,serif" font-weight="700"><text x="250" y="250" font-size="190">7</text><text x="170" y="150" font-size="96">5</text><text x="320" y="86" font-size="64">3</text><text x="200" y="272" font-size="46">2</text><text x="352" y="176" font-size="34">11</text><text x="120" y="80" font-size="48">∞</text></g>',
  // 하늘과 노을: 지는 해의 큰 반원, 작은 해, 빛 알갱이
  sky: '<g fill="none" stroke="#000" stroke-linecap="round"><path stroke-width="10" d="M190 300a120 120 0 0 1 240 0"/><path stroke-width="8" d="M230 300a80 80 0 0 1 160 0"/><circle cx="168" cy="92" r="26" stroke-width="7"/><path stroke-width="6" d="M168 46v-14M168 152v-14M122 92h-14M228 92h-14M136 60l-10-10M210 134l-10-10M136 124l-10 10M210 50l-10 10"/></g><circle cx="310" cy="300" r="40"/><circle cx="360" cy="70" r="6"/><circle cx="290" cy="130" r="4"/><circle cx="390" cy="160" r="5"/>',
  // AI: 큰 칩 하나와 뻗어 나가는 회로
  ai: '<g fill="none" stroke="#000" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><rect x="250" y="80" width="110" height="110" rx="18"/><rect x="278" y="108" width="54" height="54" rx="8"/><path d="M250 110h-50v-50h-40M250 160h-80v60M305 190v60h70M305 80V30M360 135h40"/></g><circle cx="160" cy="60" r="10"/><circle cx="170" cy="220" r="10"/><circle cx="375" cy="250" r="10"/><g font-family="monospace" font-weight="700"><text x="180" y="290" font-size="40">1</text><text x="120" y="170" font-size="30">0</text></g>',
  // 리듬: 크게 묶인 음표 둘과 작은 음표
  rhythm: '<g stroke="#000" stroke-linecap="round" fill="none"><path stroke-width="9" d="M262 200V60M352 180V40M262 60l90-20M262 84l90-20"/></g><ellipse cx="240" cy="204" rx="26" ry="19" transform="rotate(-20 240 204)"/><ellipse cx="330" cy="184" rx="26" ry="19" transform="rotate(-20 330 184)"/>' + NOTE(170, 120, 1.3) + NOTE(380, 280, .8),
  // 동백꽃: 큰 꽃 하나, 작은 꽃과 잎사귀
  dongbaek: FLOWER(300, 150, 80) + FLOWER(175, 250, 38) + FLOWER(385, 40, 26) + '<path d="M190 120c30-40 80-36 96-14c-34 30-74 34-96 14zM330 270c20-40 64-50 80-30c-24 34-60 44-80 30z"/>',
  // 별 헤는 밤: 큰 별 하나와 작은 별들
  starry: SPARKLE(300, 140, 80) + SPARKLE(175, 230, 34) + SPARKLE(380, 260, 22) + SPARKLE(200, 70, 18) + SPARKLE(390, 40, 14) + '<circle cx="130" cy="140" r="5"/><circle cx="250" cy="280" r="4"/><circle cx="360" cy="110" r="4"/>'
};
function lessonPatternStyle(lesson) {
  const art = LESSON_PATTERNS[lesson.id];
  if (!art) return '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">${art}</svg>`;
  return ` data-pattern="${lesson.id}" style="--pattern:url(&quot;data:image/svg+xml,${encodeURIComponent(svg)}&quot;)"`;
}

// 수업 카드: 두 첫 화면이 함께 쓴다. 수업의 질문으로 바로 시작한다.
function lessonCardHtml(lesson, reserved) {
  return `<div class="home-card start question-card pearl-hero"${lesson ? lessonPatternStyle(lesson) : ''}>
    ${lesson ? `<div class="pearl-hero-copy">
      <span class="pearl-subject">${escapeHtml(lesson.subject)}</span>
      <div class="question-title">${escapeHtml(lesson.question)}</div>
      <div class="question-promise">${escapeHtml(lessonPromise(lesson, lessonMinutes))}</div>
      <div class="question-actions">
        <button class="card-btn" onclick="startLesson('${lesson.id}')">듣기</button>
      </div>
    </div>`
    : '<div class="question-title">이번 길은 짧아서 다음에 들려 드릴게요</div>'}
  </div>`;
}

function renderPearlNav() {
  const lessonTab = currentMode === 'lessonPick' || currentMode === 'lesson';
  const active = currentMode === 'records' ? 'records' : lessonTab ? 'lessons' : 'now';
  const dark = document.querySelector('.pleos-display')?.dataset.colorMode === 'dark';
  document.getElementById('pearlNav').innerHTML = `
    <button class="pearl-brand" aria-label="다잇 첫 화면" onclick="openPearlTab('now')">${getDaitLogoHtml()}</button>
    <nav>${[['now','추천'],['lessons','수업'],['records','기록']].map(([id,label]) => `<button aria-current="${active === id ? 'page' : 'false'}" onclick="openPearlTab('${id}')">${label}</button>`).join('')}</nav>
    <button class="icon-btn pearl-theme-btn" aria-label="어두운 화면" aria-pressed="${dark}" onclick="togglePearlTheme()"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 15.5A7.5 7.5 0 1 1 8.5 6a6 6 0 0 0 9.5 9.5z"/><path d="M17 3.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7zM21 8.5l.45 1.05 1.05.45-1.05.45L21 11.5l-.45-1.05L19.5 10l1.05-.45z"/></svg></button>
    <button class="icon-btn" aria-label="설정" onclick="openPearlSettings()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor"/><circle cx="15" cy="17" r="2" fill="currentColor"/></svg></button>`;
  appEvents.emit('navigationRendered');
}

function openPearlTab(tab) {
  if (isDrivingMode) return;
  if (tab === 'lessons' && currentMode === 'lesson' && lessonRun && !lessonRun.done) return; // 듣던 수업을 계속 보여 준다.
  if (currentMode === 'lesson') closeLesson();
  stopSpeech();
  if (tab === 'lessons') { openLessons(); return; }
  if (tab === 'records') { currentMode = 'records'; render(); return; }
  homePick = null; // 추천 탭을 누르면 새로 뽑는다
  goHome();
}

let recordTab = 'lessons';
function selectRecordTab(tab) {
  if (isDrivingMode) return;
  recordTab = tab;
  render();
}

const PEARL_BADGES = [
  ['first-discovery','첫 발견'], ['korean','국어'], ['math','수학'],
  ['exploration','탐험'], ['well-rounded-explorer','골고루 탐험가'], ['everyday-discoverer','생활 속 발견가']
];
function recordDateLabel(ymd) {
  const digits = String(ymd || '').replace(/-/g, '');
  return /^\d{8}$/.test(digits) ? `${Number(digits.slice(4, 6))}월 ${Number(digits.slice(6, 8))}일` : '';
}

function recordResume(record, index, progress) {
  if (record.finished) return null;
  if (record.resume) return record.resume;
  const point = progress.resume;
  return point && point.lesson === record.lesson && point.ymd === record.ymd &&
    !progress.records.slice(index + 1).some(item => item.lesson === record.lesson && !item.finished) ? point : null;
}

function resumeRecord(index) {
  if (isDrivingMode) return;
  const progress = lessonProgress(), record = progress.records[index];
  if (!record) return;
  const point = recordResume(record, index, progress);
  const lesson = DAIT_LESSONS.find(item => item.id === record.lesson);
  if (!point || !lesson || !lesson.pieces.some(piece => piece.id === point.from)) return;
  const eta = remainMinutes();
  lessonMinutes = eta !== null ? Lesson.minutesFor(eta) : Math.max(Lesson.DEFAULT_MINUTES, Math.ceil(Lesson.totalSeconds(Lesson.resumePlan(lesson, point, 120)) / 60) + 1);
  startLesson(lesson.id, true, point);
}

function updateListScroll(panelId = 'recordPanel', prefix = 'recordScroll') {
  const body = document.getElementById(panelId);
  const up = document.getElementById(prefix + 'Up'), down = document.getElementById(prefix + 'Down');
  if (!body || !up || !down) return;
  const remaining = Math.max(0, body.scrollHeight - body.clientHeight);
  up.disabled = isDrivingMode || body.scrollTop <= 1;
  down.disabled = isDrivingMode || body.scrollTop >= remaining - 1;
  document.getElementById(prefix + 'Thumb')?.style.setProperty('top', `${remaining ? Math.min(1, body.scrollTop / remaining) * 60 : 0}%`);
}

function scrollList(direction, panelId = 'recordPanel') {
  if (isDrivingMode || ![-1, 1].includes(direction)) return;
  const body = document.getElementById(panelId);
  if (body) body.scrollBy({ top: direction * Math.max(1, body.clientHeight * .8), behavior: 'smooth' });
}

function renderRecords(container) {
  const progress = lessonProgress();
  const records = [...progress.records].reverse();
  container.innerHTML = `<section class="pearl-records">
    <div class="pearl-record-tabs" role="tablist" aria-label="배움 기록 종류">
      <button id="recordLessonsTab" role="tab" aria-controls="recordPanel" aria-selected="${recordTab === 'lessons'}" onclick="selectRecordTab('lessons')">배움 기록</button>
      <button id="recordBadgesTab" role="tab" aria-controls="recordPanel" aria-selected="${recordTab === 'badges'}" onclick="selectRecordTab('badges')">획득 배지</button>
    </div>
    <div class="pearl-record-content"><div class="pearl-record-body" id="recordPanel" onscroll="updateListScroll()" role="tabpanel" aria-labelledby="${recordTab === 'badges' ? 'recordBadgesTab' : 'recordLessonsTab'}">${recordTab === 'badges'
      ? `<div class="pearl-badges">${PEARL_BADGES.map(([id,name]) => `<div class="pearl-badge"><img src="badges/${id}.png" alt="${name} 배지"><span>${name}</span></div>`).join('')}</div>`
      : `${progress.homework ? `<div class="pearl-homework"><span>숙제 · ${escapeHtml(progress.homework.title)}</span><button class="card-btn quiet" onclick="doneHomework()">했어요</button></div>` : ''}
        ${records.length ? `<div class="pearl-record-grid">${records.map((record, reverseIndex) => {
          const index = progress.records.length - 1 - reverseIndex;
          const resumable = recordResume(record, index, progress);
          return `<div class="pearl-record-row"><div class="pearl-record-copy"><span class="pearl-record-date">${escapeHtml(recordDateLabel(record.ymd))}</span><strong>${escapeHtml(record.title)}</strong><span class="${record.finished ? 'pearl-record-complete' : 'pearl-record-status'}">${record.finished ? '배움 완료!' : '듣던 수업'}</span></div>${record.finished ? '' : `<button class="pearl-record-resume" onclick="resumeRecord(${index})" aria-label="${resumable ? '듣던 수업 이어 듣기' : '이어 들을 위치가 없는 기록'}"${resumable ? '' : ' disabled'}>${LESSON_PLAY_ICON}</button>`}</div>`;
        }).join('')}</div>` : '<div class="pearl-empty">수업을 들으면 여기에 쌓여요</div>'}`}
    </div>
    ${recordTab === 'lessons' && records.length ? `<div class="pearl-record-scroll" aria-label="기록 목록 이동"><button id="recordScrollUp" onclick="scrollList(-1)" aria-label="이전 기록"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button><div class="pearl-record-track" aria-hidden="true"><div id="recordScrollThumb" class="pearl-scroll-thumb"></div></div><button id="recordScrollDown" onclick="scrollList(1)" aria-label="다음 기록"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div>` : ''}
    </div>
  </section>`;
  updateListScroll();
}

// 도착 시간을 알 때만 도착을 약속한다. 모르면 수업 길이만 말한다.
function lessonPromise(lesson, minutes) {
  if (remainMinutes() !== null) return '도착할 때쯤 답을 알게 돼요';
  return `약 ${Math.round(Lesson.totalSeconds(Lesson.assemble(lesson, minutes)) / 60)}분이면 답을 알게 돼요`;
}

function bigWordHtml(word, sub) {
  const size = word.length <= 4 ? 1 : word.length <= 6 ? 2 : word.length <= 10 ? 3 : 4;
  return `<div class="card-big size-${size}"><span>${escapeHtml(word)}</span>${sub ? `<div class="card-sub">${escapeHtml(sub)}</div>` : ''}</div>`;
}

function renderDialogueFlow(container) {
  const flow = Journey.flows.afternoon;
  const data = flow[stage] || flow.DONE;
  currentChoices = data.choices;

  if (tripMuted) stopSpeech();
  else speak([data.clip].filter(Boolean));
  updateDriveScreen(data.title);

  let optionsHtml = '';
  if (currentChoices.length > 0) {
    optionsHtml = `
      <div class="options-row">
        ${currentChoices.map((c, i) => `<button class="choice-chip" onclick="handleAnswer(currentChoices[${i}])">${escapeHtml(c)}</button>`).join('')}
      </div>
    `;
  }

  const buttonLabel = isDialogueDone() ? '마치기' : '다시 듣기';
  const skipHtml = isDialogueDone() ? '' : '<button class="primary-btn secondary" onclick="skipQuestion()">넘기기</button>';

  container.innerHTML = `
    <div class="dialogue-wrap">
      <div class="dialogue-top">
        <button class="back-btn" onclick="goHome()">처음으로</button>
        <span class="top-label">하교</span>
      </div>

      <div class="dialogue-card">
        <div class="card-center">
          <div class="dialogue-orb">
            <div class="voice-visualizer">
              <div class="v-bar"></div>
              <div class="v-bar"></div>
              <div class="v-bar"></div>
              <div class="v-bar"></div>
              <div class="v-bar"></div>
            </div>
          </div>
          <div class="main-question">${escapeHtml(data.title)}</div>
          <div id="heardLine" class="heard-bubble"${heard ? '' : ' hidden'}>${escapeHtml(heardLineText())}</div>
        </div>

        ${optionsHtml}
      </div>

      <div class="bottom-bar">
        <button class="primary-btn" onclick="handlePrimaryAction()">
          ${buttonLabel}
        </button>
        ${skipHtml}
      </div>
    </div>
  `;
}

function journeyContext() {
  return {
    tier: Journey.tierFor(remainMinutes()),
    driving: isDrivingMode,
    noQuestions: readStored(QUESTIONS_KEY) === false
  };
}

function remainMinutes() {
  return naviRemainMinutes();
}

function startFlow(mode) {
  if (mode !== 'afternoon') return;
  disarm();
  currentMode = mode;
  heard = '';
  hasArrived = false;
  tripMuted = false;
  stage = Journey.start(journeyContext());
  render();
}

function goHome() {
  appEvents.emit('closeOverlays');
  if (currentMode === 'lesson') closeLesson();
  stopSpeech();
  currentMode = null;
  stage = '';
  heard = '';
  hasArrived = false;
  render();
  updateDriveScreen();
}

function setStage(nextStage) {
  stage = nextStage;
  render();
}

function handleAnswer(answer) {
  if (isDialogueDone()) return;
  heard = answer;
  setStage(Journey.next(stage, answer, journeyContext()));
}

function isDialogueDone() {
  if (currentMode === 'lesson') return !!lessonRun && lessonRun.done;
  return Journey.isDone(stage);
}

// 질문을 건너뛴다. 답을 지어내지 않고 다음 단계로만 넘어간다.
function skipQuestion() {
  if (!currentMode || isParkedScreen() || isDialogueDone()) return;
  if (currentMode === 'lesson') { nextLessonPiece(); return; }
  heard = '';
  setStage(Journey.skip(stage, journeyContext()));
}

function handlePrimaryAction() {
  if (isDialogueDone()) {
    goHome();
  } else if (currentMode === 'lesson') {
    if (!isLessonResting()) playLessonPiece();
  } else {
    render();
  }
}

// ========================================================
// 출발하면 들려주기
// 시동만으로 말을 시작하지 않는다. 주차 중에 고른 수업만 출발할 때 시작한다.
// ========================================================
function arm(choice) {
  if (choice.mode !== 'lesson') return;
  armed = { ...choice, timer: setTimeout(() => {
    disarm();
    refreshHomeIfIdle();
    if (currentMode === 'lessonPick') render();
  }, ARM_MS) };
}

// 고른 대로 출발할 때 시작한다. 수업은 출발할 때 아는 남은 시간을 먼저 쓴다.
// 그 시간에 들어가지 않는 수업이면 말을 시작하지 않고 예약만 지운다.
function startArmed() {
  const { lesson, minutes, fromStop } = armed;
  disarm();
  const eta = remainMinutes();
  lessonMinutes = eta !== null ? Lesson.minutesFor(eta) : minutes;
  startLesson(lesson, fromStop);
  refreshHomeIfIdle(); // 시간이 모자라 시작하지 못했으면 예약이 사라진 것을 보여 준다
}

function disarm() {
  if (armed) clearTimeout(armed.timer);
  armed = null;
}

// 여정 동안에는 내비가 앱을 덮어도 소리를 낼 수 있게 앱을 유지한다.
// 달리는 중에 내려놓으면 내비 뒤에서 다시 올릴 수 없으므로 주차하거나 대화를 닫을 때까지 둔다.
function syncJourney() {
  const inDialogue = !!currentMode && !isParkedScreen();
  const finishedParked = isDialogueDone() && speechPhase === 'idle' && !isDrivingMode;
  const active = !!armed || (inDialogue && !finishedParked);
  if (active === journeyActive) return;
  journeyActive = active;
  if (window.AndroidBridge) window.AndroidBridge.setJourneyActive(active);
}

// ========================================================
// 소리 내기
// 앱에서는 VoiceSession이, 브라우저 미리보기에서는 audio 태그가 소리를 낸다.
// ========================================================
function speak(clips) {
  clearTimeout(driveSkipTimer);
  speechPhase = 'speaking';
  speechPaused = false;
  speechSeq++;
  applyLessonAudioRate();
  audioAdapter.speak(clips, speechSeq, () => { previewQueue = clips.slice(); playPreviewClip(); });
}

// 브라우저 미리보기: 음원을 차례로 튼다.
function playPreviewClip() {
  const clip = previewQueue.shift();
  if (!clip) {
    window.onSpeechEvent(JSON.stringify({ event: 'ended', seq: speechSeq }));
    return;
  }
  const player = document.getElementById('audioPlayer');
  const seq = speechSeq; // 재생 실패 알림이 늦게 와도 그사이 시작한 다음 말을 끝내지 않게 한다
  const src = clip.startsWith('lesson/') ? `voices/${clip}.m4a` : `voices/${voice}/${clip}.wav`;
  audioAdapter.playClip(src, e => {
    if (e.name === 'AbortError') return; // 위치 이동이나 일시정지가 진행 중인 재생 요청을 취소할 수 있다.
    console.log('Audio error:', e);
    window.onSpeechEvent(JSON.stringify({ event: 'ended', seq }));
  });
}

function stopSpeech() {
  clearTimeout(driveSkipTimer);
  speechPhase = 'idle';
  speechPaused = false;
  speechSeq++;
  audioAdapter.stop();
}

function holdSpeech() {
  audioAdapter.hold();
}

function proceedSpeech() {
  audioAdapter.resume(() => window.onSpeechEvent(JSON.stringify({ event: 'ended', seq: speechSeq })));
}

function heardLineText() {
  return heard ? `“${heard}”` : '';
}

function showHeardLine() {
  const line = document.getElementById('heardLine');
  if (line) {
    line.textContent = heardLineText();
    line.hidden = !line.textContent;
  }
  updateDriveScreen();
}

window.onSpeechEvent = function(jsonText) {
  const info = JSON.parse(jsonText);
  if (info.seq !== speechSeq) return; // 지난 말에 대한 늦은 알림
  if (info.event === 'position') {
    if (lessonRun && !lessonRun.done && Number.isFinite(info.position)) {
      lessonRun.positionSeconds = info.position / 1000;
      updateLessonProgress();
    }
    return;
  }
  if (info.event === 'paused' || info.event === 'resumed') {
    speechPaused = info.event === 'paused';
    if (currentMode === 'lesson' && lessonRun && !lessonRun.done) {
      if (speechPaused) lessonRun.playback.interrupt();
      else if (!lessonRun.playback.resumeFromSystem()) { holdSpeech(); speechPaused = true; }
      renderStage();
      syncLessonMedia();
    }
    return;
  }
  speechPhase = 'idle';
  showHeardLine();
  if (currentMode === 'lesson') { onLessonSpeech(info); return; }
  applyNaviEta();
  syncJourney();
  if (hasArrived) closeAfterArrival();
  else if (info.event === 'stopped') endWithoutSpeaking();
  else skipWhileDriving();
};

// 음악이나 통화가 소리를 돌려주지 않으면 끼어들지 않고 대화를 마친다.
function endWithoutSpeaking() {
  if (!currentMode || isParkedScreen() || isDialogueDone()) return;
  tripMuted = true;
  setStage('QUIET_END');
}

// 달리는 동안에는 답 버튼을 누를 수 없다. 가족이 이야기할 틈을 둔 뒤 다음 단계로 넘어가,
// 질문 하나에서 멈춰 있지 않게 한다.
function skipWhileDriving() {
  if (currentMode !== 'afternoon' || !isDrivingMode || isDialogueDone() || stage === 'PARENT_BRIDGE') return;
  clearTimeout(driveSkipTimer);
  driveSkipTimer = setTimeout(() => {
    if (speechPhase === 'idle' && isDrivingMode) skipQuestion();
  }, DRIVE_SKIP_MS);
}

// 도착하면 진행 중이던 질문을 마치고 인사한 뒤 첫 화면으로 돌아간다.
function finishOnArrival() {
  if (!currentMode || isParkedScreen()) return;
  if (currentMode === 'lesson') {
    hasArrived = true;
    if (lessonRun.done) closeAfterArrival();
    else if (lessonRun.stopped || lessonRun.paused) endLesson(); // 멈춰 둔 채 도착하면 이어 말하지 않고 기록을 남긴다
    else fitLessonToEta(0);
    return;
  }
  hasArrived = true;
  if (!isDialogueDone() || (currentMode === 'afternoon' && stage === 'ETA_SHORT')) setStage('DONE');
  if (speechPhase === 'idle') closeAfterArrival();
}

function closeAfterArrival() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => { if (hasArrived) goHome(); }, ARRIVAL_CLOSE_MS);
}
