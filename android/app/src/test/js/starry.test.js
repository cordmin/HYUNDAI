const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Lesson = require('../../main/assets/dait-lesson.js');
const lessons = require('../../main/assets/dait-lessons.js');
const starry = lessons.find(lesson => lesson.id === 'starry');

test('별 헤는 밤의 녹음된 조각은 실제 음원·길이가 연결돼 있고 8분·15분에 맞춰 조립된다', () => {
  assert.equal(starry.subject, '국어');
  const voiced = starry.pieces.filter(piece => piece.voiced);
  assert.ok(voiced.length >= 32, String(voiced.length));
  for (const piece of voiced) {
    assert.ok(piece.seconds > 0);
    assert.ok(fs.statSync(path.join(__dirname, '../../main/assets/voices', piece.clip + '.m4a')).size > 0);
  }
  assert.equal(Lesson.fits(starry, 5), false);
  for (const minutes of [8, 15]) {
    const order = Lesson.assemble(starry, minutes);
    assert.ok(Lesson.recommend(lessons, minutes, []).includes(starry));
    assert.ok(Lesson.totalSeconds(order) <= minutes * 60);
    assert.equal(Lesson.isShort(order), minutes === 8);
    assert.equal(order[0].kind, '도입');
    assert.equal(order.at(-1).kind, '정리');
    const closing = Lesson.fitRemaining(order, 2, 15, starry);
    assert.equal(closing.wrapped, true);
    assert.equal(closing.pieces.at(-1).id, 'f_s1');
    assert.ok(Lesson.totalSeconds([closing.pieces.at(-1)]) <= 15);
    const point = Lesson.resumePoint(starry, order.slice(0, 2), '20261108');
    const resumed = Lesson.resumePlan(starry, point, minutes);
    assert.equal(resumed[0].id, order[2].id);
    assert.equal(Lesson.isShort(resumed), minutes === 8);
  }
});
