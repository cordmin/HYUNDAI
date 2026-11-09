// 다잇 화면: 수업 고르기·재생·멈춤·이어 듣기. dait-app.js 다음에 불러온다.
// ========================================================
// 시간 맞춤 수업 (11.01 회의)
// 조립과 판단은 dait-lesson.js가 맡고, 여기는 수업을 틀고 화면을 그린다.
// 수업의 발문 뒤에는 마이크를 열지 않고 생각할 시간을 둔다.
// ========================================================
const LESSON_KEY = 'dait.lessonProgress';
let lessonRun = null; // 지금 듣는 교시: { lesson, trip, pieces, index, heard, answers, reachedEnd, done, finished, stopped, saved }
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
const TOP_SPEED_MPS = 50; // 이보다 빨리 줄어든 남은 거리는 달린 것이 아니라 목적지를 바꾼 것이다

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
  currentMode = 'lessonPick';
  render();
}

function pickLessonTime(minutes) {
  if (isDrivingMode || remainMinutes() !== null || ![8, 15, 20].includes(minutes)) return;
  lessonMinutes = minutes;
  render();
}

// 고른 수업을 맨 앞에 두고 다른 수업을 줄 세운다. 긴 이동이면 교시로 나누고,
// 짧은 이동이어도 고른 수업 뒤에 5분 넘게 남으면 다른 수업을 쉬지 않고 이어 붙인다.
function lessonTripFor(lessonId) {
  return Lesson.planTrip(Lesson.tripOrder(DAIT_LESSONS, lessonProgress().records, lessonId), lessonMinutes);
}

// 출발 예약은 수업 재생만 준비한다.
function toggleLessonArm(lessonId, fromStop) {
  if (isDrivingMode) return;
  if (armed && armed.lesson === lessonId && !!armed.fromStop === !!fromStop) { disarm(); render(); return; }
  disarm();
  arm({ mode: 'lesson', lesson: lessonId, minutes: lessonMinutes, fromStop: !!fromStop });
  render();
}

function doneHomework() {
  writeStored(LESSON_KEY, Lesson.finishHomework(lessonProgress()));
  render();
}

// 카드를 누르면 바로 듣는다는 표시
// 카드를 누르면 바로 듣는다는 표시
const LESSON_PLAY_ICON = '<span class="lesson-play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg></span>';

function renderLessonPick(container) {
  const progress = lessonProgress();
  const eta = remainMinutes();
  const choices = eta !== null ? [Lesson.minutesFor(eta)] : [...Lesson.TIME_CHOICES, ...Lesson.LONG_CHOICES];
  if (!choices.includes(lessonMinutes)) lessonMinutes = eta !== null ? choices[0] : Lesson.DEFAULT_MINUTES;
  const trip = Lesson.planTrip(Lesson.tripOrder(DAIT_LESSONS, progress.records, armed && armed.lesson), lessonMinutes);
  const periods = trip.lesson ? Lesson.periods(trip) : [];
  const lessons = Lesson.recommend(DAIT_LESSONS, trip.minutes, progress.records);
  const reserved = armed && armed.lesson ? DAIT_LESSONS.find(lesson => lesson.id === armed.lesson) : null;
  const stopped = stoppedLesson(lessonMinutes);
  const stopReserved = !!reserved && armed.fromStop;
  const scrolled = document.querySelector('.lesson-main')?.scrollTop || 0;
  const km = Math.round(progress.km[Lesson.monthOf(toYmd(new Date()))] || 0);
  const mileage = km ? `이번 달 ${km}km ${Lesson.mileageLine(km)}`.trim() : '';
  container.innerHTML = `
    <div class="dialogue-wrap pearl-picker">
      <div class="dialogue-top">
        <button class="back-btn" onclick="goHome()">처음으로</button>
        <span class="top-label">수업</span>
      </div>
      <div class="pearl-records">
      ${eta !== null ? '' : `<div class="pearl-record-tabs lesson-time-tabs" role="tablist" aria-label="수업 시간">${[8,15,20].map(minutes => `<button role="tab" aria-controls="lessonList" aria-selected="${minutes === lessonMinutes}" onclick="pickLessonTime(${minutes})">${minutes}분 수업</button>`).join('')}</div>`}
      <div class="lesson-pick pearl-record-content">
        <div class="lesson-main" id="lessonList" onscroll="updateListScroll('lessonList', 'lessonScroll')">
          ${eta !== null ? `<div class="lesson-filters"><span class="lesson-eta-summary">도착까지 ${Lesson.minutesFor(eta)}분, ${periods.length > 1 ? (trip.rest ? `${periods.length}교시로 들어요` : '수업을 이어 들어요') : '이 수업을 들어요'}</span></div>` : ''}
          ${periods.length > 1 && trip.rest ? `<div class="lesson-plan-summary">${periods.map((lesson, i) => `${i + 1}교시 ${escapeHtml(lesson.subject)}`).join(' · ')} · 쉬는 시간 ${trip.rest}분</div>` : ''}
          ${periods.length > 1 && !trip.rest ? '<div class="lesson-plan-summary">고른 수업이 끝나고 남는 시간은 다른 수업으로 이어 채워요</div>' : ''}
          ${lessons.length === 0 && !stopped ? '<div class="settings-message">이 시간에 맞는 수업이 아직 없어요</div>' : ''}
          <div class="lesson-grid">
          ${stopped ? `<div class="lesson-row">
            <button class="choice-chip" onclick="startLesson('${stopped.id}', true)">
              ${LESSON_PLAY_ICON}
              <span class="lesson-text">
                <span class="lesson-title">지난번 멈춘 곳부터: ${escapeHtml(stopped.title)}</span>
                <span class="lesson-meta">${escapeHtml(stopped.subject)} · 남은 약 ${stopMinutesLeft(stopped, lessonMinutes)}분</span>
              </span>
            </button>
            <button class="card-btn quiet" onclick="toggleLessonArm('${stopped.id}', true)">${stopReserved && reserved === stopped ? '예약 취소' : '출발하면 듣기'}</button>
          </div>` : ''}
          ${lessons.filter(lesson => lesson !== stopped).map(lesson => `<div class="lesson-row">
            <button class="choice-chip" onclick="startLesson('${lesson.id}')">
              ${LESSON_PLAY_ICON}
              <span class="lesson-text">
                <span class="lesson-title">${escapeHtml(lesson.question || lesson.title)}</span>
                <span class="lesson-meta">${escapeHtml(lesson.subject)} · 약 ${Math.round(Lesson.totalSeconds(Lesson.assemble(lesson, trip.minutes)) / 60)}분 · ${escapeHtml(lesson.title)}</span>
              </span>
            </button>
            <button class="card-btn quiet" onclick="toggleLessonArm('${lesson.id}')">${reserved === lesson && !stopReserved ? '예약 취소' : '출발하면 듣기'}</button>
          </div>`).join('')}
          </div>
        </div>
        <div class="pearl-record-scroll" aria-label="수업 목록 이동"><button id="lessonScrollUp" onclick="scrollList(-1, 'lessonList')" aria-label="이전 수업"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button><div class="pearl-record-track" aria-hidden="true"><div id="lessonScrollThumb" class="pearl-scroll-thumb"></div></div><button id="lessonScrollDown" onclick="scrollList(1, 'lessonList')" aria-label="다음 수업"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div>
        ${mileage || progress.homework ? `<div class="lesson-side">
          ${mileage ? `<div class="card-sub">${escapeHtml(mileage)}</div>` : ''}
          ${progress.homework ? `<div class="card-label">숙제</div><div class="card-sub">${escapeHtml(progress.homework.title)}</div><button class="card-btn" onclick="doneHomework()">했어요</button>` : ''}
        </div>` : ''}
      </div>
      </div>
    </div>
  `;
  const main = document.querySelector('.lesson-main');
  if (main) main.scrollTop = scrolled; // 예약을 눌러도 보던 자리에 머문다
  updateListScroll('lessonList', 'lessonScroll');
}

function renderLesson(container) {
  const run = lessonRun;
  if (!run.done && !isLessonResting()) { renderLessonPlayer(container, run); return; }
  const piece = run.pieces[run.index];
  const resting = !run.done && Lesson.isBreak(piece);
  const title = run.done ? lessonDoneLine(run) : run.stopped ? '수업을 잠시 멈췄어요' : piece.line;
  const back = '<button class="primary-btn secondary" onclick="prevLessonPiece()">이전</button>';
  const buttons = run.done ? '<button class="primary-btn" onclick="handlePrimaryAction()">마치기</button>'
    : `${resting ? '' : back}<button class="primary-btn" onclick="lessonMainAction()">${lessonMainLabel(run)}</button>`;
  container.innerHTML = `
    <div class="dialogue-wrap">
      <div class="dialogue-top">
        <button class="back-btn" onclick="goHome()">처음으로</button>
        ${!isDrivingMode && !run.done && !resting ? '<button class="back-btn" onclick="restartLesson()">처음부터 듣기</button>' : ''}
        <span class="top-label">${escapeHtml(lessonLabel(run, resting))}</span>
      </div>
      <div class="dialogue-card">
        <div class="card-center">
          <div class="main-question">${escapeHtml(title)}</div>
          ${run.done || resting ? '' : run.paused ? '<div class="card-sub">잠시 멈췄어요</div>' : piece.voiced ? '' : '<div class="card-sub">음원 준비 중</div>'}
          <div id="heardLine" class="heard-bubble"${heard || speechPhase === 'listening' ? '' : ' hidden'}>${escapeHtml(heardLineText())}</div>
        </div>
      </div>
      ${!isDrivingMode && !resting ? lessonProgressHtml(run) : ''}
      <div class="bottom-bar">${buttons}</div>
    </div>
  `;
  tickLessonProgress();
}

function lessonIntervalText(seconds) {
  return seconds % 60 === 0 ? `${seconds / 60}분` : `${seconds}초`;
}

function lessonTransportIcon(name) {
  const paths = { back: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>', forward: '<path d="M20 10a8 8 0 1 0-1 8M20 4v6h-6"/>', play: '<path d="m8 5 12 7-12 7Z" fill="currentColor" stroke="none"/>', pause: '<path d="M8 6v12M16 6v12"/>' };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function renderLessonPlayer(container, run) {
  const piece = run.pieces[run.index], playing = run.playback.state === 'playing';
  const prefs = lessonPlaybackPrefs;
  container.innerHTML = `<div class="pearl-player${playing ? ' is-playing' : ''}" aria-label="수업 재생">
    <div class="pearl-player-heading">
      <h1 class="main-question">${escapeHtml(piece.line)}</h1>
      <p class="pearl-player-meta">${escapeHtml(lessonLabel(run, false))}${prefs.rate !== 1 ? ` · ${prefs.rate.toFixed(1)}배속` : ''}</p>
      <div id="heardLine" class="heard-bubble"${heard || speechPhase === 'listening' ? '' : ' hidden'}>${escapeHtml(heardLineText())}</div>
    </div>
    <div class="pearl-player-wave dait-sound" aria-hidden="true">${SOUND_BARS}</div>
    <div class="pearl-transport">
      <button class="pearl-seek" onclick="seekLessonBy(-lessonPlaybackPrefs.back)" aria-label="${lessonIntervalText(prefs.back)} 뒤로">${lessonTransportIcon('back')}<span>${lessonIntervalText(prefs.back)}</span></button>
      <button class="pearl-play" onclick="lessonMainAction()" aria-label="${playing ? '일시정지' : '이어 듣기'}">${lessonTransportIcon(playing ? 'pause' : 'play')}</button>
      <button class="pearl-seek" onclick="seekLessonBy(lessonPlaybackPrefs.forward)" aria-label="${lessonIntervalText(prefs.forward)} 앞으로">${lessonTransportIcon('forward')}<span>${lessonIntervalText(prefs.forward)}</span></button>
    </div>
    <div class="pearl-player-progress" aria-label="수업 진행">
      <input id="lessonSeek" type="range" min="0" max="${lessonTimeline(run).seconds}" step="0.1" value="0" aria-label="${isDrivingMode ? '수업 진행 시간' : '수업 재생 위치'}" oninput="previewLessonSeek(Number(this.value))" onchange="seekLessonAt(Number(this.value))" onblur="cancelLessonScrub()" onpointercancel="cancelLessonScrub()"${isDrivingMode ? ' disabled' : ''}>
      <div class="pearl-player-times"><span id="lessonElapsed">0:00</span><span id="lessonTimingNote"></span><span id="lessonRemaining"></span></div>
    </div>
  </div>`;
  tickLessonProgress();
  startSoundMotion();
}

// 소리 막대: 왼쪽부터 저음 → 고음 5칸. 음원마다 미리 재 둔 칸별 소리 크기(dait-sound-levels.js)를
// 지금 재생 위치에서 읽어 움직인다. 차에서는 기기 재생기가 소리를 틀어 화면이 직접 듣지 못하기 때문이다.
// 말하지 않는 동안(생각할 시간·쉬는 시간)은 낮게 쉬고, 운전 중이거나 움직임 줄이기를 켰으면 멈춘 높이로 둔다.
const SOUND_BARS = [.45, .75, 1, .7, .5].map((s, k) => `<i style="--s:${s};--k:${k}"></i>`).join('');
const SOUND_REST = .18;
let soundFrame = 0, soundClock = { pos: -1, at: 0 };

// 기기 재생기는 위치를 0.25초마다 알려 주므로, 그 사이는 흐른 시간으로 메운다.
function soundPosition(run, now) {
  if (!window.AndroidBridge) {
    const time = document.getElementById('audioPlayer')?.currentTime;
    if (Number.isFinite(time)) return time;
  }
  const pos = run.positionSeconds || 0;
  if (pos !== soundClock.pos) soundClock = { pos, at: now };
  return pos + Math.min(.5, (now - soundClock.at) / 1000) * (lessonPlaybackPrefs.rate || 1);
}

function soundBandLevels(clip, seconds) {
  const table = typeof DAIT_SOUND_LEVELS !== 'undefined' ? DAIT_SOUND_LEVELS : null;
  const data = table?.clips[clip], bands = table?.bands || 5;
  const at = Math.floor(seconds * (table?.fps || 0)) * bands;
  if (!data || at < 0 || at + bands > data.length) return null;
  return Array.from({ length: bands }, (_, k) => (Number(data[at + k]) / 9) ** 1.6); // 큰 소리만 크게 튀어 오르게
}

function startSoundMotion() {
  if (soundFrame || typeof requestAnimationFrame !== 'function') return;
  const shown = [];
  const step = now => {
    const bars = document.querySelectorAll('.pearl-player.is-playing .dait-sound i'), run = lessonRun;
    if (!bars.length || !run) { soundFrame = 0; return; }
    const still = isDrivingMode || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const piece = run.pieces[run.index];
    const speaking = piece?.voiced && speechPhase === 'speaking' && !speechPaused;
    const target = speaking ? soundBandLevels(piece.clip, soundPosition(run, now)) : null;
    bars.forEach((bar, k) => {
      if (still) { bar.style.height = ''; return; }
      const goal = SOUND_REST + (target ? target[k] : 0) * (1 - SOUND_REST);
      // 작은 변화(0.12 미만)는 무시하고, 큰 변화도 천천히 따라가 자잘하게 떨리지 않게 한다.
      const was = shown[k] ?? SOUND_REST;
      shown[k] = Math.abs(goal - was) < .12 ? was : was * .8 + goal * .2;
      bar.style.height = `${(shown[k] * 100).toFixed(1)}%`;
    });
    soundFrame = requestAnimationFrame(step);
  };
  soundFrame = requestAnimationFrame(step);
}

function lessonTimeline(run) {
  let seconds = 0;
  const sections = run.pieces.flatMap((piece, index) => {
    if (Lesson.isBreak(piece)) return [];
    const section = { piece, index, start: seconds, seconds: Lesson.totalSeconds([piece]) };
    seconds += section.seconds;
    return [section];
  });
  return { sections, seconds };
}

function lessonTimeText(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function lessonProgressHtml(run) {
  const timeline = lessonTimeline(run);
  return `<div class="lesson-progress" aria-label="수업 진행">
    <div class="lesson-progress-times"><span id="lessonElapsed">0:00</span><span id="lessonSectionName"></span><span>${lessonTimeText(timeline.seconds)}</span></div>
    <div class="lesson-progress-track">
      <div class="lesson-progress-segments" aria-hidden="true">${timeline.sections.map(section => `<span data-lesson-segment="${section.index}" style="flex:${section.seconds}"></span>`).join('')}</div>
      <input id="lessonSeek" type="range" min="0" max="${timeline.seconds}" step="0.1" value="0" aria-label="수업 재생 위치" oninput="previewLessonSeek(Number(this.value))" onchange="seekLessonAt(Number(this.value))" onblur="cancelLessonScrub()" onpointercancel="cancelLessonScrub()"${run.done ? ' disabled' : ''}>
    </div>
    <div class="lesson-sections" aria-label="수업 구간">${timeline.sections.map((section, n) => `<button onclick="seekLessonSection(${section.index})" data-lesson-section="${section.index}" aria-label="${n + 1}구간 ${escapeHtml(section.piece.line)}"${run.done ? ' disabled' : ''}>${n + 1}. ${escapeHtml(section.piece.line)}</button>`).join('')}</div>
  </div>`;
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

function updateLessonProgress() {
  const run = lessonRun;
  if (!run || currentMode !== 'lesson') return;
  const timeline = lessonTimeline(run);
  const section = timeline.sections.find(item => item.index === run.index);
  const position = run.done ? timeline.seconds : (section ? section.start + Math.min(section.seconds, currentLessonPosition(run)) : timeline.seconds);
  if (!run.scrubbing) {
    const slider = document.getElementById('lessonSeek');
    if (!slider) return;
    slider.max = timeline.seconds; slider.value = position;
    slider.style.setProperty('--seek-fill', `${timeline.seconds ? position / timeline.seconds * 100 : 0}%`);
    slider.setAttribute('aria-valuetext', `${lessonTimeText(position)} / ${lessonTimeText(timeline.seconds)}`);
    document.getElementById('lessonElapsed').textContent = lessonTimeText(position);
  }
  const remaining = document.getElementById('lessonRemaining');
  if (remaining) remaining.textContent = '수업 ' + lessonTimeText(arrivalPlanner.remaining(run.pieces, run.index, currentLessonPosition(run), lessonPlaybackPrefs.rate)) + ' 남음';
  const note = document.getElementById('lessonTimingNote');
  if (note) note.textContent = run.done ? '수업을 마쳤어요' : run.playback.state === 'interrupted' ? '다른 소리가 끝나면 이어 들어요' : run.paused ? '잠시 멈췄어요' : hasArrived || Lesson.isClosing(run.pieces[run.index]) ? '도착에 맞춰 마무리 중' : remainMinutes() !== null ? '도착 시간에 맞춰 조절 중' : '';
  const sectionName = document.getElementById('lessonSectionName');
  if (sectionName) sectionName.textContent = section ? `${timeline.sections.indexOf(section) + 1}/${timeline.sections.length} · ${section.piece.kind}` : '';
  document.querySelectorAll('[data-lesson-segment]').forEach(element => {
    const item = timeline.sections.find(section => section.index === Number(element.dataset.lessonSegment));
    element.style.setProperty('--heard', `${Math.max(0, Math.min(100, (position - item.start) / item.seconds * 100))}%`);
  });
  document.querySelectorAll('[data-lesson-section]').forEach(element => element.setAttribute('aria-current', Number(element.dataset.lessonSection) === run.index ? 'step' : 'false'));
}

function tickLessonProgress() {
  clearTimeout(lessonProgressTimer);
  const run = lessonRun;
  if (!run || currentMode !== 'lesson') return;
  if (!run.done && window.AndroidBridge && window.AndroidBridge.reportSpeechPosition) window.AndroidBridge.reportSpeechPosition(speechSeq);
  updateLessonProgress();
  syncLessonMedia();
  if (!run.done) lessonProgressTimer = setTimeout(tickLessonProgress, 250);
}

function previewLessonSeek(seconds) {
  if (!lessonRun || lessonRun.done || isDrivingMode) return;
  lessonRun.scrubbing = true;
  document.getElementById('lessonElapsed').textContent = lessonTimeText(seconds);
}

function cancelLessonScrub() {
  if (lessonRun) lessonRun.scrubbing = false;
  updateLessonProgress();
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

// 이어 붙인 수업(쉬는 시간 없음)은 교시라고 부르지 않는다.
function lessonLabel(run, resting) {
  const { number, count, rest } = run.trip;
  if (resting) return rest ? `${number}교시 마침` : `${run.lesson.subject} 수업 마침`;
  return rest && (number > 1 || count > 0) ? `${number}교시 ${run.lesson.subject}` : `${run.lesson.subject} 수업`;
}

function lessonDoneLine(run) {
  return run.finished ? '수업을 마쳤어요' : '수업을 멈췄어요. 다음에 이어 가요';
}

function isLessonResting() {
  return !!lessonRun && !lessonRun.done && Lesson.isBreak(lessonRun.pieces[lessonRun.index]);
}

// fromStop이면 지난번 멈춘 곳부터 잇는다.
function startLesson(lessonId, fromStop, recordPoint) {
  const recordLesson = recordPoint && DAIT_LESSONS.find(item => item.id === lessonId);
  const trip = recordLesson ? { ...Lesson.planTrip([recordLesson], lessonMinutes), resume: recordPoint }
    : fromStop ? stopTrip(lessonId) : lessonTripFor(lessonId);
  if (!trip || !trip.lesson || !(trip.resume || Lesson.fits(trip.lesson, trip.minutes))) return;
  disarm();
  tripForDoor = null; // 내릴 때 한마디가 수업을 끊고 지나가지 않게 한다
  clearTimeout(doorTimer);
  currentMode = 'lesson';
  stage = '';
  hasArrived = false;
  micBroken = false;
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

// 교시마다 기록을 따로 남기려고 교시마다 새로 시작한다. 앞 교시를 마쳤으면 그 복습이 앞에 붙는다.
// 멈춘 곳부터 이을 때는 복습 없이 멈춘 조각부터 말하고, 앞에서 들은 조각도 들은 것으로 센다.
function startPeriod(trip) {
  const before = trip.resume ? Lesson.resumeHeard(trip.lesson, trip.resume) : [];
  // 쉬지 않고 이어 붙인 수업은 앞 수업을 방금 들었으므로 그 복습을 붙이지 않는다.
  const records = trip.number > 1 && !trip.rest ? [] : lessonProgress().records;
  const pieces = trip.resume ? Lesson.resumePlan(trip.lesson, trip.resume, trip.minutes)
    : Lesson.plan(trip.lesson, DAIT_LESSONS, trip.minutes, records);
  const run = {
    lesson: trip.lesson, trip, pieces: Lesson.withBreak(pieces, trip), plannedSeconds: Lesson.lessonSeconds([...before, ...pieces]), short: Lesson.isShort([...before, ...pieces]),
    index: 0, heard: before, heardBefore: before.length, answers: [], meters: 0, lastMeters: null, lastMetersAt: 0, startedAt: Date.now(),
    reachedEnd: false, done: false, finished: false, stopped: false, saved: false
  };
  run.playback = new DaitPlayback.LessonSession();
  run.playback.attach(run);
  lessonRun = run;
  setTimeout(() => { if (lessonRun === run) endLesson(); }, TRIP_CAP_MS); // 차 상태가 멈춰도 앞쪽 작업이 끝없이 남지 않게 한다
  heard = '';
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
  if (Lesson.isClosing(piece)) run.reachedEnd = true;
  if (Lesson.isBreak(piece)) {
    saveLesson(run); // 마친 교시는 쉬는 시간이 시작될 때 바로 남긴다
    run.restedFrom = Date.now();
  }
  heard = '';
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

function lessonMainLabel(run) {
  if (isLessonResting()) return run.trip.rest ? '다음 교시 듣기' : '다음 수업 듣기';
  return run.playback.state !== 'playing' ? '이어 듣기' : '일시정지';
}

function nextLessonPiece() {
  const run = lessonRun;
  if (!run || run.done) return;
  clearTimeout(lessonTimer);
  const rested = Lesson.isBreak(run.pieces[run.index]);
  run.index++;
  if (rested) startPeriod(Lesson.nextPeriod(run.trip, tripSeconds(run.trip)));
  else if (run.index >= run.pieces.length) endLesson();
  else playLessonPiece();
}

function onLessonSpeech(info) {
  const run = lessonRun;
  if (!run || run.done || info.event === 'listening') return;
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
  if (info.event === 'heard') {
    if (info.text.length <= 12 && Journey.isQuiet(info.text)) { endLesson(); return; }
    nextLessonPiece();
  } else if (info.event === 'silence') nextLessonPiece(); // 답하지 않아도 재촉하지 않는다
  else if (Lesson.isQuestion(piece)) {
    if (info.event === 'micFailed') micBroken = true;
    lessonWait(piece.wait * 1000, nextLessonPiece, 'thinking'); // 생각할 틈
  } else nextLessonPiece();
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

function endLesson() {
  const run = lessonRun;
  if (!run || run.done) return;
  clearTimeout(lessonTimer);
  run.savedPosition = currentLessonPosition(run);
  stopSpeech();
  run.done = true;
  saveLesson(run);
  heard = '';
  render();
  updateDriveScreen();
  if (hasArrived) closeAfterArrival();
}

// 교시마다 한 번만 수업 기록과 숙제를 남긴다.
function saveLesson(run) {
  if (run.saved) return;
  run.saved = true;
  run.finished = Lesson.countsAsFinished(run);
  const position = run.savedPosition ?? currentLessonPosition(run);
  if (run.heard.length > run.heardBefore || position >= 1) {
    const ymd = toYmd(new Date());
    const progress = Lesson.finishLesson(lessonProgress(), run.lesson, ymd, run.finished, run.meters / 1000, run.answers, run.short);
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
}

// 주행 중에는 고르는 화면을 열지 않고, 가는 길에 들어갈 수업 하나를 버튼 하나로 제안한다.
function lessonOffer(trip) {
  if (school && trip.mode === 'afternoon' && trip.kind !== 'weekend' && !(naviInfo && !trip.known)) return null; // 학교가 없는 사람에게는 등하교를 묻지 않는다
  const minutes = Lesson.minutesFor(remainMinutes());
  return stoppedLesson(minutes) || Lesson.recommend(DAIT_LESSONS, minutes, lessonProgress().records)[0] || null;
}
