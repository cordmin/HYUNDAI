// Run from any directory: node team/b/lessons/starry/check.cjs
// Uses the repository's actual CSV builder and lesson engine in an isolated directory.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const here = __dirname;
const root = path.resolve(here, '../../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dait-starry-'));
try {
  for (const d of ['tools', 'lessons', 'voice', 'android/app/src/main/assets/voices']) fs.mkdirSync(path.join(temp, d), {recursive: true});
  fs.copyFileSync(path.join(root, 'tools/build-lessons.js'), path.join(temp, 'tools/build-lessons.js'));
  fs.copyFileSync(path.join(here, '별헤는밤.csv'), path.join(temp, 'lessons/별헤는밤.csv'));
  fs.copyFileSync(path.join(here, '목록-추가행.csv'), path.join(temp, 'lessons/목록.csv'));
  cp.execFileSync(process.execPath, [path.join(temp, 'tools/build-lessons.js')]);
  const [lesson] = require(path.join(temp, 'android/app/src/main/assets/dait-lessons.js'));
  const L = require(path.join(root, 'android/app/src/main/assets/dait-lesson.js'));
  assert.equal(lesson.id, 'starry');
  assert.equal(lesson.pieces.length, 32);
  assert.equal(new Set(lesson.pieces.map(p => p.clip)).size, 32);
  assert(lesson.pieces.every(p => p.text.length > 0 && p.text.length <= 1200 && !p.voiced));
  assert(fs.readFileSync(path.join(temp, 'voice/수업-대본.csv'), 'utf8') === fs.readFileSync(path.join(here, '음원제작.csv'), 'utf8'), 'Voice export must exactly match the actual builder');
  const plans = [8, 15].map(minutes => {
    const pieces = L.assemble(lesson, minutes);
    assert(L.fits(lesson, minutes));
    assert.equal(L.isShort(pieces), minutes === 8);
    assert.equal(pieces[0].kind, '도입');
    assert.equal(pieces.at(-1).kind, '정리');
    assert(pieces.every(p => p.kind !== '복습' && p.kind !== '짧은정리'));
    assert(L.totalSeconds(pieces) <= minutes * 60);
    const must = minutes === 8 ? L.shortOrder(lesson).filter(p => p.must) : L.required(lesson);
    assert(L.totalSeconds(must) <= minutes * 60 - 20);
    assert(must.every(p => pieces.includes(p)));
    const arrival = L.fitRemaining(pieces, 1, 30, lesson);
    assert.equal(arrival.wrapped, true);
    assert.equal(arrival.pieces.at(-1).id, 'f_s1');
    assert.equal(arrival.pieces.at(-1).kind, '짧은정리');
    assert(L.totalSeconds([arrival.pieces.at(-1)]) < 20);
    return {minutes, pieces: pieces.map(p => p.id), count: pieces.length, estimatedSeconds: +L.totalSeconds(pieces).toFixed(2), requiredSeconds: +L.totalSeconds(must).toFixed(2), omitted: lesson.pieces.filter(p => !!p.short === (minutes === 8) && !['복습', '짧은정리'].includes(p.kind) && !pieces.includes(p)).map(p => p.id), arrivalClosing: arrival.pieces.at(-1).id};
  });
  const report = {date: '2026-11-08', status: 'PASS', method: 'actual build-lessons.js and dait-lesson.js; isolated fixture; 4.62 chars/sec estimate', sourcePieces: lesson.pieces.length, basicPieces: 22, shortPieces: 10, sourceQuestions: lesson.pieces.filter(p => p.kind === '발문').length, audioProduced: 0, appIntegrated: false, plans};
  fs.writeFileSync(path.join(here, '기술확인.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  fs.rmSync(temp, {recursive: true, force: true});
}
