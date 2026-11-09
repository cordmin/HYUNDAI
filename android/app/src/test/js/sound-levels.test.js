// 재생 화면 소리 막대(저음~고음 5칸) 표가 수업 음원과 맞는지 본다.
// 음원을 새로 만들었으면: python tools/build-sound-levels.py
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const assets = path.join(__dirname, '../../main/assets');
const box = {};
vm.runInNewContext(fs.readFileSync(path.join(assets, 'dait-sound-levels.js'), 'utf8') + '\nthis.T = DAIT_SOUND_LEVELS;', box);

test('수업 음원마다 저음~고음 5칸 소리 크기 표가 있다', () => {
  const { fps, bands, clips } = box.T;
  assert.equal(bands, 5);
  assert.ok(fps > 0);
  const files = fs.readdirSync(path.join(assets, 'voices/lesson')).filter(name => name.endsWith('.m4a')).map(name => `lesson/${name.slice(0, -4)}`).sort();
  assert.deepEqual(Object.keys(clips).sort(), files);
  for (const [clip, data] of Object.entries(clips)) {
    assert.match(data, /^[0-9]+$/, clip);
    assert.equal(data.length % bands, 0, clip);
    assert.ok(/[1-9]/.test(data), `${clip}: 소리가 하나도 없다`);
  }
});
