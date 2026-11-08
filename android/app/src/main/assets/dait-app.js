// 다잇 화면 동작: 상태, 화면 그리기, 수업·대화 재생, 주행 연결. 수업 규칙은 dait-lesson.js, 대화 규칙은 dait-journey.js가 맡는다.
// State
const appEvents = new DaitPlayback.Events();
const vehiclePolicy = new DaitPlayback.VehiclePolicy();
const settingsStore = new DaitPlayback.SettingsStore(localStorage);
const audioAdapter = new DaitPlayback.AudioAdapter(() => window.AndroidBridge, () => document.getElementById('audioPlayer'));
const arrivalPlanner = new DaitPlayback.ArrivalPlanner(Lesson);
const voice = 'nika';
let currentMode = null; // 'morning' | 'afternoon' | 'tour' | null
let stage = '';
let heard = '';
let isDrivingMode = false;
let currentChoices = [];
let demoMinutes = null; // 시연 조작으로 고른 남은 분
let speechPhase = 'idle'; // 'idle' | 'speaking' | 'listening'
let unclearCount = 0;
let listenSince = 0; // 이번 질문을 듣기 시작한 때
let speechSeq = 0; // 지난 말에 대한 늦은 알림을 가려내는 순번
let previewQueue = []; // 브라우저 미리보기에서 이어 틀 음원
let speechPaused = false; // 길 안내나 통화가 소리를 가져간 동안
let tripMuted = false; // 이번 대화는 소리를 내지 않음
let pendingIntro = []; // 첫 질문 앞에 붙일 말(남은 시간, 오늘 시간표)
let micBroken = false; // 이번 대화에서 마이크를 열지 못함
let noMicTimer = null;
let doorTimer = null;
let closeTimer = null;
let routeStartedAt = 0;
let lastRefreshDay = '';
let tripForDoor = null; // 내릴 때 한마디: 대화를 시작한 여정. 달렸는지와 주차 시각을 기억한다.
let currentRule = null; // 이번 대화에 쓰는 교사 규칙
let ruleMissing = false; // 규칙 대화에서 준비물을 못 챙겼다고 답함
let armed = null; // 출발하면 들려주기: { mode, timer }. 수업이면 mode는 'lesson'이고 lesson과 minutes를 함께 둔다
let pendingStart = null; // 마이크 허락을 기다리는 동작
let micAsked = false;
let hasArrived = false;
let journeyActive = false;
const MEMORY_KEY = 'dait.morningMemory';
const VOICE_KEY = 'dait.voiceAnswers';
const QUESTIONS_KEY = 'dait.questions';
const ROUTE_KEY = 'dait.routePlaces';
const HOME_CLEARED_KEY = 'dait.homeCleared'; // 보호자가 지운 집을 내비 즐겨찾기로 되살리지 않는다
const ARM_MS = 30 * 60 * 1000;
const ARRIVAL_CLOSE_MS = 4000;
const NO_MIC_WAIT_MS = 8000;
const LISTEN_PATIENCE_MS = 12000;
const DOOR_WINDOW_MS = 5 * 60 * 1000;
const TRIP_CAP_MS = 2 * 60 * 60 * 1000;
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
        <circle class="brand-dot" cx="62" cy="7.5" r="2.8" fill="#38BDF8"/>
        <defs>
          <linearGradient id="flowGradBadge" x1="0" y1="0" x2="100" y2="0" gradientUnits="userSpaceOnUse">
            <stop stop-color="#38BDF8"/>
            <stop offset="0.6" stop-color="#FFFFFF"/>
            <stop offset="1" stop-color="#38BDF8"/>
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

  // 2. School Settings
  if (currentMode === 'settings') {
    renderSettings(stageArea);
    return;
  }

  // 3. Places to visit
  if (currentMode === 'places') {
    renderPlaces(stageArea);
    return;
  }

  // 4. Lessons
  if (currentMode === 'lessonPick') {
    renderLessonPick(stageArea);
    return;
  }
  if (currentMode === 'lesson') {
    renderLesson(stageArea);
    return;
  }

  // 5. Dialogue Flow
  renderDialogueFlow(stageArea);
  } finally { appEvents.emit('rendered'); }
}

// Pearl: 수업이 중심인 지금 화면. 학교 등록 여부와 관계없이 같은 구성을 쓴다.
function renderHome(container) {
  const { lesson, reserved } = homeLesson();
  const trip = currentTrip();
  const afterSchool = school && trip.mode === 'afternoon' && trip.kind !== 'weekend';
  container.innerHTML = `<div class="pearl-home">
    ${lessonCardHtml(lesson, reserved)}
    <div class="pearl-home-footer">
      <div class="pearl-home-links">
        ${afterSchool ? `<button class="card-btn quiet" onclick="startFlow('afternoon')">하교 대화</button>` : ''}
      </div>
    </div>
  </div>`;
}

// 남은 시간을 알면 그 시간에, 모르면 고른 시간(처음에는 15분)에 맞춘 수업 하나를 고른다. 예약한 수업이 있으면 그 수업이다.
function homeLesson() {
  const eta = remainMinutes();
  if (eta !== null) lessonMinutes = Lesson.minutesFor(eta);
  else if (!Lesson.TIME_CHOICES.includes(lessonMinutes)) lessonMinutes = Lesson.DEFAULT_MINUTES;
  const reserved = armed && armed.lesson ? DAIT_LESSONS.find(item => item.id === armed.lesson) : null;
  return { reserved, lesson: reserved || Lesson.recommend(DAIT_LESSONS, lessonMinutes, lessonProgress().records)[0] };
}

// 수업 카드: 두 첫 화면이 함께 쓴다. 수업의 질문으로 바로 시작한다.
function lessonCardHtml(lesson, reserved) {
  return `<div class="home-card start question-card pearl-hero">
    ${lesson ? `<div class="pearl-hero-copy">
      <div class="question-title">${escapeHtml(lesson.question)}</div>
      <div class="question-promise">${escapeHtml(lessonPromise(lesson, lessonMinutes))}</div>
      <div class="question-actions">
        <button class="card-btn" onclick="startLesson('${lesson.id}')">듣기</button>
      </div>
    </div><div class="pearl-wave" aria-hidden="true">${[12,24,36,48,58,64,58,48,36,24,12].map(n => `<i style="--bar:${n}"></i>`).join('')}</div>`
    : '<div class="question-title">이번 길은 짧아서 다음에 들려 드릴게요</div>'}
  </div>`;
}

function renderPearlNav() {
  const lessonTab = currentMode === 'lessonPick' || currentMode === 'lesson';
  const active = currentMode === 'records' ? 'records' : lessonTab ? 'lessons' : 'now';
  const minutes = remainMinutes();
  const eta = minutes === null ? `${lessonMinutes}분 수업` : `도착까지 ${Math.max(0, Math.ceil(minutes))}분`;
  document.getElementById('pearlNav').innerHTML = `
    <button class="pearl-brand" aria-label="다잇 첫 화면" onclick="openPearlTab('now')">${getDaitLogoHtml()}</button>
    <nav>${[['now','지금'],['lessons','수업'],['records','기록']].map(([id,label]) => `<button aria-current="${active === id ? 'page' : 'false'}" onclick="openPearlTab('${id}')">${label}</button>`).join('')}</nav>
    <button class="pearl-eta" aria-label="듣는 시간" onclick="openPearlTab('lessons')"${minutes !== null || currentMode === 'lesson' ? ' disabled' : ''}>${eta}</button>
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
function renderRecords(container) {
  const progress = lessonProgress();
  const records = [...progress.records].reverse();
  container.innerHTML = `<section class="pearl-records">
    <div class="pearl-record-tabs" role="tablist" aria-label="배움 기록 종류">
      <button role="tab" aria-selected="${recordTab === 'lessons'}" onclick="selectRecordTab('lessons')">수업 기록</button>
      <button role="tab" aria-selected="${recordTab === 'badges'}" onclick="selectRecordTab('badges')">배지</button>
    </div>
    <div class="pearl-record-body">${recordTab === 'badges'
      ? `<div class="pearl-badges">${PEARL_BADGES.map(([id,name]) => `<div class="pearl-badge"><img src="badges/${id}.png" alt="${name} 배지"><span>${name}</span></div>`).join('')}</div>`
      : `${progress.homework ? `<div class="pearl-homework"><span>숙제 · ${escapeHtml(progress.homework.title)}</span><button class="card-btn quiet" onclick="doneHomework()">했어요</button></div>` : ''}
        ${records.length ? `<div class="pearl-record-grid">${records.map(record => `<div class="pearl-record-row"><strong>${escapeHtml(record.title)}</strong><span>${escapeHtml(record.ymd)} · ${record.finished ? '마친 수업' : '듣던 수업'}</span></div>`).join('')}</div>` : '<div class="pearl-empty">수업을 들으면 여기에 쌓여요</div>'}`}
    </div>
  </section>`;
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

// 대화 카드의 예약 버튼. 수업 카드의 「출발하면 듣기」와 헷갈리지 않게 「대화」라고 쓴다. 수업을 예약하면 이 버튼은 숨긴다.
function armLabel(trip) {
  if (armed) return '출발하면 대화할게요';
  if (routePlaceFor(trip.mode) && !naviInfo) return trip.mode === 'morning' ? '학교로 안내' : '집으로 안내';
  return '출발하면 대화';
}

function renderDialogueFlow(container) {
  const flow = Journey.flows[currentMode];
  const modeName = currentMode === 'morning' ? '등교' : '하교';
  const data = stage === 'NEXT_DAY' ? Journey.nextDayStep(schoolPlan(), currentRule, DAIT_RULES)
    : stage.startsWith('RULE') ? Journey.ruleStep(stage, currentRule, ruleMissing, DAIT_RULES.extras.rule_missing)
    : stage === 'AFTER_SUBJECT' ? Journey.subjectStep((readStored(MEMORY_KEY) || {}).subject || '', DAIT_RULES)
    : (flow[stage] || flow.DONE);

  const subjectStages = ['SUBJECT', 'SUBJECT_MISSING', 'SUBJECT_TODAY'];
  const todayChoices = currentMode === 'morning' && subjectStages.includes(stage) ? subjectChoices() : null;
  currentChoices = todayChoices || data.choices || [];

  speakStage(data.clips || [data.clip]);
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
        <span class="top-label">${modeName}</span>
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
          <div id="heardLine" class="heard-bubble"${heard || speechPhase === 'listening' ? '' : ' hidden'}>${escapeHtml(heardLineText())}</div>
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
  const plan = schoolPlan();
  const memory = readStored(MEMORY_KEY);
  return {
    tier: Journey.tierFor(remainMinutes()),
    driving: isDrivingMode,
    school: !!school,
    hasPe: !!(plan && plan.hasPe),
    rule: currentRule,
    noQuestions: readStored(QUESTIONS_KEY) === false,
    nextDay: !!school && !!schoolDays[toYmd(new Date())] && !isClassDay(toYmd(new Date())),
    etaMinutes: currentTrip().known ? naviRemainMinutes() : demoMinutes,
    subjects: plan && plan.ymd === toYmd(new Date()) ? plan.subjects : [],
    memory: memory && memory.date === toYmd(new Date()) ? memory : {}
  };
}

function remainMinutes() {
  const live = naviRemainMinutes();
  return live === null ? demoMinutes : live;
}

function startFlow(mode) {
  if (mode !== 'afternoon') return; // 등교 대화·준비물 안내는 제거했다.
  if (askMicFirst(() => startFlow(mode))) return;
  disarm();
  currentMode = mode;
  heard = '';
  unclearCount = 0;
  listenSince = 0;
  hasArrived = false;
  micBroken = false;
  tripMuted = false;
  currentRule = ruleFor(mode);
  ruleMissing = false;
  const context = journeyContext();
  stage = Journey.start(mode, context);
  pendingIntro = stage === 'NEXT_DAY' ? [] : Journey.intro(mode, context, DAIT_RULES);
  const trip = { drove: isDrivingMode, parkedAt: 0 };
  tripForDoor = trip;
  setTimeout(() => endDoorTrip(trip), TRIP_CAP_MS); // 차 상태가 멈춰도 앞쪽 작업이 끝없이 남지 않게 한다
  noteTripChoice(mode);
  render();
}

function goHome() {
  appEvents.emit('closeOverlays');
  if (currentMode === 'lesson') closeLesson();
  stopSpeech();
  if (tripForDoor && !tripForDoor.drove) tripForDoor = null; // 주차 중에 들어 본 대화는 여정이 아니다
  currentMode = null;
  stage = '';
  heard = '';
  hasArrived = false;
  render();
  updateDriveScreen();
}

function setStage(nextStage) {
  stage = nextStage;
  unclearCount = 0;
  listenSince = 0;
  render();
}

function handleAnswer(ans, shown = ans) {
  if (isDialogueDone()) return;
  heard = shown;
  const result = Journey.next(currentMode, stage, ans, journeyContext());
  if (result.remember) rememberMorning(result.remember);
  ruleMissing = !!result.missing;
  setStage(result.stage);
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
  setStage(Journey.skip(currentMode, stage, journeyContext()));
}

// 아침에 고른 과목과 쉬기 여부를 기기에 남겨 하교 때 다시 꺼낸다 (기획안 ③⑤)
function rememberMorning(patch) {
  const today = toYmd(new Date());
  const memory = readStored(MEMORY_KEY);
  const base = memory && memory.date === today ? memory : { date: today };
  writeStored(MEMORY_KEY, { ...base, ...patch });
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
// 시동만으로 말을 시작하지 않는다. 주차 중에 보호자가 고른 여정만 출발할 때 시작한다.
// ========================================================
function toggleArm(mode) {
  if (mode !== 'afternoon') return;
  if (armed) { disarm(); render(); return; }
  if (askMicFirst(() => toggleArm(mode))) return;
  arm({ mode });
  render();
  const place = routePlaceFor(mode);
  if (place && !naviInfo && window.AndroidBridge) window.AndroidBridge.startRoute(JSON.stringify(place));
}

function arm(choice) {
  if (choice.mode !== 'lesson' && choice.mode !== 'afternoon') return;
  armed = { ...choice, timer: setTimeout(() => {
    disarm();
    refreshHomeIfIdle();
    if (currentMode === 'lessonPick') render();
  }, ARM_MS) };
}

// 고른 대로 출발할 때 시작한다. 수업은 출발할 때 아는 남은 시간을 먼저 쓴다.
// 그 시간에 들어가지 않는 수업이면 말을 시작하지 않고 예약만 지운다.
function startArmed() {
  const { mode, lesson, minutes, fromStop } = armed;
  disarm();
  if (mode !== 'lesson') { startFlow(mode); return; }
  const eta = remainMinutes();
  lessonMinutes = eta !== null ? Lesson.minutesFor(eta) : minutes;
  startLesson(lesson, fromStop);
  refreshHomeIfIdle(); // 시간이 모자라 시작하지 못했으면 예약이 사라진 것을 보여 준다
}

// 내비에서 알아 둔 학교와 집의 좌표. 있으면 첫 화면에서 바로 길 안내를 시작할 수 있다.
function routePlaceFor(mode) {
  return routePlaces[mode === 'morning' ? 'school' : 'home'] || null;
}

function learnRoutePlace(kind, place) {
  if (!tripMemoryOn()) return;
  if (!Number.isFinite(place.lat) || !place.lat) return;
  const known = routePlaces[kind];
  if (known && known.lat === place.lat && known.lng === place.lng) return;
  routePlaces[kind] = { name: place.name || '', address: place.address || '', lat: place.lat, lng: place.lng, poiId: place.poiId || '', poiSubId: place.poiSubId || '', poiProvider: place.poiProvider || '' };
  writeStored(ROUTE_KEY, routePlaces);
  updateCarPlace();
  refreshHomeIfIdle();
}

// 내비 즐겨찾기와 최근 목적지에서 학교를 찾고, '집' 즐겨찾기는 집으로 등록한다.
function learnFromNavi(places) {
  if (!tripMemoryOn()) return;
  places.filter(place => place.name && place.lat).forEach(place => {
    if (school && isSamePlace(place, school)) learnRoutePlace('school', place);
    if (place.category === 'HOME' && !homePlace && readStored(HOME_CLEARED_KEY) !== true) {
      homePlace = { name: place.name, address: place.address || '' };
      writeStored(HOME_KEY, homePlace);
    }
    if (homePlace && isSamePlace(place, homePlace)) learnRoutePlace('home', place);
  });
}

function disarm() {
  if (armed) clearTimeout(armed.timer);
  armed = null;
}

// 여정 동안에는 내비가 앱을 덮어도 말하고 들을 수 있게 앱을 유지한다.
// 달리는 중에 내려놓으면 내비 뒤에서 다시 올릴 수 없으므로 주차하거나 대화를 닫을 때까지 둔다.
function syncJourney() {
  const inDialogue = !!currentMode && !isParkedScreen();
  const finishedParked = isDialogueDone() && speechPhase === 'idle' && !isDrivingMode;
  const active = !!armed || (inDialogue && !finishedParked);
  if (active === journeyActive) return;
  journeyActive = active;
  if (window.AndroidBridge) window.AndroidBridge.setJourneyActive(active);
}

// 실제로 달린 여정 뒤 주차한 상태에서 아이 쪽 문이 처음 열릴 때 한 번만 말한다 (기획안 ④)
function trackDoorTrip(isDriving) {
  if (!tripForDoor) return;
  if (isDriving) {
    tripForDoor.drove = true;
    tripForDoor.parkedAt = 0;
    clearTimeout(doorTimer);
  } else if (tripForDoor.drove && !tripForDoor.parkedAt) {
    const parked = tripForDoor;
    parked.parkedAt = Date.now();
    doorTimer = setTimeout(() => endDoorTrip(parked), DOOR_WINDOW_MS);
  }
}

function endDoorTrip(trip) {
  if (tripForDoor !== trip) return;
  tripForDoor = null;
  syncJourney();
}

window.onDoorOpened = function() {
  noteTripDoor();
  if (!tripForDoor || !tripForDoor.drove || currentMode === 'lesson') return;
  const stoppedAtEnd = isDrivingMode && Journey.tierFor(remainMinutes()) === 'arrive';
  if (!stoppedAtEnd && (isDrivingMode || !tripForDoor.parkedAt)) return;
  clearTimeout(closeTimer);
  tripForDoor = null;
  if (currentMode === 'afternoon') finishOnArrival();
  syncJourney();
};

// ========================================================
// 말하기와 듣기
// 앱에서는 VoiceSession이, 브라우저 미리보기에서는 audio 태그가 소리를 낸다.
// ========================================================
function micState() {
  return window.AndroidBridge ? window.AndroidBridge.micState() : 'none';
}

// 처음 대화를 시작할 때 주차 중에만 마이크 허락을 묻는다.
function askMicFirst(action) {
  if (micAsked || isDrivingMode || micState() !== 'ask' || readStored(VOICE_KEY) === false) return false;
  micAsked = true;
  pendingStart = action;
  window.AndroidBridge.requestMic();
  return true;
}

window.onMicAnswered = function() {
  const action = pendingStart;
  pendingStart = null;
  if (action) action();
};

function canListen() {
  return !micBroken && micState() === 'ready' && readStored(VOICE_KEY) !== false;
}

function speakStage(clips) {
  listenSince = 0;
  const intro = pendingIntro;
  pendingIntro = [];
  if (tripMuted) stopSpeech();
  else speak([...intro, ...clips].filter(Boolean), listenNow());
}

function listenNow() {
  return canListen() ? Journey.listenSpec(currentMode, stage, currentChoices, currentRule) : '';
}

function speak(clips, listen) {
  clearTimeout(noMicTimer);
  speechPhase = 'speaking';
  speechPaused = false;
  speechSeq++;
  applyLessonAudioRate();
  audioAdapter.speak(clips, listen, speechSeq, () => { previewQueue = clips.slice(); playPreviewClip(); });
}

// 브라우저 미리보기: 음원을 차례로 튼다. temp/로 시작하는 것은 임시 음성이다.
function playPreviewClip() {
  const clip = previewQueue.shift();
  if (!clip) {
    window.onSpeechEvent(JSON.stringify({ event: 'ended', seq: speechSeq }));
    return;
  }
  const player = document.getElementById('audioPlayer');
  const seq = speechSeq; // 재생 실패 알림이 늦게 와도 그사이 시작한 다음 말을 끝내지 않게 한다
  const src = clip.startsWith('lesson/') ? `voices/${clip}.m4a` : clip.includes('/') ? `voices/${clip}.wav` : `voices/${voice}/${clip}.wav`;
  audioAdapter.playClip(src, e => {
    if (e.name === 'AbortError') return; // 위치 이동이나 일시정지가 진행 중인 재생 요청을 취소할 수 있다.
    console.log('Audio error:', e);
    window.onSpeechEvent(JSON.stringify({ event: 'ended', seq }));
  });
}

function stopSpeech() {
  clearTimeout(noMicTimer);
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
  if (speechPhase === 'listening') return '듣고 있어요';
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
  speechPhase = info.event === 'listening' ? 'listening' : 'idle';
  showHeardLine();
  if (currentMode === 'lesson') { onLessonSpeech(info); return; }
  if (info.event === 'heard') onHeard(info.text, info.reference);
  else if (info.event === 'silence') onUnclear();
  else if (info.event === 'listening') {
    listenSince = listenSince || performance.now();
    applyNaviEta();
  }
  else {
    if (info.event === 'micFailed') micBroken = true;
    applyNaviEta();
    syncJourney();
    if (hasArrived) closeAfterArrival();
    else if (info.event === 'stopped') endWithoutSpeaking();
    else if (!listenIfMicIsReady()) advanceWithoutMic();
  }
};

// 첫 말을 하는 사이에 음성 모델이 준비되었으면 지금부터 듣는다.
function listenIfMicIsReady() {
  if (!currentMode || isParkedScreen() || isDialogueDone() || !listenNow()) return false;
  speak([], listenNow());
  return true;
}

// 음악이나 통화가 소리를 돌려주지 않으면 끼어들지 않고 대화를 마친다.
function endWithoutSpeaking() {
  if (!currentMode || isParkedScreen() || isDialogueDone()) return;
  tripMuted = true;
  setStage('QUIET_END');
}

// 마이크를 쓸 수 없는 차에서는 달리는 동안 답을 받을 길이 없다.
// 가족이 이야기할 틈을 둔 뒤 다음 단계로 넘어가, 질문 하나에서 멈춰 있지 않게 한다.
function advanceWithoutMic() {
  if (currentMode === 'lesson' || !isDrivingMode || canListen() || !currentMode || isParkedScreen() || isDialogueDone() || stage === 'PARENT_BRIDGE') return;
  clearTimeout(noMicTimer);
  noMicTimer = setTimeout(() => {
    if (speechPhase === 'idle' && isDrivingMode) skipQuestion();
  }, NO_MIC_WAIT_MS);
}

function onHeard(text, reference) {
  if (!currentMode || isParkedScreen() || isDialogueDone()) return;
  const result = Journey.interpret(stage, text, reference, currentChoices, currentRule);
  if (result.kind === 'answer') handleAnswer(result.answer, result.heard);
  else if (result.kind === 'quiet') {
    rememberMorning({ rest: true });
    setStage('REST');
  } else if (result.kind === 'sad') {
    rememberMorning({ rest: true }); // 「오늘은 질문 없이」라고 했으니 그날은 다시 묻지 않는다
    setStage('REST_SOFT');
  }
  else if (result.kind === 'repeat') render();
  else if (performance.now() - listenSince < LISTEN_PATIENCE_MS) speak([], listenNow()); // 잡음일 수 있으니 재촉하지 않고 더 듣는다
  else onUnclear();
}

// 한 번 더 물어보고, 그래도 답이 없으면 재촉하지 않고 멈춘다 (기획안 ⑤)
function onUnclear() {
  if (!currentMode || isParkedScreen() || isDialogueDone()) return;
  if (stage === 'AFTER_DETAIL') { setStage('PARENT_BRIDGE'); return; } // 더 말하지 않아도 된다고 했으니 재촉하지 않는다
  unclearCount++;
  listenSince = 0;
  if (unclearCount >= 2) setStage('QUIET_END');
  else speak(['error_repeat'], listenNow());
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
