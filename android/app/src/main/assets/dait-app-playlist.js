// Persistent Up Next and ordered series. User queue wins over series suggestions.
const PLAYLIST_KEY='dait.playlist.v1';
const lessonQueue=new DaitPlaylist.Playlist(DAIT_LESSONS,settingsStore.read(PLAYLIST_KEY,{}),typeof DAIT_SERIES==='undefined'?[]:DAIT_SERIES);
function persistPlaylist(){
  try{settingsStore.write(PLAYLIST_KEY,lessonQueue.snapshot());return true}
  catch(_){window.playlistNotice?.('저장하지 못했어요. 이 화면에서만 유지돼요.');return false}
}
function playlistEdited(){const saved=persistPlaylist();renderStage();return saved}
function addLessonToQueue(id,position,fromStop=false){
  if(isDrivingMode){window.playlistNotice?.('주행중엔 재생목록을 바꿀 수 없어요.');return false}
  if(!lessonQueue.add(id,position,fromStop)){window.playlistNotice?.('재생목록에 더 추가할 수 없어요.');return false}
  const saved=playlistEdited();window.playlistNotice?.(saved?(position==='next'?'바로 다음에 추가했어요.':'재생목록 맨 뒤에 추가했어요.'):'추가했지만 저장하지 못했어요. 이번 화면에서만 유지돼요.');return true;
}
function playlistTripOrder(id,skipKey,explicitOnly=false){
  const own=lessonQueue.order(id,skipKey).map(key=>DAIT_LESSONS.find(item=>item.id===key)).filter(Boolean);
  if(!lessonQueue.autoNext)return own.slice(0,1);
  return explicitOnly||lessonQueue.items.some(item=>item.key!==skipKey)||lessonQueue.seriesFor(id)?own:Lesson.tripOrder(DAIT_LESSONS,lessonProgress().records,id);
}
function playlistHint(id){const series=lessonQueue.seriesFor(id);return series?`${series.title} · ${series.lessons.indexOf(id)+1}/${series.lessons.length}편`:''}
function nextPlaylistLesson(run){
  const next=lessonQueue.next(run.lesson.id);
  if(!next)return false;
  const eta=hasArrived?0:remainMinutes(),minutes=eta===null?lessonMinutes:Lesson.minutesFor(eta);
  const target=DAIT_LESSONS.find(item=>item.id===next.lesson);
  if(!target||hasArrived||isArriving(eta)||!Lesson.fits(target,minutes))return false;
  const view=lessonView;
  startLesson(next.lesson,!!next.fromStop&&stoppedLesson(minutes)?.id===next.lesson,null,{skipSeriesPrompt:true,automatic:true,queueKey:next.key,explicitOnly:true,minutes});
  if(lessonRun===run||!hasActiveLesson())return false;
  if(view&&!isDrivingMode){lessonView=view;renderStage()}
  window.refreshPlaylistPanel?.();
  return true;
}
function maybeContinuePlaylist(run){return lessonQueue.autoNext&&!run.paused&&!run.stopped&&!run.playback.interrupted&&!hasArrived&&nextPlaylistLesson(run)}
function playQueuedLesson(key){
  if(isDrivingMode)return;
  const item=lessonQueue.items.find(item=>item.key===key);if(!item)return;
  startLesson(item.lesson,!!item.fromStop&&stoppedLesson(lessonMinutes)?.id===item.lesson,null,{queueKey:key,automatic:true,explicitOnly:true});
}
function consumePlaylistStart(options){if(options.queueKey){lessonQueue.remove(options.queueKey);persistPlaylist()}}

function playNextQueuedLesson(){if(isDrivingMode)return;if(!lessonRun||!nextPlaylistLesson(lessonRun))window.playlistNotice?.('남은 시간이 짧아요. 다음 이동에서 들어요.');}

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
