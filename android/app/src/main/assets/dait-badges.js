/* Badge facts are kept independently from the capped recent-lesson list. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DaitBadges = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  const definitions = [
    ['first-discovery','첫 발견','처음 마친 수업에서 시작된 배움을 기념해요.','수업을 한 편 마치면 받을 수 있어요.'],
    ['korean','국어','언어와 문학에서 새로운 이야기를 만난 기록이에요.','국어 수업을 한 편 마치면 받을 수 있어요.','국어'],
    ['math','수학','수와 논리의 세계를 처음 탐색한 기록이에요.','수학 수업을 한 편 마치면 받을 수 있어요.','수학'],
    ['science','과학','일상 속 자연 현상의 원리를 만난 기록이에요.','과학 수업을 한 편 마치면 받을 수 있어요.','과학'],
    ['technology','기술','기술과 디지털 세상을 알아 가는 첫 기록이에요.','기술 수업을 한 편 마치면 받을 수 있어요.','기술'],
    ['music','음악','소리와 리듬에서 새로운 발견을 한 기록이에요.','음악 수업을 한 편 마치면 받을 수 있어요.','음악'],
    ['exploration','탐험','서로 다른 수업으로 배움의 폭을 넓힌 기록이에요.','서로 다른 수업 세 편을 마치면 받을 수 있어요.'],
    ['well-rounded-explorer','골고루 탐험가','다양한 분야를 골고루 만나 본 기록이에요.','서로 다른 세 과목의 수업을 한 편씩 마치면 받을 수 있어요.'],
    ['everyday-discoverer','생활 속 발견가','생활 속에 배움을 이어 온 날들을 기념해요.','수업을 마친 날이 총 5일이면 받을 수 있어요. 연속일 필요는 없어요.'],
    ['series-completion','시리즈 완주','하나의 이야기를 처음부터 끝까지 함께한 기록이에요.','공식 시리즈의 필수 수업을 모두 마치면 받을 수 있어요.']
  ].map(([id,name,meaning,condition,subject]) => ({id,name,meaning,condition,subject}));
  const validDay = value => {
    const s = String(value || '').replace(/-/g,'');
    if (!/^\d{8}$/.test(s)) return null;
    const y=+s.slice(0,4), m=+s.slice(4,6), d=+s.slice(6,8), date=new Date(y,m-1,d);
    return date.getFullYear()===y && date.getMonth()===m-1 && date.getDate()===d ? s : null;
  };
  function sync(previous, records, lessons, series = []) {
    const source = previous && previous.version === 1 ? previous : {};
    const state = {version:1, completed:{...(source.completed||{})}, days:[...(source.days||[])].filter(validDay), awards:{...(source.awards||{})}};
    const byId = new Map(lessons.map(l=>[l.id,l]));
    for (const record of records || []) {
      const lesson = record && record.finished === true && byId.get(record.lesson);
      if (!lesson) continue;
      const day = validDay(record.ymd), old = state.completed[lesson.id];
      if (!old || (day && (!old.day || day<old.day))) state.completed[lesson.id]={id:lesson.id,title:lesson.title,subject:lesson.subject,day};
      if (day) state.days.push(day);
    }
    state.days = [...new Set(state.days)].sort();
    const done=Object.values(state.completed).sort((a,b)=>(a.day||'99999999').localeCompare(b.day||'99999999'));
    const award=(id,items,reason,day=items.at(-1)?.day||null)=>{if(!state.awards[id])state.awards[id]={day,reason,lessonIds:items.map(x=>x.id)};};
    if(done.length)award('first-discovery',done.slice(0,1),`「${done[0].title}」 수업을 마치며 첫 배움을 기록했어요.`);
    for(const d of definitions.filter(d=>d.subject)){
      const first=done.find(x=>x.subject===d.subject);
      if(first)award(d.id,[first],`「${first.title}」 수업을 마치며 ${d.subject}의 첫 배움을 기록했어요.`);
    }
    if(done.length>=3)award('exploration',done.slice(0,3),'서로 다른 수업 세 편을 마쳤어요.');
    const subjects=[...new Map(done.map(x=>[x.subject,done.find(y=>y.subject===x.subject)])).values()];
    if(subjects.length>=3)award('well-rounded-explorer',subjects.slice(0,3),`${subjects.slice(0,3).map(x=>x.subject).join('·')} 수업을 마치며 세 분야를 만났어요.`);
    if(state.days.length>=5)award('everyday-discoverer',[],'수업을 마친 날이 총 다섯 날 쌓였어요. 쉬었던 날도 기록을 지우지 않아요.',state.days[4]);
    // No configured/published episodes means no series award, rather than vacuous completion.
    for(const item of series){
      const ids=(item.requiredEpisodeIds||item.lessons||item.episodes||[]).map(x=>typeof x==='string'?x:x?.lesson).filter(Boolean);
      if(ids.length<2 || new Set(ids).size!==ids.length || !ids.every(id=>byId.has(id)&&state.completed[id]&&byId.get(id).pieces?.length&&byId.get(id).pieces.every(p=>p.voiced&&p.clip)))continue;
      const entries=ids.map(id=>state.completed[id]).sort((a,b)=>(a.day||'99999999').localeCompare(b.day||'99999999'));
      award('series-completion',entries,`「${item.title||item.name||'공식 시리즈'}」의 필수 수업을 모두 마쳤어요.`);
    }
    return state;
  }
  function progress(id,state,lessons,series=[]) {
    const d=definitions.find(d=>d.id===id),done=Object.values(state?.completed||{});
    if(!d)return null;
    let current=0,target=1,unit='편',detail='수업 한 편을 마치면 받아요.';
    if(d.subject){current=done.filter(x=>x.subject===d.subject).length;detail=`${d.subject} 수업 한 편을 마치면 받아요.`;}
    else if(id==='first-discovery')current=done.length;
    else if(id==='exploration'){current=done.length;target=3;}
    else if(id==='well-rounded-explorer'){current=new Set(done.map(x=>x.subject)).size;target=3;unit='과목';}
    else if(id==='everyday-discoverer'){current=new Set(state?.days||[]).size;target=5;unit='일';}
    else if(id==='series-completion'){
      const byId=new Map(lessons.map(l=>[l.id,l]));
      const choices=series.map(s=>({title:s.title||s.name||'시리즈',ids:(s.requiredEpisodeIds||s.lessons||s.episodes||[]).map(x=>typeof x==='string'?x:x?.lesson)}))
        .filter(s=>s.ids.length>=2&&new Set(s.ids).size===s.ids.length&&s.ids.every(id=>byId.get(id)?.pieces?.length&&byId.get(id).pieces.every(p=>p.voiced&&p.clip)))
        .map(s=>({...s,current:s.ids.filter(id=>state?.completed?.[id]).length})).sort((a,b)=>b.current/b.ids.length-a.current/a.ids.length);
      if(!choices.length)return {label:'시리즈 수업이 준비되면 도전할 수 있어요.'};
      const best=choices[0];current=best.current;target=best.ids.length;detail=best.title;
    }
    current=Math.min(current,target);
    const left=target-current;
    const label=id==='series-completion'?`${detail} ${current}/${target}편 · ${left}편 더 마치면 받아요.`
      : target===1?`${current}/${target}편 · ${detail}`
      : `${current}/${target}${unit} · ${left}${unit} 더 ${unit==='일'?'배우면':'마치면'} 받아요.`;
    return {current,target,unit,label};
  }
  function dateLabel(day) { const v=validDay(day);return v?`${v.slice(0,4)}년 ${+v.slice(4,6)}월 ${+v.slice(6,8)}일`:'이전 학습 기록 · 날짜 정보 없음'; }
  return {definitions,sync,dateLabel,progress};
});
