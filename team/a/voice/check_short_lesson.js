// Use the real CSV parser and assembler without writing app files.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = path.resolve(__dirname, '../../..');
const lessonId = process.argv[2] || 'dongbaek';
assert(['dongbaek', 'ai'].includes(lessonId));
const title = lessonId === 'ai' ? '인공지능' : '동백꽃';
const tool = path.join(root, 'tools/build-lessons.js');
const context = { require, __dirname: path.dirname(tool), console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(tool, 'utf8').split('const made = build();')[0], context);
const source = path.join(root, `team/a/lessons/${title}-짧은판.csv`);
const rows = context.readTable(source);
assert.equal(rows.length, 11);
assert.equal(new Set(rows.map(row => row['조각'])).size, 11);
assert(rows.every(row => row['판'] === '8' && !/[0-9]/.test(row['대사'])));
const reportPath = path.join(__dirname, `delivery/${lessonId}-short/report.json`);
const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath)) : null;
const lengths = Object.fromEntries((report?.clips || []).map(clip => [`lesson/${clip.id}`, clip.duration]));
const pieces = rows.map(row => context.buildPiece(lessonId, row, lengths, source));
const rules = require(path.join(root, 'android/app/src/main/assets/dait-lesson.js'));
const original = require(path.join(root, 'android/app/src/main/assets/dait-lessons.js')).find(l => l.id === lessonId);
const lesson = { ...original, pieces: [...original.pieces, ...pieces] };
const choices = [5, 6, 7, 8, 9].map(minutes => {
  const selected = rules.assemble(lesson, minutes);
  return { minutes, fits: rules.fits(lesson, minutes), seconds: rules.totalSeconds(selected), pieces: selected.map(p => p.id) };
});
if (report) {
  assert.equal(report.exported, 11);
  assert.equal(report.clips.length, 11);
  for (const choice of choices) {
    assert(choice.fits, `${choice.minutes} minutes does not fit`);
    assert(choice.pieces.every(id => /^m\d+$/.test(id)));
    assert(choice.seconds <= choice.minutes * 60);
  }
}
assert(pieces.every(p => p.short));
assert.equal(pieces.filter(p => p.must).length, 8);
for (let mask = 0; mask < 8; mask++) {
  let extra = 0;
  const selected = pieces.filter(p => p.must || (mask & (1 << extra++)));
  assert.equal(selected[0].id, 'm1');
  assert.equal(selected.at(-1).id, 'm11');
  assert(selected.some(p => p.id === 'm3') && selected.some(p => p.id === 'm6'));
}
const output = { source: `team/a/lessons/${title}-짧은판.csv`, measured: !!report, choices };
console.log(JSON.stringify(output, null, 2));
fs.writeFileSync(path.join(__dirname, `${title}-짧은판-조립검사.json`), JSON.stringify(output, null, 2));
