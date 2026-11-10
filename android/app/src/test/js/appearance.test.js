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

test('이전 사용자 배경은 보존하고 선택 모드를 새 화이트·블랙 기본값으로 이관한다', () => {
 const old={mode:'dark',light:{start:'#44ff88',end:'#baffcc'},dark:{start:'#151719',end:'#1f2937'}};
 const r=loadAppearance({'dait.pearl.colors.v3':old});
 assert.deepEqual(r.store['dait.pearl.colors.v3'],old);
 assert.equal(r.host.dataset.colorMode,'dark');assert.equal(r.styles['--bg-top'],'#090b0e');
 assert.equal(r.store['dait.pearl.colors.v4'].light.start,'#ffffff');
 assert.equal(r.store['dait.pearl.colors.v4'].dark.accent,'#2563eb');
});
test('모드별 포인트 색을 복원하고 배경은 중립색으로 유지한다',()=>{
 const saved={mode:'light',light:{accent:'#16834e'},dark:{accent:'#7c3aed'}};
 const r=loadAppearance({'dait.pearl.colors.v4':saved});const accent=r.styles['--lilac'];
 assert.equal(r.styles['--bg-top'],'#ffffff');assert.equal(r.host.dataset.settingsPalette,'neutral');
 r.context.window.togglePearlTheme();assert.equal(r.styles['--bg-top'],'#090b0e');assert.notEqual(r.styles['--lilac'],accent);
 r.context.window.togglePearlTheme();assert.equal(r.styles['--lilac'],accent);
 assert.equal(r.store['dait.pearl.colors.v4'].light.accent,'#16834e');assert.equal(r.store['dait.pearl.colors.v4'].dark.accent,'#7c3aed');
 r.context.isDrivingMode=true;r.context.window.togglePearlTheme();assert.equal(r.host.dataset.colorMode,'light');
});
test('저장 공간이 없어도 화이트 기본 배경과 읽을 수 있는 본문을 그린다',()=>{
 const r=loadAppearance({},false);assert.equal(r.styles['--bg-top'],'#ffffff');
 assert.ok(DaitPalette.contrast(r.styles['--ink'],r.styles['--card'])>=7);
 assert.ok(DaitPalette.contrast(r.styles['--muted'],r.styles['--card'])>=4.5);
});
test('손상된 새 설정은 구형 모드를 읽어 복구하고 원본은 지우지 않는다',()=>{
 const legacy={start:'#111111',end:'#222222'};
 const r=loadAppearance({'dait.pearl.colors.v1':legacy,'dait.pearl.colors.v3':{mode:'light',light:{}},'dait.pearl.colors.v4':{mode:'dark',dark:{accent:'bad'}}});
 assert.equal(r.host.dataset.colorMode,'dark');assert.deepEqual(r.store['dait.pearl.colors.v1'],legacy);
});
test('8개 포인트 색의 라이트·다크 조작부와 본문 대비를 확인한다',()=>{
 for(const accent of ['#2563eb','#7c3aed','#c72975','#d74b36','#a86b12','#16834e','#007d87','#536378'])for(const mode of ['light','dark']){
  const t=DaitPalette.derive({start:mode==='light'?'#ffffff':'#090b0e',end:mode==='light'?'#eef1f5':'#1b2028',accent},mode).tokens;
  assert.ok(DaitPalette.contrast(t['--lilac'],t['--on-lilac'])>=4.5,accent+mode);
  assert.ok(DaitPalette.contrast(t['--ink'],t['--card'])>=7,accent+mode);
  assert.ok(DaitPalette.contrast(t['--muted'],t['--card'])>=4.5,accent+mode);
 }
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

test('노랑·라임을 포함한 RGB 격자 432배색에서 조작·본문 대비를 지킨다', () => {
  for(let r=0;r<=255;r+=51) for(let g=0;g<=255;g+=51) for(let b=0;b<=255;b+=51) for(const mode of ['light','dark']) {
    const start='#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
    const t=DaitPalette.derive({start,end:'#444444'},mode).tokens;
    assert.ok(DaitPalette.contrast(t['--lilac'],t['--on-lilac'])>=4.5,start+mode);
    assert.ok(DaitPalette.contrast(t['--lilac'],t['--soft'])>=3,start+mode);
    assert.ok(DaitPalette.contrast(t['--muted'],t['--card'])>=4.5,start+mode);
  }
});
