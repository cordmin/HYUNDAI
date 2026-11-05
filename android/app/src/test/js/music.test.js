const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Lesson = require('../../main/assets/dait-lesson.js');
const lessons = require('../../main/assets/dait-lessons.js');
const music = lessons.find(lesson => lesson.id === 'rhythm');

test('음악은 시간별로 음원이 있는 완결된 수업을 조립하고, 멈춘 곳과 도착에 맞춰 이어간다', () => {
  assert.equal(music.subject, '음악');
  assert.equal(music.pieces.length, 36);
  for (const minutes of [8, 15, 20, 30]) {
    assert.equal(Lesson.forRequest(lessons, minutes, [], '음악'), music);
    const order = Lesson.plan(music, lessons, minutes, []);
    assert.ok(Lesson.totalSeconds(order) <= minutes * 60);
    assert.equal(order[0].kind, '도입');
    assert.ok(Lesson.isClosing(order.at(-1)));
    for (const piece of order) {
      assert.ok(piece.voiced);
      assert.ok(fs.statSync(path.join(__dirname, '../../main/assets/voices', piece.clip + '.m4a')).size > 0);
    }
    const resume = Lesson.resumePoint(music, order.slice(0, 3), '20261106');
    assert.equal(Lesson.resumePlan(music, resume, minutes)[0].id, order[3].id);
    assert.equal(Lesson.fitRemaining(order, 2, 30, music).pieces.at(-1).id, 's1');
  }
  assert.ok(Lesson.assemble(music, 20).length > Lesson.assemble(music, 8).length);
  assert.ok(music.pieces.find(piece => piece.id === 'e3_4').seconds > 70);
  assert.ok(!music.pieces.find(piece => piece.id === 'e3_4').wait);
});
