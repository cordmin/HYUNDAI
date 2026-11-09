const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DaitPalette = require('../../main/assets/dait-palette.js');

function loadAppearance(values = {}, writable = true) {
  const store = JSON.parse(JSON.stringify(values)), styles = {}, classes = new Set();
  const host = { style: { setProperty(name, value) { styles[name] = value; } }, dataset: {}, setAttribute() {}, classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); }, contains(name) { return classes.has(name); } } };
  const context = { DaitPalette,
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
  assert.ok(DaitPalette.contrast(result.styles['--ink'], result.styles['--card']) >= 7);
  assert.ok(DaitPalette.contrast(result.styles['--muted'], result.styles['--card']) >= 4.5);
  assert.deepEqual(result.store['dait.pearl.colors.v3'], saved);
});

test('처음 실행하거나 저장소가 막혀 있어도 로즈 배경을 그린다', () => {
  const result = loadAppearance({}, false);
  assert.equal(result.styles['--bg-top'], '#f8e9eb');
  assert.equal(result.styles['--bg-bottom'], '#ecd9df');
  assert.ok(DaitPalette.contrast(result.styles['--ink'], result.styles['--card']) >= 7);
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


test('배경 두 색에서 재질·강조색·로고를 함께 만들고 무채색에는 다른 색을 섞지 않는다', () => {
  const colors = [{start:'#4df66b',end:'#191d18'},{start:'#c7e8ff',end:'#203b86'},{start:'#ffba45',end:'#39200e'},{start:'#000000',end:'#ffffff'}];
  for (const c of colors) for (const mode of ['light','dark']) {
    const p=DaitPalette.derive(c,mode);
    assert.ok(DaitPalette.contrast(p.tokens['--lilac'],p.tokens['--on-lilac'])>=4.5);
    assert.ok(DaitPalette.contrast(p.tokens['--ink'],p.tokens['--card'])>=7);
    assert.ok(DaitPalette.contrast(p.tokens['--muted'],p.tokens['--card'])>=4.5);
    assert.ok(DaitPalette.contrast(p.tokens['--lilac'],p.tokens['--soft'])>=3);
    assert.ok(p.logo(true).every(x=>DaitPalette.contrast(x,'#ffffff')>=3));
    assert.ok(p.logo(false).every(x=>DaitPalette.contrast(x,'#000000')>=3));
    if(p.neutral) assert.match(p.tokens['--lilac'], /^#([0-9a-f]{2})\1\1$/);
  }
  const green=DaitPalette.derive(colors[0],'dark'), blue=DaitPalette.derive(colors[1],'dark');
  for (const role of ['--lilac','--soft','--glass-menu','--wave-top']) assert.notEqual(green.tokens[role],blue.tokens[role]);
  assert.notDeepEqual(green.logo(false),blue.logo(false));
});

test('달 버튼을 오가면 각 모드에 저장한 배경과 모든 강조색도 함께 복원한다', () => {
  const saved={mode:'light',light:{start:'#8fe7a2',end:'#e4f9ec'},dark:{start:'#14266b',end:'#070a1c'}};
  const result=loadAppearance({'dait.pearl.colors.v3':saved});
  const accent=result.styles['--lilac'], material=result.styles['--glass-menu'];
  result.context.window.togglePearlTheme();
  assert.notEqual(result.styles['--lilac'],accent); assert.notEqual(result.styles['--glass-menu'],material);
  result.context.window.togglePearlTheme();
  assert.equal(result.styles['--lilac'],accent); assert.equal(result.styles['--glass-menu'],material);
  assert.deepEqual(result.store['dait.pearl.colors.v3'],saved);
});

test('노랑·라임을 포함한 RGB 격자 432배색에서 조작·본문 대비를 지킨다', () => {
  for(let r=0;r<=255;r+=51) for(let g=0;g<=255;g+=51) for(let b=0;b<=255;b+=51) for(const mode of ['light','dark']) {
    const start='#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
    const t=DaitPalette.derive({start,end:'#444444'},mode).tokens;
    assert.ok(DaitPalette.contrast(t['--lilac'],t['--on-lilac'])>=4.5,start+mode);
    assert.ok(DaitPalette.contrast(t['--lilac'],t['--soft'])>=3,start+mode);
    assert.ok(DaitPalette.contrast(t['--muted'],t['--card'])>=4.5,start+mode);
  }
});
