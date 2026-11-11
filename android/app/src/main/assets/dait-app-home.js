// 다잇 화면: 위쪽 메뉴, 추천 화면의 수업 카드, 기록 화면.

// DAIT 공식 확정 캘리그래피 로고 (시안 2 커넥티드 리본 + i Dot)
const DAIT_LOGO_PATH = 'M10 26 C12 10, 16 6, 22 6 C28 6, 32 12, 30 20 C28 28, 20 28, 16 28 C26 28, 38 28, 42 20 C44 14, 48 14, 50 18 C52 24, 48 28, 54 28 C60 28, 62 18, 62 14 C62 26, 68 28, 72 28 C76 28, 80 18, 80 10 M74 16 h12';

// 첫 화면의 Dait 필기체 로고.
function getDaitLogoHtml() {
  return `
    <div class="dait-brand-badge" onclick="event.stopPropagation(); playSplashIntro();">
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

function renderPearlNav() {
  const lessonTab = currentMode === 'lessonPick' || currentMode === 'lesson';
  const active = hasActiveLesson() && lessonView ? lessonView : currentMode === 'records' ? 'records' : lessonTab ? 'lessons' : 'now';
  document.getElementById('pearlNav').innerHTML = `
    <button class="pearl-brand" aria-label="다잇 첫 화면" onclick="openPearlTab('now')">${getDaitLogoHtml()}</button>
    <nav>${[['now','추천'],['lessons','수업'],['records','기록']].map(([id,label]) => `<button aria-current="${active === id ? 'page' : 'false'}" onclick="openPearlTab('${id}')">${label}</button>`).join('')}</nav>
    <button class="icon-btn" aria-label="재생목록" onclick="openPlaylist()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M4 6h16M4 11h16M4 16h9M17 15l4 3-4 3z"/></svg></button>
    <button class="icon-btn" aria-label="설정" onclick="openPearlSettings()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor"/><circle cx="15" cy="17" r="2" fill="currentColor"/></svg></button>`;
  appEvents.emit('navigationRendered');
}

function openPearlTab(tab) {
  if (isDrivingMode) return;
  // 듣는 수업이 있으면 멈추지 않고 다른 화면을 둘러본다. 아래쪽 미니 플레이어로 돌아가거나 끝낸다.
  if (hasActiveLesson()) {
    appEvents.emit('closeOverlays');
    lessonView = tab;
    if (tab === 'lessons') openLessons();
    else render();
    return;
  }
  if (currentMode === 'lesson') closeLesson();
  stopSpeech();
  if (tab === 'lessons') { openLessons(); return; }
  if (tab === 'records') { currentMode = 'records'; render(); return; }
  homePick = null; // 추천 탭을 누르면 새로 뽑는다
  goHome();
}

// ========================================================
// 추천 화면
// ========================================================

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
  const records = lessonProgress().records;
  const rules = lessonRules();
  const fitting = Lesson.recommend(DAIT_LESSONS, lessonMinutes, records, rules);
  const heard = new Set(records.map(record => record.lesson)); // 짧은 판으로 들었어도 들은 수업이다
  const fresh = fitting.filter(lesson => !heard.has(lesson.id) && !(rules.series && Lesson.seriesWaiting(DAIT_LESSONS, lesson, records)));
  const due = rules.series ? Lesson.seriesDue(DAIT_LESSONS, records) : null;
  // 시리즈를 켜면 이어 들을 편이 첫 화면 수업이다. 아니면 안 들은 수업 가운데 하나를 고른다.
  const pool = due && fitting.includes(due) ? [due] : fresh.length ? fresh : fitting;
  if (!pool.includes(homePick)) homePick = pool[Math.floor(Math.random() * pool.length)] || null;
  return { reserved: null, lesson: homePick };
}

// 메인 카드 오른쪽의 은은한 그림: 수업 주제마다 크게 한 장(되풀이하지 않음). 400×300 안에 오른쪽으로 몰아 그리고,
// 모양만 쓰며 색은 테마(--lilac)를 따른다.
const SPARKLE = (x, y, r) => `<path transform="translate(${x} ${y})" d="M0 ${-r}C${r * .18} ${-r * .18} ${r * .18} ${-r * .18} ${r} 0C${r * .18} ${r * .18} ${r * .18} ${r * .18} 0 ${r}C${-r * .18} ${r * .18} ${-r * .18} ${r * .18} ${-r} 0C${-r * .18} ${-r * .18} ${-r * .18} ${-r * .18} 0 ${-r}z"/>`;
const FLOWER = (x, y, r) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map(a => `<circle cy="${-r * .62}" r="${r * .5}" transform="rotate(${a})"/>`).join('')}</g>`;
const NOTE = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse rx="13" ry="9.5" transform="rotate(-20)"/><path d="M11 -3V-58" stroke="#000" stroke-width="4" stroke-linecap="round" fill="none"/></g>`;

const LESSON_PATTERNS = {
  // 매미와 소수: 13과 17, 두 주기가 다시 만나는 221
  cicada: '<g font-family="Georgia,serif" font-weight="700"><text x="210" y="200" font-size="150">13</text><text x="300" y="96" font-size="88">17</text><text x="232" y="276" font-size="52">221</text></g><g fill="none" stroke="#000" stroke-width="6" stroke-linecap="round"><path d="M150 230q-40-60 0-130"/><path d="M420 120q40 60 0 130"/></g>',
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
        <button class="card-btn pearl-card-play" aria-label="${escapeHtml(lesson.title)} 듣기" onclick="startLesson('${lesson.id}', false, null, {minutes:${lessonMinutes}})">${lessonTransportIcon('play')}</button>
      </div>
    </div>`
    : '<div class="question-title">이번 길은 짧아서 다음에 들려 드릴게요</div>'}
  </div>`;
}

// 도착 시간을 알 때만 도착을 약속한다. 모르면 수업 길이만 말한다.
function lessonPromise(lesson, minutes) {
  if (remainMinutes() !== null) return '도착할 때쯤 답을 알게 돼요';
  return `약 ${Math.round(Lesson.totalSeconds(Lesson.assemble(lesson, minutes)) / 60)}분이면 답을 알게 돼요`;
}

// ========================================================
// 기록 화면
// ========================================================

let recordTab = 'lessons';

function selectRecordTab(tab) {
  if (isDrivingMode) return;
  recordTab = tab;
  render();
}

const PEARL_BADGES = DaitBadges.definitions.map(d=>[d.id,d.name]);
const BADGE_KEY = 'dait.badges.v1';
function syncBadgeLedger() {
  const previous = readStored(BADGE_KEY);
  const next = DaitBadges.sync(previous, lessonProgress().records, DAIT_LESSONS, typeof lessonQueue !== 'undefined' ? lessonQueue.series : (typeof DAIT_SERIES !== 'undefined' ? DAIT_SERIES : []));
  if (JSON.stringify(previous) !== JSON.stringify(next)) writeStored(BADGE_KEY,next);
  return next;
}
function openBadge(id) {
  if (isDrivingMode) return;
  const definition = DaitBadges.definitions.find(d=>d.id===id);
  if (!definition) return;
  const earned = syncBadgeLedger().awards[id];
  if (!earned) { window.playlistNotice?.(definition.condition); return; }
  window.openDaitPanel(definition.name, `<div class="badge-detail-layout"><div class="badge-detail-art"><img src="badges/${id}.png" alt="${escapeHtml(definition.name)} 배지"></div><div class="badge-detail-copy"><h3>배지의 의미</h3><p>${escapeHtml(definition.meaning)}</p><h3>받게 된 배경</h3><p>${escapeHtml(earned.reason)}</p><h3>받은 날짜</h3><p>${escapeHtml(DaitBadges.dateLabel(earned.day))}</p></div></div>`, 'badge-detail-dialog');
}

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
  if (!lesson) return;
  if (record.finished || !point || !lesson.pieces.some(piece => piece.id === point.from)) {
    lessonMinutes = record.short ? 8 : Lesson.DEFAULT_MINUTES;
    startLesson(lesson.id, false, null, {minutes:lessonMinutes, explicitOnly:true, replay:true}); return;
  }
  const eta = remainMinutes();
  lessonMinutes = eta !== null ? Lesson.minutesFor(eta) : Math.max(Lesson.DEFAULT_MINUTES, Math.ceil(Lesson.totalSeconds(Lesson.resumePlan(lesson, point, 120)) / 60) + 1);
  startLesson(lesson.id, true, point);
}

function updateListScroll(panelId = 'recordPanel', prefix = 'recordScroll') {
  const body = document.getElementById(panelId);
  const up = document.getElementById(prefix + 'Up'), down = document.getElementById(prefix + 'Down');
  if (!body || !up || !down) return;
  const remaining = Math.max(0, body.scrollHeight - body.clientHeight);
  const rail = up.closest?.('.pearl-record-scroll');
  if (rail) rail.hidden = remaining <= 1;
  up.disabled = isDrivingMode || body.scrollTop <= 1;
  down.disabled = isDrivingMode || body.scrollTop >= remaining - 1;
  document.getElementById(prefix + 'Thumb')?.style.setProperty('top', `${remaining ? Math.min(1, body.scrollTop / remaining) * 60 : 0}%`);
}

function scrollList(direction, panelId = 'recordPanel') {
  if (isDrivingMode || ![-1, 1].includes(direction)) return;
  const body = document.getElementById(panelId);
  if (body) body.scrollBy({ top: direction * Math.max(1, body.clientHeight * .8), behavior: 'smooth' });
}

function recordFraction(record, point) {
  if (record.finished) return 1;
  if (Number.isFinite(record.elapsedSeconds) && Number.isFinite(record.totalSeconds) && record.totalSeconds > 0) return Math.max(0,Math.min(.999,record.elapsedSeconds/record.totalSeconds));
  const lesson=DAIT_LESSONS.find(l=>l.id===record.lesson);
  if (!point || !lesson || !lesson.pieces.some(p=>p.id===point.from)) return 0;
  const before=Lesson.totalSeconds(Lesson.resumeHeard(lesson,point));
  const remaining=Lesson.totalSeconds(Lesson.resumePlan(lesson,point,record.short?8:Lesson.DEFAULT_MINUTES));
  const seconds=before+Math.max(0,Number(point.offset)||0);
  return remaining+before ? Math.min(.999,seconds/(before+remaining)) : 0;
}
function recordStateRing(record, point) {
  const value=recordFraction(record,point),complete=record.finished;
  const label=complete?'수업 완료':`수업 진행률 ${Math.round(value*100)}%`;
  return `<span class="pearl-record-state-ring${complete?' is-complete':''}" role="img" aria-label="${label}"><svg viewBox="0 0 48 48" aria-hidden="true"><circle class="record-ring-track" cx="24" cy="24" r="19"/>${complete?'<circle class="record-ring-value" cx="24" cy="24" r="19"/><path class="record-ring-check" d="m16 24 5 5 11-12"/>':`<circle class="record-ring-value" cx="24" cy="24" r="19" pathLength="100" stroke-dasharray="${value*100} 100" transform="rotate(-90 24 24)"/>`}</svg></span>`;
}

function renderRecords(container) {
  const progress = lessonProgress();
  const records = [...progress.records].reverse();
  const badges = syncBadgeLedger();
  container.innerHTML = `<section class="pearl-records">
    <div class="pearl-record-tabs" role="tablist" aria-label="배움 기록 종류">
      <button id="recordLessonsTab" role="tab" aria-controls="recordPanel" aria-selected="${recordTab === 'lessons'}" onclick="selectRecordTab('lessons')">기록</button>
      <button id="recordBadgesTab" role="tab" aria-controls="recordPanel" aria-selected="${recordTab === 'badges'}" onclick="selectRecordTab('badges')">배지</button>
    </div>
    <div class="pearl-record-content"><div class="pearl-record-body" id="recordPanel" onscroll="updateListScroll()" role="tabpanel" aria-labelledby="${recordTab === 'badges' ? 'recordBadgesTab' : 'recordLessonsTab'}">${recordTab === 'badges'
      ? `<div class="pearl-badges">${PEARL_BADGES.map(([id,name]) => `<button type="button" class="pearl-badge ${badges.awards[id] ? 'is-earned' : 'is-locked'}" onclick="openBadge('${id}')" aria-label="${name} 배지 · ${badges.awards[id] ? '획득' : '획득 방법'}"><img src="badges/${id}.png" alt="${name} 배지"><span>${name}</span></button>`).join('')}</div>`
      : `
        ${records.length ? `<div class="pearl-record-grid pearl-record-list">${records.map((record, reverseIndex) => {
          const index = progress.records.length - 1 - reverseIndex;
          const resumable = recordResume(record, index, progress);
          return `<div class="pearl-record-row">${recordStateRing(record,resumable)}<div class="pearl-record-copy"><span class="pearl-record-date">${escapeHtml(recordDateLabel(record.ymd))}</span><strong>${escapeHtml(record.title)}</strong></div><button class="pearl-record-resume" onclick="resumeRecord(${index})" aria-label="${record.finished ? '완료 수업 다시 듣기' : resumable ? '듣던 수업 이어 듣기' : '듣던 수업 처음부터 듣기'}">${LESSON_PLAY_ICON}</button></div>`;
        }).join('')}</div>` : '<div class="pearl-empty">수업을 들으면 여기에 쌓여요</div>'}`}
    </div>
    ${recordTab === 'lessons' && records.length ? `<div class="pearl-record-scroll" aria-label="기록 목록 이동"><button id="recordScrollUp" onclick="scrollList(-1)" aria-label="이전 기록"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button><div class="pearl-record-track" aria-hidden="true"><div id="recordScrollThumb" class="pearl-scroll-thumb"></div></div><button id="recordScrollDown" onclick="scrollList(1)" aria-label="다음 기록"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div>` : ''}
    </div>
  </section>`;
  updateListScroll();
}

window.addEventListener?.('resize', () => updateListScroll());
