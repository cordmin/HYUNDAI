// 수업 규칙: 시간에 맞춘 수업 조립, 긴 이동의 교시 나누기, 도착에 맞춘 줄이기, 숙제와 이음.
// 대사는 교사가 검수한 조각만 쓴다. 필수 조각은 그대로 두고 시간이 남는 만큼 나머지 조각을 더한다.
(function (root) {
  const TIME_CHOICES = [15, 20, 30];
  const LONG_CHOICES = [60, 90]; // 목적지 없이 고르는 긴 이동. 60분은 2교시, 90분은 4교시로 나뉜다
  const LONG_TRIP_MINUTES = 40; // 이 시간부터 수업 하나 대신 학교처럼 교시로 나눈다
  const PERIOD_MINUTES = 15; // 몇 교시가 들어가는지 셀 때 한 교시로 치는 길이
  const BREAK_MINUTES = 10; // 교시 사이 쉬는 시간. 쉬는 시간 내용이 오기 전까지는 말하지 않는다
  const DEFAULT_MINUTES = 15; // 목적지가 없을 때의 보통 길이
  const CHARS_PER_SECOND = 4.62; // 음원을 만들기 전 대사의 예상 길이
  const ARRIVAL_MARGIN_S = 20; // 도착 전에 마지막 말을 마칠 여유
  const HEARD_TO_COUNT = 0.5; // 이만큼은 들어야 한 차시를 마친 것으로 본다
  const KEEP_RECORDS = 200;
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
    return lesson.pieces.filter(piece => !['복습', '짧은정리'].includes(piece.kind));
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
    return totalSeconds(required(lesson)) <= minutes * 60 - ARRIVAL_MARGIN_S;
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
    return pick(lessonOrder(lesson), minutes * 60);
  }

  // 남은 시간에 들어가는 수업을, 그 시간을 많이 채우는 순서로 고른다. 들은 수업은 뒤로 보낸다.
  function recommend(lessons, minutes, records) {
    const heard = new Set((records || []).map(record => record.lesson));
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

  // 지난 수업이 마친 수업이고 다른 수업을 시작할 때만 앞에 복습을 붙인다.
  // 복습도 시간 안에 넣는다. 복습 때문에 필수 조각이 빠지게 되면 복습을 뺀다.
  function plan(lesson, lessons, minutes, records) {
    const last = (records || []).filter(record => record.finished).slice(-1)[0];
    const before = last && last.lesson !== lesson.id ? lessons.find(item => item.id === last.lesson) : null;
    const line = before ? recap(before) : null;
    const left = line ? minutes - pieceSeconds(line) / 60 : minutes;
    return line && fits(lesson, left) ? [line, ...assemble(lesson, left)] : assemble(lesson, minutes);
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
    const order = lessonOrder(lesson);
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
    const order = lessonOrder(lesson);
    const ahead = isBreak(now) || isClosing(now) ? [] : order.slice(order.indexOf(now) + 1);
    const must = totalSeconds(ahead.filter(piece => piece.must));
    const count = laterCount(trip, must, totalSeconds(own.slice(index + 1)), remainingSeconds - ARRIVAL_MARGIN_S);
    const kept = { ...trip, count };
    if (isBreak(now)) return { pieces: withBreak(own, kept), count };
    const held = trip.later.slice(0, count).reduce((sum, item) => sum + BREAK_MINUTES * 60 + totalSeconds(assemble(item, trip.minutes)), 0);
    const room = count ? Math.max(remainingSeconds - held, must + ARRIVAL_MARGIN_S) : remainingSeconds;
    return { pieces: withBreak(fitRemaining(own, index, room, lesson).pieces, kept), count };
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
    return { ieum: 0, km: {}, records: [], homework: null, homeworkNext: [] };
  }

  function normalize(progress) {
    return { ...emptyProgress(), ...(progress || {}) };
  }

  function finishLesson(progress, lesson, ymd, finished, km, answers) {
    const next = normalize(progress);
    const heldKm = Math.max(0, km || 0);
    next.km = { ...next.km, [monthOf(ymd)]: (next.km[monthOf(ymd)] || 0) + (finished ? heldKm : 0) };
    next.records = [...next.records, { lesson: lesson.id, title: lesson.title, ymd, finished, answers: answers || [] }].slice(-KEEP_RECORDS);
    if (!finished) return next;
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
    TIME_CHOICES, LONG_CHOICES, LONG_TRIP_MINUTES, BREAK_MINUTES, DEFAULT_MINUTES, assemble, fits, recommend, minutesFor, plan, lessonSeconds, fitRemaining,
    speechSeconds, totalSeconds, required, recap, shortEnd, isQuestion, isClosing, isLongTrip, periodCount, tripOrder, planTrip, nextPeriod, periods, isBreak, withBreak, fitTrip,
    subjects, bySubject, unvoiced, countsAsFinished, monthOf, normalize, finishLesson, finishHomework, forgetAnswers, mileageLine
  };
  root.Lesson = Lesson;
  if (typeof module !== 'undefined') module.exports = Lesson;
})(typeof window !== 'undefined' ? window : globalThis);
