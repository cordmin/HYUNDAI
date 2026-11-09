// Persistent Up Next and ordered series. User queue wins over series suggestions.
const PLAYLIST_KEY='dait.playlist.v1';
// Keep the team's series/part metadata as the source of published order.
const publishedSeries=typeof DAIT_SERIES==='undefined'?[]:DAIT_SERIES;
const embeddedSeries=[...new Set(DAIT_LESSONS.map(item=>item.series).filter(Boolean))].filter(title=>!publishedSeries.some(item=>item.title===title)).map((title,index)=>({id:'lesson-series-'+index,title,lessons:DAIT_LESSONS.filter(item=>item.series===title).sort((a,b)=>a.part-b.part).map(item=>item.id)}));
const lessonQueue=new DaitPlaylist.Playlist(DAIT_LESSONS,settingsStore.read(PLAYLIST_KEY,{followSeries:settingsStore.read('dait.lesson.series',true)}),[...publishedSeries,...embeddedSeries]);
function persistPlaylist(){
  try{settingsStore.write(PLAYLIST_KEY,lessonQueue.snapshot());return true}
  catch(_){window.playlistNotice?.('저장하지 못했어요. 이 화면에서만 유지돼요.');return false}
}
function playlistEdited(){cancelNextLessonCountdown();const saved=persistPlaylist();renderStage();return saved}
function addLessonToQueue(id,position='last',fromStop=false){
  if(isDrivingMode){window.playlistNotice?.('주행중엔 재생목록을 바꿀 수 없어요.');return false}
  if(!lessonQueue.add(id,position,fromStop)){window.playlistNotice?.('재생목록에 더 추가할 수 없어요.');return false}
  const item=position==='next'?lessonQueue.items[0]:lessonQueue.items[lessonQueue.items.length-1];
  const saved=playlistEdited();
  const action=saved&&position==='last'?{label:'바로 다음에 재생',title:DAIT_LESSONS.find(lesson=>lesson.id===id)?.title,count:lessonQueue.items.length,ariaLabel:(DAIT_LESSONS.find(lesson=>lesson.id===id)?.title||'방금 추가한 수업')+' 바로 다음에 재생',onClick:()=>promoteQueuedLesson(item.key),restoreFocus:()=>window.restoreQueueAddFocus?.(id,fromStop)}:null;
  window.playlistNotice?.(saved?(position==='next'?'바로 다음에 추가했어요.':'맨 뒤에 추가했어요.'):'추가했지만 저장하지 못했어요. 이번 화면에서만 유지돼요.',action);return true;
}
function promoteQueuedLesson(key){
  if(isDrivingMode){window.playlistNotice?.('주행중엔 재생목록을 바꿀 수 없어요.');return false}
  if(!lessonQueue.promote(key)){window.playlistNotice?.('이미 재생했거나 목록에서 삭제된 수업이에요.');return false}
  const saved=playlistEdited();window.refreshPlaylistPanel?.();
  window.playlistNotice?.(saved?'바로 다음에 재생하도록 바꿨어요.':'순서는 바꿨지만 저장하지 못했어요. 이번 화면에서만 유지돼요.');return true;
}
function playlistTripOrder(id,skipKey,explicitOnly=false){
  const own=lessonQueue.order(id,skipKey).map(key=>DAIT_LESSONS.find(item=>item.id===key)).filter(Boolean);
  if(!lessonQueue.autoNext)return own.slice(0,1);
  return explicitOnly||lessonQueue.items.some(item=>item.key!==skipKey)||lessonQueue.seriesFor(id)?own:Lesson.tripOrder(DAIT_LESSONS,lessonProgress().records,id,lessonRules());
}
function playlistHint(id){const series=lessonQueue.seriesFor(id);return series?`${series.title} · ${series.lessons.indexOf(id)+1}/${series.lessons.length}편`:''}
// Re-check the live queue and navigation before scheduling and before starting.
function nextLessonCandidate(run){
  if(!run||hasArrived||isArriving(remainMinutes()))return null;
  const next=lessonQueue.next(run.lesson.id),eta=remainMinutes(),minutes=eta===null?lessonMinutes:Lesson.minutesFor(eta);
  if(next){const target=DAIT_LESSONS.find(item=>item.id===next.lesson);return target&&Lesson.fits(target,minutes)&&(next.source!=='series'||Lesson.playsFull(target,minutes))?{...next,target,minutes,token:next.source+':'+(next.key||next.lesson)}:null}
  if(run.trip.count>0&&run.trip.later?.length){const trip=Lesson.nextPeriod(run.trip,tripSeconds(run.trip));if(trip?.lesson&&Lesson.fits(trip.lesson,trip.minutes))return{lesson:trip.lesson.id,target:trip.lesson,trip,token:'trip:'+trip.lesson.id}}
  return null;
}
function nextPlaylistLesson(run){
  const next=nextLessonCandidate(run);if(!next)return false;
  cancelNextLessonCountdown(run);const view=lessonView;
  if(next.trip){startPeriod(next.trip);render();updateDriveScreen();return true}
  startLesson(next.lesson,!!next.fromStop&&stoppedLesson(next.minutes)?.id===next.lesson,null,{skipSeriesPrompt:true,automatic:true,queueKey:next.key,explicitOnly:true,minutes:next.minutes});
  if(lessonRun===run||!hasActiveLesson())return false;
  if(view&&!isDrivingMode){lessonView=view;renderStage()}
  window.refreshPlaylistPanel?.();return true;
}
function cancelNextLessonCountdown(run=lessonRun){if(!run)return;clearTimeout(run.nextTimer);run.nextTimer=null;run.nextAt=0;run.nextSeconds=0;}
function nextLessonCountdownTick(run=lessonRun,now=Date.now()){
  if(!run||run!==lessonRun||!run.done||!run.nextAt)return;
  const next=nextLessonCandidate(run);
  if(currentMode!=='lesson'||hasArrived||speechPaused||run.playback.interrupted||!lessonQueue.autoNext||!next||next.token!==run.nextToken){cancelNextLessonCountdown(run);render();updateDriveScreen();return}
  run.nextSeconds=Math.max(0,Math.ceil((run.nextAt-now)/1000));
  if(!run.nextSeconds){cancelNextLessonCountdown(run);nextPlaylistLesson(run);return}
  updateNextLessonCountdown();clearTimeout(run.nextTimer);run.nextTimer=setTimeout(()=>nextLessonCountdownTick(run),200);
}
function startNextLessonCountdown(run){
  cancelNextLessonCountdown(run);const next=nextLessonCandidate(run);
  if(!run?.done||!run.nextEligible||run.paused||run.stopped||run.playback.interrupted||speechPaused||!lessonQueue.autoNext||!next)return false;
  run.nextAt=Date.now()+5000;run.nextSeconds=5;run.nextToken=next.token;nextLessonCountdownTick(run);return true;
}
function toggleNextLessonAutoplay(){if(isDrivingMode)return;lessonQueue.autoNext=!lessonQueue.autoNext;persistPlaylist();if(lessonQueue.autoNext)startNextLessonCountdown(lessonRun);else cancelNextLessonCountdown();render();updateDriveScreen();}
function cancelNextLessonAutoplay(){cancelNextLessonCountdown();render();updateDriveScreen();}
function updateNextLessonCountdown(){
  const node=document.getElementById('nextLessonCountdown');const text=lessonRun?.nextAt?lessonRun.nextSeconds+'초 후 재생':'다음 수업';if(node&&node.textContent!==text)node.textContent=text;
  if(isDrivingMode&&lessonRun?.nextAt)document.getElementById('driveSub').textContent=lessonRun.nextSeconds+'초 후 다음 수업';
}
function playQueuedLesson(key){
  if(isDrivingMode)return;
  const item=lessonQueue.items.find(item=>item.key===key);if(!item)return;
  startLesson(item.lesson,!!item.fromStop&&stoppedLesson(lessonMinutes)?.id===item.lesson,null,{queueKey:key,automatic:true,explicitOnly:true});
}
function consumePlaylistStart(options){if(options.queueKey){lessonQueue.remove(options.queueKey);persistPlaylist()}}

function playNextQueuedLesson(){if(!lessonRun||!nextPlaylistLesson(lessonRun))window.playlistNotice?.('남은 시간이 짧아요. 다음 이동에서 들어요.');}

// Series authors can attach a recorded end bridge later; no invented relationships or missing clips ship.
function playlistOutroEligible(id){
  const next=lessonQueue.next(id),following=lessonQueue.following(id);
  return lessonQueue.cues&&lessonQueue.autoNext&&lessonQueue.followSeries&&next?.lesson===following&&!!following&&!hasArrived&&!isArriving(remainMinutes());
}
function lessonWithSeriesOutro(lesson){
  const cue=lessonQueue.seriesFor(lesson.id)?.outros?.[lesson.id];
  if(!cue||!playlistOutroEligible(lesson.id))return lesson;
  const pieces=[...lesson.pieces];
  for(const short of [false,true]){
    if(!pieces.some(piece=>!!piece.short===short&&Lesson.isClosing(piece)))continue;
    pieces.push({id:'series-outro-'+(short?'short':'full'),kind:'정리',must:true,short,seriesOutro:true,line:cue.text,text:cue.text,clip:cue.clip,seconds:cue.seconds,voiced:true});
  }
  return {...lesson,pieces};
}

// Leaving the visible app cancels this handoff; returning never restarts its timer.
document.addEventListener?.('visibilitychange',()=>{if(document.hidden&&lessonRun?.nextAt)cancelNextLessonAutoplay()});
