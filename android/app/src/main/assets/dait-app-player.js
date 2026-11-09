// 다잇 화면: 수업 고르기 화면과 수업 재생 화면 그리기(진행 막대, 시간, 소리 막대).

// 카드를 누르면 바로 듣는다는 표시
// 카드를 누르면 바로 듣는다는 표시
const LESSON_PLAY_ICON = '<span class="lesson-play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg></span>';

function renderLessonPick(container) {
  const progress = lessonProgress();
  const eta = remainMinutes();
  const choices = eta !== null ? [Lesson.minutesFor(eta)] : [...Lesson.TIME_CHOICES, ...Lesson.LONG_CHOICES];
  if (!choices.includes(lessonMinutes)) lessonMinutes = eta !== null ? choices[0] : Lesson.DEFAULT_MINUTES;
  const trip = Lesson.planTrip(Lesson.tripOrder(DAIT_LESSONS, progress.records), lessonMinutes);
  const periods = trip.lesson ? Lesson.periods(trip) : [];
  const lessons = Lesson.recommend(DAIT_LESSONS, trip.minutes, progress.records);
  const stopped = stoppedLesson(lessonMinutes);
  const scrolled = document.querySelector('.lesson-main')?.scrollTop || 0;
  const km = Math.round(progress.km[Lesson.monthOf(toYmd(new Date()))] || 0);
  const mileage = km ? `이번 달 ${km}km ${Lesson.mileageLine(km)}`.trim() : '';
  container.innerHTML = `
    <div class="dialogue-wrap pearl-picker">
      <div class="dialogue-top">
        <button class="back-btn" onclick="openPearlTab('now')">처음으로</button>
        <span class="top-label">수업</span>
      </div>
      <div class="pearl-records">
      <div class="playlist-list-toolbar">${eta !== null ? '' : `<div class="pearl-record-tabs lesson-time-tabs" role="tablist" aria-label="수업 시간">${[8,15,20].map(minutes => `<button role="tab" aria-controls="lessonList" aria-selected="${minutes === lessonMinutes}" onclick="pickLessonTime(${minutes})">${minutes}분 수업</button>`).join('')}</div>`}<button class="playlist-open-btn" onclick="openPlaylist()">재생목록${lessonQueue.items.length ? ` · ${lessonQueue.items.length}` : ''}</button></div>
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
            ${lessonOptionsButton(stopped, true)}
          </div>` : ''}
          ${lessons.filter(lesson => lesson !== stopped).map(lesson => `<div class="lesson-row">
            <button class="choice-chip" onclick="startLesson('${lesson.id}')">
              ${LESSON_PLAY_ICON}
              <span class="lesson-text">
                <span class="lesson-title">${escapeHtml(lesson.question || lesson.title)}</span>
                <span class="lesson-meta">${escapeHtml(lesson.subject)}${playlistHint(lesson.id) ? ` · ${escapeHtml(playlistHint(lesson.id))}` : ''} · 약 ${Math.round(Lesson.totalSeconds(Lesson.assemble(lesson, trip.minutes)) / 60)}분</span>
              </span>
            </button>
            ${lessonOptionsButton(lesson, false)}
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

// One tap adds to the end; the toast can move that exact entry to Play Next.
function lessonOptionsButton(lesson, fromStop) {
  return `<button class="lesson-options-btn" data-queue-add="${lesson.id}" data-from-stop="${!!fromStop}" aria-label="${escapeHtml(lesson.title)} 재생목록에 추가" onclick="quickAddLesson('${lesson.id}', ${!!fromStop})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8 12h8M12 8v8"/></svg></button>`;
}

function renderLesson(container) {
  const run = lessonRun;
  if (!run.done && !isLessonResting()) { renderLessonPlayer(container, run); return; }
  const piece = run.pieces[run.index];
  const resting = !run.done && Lesson.isBreak(piece);
  const title = run.done ? lessonDoneLine(run) : run.stopped ? '수업을 잠시 멈췄어요' : piece.line;
  const back = '<button class="primary-btn secondary" onclick="prevLessonPiece()">이전</button>';
  const buttons = run.done ? `${!isDrivingMode && lessonQueue.next(run.lesson.id) ? '<button class="primary-btn secondary" onclick="playNextQueuedLesson()">다음 수업 듣기</button>' : ''}<button class="primary-btn" onclick="goHome()">마치기</button>`
    : `${resting ? '' : back}<button class="primary-btn" onclick="lessonMainAction()">${lessonMainLabel(run)}</button>`;
  container.innerHTML = `
    <div class="dialogue-wrap">
      <div class="dialogue-top">
        <button class="back-btn" onclick="openPearlTab('now')">처음으로</button>
        ${!isDrivingMode && !run.done && !resting ? '<button class="back-btn" onclick="restartLesson()">처음부터 듣기</button>' : ''}
        <span class="top-label">${escapeHtml(lessonLabel(run, resting))}</span>
      </div>
      <div class="dialogue-card">
        <div class="card-center">
          <div class="main-question">${escapeHtml(title)}</div>
          ${run.done || resting ? '' : run.paused ? '<div class="card-sub">잠시 멈췄어요</div>' : piece.voiced ? '' : '<div class="card-sub">음원 준비 중</div>'}
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
      <p class="pearl-player-meta">${escapeHtml(lessonLabel(run, false))}${playlistHint(run.lesson.id) ? ` · ${escapeHtml(playlistHint(run.lesson.id))}` : ''}${prefs.rate !== 1 ? ` · ${prefs.rate.toFixed(1)}배속` : ''}</p>
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

function updateLessonProgress() {
  const run = lessonRun;
  if (!run || currentMode !== 'lesson') return;
  updateLessonDock();
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

// 이어 붙인 수업(쉬는 시간 없음)은 교시라고 부르지 않는다.
// 미니 플레이어: 수업을 들으며 다른 화면을 둘러볼 때 아래에 보인다. 주행 중에는 숨긴다.
function renderLessonDock() {
  const dock = document.getElementById('lessonDock');
  if (!dock) return;
  const visible = hasActiveLesson() && !!lessonView && !isDrivingMode;
  dock.hidden = !visible;
  if (!visible) { dock.innerHTML = ''; return; }
  const run = lessonRun, playing = !isLessonResting() && run.playback.state === 'playing';
  dock.innerHTML = `<button class="lesson-dock-open" onclick="returnToLesson()" aria-label="${escapeHtml(run.lesson.title)} 재생 화면으로 돌아가기"><span class="lesson-dock-copy"><strong>${escapeHtml(run.lesson.title)}</strong><span id="miniLessonRemaining"></span></span></button><button class="lesson-dock-toggle" onclick="lessonMainAction()" aria-label="${lessonMainLabel(run)}">${lessonTransportIcon(playing ? 'pause' : 'play')}</button><button class="lesson-dock-stop" onclick="stopLessonFromDock()" aria-label="수업 끝내기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>`;
  updateLessonDock();
}

function updateLessonDock() {
  if (!hasActiveLesson() || !lessonView) return;
  const label = document.getElementById('miniLessonRemaining');
  if (!label) return;
  const run = lessonRun;
  const state = isLessonResting() ? '쉬는 시간' : run.playback.interrupted ? '다른 소리가 끝나면 이어 들어요' : run.paused ? '잠시 멈췄어요' : '듣는 중';
  const seconds = arrivalPlanner.remaining(run.pieces, run.index, currentLessonPosition(run), lessonPlaybackPrefs.rate);
  label.textContent = `${state} · ${lessonTimeText(seconds)} 남음`;
}

function lessonLabel(run, resting) {
  const { number, count, rest } = run.trip;
  if (resting) return rest ? `${number}교시 마침` : `${run.lesson.subject} 수업 마침`;
  return rest && (number > 1 || count > 0) ? `${number}교시 ${run.lesson.subject}` : `${run.lesson.subject} 수업`;
}

function lessonDoneLine(run) {
  return run.finished ? '수업을 마쳤어요' : '수업을 멈췄어요. 다음에 이어 가요';
}

function lessonMainLabel(run) {
  if (isLessonResting()) return run.trip.rest ? '다음 교시 듣기' : '다음 수업 듣기';
  return run.playback.state !== 'playing' ? '이어 듣기' : '일시정지';
}
