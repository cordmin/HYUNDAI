// 수업 규칙: 시간에 맞춘 수업 조립, 긴 이동의 교시 나누기, 도착에 맞춘 줄이기, 숙제와 이음.
// 대사는 교사가 검수한 조각만 쓴다. 필수 조각은 그대로 두고 시간이 남는 만큼 나머지 조각을 더한다.
(function (root) {
  const TIME_CHOICES = [8, 15, 20, 30];
  const LONG_CHOICES = [60, 90]; // 목적지 없이 고르는 긴 이동. 60분은 2교시, 90분은 4교시로 나뉜다
  const LONG_TRIP_MINUTES = 40; // 이 시간부터 수업 하나 대신 학교처럼 교시로 나눈다
  const PERIOD_MINUTES = 15; // 몇 교시가 들어가는지 셀 때 한 교시로 치는 길이
  const BREAK_MINUTES = 10; // 교시 사이 쉬는 시간. 쉬는 시간 내용이 오기 전까지는 말하지 않는다
  const DEFAULT_MINUTES = 15; // 목적지가 없을 때의 보통 길이
  const SHORT_UNDER_MINUTES = 10; // 이보다 짧은 시간에는 짧은 판이 있는 수업을 짧은 판으로 듣는다
  const CHARS_PER_SECOND = 4.62; // 음원을 만들기 전 대사의 예상 길이
  const ARRIVAL_MARGIN_S = 20; // 도착 전에 마지막 말을 마칠 여유
  const HEARD_TO_COUNT = 0.5; // 이만큼은 들어야 한 차시를 마친 것으로 본다
  const KEEP_RECORDS = 200;
  const RESUME_DAYS = 7; // 끝까지 못 들은 수업을 이 날수까지 「멈춘 곳부터」로 권한다
  // 도로 기준 어림값. 말로 보여 주기 위한 것이라 정밀하지 않아도 된다.
  const DISTANCE_MARKS = [
    { km: 400, text: '서울에서 부산까지' },
    { km: 240, text: '서울에서 대구까지' },
    { km: 150, text: '서울에서 대전까지' },
    { km: 75, text: '서울에서 춘천까지' },
    { km: 30, text: '서울에서 인천까지' }
  ];

  function speechSeconds(piece) {
    return piece.seconds || piece.text.length / CHARS_PER_SECOND;
  }

  function pieceSeconds(piece) {
    return speechSeconds(piece) + (piece.wait || 0);
  }

  function totalSeconds(pieces) {
    return pieces.reduce((sum, piece) => sum + pieceSeconds(piece), 0);
  }

  function lessonOrder(lesson) {
    return lesson.pieces.filter(piece => !piece.short && !['복습', '짧은정리'].includes(piece.kind));
  }

  // 짧은 판(판 8)은 따로 짠 맛보기 수업이다. 질문으로 시작해 개념 하나만 다루고 답과 숙제로 맺는다.
  function shortOrder(lesson) {
    return lesson.pieces.filter(piece => piece.short);
  }

  function orderFits(order, minutes) {
    return order.length > 0 && totalSeconds(order.filter(piece => piece.must)) <= minutes * 60 - ARRIVAL_MARGIN_S;
  }

  // 10분보다 짧거나 원래 판의 필수 조각이 들어가지 않으면 짧은 판으로 듣는다.
  function orderFor(lesson, minutes) {
    const short = shortOrder(lesson);
    const useShort = (minutes < SHORT_UNDER_MINUTES || !orderFits(lessonOrder(lesson), minutes)) && orderFits(short, minutes);
    return useShort ? short : lessonOrder(lesson);
  }

  // 지금 틀고 있는 판의 조각 차례. 짧은 판을 듣다가 도착이 늦어져도 원래 판으로 바꾸지 않는다.
  function playingOrder(lesson, pieces) {
    return pieces.some(piece => piece.short) ? shortOrder(lesson) : lessonOrder(lesson);
  }

  function isShort(pieces) {
    return pieces.some(piece => piece.short);
  }

  function required(lesson) {
    return lessonOrder(lesson).filter(piece => piece.must);
  }

  function shortEnd(lesson) {
    return lesson.pieces.find(piece => piece.kind === '짧은정리') || null;
  }

  function recap(lesson) {
    return lesson.pieces.find(piece => piece.kind === '복습') || null;
  }

  function fits(lesson, minutes) {
    return orderFits(lessonOrder(lesson), minutes) || orderFits(shortOrder(lesson), minutes);
  }

  // 필수 조각을 두고, 15분 판 조각부터 대본 순서대로 더한 뒤 30분 판 조각을 더한다.
  // 시간에 들어가는 조각을 고를 뿐 말하는 차례는 대본 그대로다.
  function pick(order, budget) {
    const musts = order.filter(piece => piece.must);
    let used = totalSeconds(musts);
    const keep = new Set(musts);
    const extras = order.filter(piece => !piece.must);
    for (const piece of [...extras.filter(piece => !piece.long), ...extras.filter(piece => piece.long)]) {
      if (used + pieceSeconds(piece) > budget) continue;
      keep.add(piece);
      used += pieceSeconds(piece);
    }
    return order.filter(piece => keep.has(piece));
  }

  function assemble(lesson, minutes) {
    return pick(orderFor(lesson, minutes), minutes * 60);
  }

  // 남은 시간에 들어가는 수업을, 그 시간을 많이 채우는 순서로 고른다. 들은 수업은 뒤로 보낸다.
  // 짧은 판만 들은 수업은 맛보기를 한 것이라 뒤로 보내지 않는다. 다음 긴 이동에서 원래 판으로 이어 듣게 한다.
  function recommend(lessons, minutes, records) {
    const heard = new Set((records || []).filter(record => !record.short).map(record => record.lesson));
    return lessons
      .filter(lesson => fits(lesson, minutes))
      .map(lesson => ({ lesson, seconds: totalSeconds(assemble(lesson, minutes)) }))
      .sort((a, b) => heard.has(a.lesson.id) - heard.has(b.lesson.id) || b.seconds - a.seconds)
      .map(item => item.lesson);
  }

  // 목적지가 있으면 남은 시간을 쓰고, 없으면 보통 길이로 듣는다.
  function minutesFor(etaMinutes) {
    return Number.isFinite(etaMinutes) ? Math.floor(etaMinutes) : DEFAULT_MINUTES;
  }

  // 지난 수업이 마친 수업이고 다른 수업을 시작할 때만 앞에 복습을 붙인다. 짧은 판에는 복습을 두지 않는다.
  // 판은 고른 시간으로 정하고, 복습도 시간 안에 넣는다. 복습 때문에 필수 조각이 빠지게 되면 복습을 뺀다.
  function plan(lesson, lessons, minutes, records) {
    const order = orderFor(lesson, minutes);
    const last = (records || []).filter(record => record.finished).slice(-1)[0];
    const before = last && last.lesson !== lesson.id ? lessons.find(item => item.id === last.lesson) : null;
    const line = before && !isShort(order) ? recap(before) : null;
    const left = line ? minutes - pieceSeconds(line) / 60 : minutes;
    return line && orderFits(order, left) ? [line, ...pick(order, left * 60)] : pick(order, minutes * 60);
  }

  // 복습은 지난 수업의 말이므로 이번 수업을 들은 시간에 넣지 않는다.
  function lessonSeconds(pieces) {
    return totalSeconds(pieces.filter(piece => piece.kind !== '복습' && !isBreak(piece)));
  }

  // 수업 중 내비의 남은 시간이 바뀌면, 앞으로 할 조각을 대본에서 다시 고른다.
  // 도착이 앞당겨지면 조각을 빼고, 늦어지면 빼 두었던 조각을 되살린다. 지나간 조각은 다시 넣지 않는다.
  // 필수 조각도 못 들어가면 짧은 정리 하나로 끝낸다. 지금 말하는 조각은 건드리지 않는다.
  function fitRemaining(pieces, index, remainingSeconds, lesson) {
    if (isClosing(pieces[index])) return { pieces, wrapped: false }; // 정리는 끝까지 말한다
    const done = pieces.slice(0, index + 1);
    const order = playingOrder(lesson, pieces);
    const ahead = order.slice(order.indexOf(pieces[index]) + 1);
    const budget = remainingSeconds - ARRIVAL_MARGIN_S;
    if (totalSeconds(ahead.filter(piece => piece.must)) <= budget) {
      return { pieces: [...done, ...pick(ahead, budget)], wrapped: false };
    }
    const end = shortEnd(lesson);
    return { pieces: end ? [...done, end] : done, wrapped: true };
  }

  function isLongTrip(minutes) {
    return minutes >= LONG_TRIP_MINUTES;
  }

  function periodCount(minutes) {
    return Math.max(1, Math.floor((minutes + BREAK_MINUTES) / (PERIOD_MINUTES + BREAK_MINUTES)));
  }

  // 교시마다 다른 수업을 듣도록 추천 차례대로 줄을 세운다. 고른 수업이 있으면 1교시로 올린다.
  function tripOrder(lessons, records, firstId) {
    const order = recommend(lessons, PERIOD_MINUTES, records);
    const first = lessons.find(lesson => lesson.id === firstId); // 고른 수업은 빼지 않는다. 다른 수업이 대신 나오지 않게 한다
    return first ? [first, ...order.filter(lesson => lesson !== first)] : order;
  }

  function periodShare(minutes, periods) {
    return (minutes - (periods - 1) * BREAK_MINUTES) / periods;
  }

  // 시간을 교시에 고르게 나눈다. 뒤에 줄 선 수업은 later에 두었다가 도착이 늦어지면 교시로 되살린다.
  // count는 지금 이어 들을 뒤 교시 수다. 수업이 모자라면 시간이 남아도 같은 수업을 다시 넣지 않는다.
  function planTrip(order, minutes) {
    const total = Math.max(1, Math.min(order.length, periodCount(minutes)));
    return { lesson: order[0], later: order.slice(1), count: total - 1, number: 1, minutes: periodShare(minutes, total) };
  }

  // 쉬는 시간이 끝나면 남은 시간을 남은 교시에 다시 나눈다. 앞 교시가 짧았으면 뒤 교시가 그만큼 길어진다.
  function nextPeriod(trip, remainingSeconds) {
    const [lesson, ...later] = trip.later;
    const count = trip.count - 1;
    return { ...trip, lesson, later, count, number: trip.number + 1, minutes: periodShare(remainingSeconds / 60, count + 1) };
  }

  function periods(trip) {
    return [trip.lesson, ...trip.later.slice(0, trip.count)];
  }

  function isBreak(piece) {
    return !!piece && piece.kind === '쉬는시간';
  }

  // 쉬는 시간은 말 없는 조각이다. 내용이 오면 음원만 붙이면 된다.
  function withBreak(pieces, trip) {
    if (!trip.count) return pieces;
    const line = `쉬는 시간이에요. 다음은 ${trip.number + 1}교시 ${trip.later[0].subject}`;
    return [...pieces, { id: 'break', kind: '쉬는시간', line, text: '', seconds: BREAK_MINUTES * 60 }];
  }

  // 뒤에 몇 교시를 남길지 정한다. 줄어들 때는 필수 조각이 들어가는 한 남기고,
  // 새 교시를 되살릴 때는 한 교시 길이가 온전히 남아야 한다.
  function laterCount(trip, mustSeconds, plannedSeconds, budget) {
    const room = Math.floor((budget - plannedSeconds) / ((PERIOD_MINUTES + BREAK_MINUTES) * 60));
    let count = Math.min(trip.later.length, Math.max(trip.count, room));
    const need = kept => trip.later.slice(0, kept).reduce((sum, lesson) => sum + BREAK_MINUTES * 60 + totalSeconds(required(lesson)), mustSeconds);
    while (count > 0 && need(count) > budget) count--;
    return count;
  }

  // 뒤 교시에 쓸 시간을 먼저 떼어 놓고, 남는 시간으로 이번 교시를 fitRemaining에 맡긴다.
  // 뒤 교시가 다 빠지면 쉬는 시간도 빠지고, 필수도 못 들어가면 이번 수업의 짧은 정리로 끝난다.
  // 쉬는 시간 중에 뒤 교시가 다 빠지면 pieces가 지금 차례보다 짧아진다. 그때는 화면 쪽에서 수업을 마친다.
  function fitTrip(pieces, index, remainingSeconds, lesson, trip) {
    const now = pieces[index];
    const own = pieces.filter(piece => !isBreak(piece));
    const order = playingOrder(lesson, own);
    const ahead = isBreak(now) || isClosing(now) ? [] : order.slice(order.indexOf(now) + 1);
    const must = totalSeconds(ahead.filter(piece => piece.must));
    const count = laterCount(trip, must, totalSeconds(own.slice(index + 1)), remainingSeconds - ARRIVAL_MARGIN_S);
    const kept = { ...trip, count };
    if (isBreak(now)) return { pieces: withBreak(own, kept), count };
    const held = trip.later.slice(0, count).reduce((sum, item) => sum + BREAK_MINUTES * 60 + totalSeconds(assemble(item, trip.minutes)), 0);
    const room = count ? Math.max(remainingSeconds - held, must + ARRIVAL_MARGIN_S) : remainingSeconds;
    return { pieces: withBreak(fitRemaining(own, index, room, lesson).pieces, kept), count };
  }

  // 끝까지 못 들은 수업은 마지막으로 들은 조각의 다음 조각부터 이어 듣게 기억한다.
  // 들은 판(짧은 판인지 원래 판인지)은 바꾸지 않는다. 들은 조각은 마친 수업을 셀 때 함께 센다.
  function resumePoint(lesson, heard, ymd) {
    const order = playingOrder(lesson, heard);
    const own = heard.filter(piece => order.includes(piece));
    const last = Math.max(-1, ...own.map(piece => order.indexOf(piece)));
    const next = order[last + 1];
    if (last < 0 || !next) return null;
    return { lesson: lesson.id, from: next.id, heard: own.map(piece => piece.id), short: isShort(heard), ymd };
  }

  // 날짜는 화면이 쓰는 20261102와 2026-11-02 꼴을 모두 받는다.
  function dayNumber(ymd) {
    const digits = String(ymd).replace(/-/g, '');
    return Date.UTC(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)) - 1, Number(digits.slice(6, 8))) / 86400000;
  }

  function daysBetween(from, to) {
    return dayNumber(to) - dayNumber(from);
  }

  function resumeFresh(resume, ymd) {
    return !!resume && daysBetween(resume.ymd, ymd) <= RESUME_DAYS;
  }

  function resumeOrder(lesson, resume) {
    const order = resume.short ? shortOrder(lesson) : lessonOrder(lesson);
    const start = order.findIndex(piece => piece.id === resume.from);
    return start < 0 ? [] : order.slice(start);
  }

  function resumeFits(lesson, resume, minutes) {
    return orderFits(resumeOrder(lesson, resume), minutes);
  }

  // 멈춘 조각부터 대본 차례대로, 남은 시간에 들어가는 만큼 고른다.
  function resumePlan(lesson, resume, minutes) {
    return pick(resumeOrder(lesson, resume), minutes * 60);
  }

  function resumeHeard(lesson, resume) {
    return lesson.pieces.filter(piece => resume.heard.includes(piece.id));
  }

  // 과목 칩은 자료에서 만든다. 수업이 늘면 칩도 늘어난다.
  function subjects(lessons) {
    return [...new Set(lessons.map(lesson => lesson.subject))];
  }

  function bySubject(lessons, subject) {
    return subject ? lessons.filter(lesson => lesson.subject === subject) : lessons;
  }

  // 음원이 없는 조각의 이름. 제출용 앱을 만들기 전에 확인한다.
  function unvoiced(lessons) {
    return lessons.flatMap(lesson => lesson.pieces.filter(piece => !piece.voiced).map(piece => piece.clip));
  }

  function isQuestion(piece) {
    return piece.kind === '발문';
  }

  function isClosing(piece) {
    return piece.kind === '정리' || piece.kind === '짧은정리';
  }

  // 시작할 때의 계획과 견준다. 넘겼거나 도착으로 잘린 수업은 마친 수업으로 치지 않는다.
  function countsAsFinished(run) {
    if (!run.reachedEnd) return false;
    return lessonSeconds(run.heard) >= run.plannedSeconds * HEARD_TO_COUNT;
  }

  function monthOf(ymd) {
    return ymd.slice(0, 7);
  }

  function emptyProgress() {
    return { ieum: 0, km: {}, records: [], homework: null, homeworkNext: [], resume: null };
  }

  function normalize(progress) {
    return { ...emptyProgress(), ...(progress || {}) };
  }

  function finishLesson(progress, lesson, ymd, finished, km, answers, short) {
    const next = normalize(progress);
    const heldKm = Math.max(0, km || 0);
    next.km = { ...next.km, [monthOf(ymd)]: (next.km[monthOf(ymd)] || 0) + (finished ? heldKm : 0) };
    const record = { lesson: lesson.id, title: lesson.title, ymd, finished, answers: answers || [] };
    if (short) record.short = true; // 짧은 판으로 들었다는 표시. 추천에서 이 수업을 뒤로 보내지 않는다
    next.records = [...next.records, record].slice(-KEEP_RECORDS);
    if (!finished) return next;
    if (next.resume && next.resume.lesson === lesson.id) next.resume = null; // 이어 듣던 수업을 마쳤다
    next.ieum += 1;
    if (lesson.homework) {
      // 긴 이동에서 교시마다 숙제가 생겨도 앞 숙제를 덮지 않는다. 같은 수업의 숙제만 새것으로 바꾼다.
      const waiting = [next.homework, ...next.homeworkNext].filter(item => item && item.lesson !== lesson.id);
      const [first, ...rest] = [...waiting, { lesson: lesson.id, title: lesson.homework, ymd }];
      next.homework = first;
      next.homeworkNext = rest;
    }
    return next;
  }

  // 끝까지 못 들은 수업 하나만 기억한다. 다른 수업이 또 끊기면 그것으로 바뀐다.
  function keepResume(progress, point) {
    return { ...normalize(progress), resume: point };
  }

  function finishHomework(progress) {
    const next = normalize(progress);
    if (!next.homework) return next;
    const [first, ...rest] = next.homeworkNext;
    next.homework = first || null;
    next.homeworkNext = rest;
    next.ieum += 1;
    return next;
  }

  // 기록 칸의 답을 지운다. 들은 수업과 이음은 남긴다.
  function forgetAnswers(progress) {
    const next = normalize(progress);
    next.records = next.records.map(record => ({ ...record, answers: [] }));
    return next;
  }

  function mileageLine(km) {
    const mark = DISTANCE_MARKS.find(item => km >= item.km);
    return mark ? `${mark.text} 배움으로 이었어요` : '';
  }

  const Lesson = {
    TIME_CHOICES, LONG_CHOICES, LONG_TRIP_MINUTES, BREAK_MINUTES, DEFAULT_MINUTES, SHORT_UNDER_MINUTES, assemble, fits, recommend, minutesFor, plan, lessonSeconds, fitRemaining,
    speechSeconds, totalSeconds, required, shortOrder, isShort, recap, shortEnd, isQuestion, isClosing, isLongTrip, periodCount, tripOrder, planTrip, nextPeriod, periods, isBreak, withBreak, fitTrip,
    resumePoint, resumeFresh, resumeFits, resumePlan, resumeHeard, keepResume, RESUME_DAYS,
    subjects, bySubject, unvoiced, countsAsFinished, monthOf, normalize, finishLesson, finishHomework, forgetAnswers, mileageLine
  };
  root.Lesson = Lesson;
  if (typeof module !== 'undefined') module.exports = Lesson;
})(typeof window !== 'undefined' ? window : globalThis);
