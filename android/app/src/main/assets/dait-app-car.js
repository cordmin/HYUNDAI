// 다잇 화면: Gleo 음성 비서, 학교 정보, 가 볼 만한 곳, 차 미디어 버튼·주행·내비·위치 연결. dait-app-lesson.js 다음에 불러온다.
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
  const asking = pendingStart;
  startLesson(lesson.id);
  if (lessonRun && lessonRun !== before && !lessonRun.done) gleoReply(fn, 'success', `Started the ${lesson.subject} lesson.`, 'silent');
  else if (pendingStart && pendingStart !== asking) gleoReply(fn, 'asking', 'Please allow the microphone on the DAIT screen first.'); // 답 남기기를 켰는데 마이크 허락을 묻는 중
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
// 학교 정보 (나이스 교육정보 개방 포털)
// ========================================================
const NEIS_URL = 'https://relay-khaki-omega.vercel.app/neis/';
const SCHOOL_KEY = 'dait.school';
const DAYS_KEY = 'dait.schoolDays';
const DAYS_AHEAD = 7;
const EVENTS_KEY = 'dait.schoolEvents';
const EVENT_DAYS_AHEAD = 45;
const GRADE_FIELDS = ['ONE', 'TW', 'THREE', 'FR', 'FIV', 'SIX'];
const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

let school = null; // 학교 설정 제거: 기존 저장값을 사용하지 않는다.
let schoolDays = {};
let schoolEvents = {};
let neisSeq = 0;
let homeStale = false;
const neisWaiting = {};

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

function fromYmd(ymd) {
  return new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
}

function upcomingDates() {
  const start = new Date();
  return Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

function dayLabel(ymd) {
  const dates = upcomingDates();
  if (ymd === toYmd(dates[0])) return '오늘';
  if (ymd === toYmd(dates[1])) return '내일';
  return WEEKDAYS[fromYmd(ymd).getDay()];
}

// 인증키는 중계 서버에만 있다. 앱에서는 Kotlin이 대신 받고, 브라우저 미리보기는 중계 서버에 직접 묻는다.
window.onNeisResult = function(requestId, body) {
  const resolve = neisWaiting[requestId];
  delete neisWaiting[requestId];
  if (resolve) resolve(body);
};

function neisBody(service, query) {
  if (window.AndroidBridge) {
    return new Promise(resolve => {
      const requestId = ++neisSeq;
      neisWaiting[requestId] = resolve;
      window.AndroidBridge.neisGet(requestId, service, query);
    });
  }
  return fetch(`${NEIS_URL}${service}?${query}`).then(response => response.text());
}

async function neisRows(service, params) {
  const query = new URLSearchParams({ Type: 'json', pIndex: '1', pSize: '100', ...params }).toString();
  const data = JSON.parse(await neisBody(service, query));
  if (data.RESULT) {
    if (data.RESULT.CODE === 'INFO-200') return [];
    throw new Error(data.RESULT.CODE);
  }
  return data[service][1].row;
}

function mainDish(dishes) {
  const items = dishes.split(/<br\s*\/?>/i)
    .map(item => item.replace(/\([^)]*\)/g, '').replace(/[*]/g, '').replace(/[a-zA-Z]+\s*$/, '').trim())
    .filter(Boolean);
  return items.find(item => !/(밥|국|탕|찌개|김치|깍두기|우유|주스)$/.test(item)) || items[0] || '';
}

// 시간표 창구는 학교급마다 다르다.
const SCHOOL_KINDS = {
  '초등학교': { service: 'elsTimetable', grades: [1, 2, 3, 4, 5, 6] },
  '중학교': { service: 'misTimetable', grades: [1, 2, 3] },
  '고등학교': { service: 'hisTimetable', grades: [1, 2, 3] }
};

function timetableService(target) {
  return (SCHOOL_KINDS[target.kind] || SCHOOL_KINDS['초등학교']).service;
}

// 학사일정에서 우리 학년 일정만 날짜별로 모은다. 토요휴업일은 뺀다.
function eventsByDay(rows, grade) {
  const days = {};
  rows.forEach(row => {
    if (row.EVENT_NM.includes('토요휴업')) return;
    const marks = GRADE_FIELDS.map(field => row[`${field}_GRADE_EVENT_YN`]);
    if (marks.includes('Y') && marks[Number(grade) - 1] !== 'Y') return;
    (days[row.AA_YMD] = days[row.AA_YMD] || []).push({ name: row.EVENT_NM, off: row.SBTR_DD_SC_NM !== '해당없음' });
  });
  return days;
}

async function refreshSchoolEvents(target) {
  const today = toYmd(new Date());
  try {
    const rows = await neisRows('SchoolSchedule', {
      ATPT_OFCDC_SC_CODE: target.office, SD_SCHUL_CODE: target.code, AA_FROM_YMD: today, AA_TO_YMD: toYmd(new Date(fromYmd(today).getTime() + EVENT_DAYS_AHEAD * 86400000))
    });
    if (school !== target) return;
    schoolEvents = eventsByDay(rows, target.grade);
    writeStored(EVENTS_KEY, schoolEvents);
    if (isIntroPlaying) homeStale = true;
    else if (!currentMode) render();
  } catch (e) {
    console.log('School events error:', e);
  }
}

// 시간표는 하루씩 받는다.
async function refreshSchoolDays() {
  if (!school) return;
  const target = school;
  refreshSchoolEvents(target);
  const dates = upcomingDates();
  const ymds = dates.map(toYmd);
  const base = { ATPT_OFCDC_SC_CODE: target.office, SD_SCHUL_CODE: target.code };
  try {
    const schoolDates = dates.filter(date => date.getDay() !== 0 && date.getDay() !== 6);
    const [timetables, meals] = await Promise.all([
      Promise.all(schoolDates.map(date => neisRows(timetableService(target), {
        ...base, GRADE: target.grade, CLASS_NM: target.classNm, ALL_TI_YMD: toYmd(date)
      }))),
      neisRows('mealServiceDietInfo', {
        ...base, MMEAL_SC_CODE: '2', MLSV_FROM_YMD: ymds[0], MLSV_TO_YMD: ymds[ymds.length - 1]
      })
    ]);
    const days = {};
    ymds.forEach(ymd => { days[ymd] = { subjects: [], meal: '' }; });
    timetables.flat().sort((a, b) => Number(a.PERIO) - Number(b.PERIO)).forEach(row => {
      const day = days[row.ALL_TI_YMD];
      if (day && !day.subjects.includes(row.ITRT_CNTNT)) day.subjects.push(row.ITRT_CNTNT);
    });
    meals.forEach(row => {
      if (days[row.MLSV_YMD]) days[row.MLSV_YMD].meal = mainDish(row.DDISH_NM);
    });
    if (school !== target) return;
    schoolDays = days;
    lastRefreshDay = ymds[0];
    writeStored(DAYS_KEY, days);
    if (isIntroPlaying) homeStale = true;
    else if (!currentMode) render();
  } catch (e) {
    console.log('School data error:', e);
  }
}

// 시험 날은 시간표가 없을 수 있으므로 점심이나 학사일정이 있어도 수업일로 본다.
function isClassDay(ymd) {
  if (!Journey.isSchoolDay(ymd, schoolEvents)) return false;
  const day = schoolDays[ymd];
  return !!(day && (day.subjects.length > 0 || day.meal)) || !!schoolEvents[ymd];
}

// 앱을 다시 볼 때 날짜가 바뀌었으면 자료를 새로 받고 첫 화면도 지금 시각으로 다시 그린다.
window.onAppResumed = function() {
  syncLocation();
  if (school && lastRefreshDay !== toYmd(new Date())) refreshSchoolDays();
  refreshHomeIfIdle();
};

function schoolPlan() {
  const today = toYmd(new Date());
  const ymd = Object.keys(schoolDays).sort()
    .find(key => key >= today && isClassDay(key));
  if (!school || !ymd) return null;
  const day = schoolDays[ymd];
  return { ...day, ymd, weekday: fromYmd(ymd).getDay(), label: dayLabel(ymd), hasPe: day.subjects.some(subject => subject.replace(/[^가-힣]/g, '').startsWith('체육')) };
}

function schoolLevel() {
  return school ? school.kind.charAt(0) : '초';
}

// 지금 여정에 맞는 교사 규칙. 하교는 오늘, 등교는 다가오는 수업일을 기준으로 본다.
function ruleFor(mode) {
  if (!school) return null;
  const plan = schoolPlan();
  const ymd = mode === 'afternoon' || !plan ? toYmd(new Date()) : plan.ymd;
  return Journey.pickRule(DAIT_RULES.rules, { mode, level: schoolLevel(), ymd, events: schoolEvents });
}

function subjectChoices() {
  const plan = schoolPlan();
  if (!plan || plan.subjects.length === 0) return null;
  const preferred = ['체육', '과학', '국어'].filter(subject => plan.subjects.includes(subject));
  return [...new Set([...preferred, ...plan.subjects])].slice(0, 3);
}

// 지금 여정을 한 곳에서 정한다. 첫 화면·칸·대화 시작이 모두 이것을 따른다.
// 우선순위: 내비 목적지(학교/집) → 주말·방학은 다음 수업일 준비 → 다니는 길 기억 → 수업일의 시간대(오전 등교·오후 하교)
function currentTrip() {
  const now = new Date();
  const minutes = naviRemainMinutes();
  const mins = minutes === null ? null : Math.max(1, Math.round(minutes));
  if (naviInfo && naviInfo.name) {
    const fig = { figure: mins === null ? '' : String(mins), figureUnit: mins === null ? '' : '분' };
    if (school && placeMatches(naviInfo, school)) return { mode: 'morning', kind: 'school', known: true, where: `${school.name}까지`, minutes: mins, when: '', ...fig };
    if (homePlace && placeMatches(naviInfo, homePlace)) return { mode: 'afternoon', kind: 'home', known: true, where: '집까지', minutes: mins, when: '', ...fig };
  }
  // 여기부터는 목적지가 학교도 집도 아니거나 없다. 남은 시간은 쓰지 않는다
  const unknownMins = null;
  const todayYmd = toYmd(now);
  const todayHasClass = isClassDay(todayYmd);
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  if (school && schoolDays[todayYmd] && !todayHasClass) {
    const plan = schoolPlan();
    const label = plan ? plan.label : '다음 수업일';
    return { mode: 'morning', kind: 'weekend', known: false, where: '', minutes: unknownMins, when: `${label} 준비`, figure: label.replace('요일', ''), figureUnit: label.endsWith('요일') ? '요일' : '' };
  }
  if ((!school || !schoolDays[todayYmd]) && isWeekend) return { mode: 'morning', kind: 'weekend', known: false, where: '', minutes: unknownMins, when: '다음 수업일 준비', figure: '월', figureUnit: '요일' };
  const guess = tripGuess(now);
  const afternoon = guess ? guess === 'afternoon' : now.getHours() >= 12;
  const hhmm = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  return { mode: afternoon ? 'afternoon' : 'morning', kind: afternoon ? 'afternoon' : 'morning', known: false, where: '', minutes: unknownMins, when: afternoon ? '오늘 오후' : '오늘 아침', figure: hhmm, figureUnit: '' };
}

// 교사 규칙이 있는 날은 첫 화면의 말도 규칙을 따른다.
// ========================================================
// 가 볼 만한 곳 (공공데이터포털 한국관광공사 국문 관광정보)
// 브라우저 미리보기에서는 예시를 보여 준다.
// ========================================================
const PLACE_TOPICS = ['과학관', '박물관', '유적지', '체험관'];
const PLACE_LIMIT = 8;
const PLACE_TYPES = ['12', '14', '28']; // 관광지, 문화시설, 레포츠. 숙박·식당·쇼핑은 뺀다.
// 관광공사 자료의 시도 코드(2026-11-03 실제 응답으로 확인). 전남과 광주는 전남광주통합특별시(12)로 합쳐졌고, 세종은 36110이다.
// 학교 주소가 옛 이름(전라남도, 광주광역시)이어도 같은 코드로 찾는다.
const REGIONS = [
  ['서울', '11', '서울'], ['부산', '26', '부산'], ['대구', '27', '대구'], ['인천', '28', '인천'],
  ['전남광주', '12', '전남광주'], ['광주', '12', '전남광주'], ['대전', '30', '대전'], ['울산', '31', '울산'], ['세종', '36110', '세종'],
  ['경기', '41', '경기'], ['강원', '51', '강원'], ['충북', '43', '충북'], ['충청북', '43', '충북'],
  ['충남', '44', '충남'], ['충청남', '44', '충남'], ['전북', '52', '전북'], ['전라북', '52', '전북'],
  ['전남', '12', '전남광주'], ['전라남', '12', '전남광주'], ['경북', '47', '경북'], ['경상북', '47', '경북'],
  ['경남', '48', '경남'], ['경상남', '48', '경남'], ['제주', '50', '제주']
];
const SAMPLE_PLACES = {
  '과학관': [['국립과천과학관', '경기도 과천시'], ['국립중앙과학관', '대전광역시 유성구']],
  '박물관': [['국립중앙박물관', '서울특별시 용산구'], ['국립경주박물관', '경상북도 경주시']],
  '유적지': [['경주 불국사', '경상북도 경주시'], ['수원 화성', '경기도 수원시']],
  '체험관': [['한국잡월드', '경기도 성남시'], ['국립어린이과학관', '서울특별시 종로구']]
};

let places = {};
let tourSeq = 0;
const tourWaiting = {};

window.onTourResult = function(requestId, body) {
  const resolve = tourWaiting[requestId];
  delete tourWaiting[requestId];
  if (resolve) resolve(body);
};

function schoolRegion() {
  const address = school ? school.address : '';
  const found = REGIONS.find(row => address.startsWith(row[0]));
  return found ? { code: found[1], name: found[2] } : null;
}

function tourBody(query) {
  return new Promise(resolve => {
    const requestId = ++tourSeq;
    tourWaiting[requestId] = resolve;
    window.AndroidBridge.tourGet(requestId, 'searchKeyword2', query);
  });
}

function tourRows(data) {
  const header = data.response.header;
  if (header.resultCode !== '0000') throw new Error(header.resultCode);
  const items = data.response.body.items;
  const rows = items && items.item ? [].concat(items.item) : [];
  return rows
    .filter(row => PLACE_TYPES.includes(String(row.contenttypeid)))
    .map(row => ({ name: row.title, address: row.addr1 || '', lat: Number(row.mapy), lng: Number(row.mapx) })); // 관광공사 좌표: mapy가 위도, mapx가 경도
}

// 차의 지금 위치(다니는 길 기억을 켠 경우), 없으면 학교 위치에서 가까운 순으로 줄 세우고 직선거리를 붙인다.
// 둘 다 모르면 받은 차례(이름순) 그대로 둔다. 실제 길로 걸리는 시간은 길 안내를 누르면 내비가 보여 준다.
function nearestFirst(rows) {
  const school = knownSpots().school;
  const origin = carSpot || school;
  if (!origin) return { rows, from: '' };
  const measured = rows.map(row => ({ ...row, km: row.lat && row.lng ? Journey.distanceM(origin, row) / 1000 : null }));
  measured.sort((a, b) => (a.km === null) - (b.km === null) || a.km - b.km);
  return { rows: measured, from: carSpot ? '지금 위치에서 가까운 순' : '학교에서 가까운 순' };
}

function kmText(km) {
  return km < 10 ? `${km.toFixed(1)}km` : `${Math.round(km)}km`;
}

async function searchPlaces(topic) {
  places = { topic, rows: [], sample: false, message: '찾는 중이에요' };
  render();
  if (!window.AndroidBridge) {
    places = { topic, rows: SAMPLE_PLACES[topic].map(row => ({ name: row[0], address: row[1] })), sample: true, message: '' };
    render();
    return;
  }
  const region = schoolRegion();
  const query = new URLSearchParams({
    numOfRows: '100', pageNo: '1', MobileOS: 'AND', MobileApp: 'DAIT', _type: 'json', arrange: 'A', keyword: topic,
    ...(region ? { lDongRegnCd: region.code } : {})
  }).toString();
  let next;
  try {
    const near = nearestFirst(tourRows(JSON.parse(await tourBody(query))));
    next = { topic, rows: near.rows.slice(0, PLACE_LIMIT), near: near.from, sample: false, message: near.rows.length > 0 ? '' : '찾는 곳이 없어요' };
  } catch (e) {
    next = { topic, rows: [], sample: false, message: '지금은 찾을 수 없어요' };
  }
  // 기다리는 사이 다른 주제를 골랐거나 화면을 나갔으면 이 결과는 버린다.
  if (currentMode !== 'places' || places.topic !== topic) return;
  places = next;
  render();
}

// 좌표가 있고 차의 내비에 닿을 수 있을 때만 길 안내를 건다. 브라우저 미리보기의 예시 장소는 이름과 주소만 보여 준다.
function canRoute(row) {
  return !!window.AndroidBridge && Number.isFinite(row.lat) && Number.isFinite(row.lng) && row.lat !== 0 && row.lng !== 0;
}

// 고른 곳으로 Pleos 내비 길 안내를 시작하고 첫 화면으로 돌아간다. 안내가 시작되면 첫 화면이 도착까지 남은 시간에 맞춘 수업을 보여 준다.
function routeToPlace(index) {
  const row = places.rows[index];
  if (!row || !canRoute(row) || isDrivingMode) return;
  window.AndroidBridge.startRoute(JSON.stringify({ name: row.name, address: row.address, lat: row.lat, lng: row.lng }));
  goHome();
}

function openPlaces() {
  stopSpeech();
  currentMode = 'places';
  searchPlaces(PLACE_TOPICS[0]);
}

function renderPlaces(container) {
  const region = schoolRegion();
  container.innerHTML = `
    <div class="dialogue-wrap">
      <div class="dialogue-top">
        <button class="back-btn" onclick="goHome()">처음으로</button>
        <span class="top-label">${region ? `${escapeHtml(region.name)}에서 ` : ''}가 볼 만한 곳</span>
        <span class="top-label">${places.rows.length > 0 ? (places.sample ? '예시' : '자료: 한국관광공사') : ''}</span>
      </div>
      <div class="places-body">
        <div class="settings-list">
          ${PLACE_TOPICS.map(topic => `<button class="choice-chip" onclick="searchPlaces('${topic}')"${topic === places.topic ? ' aria-pressed="true"' : ''}>${topic}</button>`).join('')}
        </div>
        ${places.message ? `<div class="settings-message">${escapeHtml(places.message)}</div>` : ''}
        ${places.near && places.rows.length ? `<div class="card-sub">${escapeHtml(places.near)}</div>` : ''}
        <div class="place-list">
          ${places.rows.map((row, i) => canRoute(row)
            ? `<button class="place-row place-go" aria-label="${escapeHtml(row.name)} 여기로 안내" onclick="routeToPlace(${i})"><span class="place-text"><span class="place-name">${escapeHtml(row.name)}</span><span class="place-address">${typeof row.km === 'number' ? `약 ${kmText(row.km)} · ` : ''}${escapeHtml(row.address)}</span></span><span class="place-action" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 11 22 2l-9 19-2-8z"/></svg></span></button>`
            : `<div class="place-row"><span class="place-name">${escapeHtml(row.name)}</span><span class="place-address">${escapeHtml(row.address)}</span></div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function isParkedScreen() {
  return currentMode === 'settings' || currentMode === 'places' || currentMode === 'lessonPick' || currentMode === 'records';
}

function toggleQuestions() {
  writeStored(QUESTIONS_KEY, readStored(QUESTIONS_KEY) === false);
  render();
}

function toggleVoiceAnswers() {
  writeStored(VOICE_KEY, readStored(VOICE_KEY) === false);
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
  trackDoorTrip(isDriving);
  if (isDriving && (isParkedScreen() || (departing && currentMode === 'lesson' && isDialogueDone()))) goHome();
  trackTrip(isDriving);
  if (!isDriving && isLessonResting() && lessonRun.trip.rest) endLesson(); // 쉬는 시간에 주차하면 내린 것으로 보고 수업을 닫는다
  if (departing && armed) startArmed();
  else if (departing && speechPhase === 'idle') advanceWithoutMic();
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

// 차가 보내는 목적지와 남은 시간. 앱의 NaviBridge가 부른다.
// 실제 값이 오면 시연 조작(8분 전·4분 전·2분 전)보다 우선한다.
let naviInfo = null;

window.onNaviUpdate = function(jsonText) {
  let info;
  try { info = JSON.parse(jsonText); } catch (e) { return; }
  if (info.event === 'places') learnFromNavi(info.places || []);
  else if (info.event === 'routeEnded' && performance.now() - routeStartedAt < ROUTE_SWAP_MS) return; // 경로를 바꾸면 옛 경로의 종료 신호가 뒤따른다
  else if (info.event === 'destination' || info.event === 'routeStarted') {
    if (info.event === 'routeStarted') routeStartedAt = performance.now();
    // 길 안내가 없을 때는 이름 없이 0으로 오므로 도착 직전과 구분한다.
    if (!info.name && !(Number(info.remainTime) > 0)) { const had = !!naviInfo; naviInfo = null; if (had) refreshHomeIfIdle(); return; }
    const changed = !naviInfo || naviInfo.name !== (info.name || '') || (currentMode === 'settings' && !document.querySelector('[onclick="saveHomeFromNavi()"]') && canSaveHomeFor(info));
    naviInfo = { name: info.name || '', address: info.address || '', remainTime: Number(info.remainTime), remainDistance: Number(info.remainDistance), at: Date.now() };
    noteNaviPlace();
    learnFromNavi([info]);
    applyNaviEta();
    if (changed) refreshHomeIfIdle();
  } else if (info.event === 'routeCancelled' || info.event === 'routeEnded' || info.event === 'arrived' || info.event === 'unavailable') {
    // 내비에 따라 도착 신호 없이 안내 종료만 올 수 있으므로, 거의 다 온 때의 종료도 도착으로 본다.
    const reached = info.event === 'arrived' || (info.event === 'routeEnded' && Journey.tierFor(naviRemainMinutes()) === 'arrive');
    if (reached) noteTripArrival();
    naviPlace = '';
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
  if (!currentMode || currentMode === 'settings') render();
}
// 길 안내 중 10초마다 같은 목적지가 와도 설정 화면의 '집으로' 버튼이 늦지 않게, 목적지 이름이 생기면 다시 그린다

// ========================================================
// 목적지로 등교·하교 제안 (기획안 ②: 목적지가 학교면 등교, 집이면 하교)
// 자동으로 대화를 시작하지는 않는다. 안전 원칙: 운전자 조작 없이 소리를 내지 않는다.
// ========================================================
const HOME_KEY = 'dait.home';
let homePlace = null;
let routePlaces = {}; // 내비에서 알아 둔 학교와 집의 좌표

function normalizePlace(text) {
  return String(text || '').replace(/\s+/g, '').replace(/[()·,.]/g, '');
}

// 도로명 주소에서 '산정로 171'처럼 도로 이름과 번지만 뽑는다.
function roadPart(address) {
  const m = String(address || '').match(/([가-힣A-Za-z0-9]+(?:로|길|대로))\s*(\d+(?:-\d+)?)/);
  return m ? m[1] + m[2] : '';
}

function placeMatches(dest, place) {
  if (!dest || !place) return false;
  const destName = normalizePlace(dest.name), placeName = normalizePlace(place.name);
  // '집'처럼 짧은 이름은 '피자집'에도 들어가므로 네 글자가 넘을 때만 일부 일치를 인정한다.
  const longEnough = Math.min(destName.length, placeName.length) >= 4;
  if (destName && placeName && (destName === placeName || (longEnough && (destName.includes(placeName) || placeName.includes(destName))))) return true;
  const destRoad = roadPart(dest.address), placeRoad = roadPart(place.address);
  return !!(destRoad && placeRoad && destRoad === placeRoad);
}

// 좌표를 배우면 실제 길 안내로 이어지므로, 이름이 같고 주소도 어긋나지 않을 때만 같은 곳으로 본다.
function isSamePlace(found, target) {
  const foundRoad = roadPart(found.address), targetRoad = roadPart(target.address);
  if (foundRoad && targetRoad) return foundRoad === targetRoad;
  if (normalizePlace(found.name) !== normalizePlace(target.name)) return false;
  if (!found.address || !target.address) return true;
  return found.address.split(/\s+/).some(word => word.length >= 2 && target.address.includes(word));
}

function canSaveHome() { return canSaveHomeFor(naviInfo); }
function canSaveHomeFor(dest) {
  return !!(dest && dest.name) && !(school && placeMatches(dest, school)) && !(homePlace && placeMatches(dest, homePlace));
}

function saveHomeFromNavi() {
  if (!canSaveHome()) return;
  delete routePlaces.home;
  writeStored(ROUTE_KEY, routePlaces);
  forgetSpot('home');
  homePlace = { name: naviInfo.name, address: naviInfo.address || '' };
  writeStored(HOME_KEY, homePlace);
  writeStored(HOME_CLEARED_KEY, false);
  goHome();
}

function clearHome() {
  homePlace = null;
  writeStored(HOME_CLEARED_KEY, true);
  delete routePlaces.home;
  writeStored(ROUTE_KEY, routePlaces);
  forgetSpot('home');
  try { localStorage.removeItem(HOME_KEY); } catch (e) { console.log('Storage error:', e); }
  render();
}

// ========================================================
// 다니는 길 기억 (보호자가 켰을 때만)
// 어디서 어디로 갔는지의 구분만 기록해 등교·하교 판단을 돕는다. 좌표와 지나온 길은 남기지 않는다.
// 판단이 맞아도 첫 화면과 주행 화면의 제안만 바뀌고, 말을 먼저 걸지 않는다.
// 시동을 끄면 타이머가 사라지므로 여정은 다음 출발 때 마감한다.
// ========================================================
const TRIP_MEMORY_KEY = 'dait.tripMemory';
const TRIPS_KEY = 'dait.trips';
const TRIP_OPEN_KEY = 'dait.tripOpen';
const SPOTS_KEY = 'dait.tripSpots';
const STOP_GAP_MS = 3 * 60 * 1000; // 신호 대기나 잠깐 정차는 같은 여정으로 본다
const FIX_FRESH_MS = 60 * 1000; // 내비가 앱을 덮으면 위치가 끊기므로 이보다 오래된 위치는 믿지 않는다
const TRIP_KEEP_DAYS = 60;
let trips = [];
let tripOpen = null;
let tripSpots = {}; // 내비에 없는 학교와 집을 보호자가 지금 위치로 정한 좌표
let carSpot = null; // 지금 좌표. 저장하지 않는다
let carPlace = ''; // 'home' | 'school' | 'other' | ''
let carFixAt = 0;
let naviPlace = ''; // 내비 목적지가 학교나 집이면 그 구분. 도착 신호보다 먼저 목적지가 지워져도 남는다
if (tripOpen && !tripOpen.parkedAt) tripOpen.parkedAt = 1; // 달리던 중 앱이 꺼졌으면 다음 출발 때 마감한다

function tripMemoryOn() {
  return false; // 다니는 길 기록 기능 제거
}

function locationState() {
  return window.AndroidBridge ? window.AndroidBridge.locationState() : 'none';
}

function syncLocation() {
  if (window.AndroidBridge) window.AndroidBridge.setLocationOn(tripMemoryOn());
}

function knownSpots() {
  return { school: tripSpots.school || routePlaces.school, home: tripSpots.home || routePlaces.home };
}

function minuteOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function saveTripOpen() {
  writeStored(TRIP_OPEN_KEY, tripOpen);
}

function freshPlace() {
  return Date.now() - carFixAt < FIX_FRESH_MS ? carPlace : '';
}

window.onCarLocation = function(lat, lng) {
  if (!tripMemoryOn()) return;
  carSpot = { lat, lng };
  carFixAt = Date.now();
  updateCarPlace();
};

function updateCarPlace() {
  const place = Journey.placeLabel(carSpot, knownSpots());
  const changed = place !== carPlace;
  carPlace = place;
  if (tripOpen && freshPlace()) {
    // 출발 직후에만 출발지를 채운다. 달리던 중에 처음 받은 위치는 출발지가 아니다.
    const from = tripOpen.from || (Date.now() - tripOpen.startedAt < FIX_FRESH_MS ? place : '');
    if (from !== tripOpen.from || place !== tripOpen.last) {
      tripOpen.from = from;
      tripOpen.last = place;
      saveTripOpen();
    }
  }
  if (!changed) return;
  refreshHomeIfIdle();
  updateDriveScreen();
}

function startTrip(chosen) {
  const now = new Date();
  const place = freshPlace();
  tripOpen = { ymd: toYmd(now), day: now.getDay(), min: minuteOfDay(now), end: null, from: place, last: place, door: false, chosen, parkedAt: 0, startedAt: Date.now() };
  saveTripOpen();
}

function closeTrip() {
  if (!tripOpen) return;
  const record = Journey.finishTrip(tripOpen, trips[trips.length - 1]);
  const oldest = toYmd(new Date(Date.now() - TRIP_KEEP_DAYS * 24 * 60 * 60 * 1000));
  trips = [...trips, ...(record ? [record] : [])].filter(trip => trip.ymd >= oldest);
  writeStored(TRIPS_KEY, trips);
  tripOpen = null;
  saveTripOpen();
}

function trackTrip(isDriving) {
  if (!tripMemoryOn()) return;
  if (!isDriving) {
    if (tripOpen && !tripOpen.parkedAt) {
      tripOpen.parkedAt = Date.now();
      tripOpen.end = minuteOfDay(new Date());
      saveTripOpen();
    }
    return;
  }
  if (tripOpen && !tripOpen.parkedAt) return;
  const talking = (currentMode === 'morning' || currentMode === 'afternoon') && !isDialogueDone() ? currentMode : '';
  if (tripOpen && Date.now() - tripOpen.parkedAt < STOP_GAP_MS) {
    tripOpen.parkedAt = 0;
    tripOpen.end = null;
    tripOpen.chosen = tripOpen.chosen || talking;
    saveTripOpen();
    return;
  }
  closeTrip();
  startTrip(talking);
}

// 보호자가 고른 대화는 이 여정이 무엇인지 알려 준다.
function noteTripChoice(mode) {
  if (!tripOpen || tripOpen.parkedAt) return;
  tripOpen.chosen = mode;
  saveTripOpen();
}

// 교문 앞에서는 주차하지 않고 내릴 수 있으므로 학교 앞에서 문이 열리면 여정을 마감한다.
function noteTripDoor() {
  if (!tripOpen || (tripOpen.parkedAt && Date.now() - tripOpen.parkedAt > DOOR_WINDOW_MS)) return;
  tripOpen.door = true;
  saveTripOpen();
  if (freshPlace() !== 'school' || tripOpen.from === 'school') return;
  if (tripOpen.end === null) tripOpen.end = minuteOfDay(new Date());
  closeTrip();
  if (isDrivingMode) startTrip('');
}

function noteNaviPlace() {
  naviPlace = school && placeMatches(naviInfo, school) ? 'school' : homePlace && placeMatches(naviInfo, homePlace) ? 'home' : '';
}

// 내비가 앱을 덮어 위치가 끊겨도 도착 신호로 도착한 곳을 안다.
function noteTripArrival() {
  if (!naviPlace) return;
  carPlace = naviPlace;
  carFixAt = Date.now();
  if (!tripOpen) return;
  tripOpen.last = naviPlace;
  saveTripOpen();
}

// 달리는 동안에는 출발한 곳과 시각으로 판단해, 시간이 지나도 판단이 바뀌지 않게 한다.
function tripGuess(now) {
  if (!tripMemoryOn()) return null;
  const driving = isDrivingMode && tripOpen;
  const previous = trips[trips.length - 1];
  const last = driving || !tripOpen ? previous : Journey.finishTrip(tripOpen, previous) || previous;
  return Journey.guessMode({ place: driving ? tripOpen.from : freshPlace(), trips, last, ymd: toYmd(now), day: now.getDay(), min: driving ? tripOpen.min : minuteOfDay(now) });
}

// 학교 바로 옆에 살면 집에서도 학교로 나오므로, 집은 그 자리에서도 정할 수 있게 한다.
function canSaveSpot(kind) {
  const place = freshPlace();
  const here = place === 'other' || (kind === 'home' && place === 'school');
  return tripMemoryOn() && here && !knownSpots()[kind] && (kind === 'home' || !!school);
}

function saveSpot(kind) {
  if (!canSaveSpot(kind)) return;
  tripSpots[kind] = carSpot;
  writeStored(SPOTS_KEY, tripSpots);
  updateCarPlace();
  render();
}

function forgetTrips() {
  trips = [];
  tripOpen = null;
  writeStored(TRIPS_KEY, trips);
  saveTripOpen();
}

// 학교나 집이 바뀌면 지난 기록의 구분이 맞지 않으므로 함께 지운다.
function forgetSpot(kind) {
  delete tripSpots[kind];
  writeStored(SPOTS_KEY, tripSpots);
  forgetTrips();
  carPlace = '';
  updateCarPlace();
}

window.onLocationAnswered = syncLocation; // 제거한 위치 기록을 다시 켜지 않는다.

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
  if (stage === 'ETA_SHORT' || stage === 'PARENT_BRIDGE' || stage === 'NEXT_DAY') return; // 가족 대화는 끊지 않는다
  // 대화를 일찍 마친 등교도 내리기 전 준비물 확인은 한 번 한다 (기획안 ④)
  if (!isDialogueDone() || currentMode === 'morning') setStage('ETA_SHORT');
}
