const test=require('node:test');
const assert=require('node:assert/strict');
const {Playlist}=require('../../main/assets/dait-playlist.js');
const lessons=['a','b','c','d'].map(id=>({id}));

test('바로 다음은 앞에, 맨 뒤 추가는 뒤에 넣으며 중복 수업도 각각 편집한다',()=>{
  const p=new Playlist(lessons);p.add('a');p.add('b');p.add('c','next');p.add('a');
  assert.deepEqual(p.items.map(i=>i.lesson),['c','a','b','a']);
  const repeated=p.items[3].key;p.move(repeated,-1);p.remove(p.items[1].key);
  assert.deepEqual(p.items.map(i=>i.lesson),['c','a','b']);
  assert.equal(p.move(p.items[0].key,-1),false);
});
test('직접 고른 재생목록이 시리즈 다음 편보다 우선한다',()=>{
  const p=new Playlist(lessons,{},[{title:'시리즈',lessons:['a','b','c']}]);
  assert.deepEqual(p.next('a'),{lesson:'b',source:'series'});
  p.add('d');assert.equal(p.next('a').lesson,'d');p.remove(p.items[0].key);
  p.followSeries=false;assert.equal(p.next('a'),null);
});
test('시리즈는 완주한 이전 편만 인정하고, 다음 편이 없어도 순환하지 않는다',()=>{
  const p=new Playlist(lessons,{},[{title:'순서',lessons:['a','b','c']}]);
  assert.equal(p.prior('b',[]),'a');assert.equal(p.prior('b',[{lesson:'a',finished:false}]),'a');
  assert.equal(p.prior('b',[{lesson:'a',finished:true}]),null);assert.equal(p.next('c'),null);
});
test('저장·복원은 설정과 순서를 보존하며 잘못되거나 사라진 수업은 걸러 낸다',()=>{
  const p=new Playlist(lessons,{items:[null,{lesson:'a'},{lesson:'missing'}],series:[null,{title:'test',lessons:['a','b','b']}],autoNext:false,cues:false});
  p.add('c','next');const q=new Playlist(lessons,p.snapshot());
  assert.equal(q.autoNext,false);assert.equal(q.cues,false);assert.deepEqual(q.items.map(i=>i.lesson),['c','a']);
  assert.equal(q.series.length,0);q.add('d');assert.equal(new Set(q.items.map(i=>i.key)).size,3);
});
test('순서가 정의되지 않은 수업을 시리즈로 추정하지 않고 제목·편수를 검증한다',()=>{
  const p=new Playlist(lessons);assert.equal(p.seriesFor('a'),null);assert.equal(typeof p.saveSeries,'undefined');
  assert.equal(new Playlist(lessons,{},[{title:'한 편',lessons:['a','a']}]).series.length,0);assert.equal(p.add('missing'),false);
});

test('제작자 시리즈만 읽고 사용자 저장소에서 시리즈를 만들거나 복원하지 않는다',()=>{
 const catalog=[{id:'official',title:'공식 순서',lessons:['a','b'],outros:{a:{clip:'lesson/series_a_outro',seconds:3,text:'다음 편을 기대해 주세요.'},b:{clip:'https://invalid.test',seconds:3}}}];
 const p=new Playlist(lessons,{series:[{title:'내 순서',lessons:['c','d']}]},catalog);
 assert.equal(p.series[0].outros.a.clip,'lesson/series_a_outro');assert.equal(p.series[0].outros.b,undefined);
 assert.equal(p.snapshot().series,undefined);const q=new Playlist(lessons,p.snapshot(),catalog);assert.equal(q.series.length,1);assert.equal(q.series[0].id,'official');
});

test('시리즈 예고 음원이 없는 자료는 제출용 검사에서 차단한다',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dait-series-'));
 try{const file=path.join(dir,'series.js');fs.writeFileSync(file,"module.exports=[{title:'시험',lessons:['dongbaek','starry'],outros:{dongbaek:{clip:'lesson/definitely_missing_series',seconds:3}}}]");
 const fixture=path.join(dir,'lessons.js');fs.writeFileSync(fixture,'module.exports='+JSON.stringify(require('../../main/assets/dait-lessons.js').filter(x=>['dongbaek','starry'].includes(x.id))));
 const result=spawnSync(process.execPath,[path.join(__dirname,'../../../../../tools/check-lesson-voices.js'),fixture,file],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/시리즈 연결 음원/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('재생목록의 이어 듣기 의도는 저장되고 잘못된 순서 이동은 목록을 망가뜨리지 않는다',()=>{
 const p=new Playlist(lessons);p.add('a','last',true);p.add('b');const before=p.snapshot();
 assert.equal(p.move(p.items[0].key,NaN),false);assert.deepEqual(p.snapshot(),before);
 const q=new Playlist(lessons,p.snapshot());assert.equal(q.next('c').fromStop,true);
});

test('방금 추가한 고유 항목만 바로 다음으로 옮기고 사라진 항목은 대신 옮기지 않는다',()=>{
 const p=new Playlist(lessons);p.add('a');p.add('b');p.add('a');const keys=p.items.map(i=>i.key);
 assert.equal(p.promote(keys[2]),true);assert.deepEqual(p.items.map(i=>i.key),[keys[2],keys[0],keys[1]]);assert.equal(p.items.length,3);
 p.remove(keys[2]);assert.equal(p.promote(keys[2]),false);assert.deepEqual(p.items.map(i=>i.key),[keys[0],keys[1]]);
});
