/* Parked-only playlist editing uses the same readable glass panel as other settings. */
(()=>{
  'use strict';
  const icons={up:'<path d="m6 15 6-6 6 6"/>',down:'<path d="m6 9 6 6 6-6"/>',remove:'<path d="m6 6 12 12M18 6 6 18"/>'};
  const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  const lesson=id=>DAIT_LESSONS.find(item=>item.id===id);
  function edit(){cancelNextLessonCountdown();const saved=persistPlaylist();renderStage();window.openPlaylist();return saved}
  window.restoreQueueAddFocus=(id,fromStop)=>document.querySelector(`[data-queue-add="${id}"][data-from-stop="${!!fromStop}"]`)?.focus({preventScroll:true});
  const recentAdds=new Map();
  window.quickAddLesson=(id,fromStop=false)=>{
    if(isDrivingMode)return;
    const key=id+':'+!!fromStop,now=performance.now();
    if(recentAdds.has(key)&&now-recentAdds.get(key)<700)return;
    const focused=document.activeElement?.matches('[data-queue-add]');
    if(!lesson(id)||!addLessonToQueue(id,'last',fromStop))return;
    recentAdds.set(key,now);
    if(focused)window.restoreQueueAddFocus(id,fromStop);
    const button=document.querySelector(`[data-queue-add="${id}"][data-from-stop="${!!fromStop}"]`);
    if(button){button.classList.add('just-added');setTimeout(()=>button.classList.remove('just-added'),750)}
  };
  window.showSeriesOrderPrompt=(id,options={})=>{
    const prior=lessonQueue.prior(id,lessonProgress().records),before=lesson(prior);if(!before)return;
    window.openDaitPanel('이전 수업부터 들어볼까요?',`<p class="queue-order-message">${escapeHtml(before.title)}부터 들으면 흐름을 따라가기 좋아요. 지금 고른 수업부터 들어도 괜찮아요.</p><div class="pearl-settings-menu"><button data-series-start="previous"><strong>이전 수업 먼저 듣기</strong><small>${escapeHtml(before.title)}</small></button><button data-series-start="selected"><strong>이 수업 바로 듣기</strong><small>${escapeHtml(lesson(id).title)}</small></button></div>`,'queue-order-dialog',e=>{
      const choice=e.target.closest('[data-series-start]')?.dataset.seriesStart;if(!choice||isDrivingMode)return;
      window.closeDaitPanel();if(choice==='previous')startLesson(prior,false,null,{skipSeriesPrompt:true});else startLesson(id,false,null,{...options,skipSeriesPrompt:true});
    });
  };
  window.refreshPlaylistPanel=()=>{if(document.querySelector('.playlist-dialog[open]'))window.openPlaylist()};
  window.openPlaylist=()=>{
    const items=lessonQueue.items;
    const now=hasActiveLesson()?`<div class="queue-now"><span>지금 듣는 수업</span><strong>${escapeHtml(lessonRun.lesson.title)}</strong></div>`:'';
    const queue=items.length?`<ol class="queue-items">${items.map((item,index)=>`<li><button class="queue-title" data-queue-play="${item.key}"><span>${index+1}</span><span class="queue-lesson-copy"><strong>${escapeHtml(lesson(item.lesson).title)}</strong><small>${escapeHtml(lesson(item.lesson).subject)}</small></span></button><div class="queue-actions"><button data-queue-move="${item.key}" data-delta="-1" aria-label="${escapeHtml(lesson(item.lesson).title)} 위로"${index===0?' disabled':''}>${icon('up')}</button><button data-queue-move="${item.key}" data-delta="1" aria-label="${escapeHtml(lesson(item.lesson).title)} 아래로"${index===items.length-1?' disabled':''}>${icon('down')}</button><button data-queue-remove="${item.key}" aria-label="${escapeHtml(lesson(item.lesson).title)} 재생목록에서 삭제">${icon('remove')}</button></div></li>`).join('')}</ol>`:'<div class="queue-empty"><strong>다음 수업을 담아 보세요</strong><p>수업 옆 +를 누르면 여기에 모여요.</p></div>';
    const panel=window.openDaitPanel('재생목록',`${now}<p class="queue-summary">다음 재생${items.length?' · '+items.length+'개':''}</p><div class="queue-scroll">${queue}</div>`,'playlist-dialog',e=>{
      if(isDrivingMode)return;
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.queueRemove){
        const removed=lessonQueue.remove(Number(b.dataset.queueRemove)),saved=edit();
        if(removed&&saved)window.playlistNotice('목록에서 뺐어요.',{label:'실행 취소',title:lesson(removed.item.lesson).title,onClick:()=>{
          if(isDrivingMode)return;
          if(!lessonQueue.restore(removed)){window.playlistNotice('되돌릴 수 없어요. 목록을 확인해 주세요.');return;}
          const saved=edit();if(saved)window.playlistNotice('목록에 되돌렸어요.');
        }});
      }
      else if(b.dataset.queueMove){lessonQueue.move(Number(b.dataset.queueMove),Number(b.dataset.delta));edit();}
      else if(b.dataset.queuePlay){const key=Number(b.dataset.queuePlay);window.closeDaitPanel();playQueuedLesson(key);}
    });
    return panel;
  };
})();
