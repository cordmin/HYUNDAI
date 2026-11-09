const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assets = path.join(__dirname, '../../main/assets');
const app = require('./app-files.js').appSource();
const html = fs.readFileSync(path.join(assets, 'dait-preview.html'), 'utf8') + app;
const engine = app.slice(app.indexOf('let isIntroPlaying = false;'), app.indexOf('// 제출용 앱에는 시연 버튼'));
function fixture(state = 'running', rejectResume = false) {
  const notes = [], levels = [], timers = new Map();
  let created = 0, resumed = 0, stopped, disconnected = 0, oscillator, serial = 0;
  class AudioContext {
    currentTime = 10;
    destination = {};
    state = state;
    constructor() { created++; }
    async resume() { resumed++; if (rejectResume) throw Error('blocked'); this.state = 'running'; }
    createOscillator() {
      oscillator = { frequency: { setValueAtTime: (hz,t) => notes.push([hz,t]), exponentialRampToValueAtTime: (hz,t) => notes.push([hz,t]) }, connect() {}, disconnect() { disconnected++; }, start() {}, stop(t) { stopped=t; } };
      return oscillator;
    }
    createGain() { return { gain: { setValueAtTime: (v,t) => levels.push([v,t]), linearRampToValueAtTime: (v,t) => levels.push([v,t]), exponentialRampToValueAtTime: (v,t) => levels.push([v,t]) }, connect() {}, disconnect() { disconnected++; } }; }
  }
  const element = () => ({ hidden: true, style: {}, classList: { add() {}, remove() {} }, getTotalLength: () => 120, getBoundingClientRect: () => ({left:0,top:0,width:100,height:34}) });
  const elements = new Map();
  const context = { window: { AudioContext }, isDrivingMode: false, homeStale: false, currentMode: null,
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id,element()); return elements.get(id); }, querySelector: () => element(), querySelectorAll: () => [] },
    setTimeout(fn,ms) { timers.set(++serial,{fn,ms}); return serial; }, clearTimeout: id => timers.delete(id), requestAnimationFrame: fn => fn() };
  vm.createContext(context); vm.runInContext(engine,context);
  return { context, notes, levels, timers, elements, stats: () => ({created,resumed,stopped,disconnected,oscillator}) };
}

test('점 소리는 짧게 올라갔다 내려오며 재생 뒤 오디오 노드를 정리한다', () => {
  const f=fixture();f.context.playDotPopSound();
  assert.ok(f.notes[1][0] > f.notes[0][0] && f.notes[2][0] < f.notes[1][0]);
  assert.ok(f.stats().stopped - 10 < .3);
  assert.equal(f.levels[0][0],0);assert.ok(f.levels.at(-1)[0] < .002);
  f.stats().oscillator.onended();assert.equal(f.stats().disconnected,2);
  f.context.isDrivingMode=true;f.notes.length=0;f.context.playDotPopSound();assert.equal(f.notes.length,0);
});

test('오디오 자동재생이 막혀도 시작 버튼 없이 인트로를 바로 진행한다', async () => {
  const f=fixture('suspended');
  f.context.window.AudioContext.prototype.resume = function () { return new Promise(() => {}); };
  f.context.playSplashIntro();
  assert.ok(f.timers.size>0);
  assert.ok(!html.includes('splashStartButton'));
  [...f.timers.values()].find(t=>t.ms===1120).fn();
  assert.equal(f.notes.length,0);
});

test('오디오를 재개하면 점 시점에 소리를 내고, 재개 실패도 화면을 멈추지 않는다', async () => {
  const f=fixture('suspended');f.context.playSplashIntro();
  await Promise.resolve();
  [...f.timers.values()].find(t=>t.ms===1120).fn();
  assert.ok(f.notes.length>0);assert.equal(f.stats().created,1);assert.equal(f.stats().resumed,1);
  const blocked=fixture('suspended',true);blocked.context.playSplashIntro();
  await Promise.resolve();assert.ok(blocked.timers.size>0);
});

test('인트로를 건너뛰면 점 소리 예약도 취소한다', async () => {
  const f=fixture();await f.context.playSplashIntro();f.context.skipSplashIntro();
  assert.ok(![...f.timers.values()].some(t=>t.ms===1120));assert.equal(f.notes.length,0);
});

test('오디오 API가 없어도 인트로는 오류 없이 계속된다', async () => {
  const f=fixture();f.context.window={};await f.context.playSplashIntro();f.context.playDotPopSound();
  assert.ok(f.timers.size>0);assert.equal(f.notes.length,0);
});

test('인트로 점은 필터 없는 원이고 링은 점 확대와 분리되어 로고 축소 전에 사라진다', () => {
  const markup = fs.readFileSync(path.join(assets, 'dait-preview.html'), 'utf8');
  const css = fs.readFileSync(path.join(assets, 'dait-base.css'), 'utf8');
  const group = markup.match(/<g id="splashDotGroup"[^>]*>([\s\S]*?)<\/g>/)[1];
  assert.match(group, /<circle id="splashDot"[^>]*\br="3\.2"/);
  assert.ok(!/filter=|splashDotRipple/.test(group));
  const duration = Number(css.match(/\.splash-dot-ripple\.expand\s*\{[^}]*animation:\s*rippleExpand\s*([\d.]+)s/)[1]) * 1000;
  const f = fixture(); f.context.playSplashIntro();
  const ring = [...f.timers.values()].find(timer => timer.fn.toString().includes("dotRipple.classList.add('expand')"));
  const moving = [...f.timers.values()].find(timer => timer.fn.toString().includes('brand.style.transform'));
  assert.ok(ring.ms + duration < moving.ms);
});

