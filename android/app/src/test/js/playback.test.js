const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../../main/assets/dait-playback.js');
const Lesson = require('../../main/assets/dait-lesson.js');
const lessons = require('../../main/assets/dait-lessons.js');
test('사용자 멈춤은 시스템 재개 신호보다 우선하고 기존 run 속성도 같은 상태를 읽는다', () => {
 const session = new P.LessonSession(), run = session.attach({});
 session.interrupt(); assert.equal(session.state, 'interrupted'); run.paused = true;
 assert.equal(session.resumeFromSystem(), false); assert.equal(session.state, 'paused');
 run.paused = false; assert.equal(session.resumeFromSystem(), true); assert.equal(session.state, 'playing');
 run.done = true; assert.equal(session.resumeFromSystem(), false); assert.equal(session.state, 'ended');
});
test('주행 제한은 정해진 미디어 조작만 허용하고 상세 설정과 자유 탐색은 차단한다', () => {
 const p = new P.VehiclePolicy(); p.update(true);
 for(const c of ['play','pause','seek-relative','volume']) assert.equal(p.allows(c),true);
 for(const c of ['settings','seek-absolute']) assert.equal(p.allows(c),false);
 p.update(false); assert.equal(p.allows('settings'),true);
});
test('생각할 시간과 교시 휴식은 배속으로 줄이지 않는다', () => {
 const question = { text:'질문',seconds:20,wait:10 }, rest={text:'',seconds:60,kind:'쉬는시간'};
 assert.equal(Lesson.playbackSeconds([question],2),20);
 assert.equal(Lesson.playbackSeconds([rest],2),60);
 const planner = new P.ArrivalPlanner(Lesson);
 assert.equal(planner.remaining([question],0,0,2),20);
 assert.equal(planner.remaining([question],0,25,2),5);
});
test('배속별 도착 계획은 실제 발화·생각 시간을 합친 벽시계 예산 안에 선택 조각을 맞춘다', () => {
 const lesson = lessons.find(x=>x.id==='sky'), pieces=Lesson.assemble(lesson,30);
 for(const rate of [.8,1,2]) {
  const fitted = Lesson.fitRemaining(pieces,0,300,lesson,rate);
  if(!fitted.wrapped) assert.ok(Lesson.playbackSeconds(fitted.pieces.slice(1),rate)<=280+.01);
 }
});
test('설정 저장소는 손상된 값은 복원하지 않고 저장 실패를 호출자에게 알린다', () => {
 const data = new Map(), store = new P.SettingsStore({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)});
 data.set('x','bad'); assert.equal(store.read('x',7),7);
 store.write('x',{back:15}); assert.deepEqual(store.read('x',null),{back:15});
 const broken = new P.SettingsStore({setItem(){throw Error('quota')}}); assert.throws(()=>broken.write('x',1),/quota/);
});
