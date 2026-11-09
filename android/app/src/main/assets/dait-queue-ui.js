/* Parked-only playlist editing uses the same readable glass panel as other settings. */
(()=>{
  'use strict';
  let tab='queue',selectedSeries=null;
  const icons={up:'<path d="m6 15 6-6 6 6"/>',down:'<path d="m6 9 6 6 6-6"/>',remove:'<path d="m6 6 12 12M18 6 6 18"/>'};
  const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  const lesson=id=>DAIT_LESSONS.find(item=>item.id===id);
  const toggle=(key,label)=>`<button class="queue-switch" data-queue-pref="${key}" role="switch" aria-checked="${lessonQueue[key]}"><span>${label}</span><span aria-hidden="true">${lessonQueue[key]?'켜짐':'꺼짐'}</span></button>`;
  function edit(){const saved=persistPlaylist();renderStage();window.openPlaylist(tab);return saved}
  window.restoreQueueAddFocus=(id,fromStop)=>document.querySelector(`[data-queue-add="${id}"][data-from-stop="${!!fromStop}"]`)?.focus({preventScroll:true});
  window.quickAddLesson=(id,fromStop=false)=>{
    const focused=document.activeElement?.matches('[data-queue-add]');
    if(!lesson(id)||!addLessonToQueue(id,'last',fromStop))return;
    if(focused)window.restoreQueueAddFocus(id,fromStop);
  };
  window.showSeriesOrderPrompt=(id,options={})=>{
    const prior=lessonQueue.prior(id,lessonProgress().records),before=lesson(prior);if(!before)return;
    window.openDaitPanel('이전 수업부터 들어볼까요?',`<p class="queue-order-message">${escapeHtml(before.title)}부터 들으면 흐름을 따라가기 좋아요. 지금 고른 수업부터 들어도 괜찮아요.</p><div class="pearl-settings-menu"><button data-series-start="previous"><strong>이전 수업 먼저 듣기</strong><small>${escapeHtml(before.title)}</small></button><button data-series-start="selected"><strong>이 수업 바로 듣기</strong><small>${escapeHtml(lesson(id).title)}</small></button></div>`,'queue-order-dialog',e=>{
      const choice=e.target.closest('[data-series-start]')?.dataset.seriesStart;if(!choice||isDrivingMode)return;
      window.closeDaitPanel();if(choice==='previous')startLesson(prior,false,null,{skipSeriesPrompt:true});else startLesson(id,false,null,{...options,skipSeriesPrompt:true});
    });
  };
  function saveSeries(){
    const ids=lessonQueue.items.map(item=>item.lesson);
    const panel=window.openDaitPanel('시리즈로 저장',`<form id="seriesSaveForm"><label for="seriesName">시리즈 이름</label><input id="seriesName" class="series-name" maxlength="60" autocomplete="off" required placeholder="예: 출근길 문학"><p class="queue-order-message">재생목록의 순서대로 저장해요. 같은 수업은 한 번만 넣어요.</p><div class="pearl-settings-footer"><p role="status" id="seriesSaveMessage"></p><button class="card-btn" type="submit">저장</button></div></form>`,'queue-order-dialog');
    if(!panel)return;
    panel.querySelector('form').addEventListener('submit',e=>{
      e.preventDefault();if(isDrivingMode)return;
      const series=lessonQueue.saveSeries(panel.querySelector('input').value,ids);
      if(!series){panel.querySelector('#seriesSaveMessage').textContent='이름과 서로 다른 수업 두 편이 필요해요.';return}
      selectedSeries=series.id;tab='series';if(edit())window.playlistNotice('시리즈를 저장했어요.');
    });
    panel.querySelector('input').focus();
  }
  window.refreshPlaylistPanel=()=>{if(document.querySelector('.playlist-dialog[open]'))window.openPlaylist(tab)};
  window.openPlaylist=(nextTab)=>{
    if(nextTab)tab=nextTab;
    const items=lessonQueue.items,series=lessonQueue.series.find(item=>item.id===selectedSeries);
    const now=hasActiveLesson()?`<div class="queue-now"><span>지금 듣는 수업</span><strong>${escapeHtml(lessonRun.lesson.title)}</strong></div>`:'';
    const queue=items.length?`<ol class="queue-items">${items.map((item,index)=>`<li><button class="queue-title" data-queue-play="${item.key}"><span>${index+1}</span><strong>${escapeHtml(lesson(item.lesson).title)}</strong></button><div class="queue-actions"><button data-queue-move="${item.key}" data-delta="-1" aria-label="${escapeHtml(lesson(item.lesson).title)} 위로"${index===0?' disabled':''}>${icon('up')}</button><button data-queue-move="${item.key}" data-delta="1" aria-label="${escapeHtml(lesson(item.lesson).title)} 아래로"${index===items.length-1?' disabled':''}>${icon('down')}</button><button data-queue-remove="${item.key}" aria-label="${escapeHtml(lesson(item.lesson).title)} 재생목록에서 삭제">${icon('remove')}</button></div></li>`).join('')}</ol>`:'<p class="queue-empty">수업 옆 +를 누르면 맨 뒤에 추가돼요.</p>';
    const seriesList=series?`<button class="queue-back" data-queue-series="">시리즈 목록</button><h3 class="queue-series-name">${escapeHtml(series.title)}</h3><ol class="queue-items">${series.lessons.map((id,index)=>`<li><button class="queue-title" data-series-play="${id}"><span>${index+1}</span><strong>${escapeHtml(lesson(id).title)}</strong></button></li>`).join('')}</ol>`
      :lessonQueue.series.length?`<div class="queue-series-list">${lessonQueue.series.map(item=>`<button data-queue-series="${item.id}"><strong>${escapeHtml(item.title)}</strong><span>${item.lessons.length}편 · 순서대로 듣기</span></button>`).join('')}</div>`:'<p class="queue-empty">재생목록에 수업 두 편 이상을 담고 시리즈로 저장해 보세요.</p>';
    const panel=window.openDaitPanel('재생목록',`${now}<div class="queue-preferences">${toggle('autoNext','다음 수업 자동 재생')}</div><div class="queue-tabs" role="tablist" aria-label="재생목록 종류"><button role="tab" aria-selected="${tab==='queue'}" data-queue-tab="queue">다음 재생${items.length?' · '+items.length:''}</button><button role="tab" aria-selected="${tab==='series'}" data-queue-tab="series">시리즈</button></div><div class="queue-scroll">${tab==='queue'?queue:seriesList}</div><div class="queue-footer">${tab==='queue'?`<button class="queue-save" data-save-series${new Set(items.map(item=>item.lesson)).size<2?' disabled':''}>시리즈로 저장</button>`:`<div class="queue-preferences">${toggle('followSeries','시리즈 순서대로 듣기')}${toggle('cues','시리즈 연결 안내')}</div>`}</div>`,'playlist-dialog',e=>{
      if(isDrivingMode)return;
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.queueTab){tab=b.dataset.queueTab;window.openPlaylist();}
      else if(b.dataset.queuePref){const key=b.dataset.queuePref;if(!['autoNext','followSeries','cues'].includes(key))return;lessonQueue[key]=!lessonQueue[key];edit();}
      else if(b.dataset.queueRemove){lessonQueue.remove(Number(b.dataset.queueRemove));edit();}
      else if(b.dataset.queueMove){lessonQueue.move(Number(b.dataset.queueMove),Number(b.dataset.delta));edit();}
      else if(b.dataset.queuePlay){const key=Number(b.dataset.queuePlay);window.closeDaitPanel();playQueuedLesson(key);}
      else if(b.hasAttribute('data-save-series'))saveSeries();
      else if(b.hasAttribute('data-queue-series')){selectedSeries=b.dataset.queueSeries||null;window.openPlaylist('series');}
      else if(b.dataset.seriesPlay){window.closeDaitPanel();startLesson(b.dataset.seriesPlay);}
    });
    return panel;
  };
})();
