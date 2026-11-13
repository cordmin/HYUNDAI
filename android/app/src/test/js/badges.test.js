const test=require('node:test'),assert=require('node:assert/strict');
const Badges=require('../../main/assets/dait-badges.js');
const lessons=[{id:'a',title:'첫 이야기',subject:'국어'},{id:'b',title:'수의 이야기',subject:'수학'},{id:'c',title:'빛의 이야기',subject:'과학'}];
for(const l of lessons)l.pieces=[{clip:'test/'+l.id,voiced:true}];
const record=(lesson,ymd,finished=true)=>({lesson,ymd,finished});
test('완료하지 않은 기록은 지급하지 않고 첫 완료 날짜와 배경을 보존한다',()=>{
 assert.deepEqual(Badges.sync(null,[record('a','20261110',false)],lessons).awards,{});
 const s=Badges.sync(null,[record('a','20261110')],lessons);
 assert.equal(s.awards.korean.day,'20261110');assert.match(s.awards.korean.reason,/첫 이야기/);
 const next=Badges.sync(s,[record('a','20261111')],lessons);
 assert.equal(next.awards.korean.day,'20261110');assert.equal(Object.keys(next.completed).length,1);
});
test('반복·짧은 판은 수업 수를 늘리지 않고 새로운 학습일에는 포함한다',()=>{
 const s=Badges.sync(null,[1,2,3,4,5].map(d=>({...record('a',`2026110${d}`),short:true})),lessons);
 assert.equal(s.awards.exploration,undefined);assert.equal(s.awards['everyday-discoverer'].day,'20261105');
 const truncated=Badges.sync(s,[],lessons);assert.equal(truncated.days.length,5);assert.deepEqual(truncated.awards,s.awards);
});
test('세 수업과 세 분야는 따로 집계하고 과거 기록을 날짜 순으로 이관한다',()=>{
 const s=Badges.sync(null,[record('c','20261103'),record('b','20261102'),record('a','20261101')],lessons);
 assert.equal(s.awards.exploration.day,'20261103');assert.equal(s.awards['well-rounded-explorer'].day,'20261103');
 assert.equal(s.awards['first-discovery'].day,'20261101');
});
test('공식 시리즈가 없거나 필수편이 비었거나 누락된 경우 완주 배지는 지급하지 않는다',()=>{
 const records=lessons.map(x=>record(x.id,'20261110'));
 for(const series of [[],[{episodes:[]}],[{episodes:['a','missing']}]])assert.equal(Badges.sync(null,records,lessons,series).awards['series-completion'],undefined);
 const s=Badges.sync(null,records,lessons,[{title:'첫 시리즈',lessons:['a','b']}]);
 assert.equal(s.awards['series-completion'].day,'20261110');
 assert.equal(Badges.sync(s,[],lessons,[]).awards['series-completion'].day,'20261110');
});
test('날짜 없는 과거 완료에 오늘 날짜를 지어내지 않는다',()=>{
 const s=Badges.sync(null,[record('a','invalid')],lessons);
 assert.equal(s.awards.korean.day,null);assert.match(Badges.dateLabel(null),/날짜 정보 없음/);
 assert.match(Badges.dateLabel('20260231'),/날짜 정보 없음/);
});

test('미획득 조건은 현재 수업·분야·날짜 진행량을 중복 없이 보여 준다',()=>{
 const s=Badges.sync(null,[record('a','20261110'),record('a','20261111'),record('b','20261111')],lessons);
 assert.match(Badges.progress('exploration',s,lessons).label,/2\/3편 · 1편/);
 assert.equal(Badges.progress('well-rounded-explorer',s,lessons).current,2);
 assert.equal(Badges.progress('everyday-discoverer',s,lessons).current,2);
 assert.equal(Badges.progress('science',s,lessons).current,0);
 const series=[{title:'연결',lessons:['a','c']}];assert.match(Badges.progress('series-completion',s,lessons,series).label,/1\/2편/);
 assert.match(Badges.progress('series-completion',s,lessons,[]).label,/준비/);
});
