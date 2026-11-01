const test = require('node:test');
const assert = require('node:assert');
const Lesson = require('../../main/assets/dait-lesson.js');
const lessons = require('../../main/assets/dait-lessons.js');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const piece = (id, kind, must, seconds) => ({ id, kind, must, seconds, text: '말', line: id });
const lesson = {
  id: 'a', title: '가', homework: '숙제',
  pieces: [
    piece('r1', '복습', true, 20), piece('i1', '도입', true, 60), piece('b1', '전개', false, 120), piece('q1', '발문', true, 30),
    piece('b2', '전개', false, 200), piece('c1', '정리', true, 60), piece('s1', '짧은정리', true, 15)
  ]
};
const ids = pieces => pieces.map(item => item.id);

test('동백꽃은 15분 전후 판과 30분 전후 판이 있고, 30분 판 조각은 15분 판에 들어가지 않는다', () => {
  const dongbaek = lessons.find(item => item.id === 'dongbaek');
  const short = Lesson.assemble(dongbaek, 15);
  const long = Lesson.assemble(dongbaek, 30);
  const minutes = pieces => Lesson.totalSeconds(pieces) / 60;
  assert.ok(minutes(short) >= 13 && minutes(short) <= 15, String(minutes(short)));
  assert.ok(minutes(long) >= 27 && minutes(long) <= 30, String(minutes(long)));
  assert.ok(short.every(line => !line.long));
  assert.ok(long.filter(Lesson.isQuestion).length > short.filter(Lesson.isQuestion).length);
  assert.ok(Lesson.isClosing(long[long.length - 1]));
});

test('시간이 모자라면 필수만, 넉넉하면 대본 차례대로 더하고 복습과 짧은 정리는 빼 둔다', () => {
  assert.deepStrictEqual(ids(Lesson.assemble(lesson, 3)), ['i1', 'q1', 'c1']);
  assert.deepStrictEqual(ids(Lesson.assemble(lesson, 5)), ['i1', 'b1', 'q1', 'c1']);
  assert.deepStrictEqual(ids(Lesson.assemble(lesson, 8)), ['i1', 'b1', 'q1', 'b2', 'c1']);
});

test('조립한 수업은 고른 시간을 넘지 않는다', () => {
  for (const item of lessons) {
    for (const minutes of Lesson.TIME_CHOICES) {
      assert.ok(Lesson.totalSeconds(Lesson.assemble(item, minutes)) <= minutes * 60, `${item.id} ${minutes}분`);
    }
  }
});

test('모든 수업은 도입·발문·정리와 복습·짧은 정리를 갖추고, 15분에 들어간다', () => {
  for (const item of lessons) {
    const kinds = new Set(item.pieces.map(line => line.kind));
    ['복습', '도입', '발문', '정리', '짧은정리'].forEach(kind => assert.ok(kinds.has(kind), `${item.id} ${kind}`));
    assert.ok(Lesson.fits(item, 15), item.id);
    assert.ok(item.pieces.every(line => line.line && line.text), item.id);
    assert.ok(item.pieces.filter(Lesson.isQuestion).every(line => line.wait > 0 && line.level), item.id);
  }
});

test('필수 조각도 못 들어가는 시간에는 수업을 추천하지 않는다', () => {
  assert.deepStrictEqual(Lesson.recommend([lesson], 2, []), []);
});

test('시간을 많이 채우는 수업을 먼저, 들은 수업은 뒤로 추천한다', () => {
  const longer = { ...lesson, id: 'b' };
  const shorter = { ...lesson, id: 'c', pieces: lesson.pieces.filter(line => line.id !== 'b2') };
  assert.deepStrictEqual(Lesson.recommend([shorter, longer], 8, []).map(item => item.id), ['b', 'c']);
  assert.deepStrictEqual(Lesson.recommend([shorter, longer], 8, [{ lesson: 'b' }]).map(item => item.id), ['c', 'b']);
});

test('목적지가 없으면 보통 15분으로, 있으면 남은 시간으로 듣는다', () => {
  assert.strictEqual(Lesson.minutesFor(null), 15);
  assert.strictEqual(Lesson.minutesFor(23.7), 23);
  assert.strictEqual(Lesson.minutesFor(0), 0); // 도착한 곳에서 수업을 권하지 않는다
  assert.deepStrictEqual(Lesson.recommend([lesson], Lesson.minutesFor(0), []), []);
});

test('지난 수업을 마쳤을 때만 다른 수업 앞에 복습을 붙이고, 같은 수업을 다시 들을 때는 붙이지 않는다', () => {
  const other = { ...lesson, id: 'b' };
  assert.strictEqual(Lesson.plan(other, [lesson, other], 8, [{ lesson: 'a', finished: true }])[0].id, 'r1');
  assert.strictEqual(Lesson.plan(other, [lesson, other], 8, [{ lesson: 'a', finished: false }])[0].id, 'i1');
  assert.strictEqual(Lesson.plan(other, [lesson, other], 8, [{ lesson: 'b', finished: true }])[0].id, 'i1');
});

test('복습도 시간 안에 넣고, 복습 때문에 필수 조각이 빠지면 복습을 뺀다', () => {
  const other = { ...lesson, id: 'b' };
  const done = [{ lesson: 'a', finished: true }];
  assert.ok(Lesson.totalSeconds(Lesson.plan(other, [lesson, other], 8, done)) <= 8 * 60);
  assert.strictEqual(Lesson.plan(other, [lesson, other], 170 / 60, done)[0].id, 'i1');
});

test('도착이 앞당겨지면 뒤의 선택 조각부터 빼고, 필수도 안 들어가면 짧은 정리로 끝낸다', () => {
  const pieces = Lesson.assemble(lesson, 8);
  assert.deepStrictEqual(ids(Lesson.fitRemaining(pieces, 0, 600, lesson).pieces), ids(pieces));
  assert.deepStrictEqual(ids(Lesson.fitRemaining(pieces, 0, 260, lesson).pieces), ['i1', 'b1', 'q1', 'c1']);
  assert.deepStrictEqual(ids(Lesson.fitRemaining(pieces, 0, 40, lesson).pieces), ['i1', 's1']);
});

test('도착이 늦어지면 빼 두었던 조각을 되살리고, 지나간 조각은 다시 넣지 않는다', () => {
  const short = Lesson.assemble(lesson, 3);
  assert.deepStrictEqual(ids(short), ['i1', 'q1', 'c1']);
  assert.deepStrictEqual(ids(Lesson.fitRemaining(short, 0, 600, lesson).pieces), ['i1', 'b1', 'q1', 'b2', 'c1']);
  assert.deepStrictEqual(ids(Lesson.fitRemaining(short, 1, 600, lesson).pieces), ['i1', 'q1', 'b2', 'c1']);
});

test('짧은 정리로 줄였다가 도착이 늦어지면 수업을 다시 잇는다', () => {
  const wrapped = Lesson.fitRemaining(Lesson.assemble(lesson, 3), 0, 40, lesson).pieces;
  assert.deepStrictEqual(ids(wrapped), ['i1', 's1']);
  assert.deepStrictEqual(ids(Lesson.fitRemaining(wrapped, 0, 200, lesson).pieces), ['i1', 'q1', 'c1']);
});

test('복습을 말하는 중에도 앞으로의 수업을 다시 고른다', () => {
  const start = [lesson.pieces[0], ...Lesson.assemble(lesson, 3)];
  assert.deepStrictEqual(ids(Lesson.fitRemaining(start, 0, 600, lesson).pieces), ['r1', 'i1', 'b1', 'q1', 'b2', 'c1']);
});

test('짧은 정리를 말하는 중이거나 마지막 조각이면 다시 붙이지 않는다', () => {
  const wrapped = [lesson.pieces[1], lesson.pieces[6]];
  assert.deepStrictEqual(ids(Lesson.fitRemaining(wrapped, 1, 0, lesson).pieces), ['i1', 's1']);
  const ending = Lesson.assemble(lesson, 3);
  assert.deepStrictEqual(ids(Lesson.fitRemaining(ending, 2, 0, lesson).pieces), ids(ending));
});

test('정리까지 오고 절반 넘게 들어야 마친 수업이다', () => {
  const pieces = Lesson.assemble(lesson, 3);
  const plannedSeconds = Lesson.lessonSeconds(pieces);
  assert.strictEqual(Lesson.countsAsFinished({ plannedSeconds, heard: pieces, reachedEnd: false }), false);
  assert.strictEqual(Lesson.countsAsFinished({ plannedSeconds, heard: [pieces[2]], reachedEnd: true }), false);
  assert.strictEqual(Lesson.countsAsFinished({ plannedSeconds, heard: pieces, reachedEnd: true }), true);
});

test('도착으로 잘린 수업은 남은 조각을 다 들어도 마친 수업이 아니고, 복습은 들은 시간에 넣지 않는다', () => {
  const pieces = Lesson.assemble(lesson, 8);
  const plannedSeconds = Lesson.lessonSeconds(pieces);
  const cut = [pieces[0], lesson.pieces[6]];
  assert.strictEqual(Lesson.countsAsFinished({ plannedSeconds, heard: cut, reachedEnd: true }), false);
  assert.strictEqual(Lesson.countsAsFinished({ plannedSeconds: 120, heard: [lesson.pieces[0], lesson.pieces[6]], reachedEnd: true }), false);
});

test('마친 수업은 이음 +1과 거리, 숙제를 남기고, 못 마친 수업은 기록만 남긴다', () => {
  const done = Lesson.finishLesson(null, lesson, '2026-11-02', true, 12.5, [{ text: '답' }]);
  assert.strictEqual(done.ieum, 1);
  assert.strictEqual(done.km['2026-11'], 12.5);
  assert.strictEqual(done.homework.title, '숙제');
  assert.strictEqual(done.records[0].answers[0].text, '답');
  const stopped = Lesson.finishLesson(done, lesson, '2026-11-03', false, 5, []);
  assert.strictEqual(stopped.ieum, 1);
  assert.strictEqual(stopped.km['2026-11'], 12.5);
  assert.strictEqual(stopped.records.length, 2);
});

test('숙제를 마치면 이음 +1, 숙제가 없으면 그대로다', () => {
  const given = Lesson.finishLesson(null, lesson, '2026-11-02', true, 0, []);
  const done = Lesson.finishHomework(given);
  assert.strictEqual(done.ieum, 2);
  assert.strictEqual(done.homework, null);
  assert.strictEqual(Lesson.finishHomework(done).ieum, 2);
});

test('남긴 답을 지워도 들은 수업과 이음은 남는다', () => {
  const given = Lesson.finishLesson(null, lesson, '2026-11-02', true, 0, [{ text: '답' }]);
  const forgotten = Lesson.forgetAnswers(given);
  assert.deepStrictEqual(forgotten.records[0].answers, []);
  assert.strictEqual(forgotten.ieum, 1);
});

test('달린 거리를 아는 말로 바꾼다', () => {
  assert.strictEqual(Lesson.mileageLine(412), '서울에서 부산까지 배움으로 이었어요');
  assert.strictEqual(Lesson.mileageLine(10), '');
});

const other = id => ({ ...lesson, id, subject: id, pieces: lesson.pieces.map(line => ({ ...line })) });
const startPieces = trip => Lesson.withBreak(Lesson.assemble(trip.lesson, trip.minutes), trip);

test('40분부터 교시로 나누고, 교시마다 15분과 쉬는 시간이 들어갈 만큼만 잡는다', () => {
  assert.strictEqual(Lesson.isLongTrip(39), false);
  assert.strictEqual(Lesson.isLongTrip(40), true);
  assert.deepStrictEqual([39, 40, 64, 65, 90].map(Lesson.periodCount), [1, 2, 2, 3, 4]);
});

test('40분은 국어, 쉬는 시간, 과학이고 합쳐도 40분을 넘지 않는다', () => {
  const trip = Lesson.planTrip(Lesson.tripOrder(lessons, []), 40);
  assert.deepStrictEqual(Lesson.periods(trip).map(item => item.subject), ['국어', '과학']);
  assert.strictEqual(trip.minutes, 15);
  const total = Lesson.periods(trip).reduce((sum, item) => sum + Lesson.totalSeconds(Lesson.assemble(item, trip.minutes)), Lesson.BREAK_MINUTES * 60);
  assert.ok(total <= 40 * 60, String(total));
});

test('3시간은 들어가는 만큼 교시를 잡되 같은 수업을 되풀이하지 않는다', () => {
  const picked = Lesson.periods(Lesson.planTrip(Lesson.tripOrder(lessons, []), 180)).map(item => item.id);
  assert.strictEqual(picked.length, lessons.length);
  assert.strictEqual(new Set(picked).size, picked.length);
});

test('고른 수업이 1교시가 되고, 들은 수업은 뒤 교시로 간다', () => {
  assert.strictEqual(Lesson.tripOrder(lessons, [], 'prime')[0].id, 'prime');
  const order = Lesson.tripOrder(lessons, [{ lesson: 'dongbaek' }]).map(item => item.id);
  assert.strictEqual(order[order.length - 1], 'dongbaek');
});

test('쉬는 시간은 말 없는 조각이고, 마지막 교시 뒤에는 없다', () => {
  const trip = Lesson.planTrip([other('a'), other('b')], 40);
  const pieces = startPieces(trip);
  const rest = pieces[pieces.length - 1];
  assert.ok(Lesson.isBreak(rest));
  assert.strictEqual(rest.text, '');
  assert.strictEqual(rest.line, '쉬는 시간이에요. 다음은 2교시 b');
  assert.strictEqual(Lesson.speechSeconds(rest), Lesson.BREAK_MINUTES * 60);
  assert.strictEqual(Lesson.lessonSeconds(pieces), Lesson.lessonSeconds(pieces.slice(0, -1)));
  assert.ok(!startPieces(Lesson.nextPeriod(trip, 1200)).some(Lesson.isBreak));
});

test('수업 하나일 때 fitTrip은 fitRemaining과 같다', () => {
  const trip = Lesson.planTrip([lesson], 8);
  const pieces = Lesson.assemble(lesson, 8);
  for (const seconds of [600, 260, 40]) {
    assert.deepStrictEqual(ids(Lesson.fitTrip(pieces, 0, seconds, lesson, trip).pieces), ids(Lesson.fitRemaining(pieces, 0, seconds, lesson).pieces));
  }
});

test('시간이 그대로면 교시 계획도 그대로다', () => {
  const trip = Lesson.planTrip([other('a'), other('b')], 40);
  const fitted = Lesson.fitTrip(startPieces(trip), 0, 2400, trip.lesson, trip);
  assert.strictEqual(fitted.count, 1);
  assert.deepStrictEqual(ids(fitted.pieces), ['i1', 'b1', 'q1', 'b2', 'c1', 'break']);
});

test('도착이 앞당겨지면 이번 교시 선택 조각부터 빼고, 다음에 뒤 교시와 쉬는 시간을 뺀다', () => {
  const trip = Lesson.planTrip([other('a'), other('b')], 40);
  const pieces = startPieces(trip);
  // 뒤 교시 필수 150초 + 쉬는 시간 600초 + 이번 교시 필수 90초 + 여유 20초
  const kept = Lesson.fitTrip(pieces, 0, 860, trip.lesson, trip);
  assert.strictEqual(kept.count, 1);
  assert.deepStrictEqual(ids(kept.pieces), ['i1', 'q1', 'c1', 'break']);
  const dropped = Lesson.fitTrip(pieces, 0, 859, trip.lesson, trip);
  assert.strictEqual(dropped.count, 0);
  assert.deepStrictEqual(ids(dropped.pieces), ['i1', 'b1', 'q1', 'b2', 'c1']); // 빠진 교시의 시간은 이번 교시가 쓴다
});

test('도착이 코앞이면 뒤 교시를 모두 빼고 이번 수업의 짧은 정리로 끝낸다', () => {
  const trip = Lesson.planTrip([other('a'), other('b'), other('c')], 65);
  const fitted = Lesson.fitTrip(startPieces(trip), 0, 40, trip.lesson, trip);
  assert.strictEqual(fitted.count, 0);
  assert.deepStrictEqual(ids(fitted.pieces), ['i1', 's1']);
});

test('도착이 늦어지면 빠진 교시와 조각을 되살린다. 새 교시는 한 교시 길이가 남아야 한다', () => {
  const trip = { ...Lesson.planTrip([other('a'), other('b'), other('c')], 40), count: 0 };
  const pieces = Lesson.assemble(trip.lesson, 3);
  const none = Lesson.fitTrip(pieces, 0, 1400, trip.lesson, trip);
  assert.strictEqual(none.count, 0); // 뒤 교시 필수만 넣을 수 있어도 새 교시로 되살리지 않는다
  const back = Lesson.fitTrip(pieces, 0, 4000, trip.lesson, trip);
  assert.strictEqual(back.count, 2);
  assert.deepStrictEqual(ids(back.pieces).slice(-2), ['c1', 'break']);
  assert.ok(ids(back.pieces).includes('b1'));
});

test('정리를 말하는 중에도 뒤 교시를 다시 고르고, 정리는 끝까지 둔다', () => {
  const trip = Lesson.planTrip([other('a'), other('b')], 40);
  const pieces = startPieces(trip);
  const at = pieces.findIndex(Lesson.isClosing);
  assert.deepStrictEqual(ids(Lesson.fitTrip(pieces, at, 2000, trip.lesson, trip).pieces).slice(-2), ['c1', 'break']);
  assert.deepStrictEqual(ids(Lesson.fitTrip(pieces, at, 100, trip.lesson, trip).pieces).slice(-1), ['c1']);
});

test('쉬는 시간 중에 뒤 교시가 다 빠지면 쉬는 시간도 빠져 수업이 끝난다', () => {
  const trip = Lesson.planTrip([other('a'), other('b')], 40);
  const pieces = startPieces(trip);
  const at = pieces.length - 1;
  assert.strictEqual(Lesson.fitTrip(pieces, at, 900, trip.lesson, trip).count, 1);
  const over = Lesson.fitTrip(pieces, at, 100, trip.lesson, trip);
  assert.strictEqual(over.count, 0);
  assert.ok(over.pieces.length <= at);
});

test('쉬는 시간 뒤에는 남은 시간을 남은 교시에 다시 나눠, 앞 교시가 짧으면 뒤 교시가 길어진다', () => {
  const trip = Lesson.planTrip([other('a'), other('b'), other('c')], 65);
  const next = Lesson.nextPeriod(trip, 45 * 60);
  assert.strictEqual(next.lesson.id, 'b');
  assert.strictEqual(next.number, 2);
  assert.strictEqual(next.count, 1);
  assert.strictEqual(next.minutes, 17.5);
});

test('과목 목록은 자료에서 겹치지 않게 만들고, 과목으로 거른다', () => {
  assert.deepStrictEqual(Lesson.subjects(lessons), ['국어', '과학', '수학', '사회']);
  assert.deepStrictEqual(Lesson.bySubject(lessons, '수학').map(item => item.id), ['prime']);
  assert.strictEqual(Lesson.bySubject(lessons, '').length, lessons.length);
});

test('마친 교시는 저마다 이음과 숙제가 되고, 숙제는 하나씩 마친다', () => {
  const first = { ...lesson, id: 'a', homework: '첫 숙제' };
  const second = { ...lesson, id: 'b', homework: '둘째 숙제' };
  const done = Lesson.finishLesson(Lesson.finishLesson(null, first, '2026-11-02', true, 1, []), second, '2026-11-02', true, 2, []);
  assert.strictEqual(done.ieum, 2);
  assert.strictEqual(done.records.length, 2);
  assert.strictEqual(done.km['2026-11'], 3);
  assert.strictEqual(done.homework.title, '첫 숙제');
  const one = Lesson.finishHomework(done);
  assert.strictEqual(one.ieum, 3);
  assert.strictEqual(one.homework.title, '둘째 숙제');
  const two = Lesson.finishHomework(one);
  assert.strictEqual(two.ieum, 4);
  assert.strictEqual(two.homework, null);
  assert.strictEqual(Lesson.finishHomework(two).ieum, 4);
});

test('같은 수업을 다시 마치면 그 수업의 숙제만 새로 바뀌어 쌓이지 않는다', () => {
  const first = { ...lesson, id: 'a', homework: '첫 숙제' };
  const again = Lesson.finishLesson(Lesson.finishLesson(null, first, '2026-11-02', true, 0, []), first, '2026-11-03', true, 0, []);
  assert.strictEqual(again.homework.ymd, '2026-11-03');
  assert.deepStrictEqual(again.homeworkNext, []);
});

test('이전에 저장한 진도에도 뒤에 기다리는 숙제 자리가 생긴다', () => {
  assert.deepStrictEqual(Lesson.normalize({ ieum: 3, homework: null }).homeworkNext, []);
});

function checkVoices(data) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dait-voices-')), 'lessons.js');
  fs.writeFileSync(file, `module.exports = ${JSON.stringify(data)};`);
  const script = path.join(__dirname, '../../../../../tools/check-lesson-voices.js');
  return spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
}

test('음원이 없는 조각의 이름을 찾는다', () => {
  const data = [{ pieces: [{ clip: 'lesson/a_1', voiced: true }, { clip: 'lesson/a_2' }] }];
  assert.deepStrictEqual(Lesson.unvoiced(data), ['lesson/a_2']);
});

test('제출용 검사는 음원이 하나라도 없으면 이름을 말하고 멈춘다', () => {
  const result = checkVoices([{ pieces: [{ clip: 'lesson/a_1', voiced: true }, { clip: 'lesson/a_2' }] }]);
  assert.strictEqual(result.status, 1);
  assert.ok(result.stderr.includes('lesson/a_2'));
  assert.ok(result.stderr.includes('제출용 앱을 만들지 않습니다'));
});

test('제출용 검사는 음원이 다 있으면 통과한다', () => {
  assert.strictEqual(checkVoices([{ pieces: [{ clip: 'lesson/a_1', voiced: true }] }]).status, 0);
});

test('음원 검사는 제출용 빌드에만 있고, 오래 빌드하기 전에 멈춘다', () => {
  const script = fs.readFileSync(path.join(__dirname, '../../../../../tools/Build-App.ps1'), 'utf8');
  const release = script.indexOf('if ($Release) {');
  const check = script.indexOf('check-lesson-voices.js');
  assert.ok(release >= 0 && release < check);
  assert.ok(script.slice(release, check).split('\n').length <= 2);
  assert.ok(check < script.indexOf('gradlew.bat'));
});

test('고른 수업은 교시 시간에 맞지 않아도 다른 수업으로 바뀌지 않는다', () => {
  const heavy = { ...lesson, id: 'heavy', pieces: lesson.pieces.map(line => ({ ...line, seconds: 400 })) };
  const order = Lesson.tripOrder([lesson, heavy], [], 'heavy');
  assert.strictEqual(order[0].id, 'heavy');
  assert.deepStrictEqual(order.filter(line => line.id === 'heavy').length, 1);
});
