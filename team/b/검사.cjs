const fs=require('fs'), path=require('path'), vm=require('vm'), assert=require('assert');
const base=path.resolve(__dirname,'../..'), out=path.join(base,'team/b');
const R=require(path.join(base,'android/app/src/main/assets/dait-lesson.js'));
const original=require(path.join(base,'android/app/src/main/assets/dait-lessons.js')).find(l=>l.id==='dongbaek');
const src=fs.readFileSync(path.join(base,'tools/build-lessons.js'),'utf8').split('const made = build();')[0];
const ctx={require,console,__dirname:path.join(base,'tools')}; vm.createContext(ctx); vm.runInContext(src,ctx);
const read=f=>ctx.readTable(path.join(out,'lessons',f));
const revisedRows=read('동백꽃-수정안.csv'), shortRows=read('동백꽃-짧은판.csv');
const originalBy=Object.fromEntries(original.pieces.map(p=>[p.id,p]));
let errors=[];
function ensure(x,s){if(!x) errors.push(s)}
const requiredHead=['조각','판','구분','필수','수준','기다림','화면 문장','대사'];
for(const [file,rows] of [['수정안',revisedRows],['짧은판',shortRows]]){
  ensure(new Set(rows.map(r=>r['조각'])).size===rows.length,`${file}: 조각 중복`);
  for(const row of rows){
    ensure(JSON.stringify(Object.keys(row))===JSON.stringify(requiredHead),`${file}: 머리글`);
    try{ctx.buildPiece('dongbaek',row,{},file)}catch(e){errors.push(e.message)}
    ensure(!/[0-9]/.test(row['대사']),`${file} ${row['조각']}: 대사 아라비아 숫자`);
    ensure(!row['화면 문장'].includes(','),`${file} ${row['조각']}: 화면 쉼표`);
    if(row['구분']==='발문') ensure(row['수준']&&row['기다림']==='9',`${file}: 발문 수준/기다림`);
  }
}
function make(rows){return {...original,pieces:rows.map(row=>{
  const p=ctx.buildPiece('dongbaek',row,{},'proposal');
  const prev=originalBy[p.id];
  // 문장이 바뀐 조각에는 과거 음원 길이를 쓰지 않는다.
  if(prev&&prev.text===p.text) p.seconds=prev.seconds;
  delete p.voiced; return p;
})};}
const proposed=make(revisedRows), combined=make([...revisedRows,...shortRows]);
function report(lesson,n){const p=R.assemble(lesson,n);return {minutes:n,fits:R.fits(lesson,n),seconds:Math.round(R.lessonSeconds(p)*100)/100,spareSeconds:Math.round((n*60-R.lessonSeconds(p))*100)/100,ids:p.map(x=>x.id),questions:p.filter(x=>x.kind==='발문').map(x=>({id:x.id,level:x.level})),short:R.isShort(p)};}
const current=[5,7,8,10,12,15,20,30].map(n=>report(original,n));
const proposal=[5,7,8,10,12,15,20,30].map(n=>report(combined,n));
for(const n of [5,6,7,8,9]){
  const result=report(combined,n); ensure(result.fits&&result.short,`${n}분: 짧은 판 선택 실패`);
  ensure(result.seconds<=n*60,`${n}분: 시간 초과`);
  for(const id of ['m1','m2','m3','m4','m6','m8','m10','m11']) ensure(result.ids.includes(id),`${n}분: 필수 ${id} 누락`);
}
for(const n of [10,15,30]){
  const result=report(combined,n);ensure(!result.short,`${n}분: 원래 판 유지 실패`);
  for(const id of ['b4','b7','c1','c2']) ensure(result.ids.includes(id),`${n}분: 의미 연결 ${id} 누락`);
}
ensure(R.recommend([combined],4,[]).length===0,'4분 이하 추천 제외');
const shortMust=combined.pieces.filter(p=>p.short&&p.must);
const requiredChars=shortMust.reduce((s,p)=>s+p.text.length,0);
const slowSeconds=requiredChars/3.8+shortMust.reduce((s,p)=>s+(p.wait||0),0);
ensure(slowSeconds<=280,'느린 말속도 초당 3.8글자에서 필수 대본 5분 여유 부족');
let optionalCombinations=0;
const optionalIds=shortRows.filter(r=>r['필수']==='아니오').map(r=>r['조각']);
for(let mask=0;mask<(1<<optionalIds.length);mask++){
 const rows=shortRows.filter(r=>r['필수']==='예'||(mask&(1<<optionalIds.indexOf(r['조각']))));
 const ids=rows.map(r=>r['조각']);
 for(const id of ['m1','m2','m3','m4','m6','m8','m10','m11']) ensure(ids.includes(id),`선택 ${mask}: 핵심 ${id}`);
 ensure(ids.indexOf('m2')<ids.indexOf('m3')&&ids.indexOf('m3')<ids.indexOf('m4')&&ids.indexOf('m4')<ids.indexOf('m8')&&ids.indexOf('m8')<ids.indexOf('m10'),`선택 ${mask}: 장면-발문-답 순서`);
 ensure(ids.at(-1)==='m11',`선택 ${mask}: 숙제 끝맺음`); optionalCombinations++;
}
const changes=JSON.parse(fs.readFileSync(path.join(out,'변경목록.json'),'utf8'));
const result={baseCommit:'3f860bc3cd8bde654f25302959f985a384e72da0',method:'현행 build-lessons.js 파서·buildPiece와 dait-lesson.js 조립 함수를 그대로 호출. 수정 대사·신규 대사만 초당 4.62글자 추정, 미수정 대사는 기존 실측 음원 길이. 발문 기다림 포함. 실측·추정 구분.',current,proposal,short:{pieces:shortRows.length,required:shortMust.length,requiredChars,allChars:shortRows.reduce((s,r)=>s+r['대사'].length,0),slowSpeechCharsPerSecond:3.8,slowRequiredSeconds:Math.round(slowSeconds*100)/100,optionalCombinations},changedVoiceIds:changes['변경'].filter(x=>x['음원_재생성']).map(x=>x['조각']),errors};
fs.writeFileSync(path.join(out,'조립-검사결과.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({errors,short:result.short,current15:current.find(x=>x.minutes===15),current30:current.find(x=>x.minutes===30),proposal5:proposal[0],proposal15:proposal.find(x=>x.minutes===15)},null,2));
if(errors.length) process.exitCode=1;
