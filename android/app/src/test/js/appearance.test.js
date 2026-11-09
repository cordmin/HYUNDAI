const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadAppearance(values = {}, writable = true) {
  const store = JSON.parse(JSON.stringify(values)), styles = {}, classes = new Set();
  const host = { dataset: {}, setAttribute() {}, classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); }, contains(name) { return classes.has(name); } } };
  const context = {
    document: { querySelector: () => host, documentElement: { style: { setProperty(name, value) { styles[name] = value; } } } },
    settingsStore: { read: (key, fallback) => store[key] ?? fallback, write(key, value) { if (!writable) throw Error('unavailable'); store[key] = JSON.parse(JSON.stringify(value)); } },
    appEvents: { on() {} }, window: { addEventListener() {} }, requestAnimationFrame: () => 1, isDrivingMode: false
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../main/assets/dait-appearance.js'), 'utf8'), context);
  return { store, styles, host, context };
}

test('이전 파란 테마는 원본을 보관하고 선택한 모드의 로즈 테마로 한 번 전환한다', () => {
  const old = { mode: 'dark', light: { start: '#f8e9eb', end: '#e7edf5' }, dark: { start: '#151719', end: '#1f2937' } };
  const result = loadAppearance({ 'dait.pearl.colors.v2': old });
  assert.deepEqual(result.store['dait.pearl.colors.v2'], old);
  assert.equal(result.host.dataset.colorMode, 'dark');
  assert.equal(result.styles['--bg-top'], '#30212a');
  assert.equal(result.styles['--bg-bottom'], '#452e38');
  assert.equal(result.store['dait.pearl.colors.v3'].light.end, '#ecd9df');
});

test('새 테마에서 사용자가 저장한 라이트·다크 배색은 다시 열어도 유지한다', () => {
  const saved = { mode: 'light', light: { start: '#fffafb', end: '#e2c3cf' }, dark: { start: '#352832', end: '#573746' } };
  const result = loadAppearance({ 'dait.pearl.colors.v3': saved });
  assert.deepEqual(result.store['dait.pearl.colors.v3'], saved);
  assert.equal(result.styles['--bg-top'], '#fffafb');
  assert.equal(result.styles['--bg-bottom'], '#e2c3cf');
});

test('라이트 모드에 검은 배경을 골라도 밝은 설정 패널의 글자를 흰색으로 바꾸지 않는다', () => {
  const saved = { mode: 'light', light: { start: '#000000', end: '#111111' }, dark: { start: '#30212a', end: '#452e38' } };
  const result = loadAppearance({ 'dait.pearl.colors.v3': saved });
  assert.equal(result.host.dataset.colorMode, 'light');
  assert.equal(result.styles['--ink'], '#352832');
  assert.equal(result.styles['--muted'], '#715e69');
  assert.deepEqual(result.store['dait.pearl.colors.v3'], saved);
});

test('처음 실행하거나 저장소가 막혀 있어도 로즈 배경을 그린다', () => {
  const result = loadAppearance({}, false);
  assert.equal(result.styles['--bg-top'], '#f8e9eb');
  assert.equal(result.styles['--bg-bottom'], '#ecd9df');
  assert.equal(result.styles['--ink'], '#352832');
});

test('구형 단일 배색과 손상된 새 배색도 모드를 보존하며 안전하게 이관한다', () => {
  const result = loadAppearance({ 'dait.pearl.colors.v1': { start: '#111111', end: '#222222' }, 'dait.pearl.colors.v3': { mode: 'light', light: {} } });
  assert.equal(result.host.dataset.colorMode, 'dark');
  assert.equal(result.styles['--bg-bottom'], '#452e38');
});

test('달 버튼은 밝은 화면과 어두운 화면을 오가며 저장한 배색을 쓴다', () => {
  const result = loadAppearance({});
  result.context.window.togglePearlTheme();
  assert.equal(result.host.dataset.colorMode, 'dark');
  assert.equal(result.styles['--bg-top'], '#30212a');
  assert.equal(result.store['dait.pearl.colors.v3'].mode, 'dark');
  result.context.isDrivingMode = true; result.context.window.togglePearlTheme();
  assert.equal(result.host.dataset.colorMode, 'dark'); // 주행 중에는 바꾸지 않는다
  result.context.isDrivingMode = false; result.context.window.togglePearlTheme();
  assert.equal(result.host.dataset.colorMode, 'light');
  assert.equal(result.styles['--bg-top'], '#f8e9eb');
});
