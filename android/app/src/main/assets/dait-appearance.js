/* Appearance only: native lesson, navigation, rewards and driving rules stay in the app. */
(() => {
  'use strict';
  const KEY = 'dait.pearl.colors.v2';
  const LEGACY_KEY = 'dait.pearl.colors.v1';
  const DEFAULT = { start: '#f8e9eb', end: '#e7edf5' };
  const HEX = /^#[0-9a-f]{6}$/i;
  const host = document.querySelector('.pleos-display');
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const luminance = c => c.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const contrast = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  const valid = colors => colors && HEX.test(colors.start) && HEX.test(colors.end);
  const cloneProfiles = value => ({ mode: value.mode, light: { ...value.light }, dark: { ...value.dark } });
  const isDark = colors => luminance(rgb(colors.start)) + luminance(rgb(colors.end)) < .55;
  let profiles = { mode: 'light', light: { ...DEFAULT }, dark: { start: '#151719', end: '#1f2937' } };
  const stored = settingsStore.read(KEY, null);
  if (stored && ['light','dark'].includes(stored.mode) && valid(stored.light) && valid(stored.dark)) profiles = cloneProfiles(stored);
  else {
    const legacy = settingsStore.read(LEGACY_KEY, null);
    if (valid(legacy)) { profiles.mode = isDark(legacy) ? 'dark' : 'light'; profiles[profiles.mode] = { start: legacy.start, end: legacy.end }; }
  }
  let saved = { ...profiles[profiles.mode] };
  let active = { ...saved }, draft = null, dialog = null, focusBefore = null, frame = 0, noticeTimer;
  const PANES = '.home-card,.dialogue-card,.settings-card,.pearl-record-row,.pearl-badge,.pearl-page-title,.lesson-row,.pearl-homework,.pearl-nav nav,.pearl-eta,.pearl-nav .icon-btn';
  const TEXT = '.pearl-badge span,.question-title,.card-label,.question-promise,.main-question,.card-sub,.lesson-title,.lesson-meta,.pearl-page-title h1,.pearl-page-title span,.pearl-record-row strong,.pearl-record-row span,.pearl-hint,.pearl-empty,.pearl-nav nav button,.pearl-eta,.pearl-nav .icon-btn,.top-label,.back-btn,.lesson-progress-times span,.drive-sentence,.drive-sub,.settings-message,.settings-title,.settings-card h2,.settings-card .card-focus,.school-input,.choice-chip,.heard-bubble,.place-name,.place-address,.pearl-homework>span,.drive-btn:not(.primary),.pearl-player-meta,.pearl-player-times,.pearl-seek';

  function backgroundAt(x, y) {
    const rect = host.getBoundingClientRect(), dx = Math.sin(2 * Math.PI / 3), dy = -Math.cos(2 * Math.PI / 3);
    const t = Math.max(0, Math.min(1, .5 + ((x - rect.left - rect.width / 2) * dx + (y - rect.top - rect.height / 2) * dy) / (rect.width * dx + rect.height * dy)));
    const a = rgb(active.start), b = rgb(active.end);
    return a.map((v, i) => v + (b[i] - v) * t);
  }
  function rgba(element) {
    const n = (getComputedStyle(element).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    return n.length >= 3 ? [...n.slice(0, 3), n.length === 4 ? n[3] : 1] : [0, 0, 0, 0];
  }
  function measure(element) {
    if (!element.getClientRects().length) return null;
    const range = document.createRange(); range.selectNodeContents(element);
    let rect = range.getBoundingClientRect(); if (!rect.width) rect = element.getBoundingClientRect();
    if (!rect.width) return null;
    const layers = [];
    for (let node = element; node && node !== host; node = node.parentElement) layers.unshift(rgba(node));
    const samples = [.05, .25, .5, .75, .95].map(t => {
      let c = backgroundAt(rect.left + rect.width * t, rect.top + rect.height / 2);
      for (const layer of layers) c = c.map((v, i) => v * (1 - layer[3]) + layer[i] * layer[3]);
      return luminance(c);
    });
    const dark = Math.min(...samples.map(v => contrast(v, luminance(rgb('#172236')))));
    const white = Math.min(...samples.map(v => contrast(v, 1)));
    const blue = Math.min(...samples.map(v => contrast(v, luminance(rgb('#245ed0')))));
    if (element.matches('[aria-current=page],[aria-selected=true]') && blue >= 4.5) return { ink: '#245ed0', score: blue };
    return white > dark ? { ink: '#ffffff', score: white } : { ink: '#172236', score: dark };
  }
  function refreshInk() {
    host.querySelectorAll('[data-pearl-tint]').forEach(e => { e.style.removeProperty('background-color'); e.removeAttribute('data-pearl-tint'); });
    const elements = [...host.querySelectorAll(TEXT)];
    for (const element of elements) {
      let result = measure(element);
      if (!result || result.score >= 4.65) continue;
      const pane = element.closest(PANES);
      if (!pane) continue;
      pane.style.setProperty('background-color', result.ink === '#ffffff' ? 'rgba(15,27,43,.16)' : 'rgba(255,255,255,.34)');
      pane.setAttribute('data-pearl-tint', '');
      result = measure(element);
      if (result.score < 4.5) pane.style.setProperty('background-color', 'rgba(255,255,255,.6)');
    }
    for (const element of elements) {
      const result = measure(element); if (!result) continue;
      element.setAttribute('data-pearl-ink', ''); element.style.setProperty('--local-ink', result.ink);
      element.dataset.pearlContrast = result.score.toFixed(2);
    }
  }
  function refreshLogo() {
    const brand = host.querySelector('.pearl-brand'), svg = brand?.querySelector('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const colors = [[.2, .25], [.5, .5], [.8, .75]].map(([x, y]) => backgroundAt(rect.left + rect.width * x, rect.top + rect.height * y));
    const bright = luminance(colors[1]) >= .32;
    const needsOutline = colors.filter(c => {
      const max = Math.max(...c), min = Math.min(...c), d = max - min;
      let hue = d ? (max === c[0] ? (c[1] - c[2]) / d : max === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4) * 60 : 0;
      hue = (hue + 360) % 360;
      const lum = luminance(c);
      return max && 1 - min / max > .18 && hue >= 185 && hue <= 215 && contrast(lum, luminance(rgb('#38bdf8'))) < 1.25 && contrast(lum, 1) < 2.7;
    }).length >= 2;
    const path = svg.querySelector(':scope > path:not(.pearl-logo-outline)');
    let halo = svg.querySelector('.pearl-logo-halo');
    if (path && !halo) {
      const ns = 'http://www.w3.org/2000/svg', defs = svg.querySelector('defs');
      const filter = document.createElementNS(ns, 'filter');
      filter.id = 'pearlLogoOuterBlur';
      filter.setAttribute('filterUnits', 'userSpaceOnUse');
      filter.setAttribute('x', '-20'); filter.setAttribute('y', '-20');
      filter.setAttribute('width', '140'); filter.setAttribute('height', '80');
      filter.innerHTML = '<feGaussianBlur stdDeviation="1.57"/>';
      const mask = document.createElementNS(ns, 'mask');
      mask.id = 'pearlLogoOutside';
      mask.setAttribute('maskUnits', 'userSpaceOnUse');
      mask.setAttribute('x', '-20'); mask.setAttribute('y', '-20');
      mask.setAttribute('width', '140'); mask.setAttribute('height', '80');
      mask.setAttribute('style', 'mask-type:luminance');
      mask.innerHTML = '<rect x="-20" y="-20" width="140" height="80" fill="white"/>';
      const cutout = path.cloneNode();
      cutout.setAttribute('stroke', 'black'); cutout.setAttribute('fill', 'none');
      mask.append(cutout);
      const dot = svg.querySelector(':scope > .brand-dot');
      if (dot) { const hole = dot.cloneNode(); hole.setAttribute('fill', 'black'); mask.append(hole); }
      defs.append(filter, mask);
      halo = document.createElementNS(ns, 'g');
      halo.classList.add('pearl-logo-halo');
      halo.setAttribute('aria-hidden', 'true'); halo.setAttribute('pointer-events', 'none');
      halo.setAttribute('mask', 'url(#pearlLogoOutside)');
      const blurred = document.createElementNS(ns, 'g');
      blurred.setAttribute('filter', 'url(#pearlLogoOuterBlur)');
      blurred.setAttribute('opacity', '.76');
      const ribbon = path.cloneNode();
      ribbon.setAttribute('stroke', 'currentColor'); ribbon.setAttribute('stroke-width', '4.8');
      blurred.append(ribbon);
      if (dot) { const glowDot = dot.cloneNode(); glowDot.setAttribute('r', '3.35'); glowDot.setAttribute('fill', 'currentColor'); blurred.append(glowDot); }
      halo.append(blurred); svg.insertBefore(halo, path);
    }
    if (path && !svg.querySelector('.pearl-logo-outline')) {
      const outline = path.cloneNode(); outline.classList.add('pearl-logo-outline');
      outline.setAttribute('stroke-width', '4.4'); outline.setAttribute('aria-hidden', 'true'); svg.insertBefore(outline, path);
    }
    svg.querySelector('.pearl-logo-outline')?.setAttribute('stroke', bright ? '#18314a' : '#ffffff');
    brand.dataset.logoOutline = needsOutline ? 'on' : 'off'; brand.dataset.logoEffect = bright ? 'shadow' : 'glow';
    // Keep the original ribbon completely unfiltered. Only its exterior receives light.
    svg.style.filter = 'none';
    if (halo) halo.style.color = bright ? '#397694' : '#a3ddff';
    brand.dataset.logoOuter = 'sky';
  }
  function refresh() { frame = 0; refreshInk(); refreshLogo(); }
  function queueRefresh() { if (!frame) frame = requestAnimationFrame(refresh); }
  function apply(colors, mode = profiles.mode) {
    active = { ...colors };
    document.documentElement.style.setProperty('--bg-top', colors.start);
    document.documentElement.style.setProperty('--bg-bottom', colors.end);
    const dark = luminance(rgb(colors.start)) + luminance(rgb(colors.end)) < .55;
    host.classList.toggle('pearl-night', mode === 'dark');
    host.dataset.colorMode = mode;
    document.documentElement.style.setProperty('--ink', dark ? '#ffffff' : '#172236');
    document.documentElement.style.setProperty('--muted', dark ? '#e3ebf7' : '#526175');
    queueRefresh();
  }
  function notice(message) {
    let node = document.getElementById('pearlNotice');
    if (!node) { node = document.createElement('div'); node.id = 'pearlNotice'; node.className = 'pearl-notice'; node.setAttribute('role', 'status'); host.append(node); }
    node.textContent = message; node.hidden = false;
    clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { node.hidden = true; }, 3500);
  }
  function close() {
    if (!dialog) return;
    apply(saved); draft = null; dialog.close(); dialog.remove(); dialog = null;
    if (focusBefore?.isConnected) focusBefore.focus();
  }
  function shell(title, body) {
    if (dialog) close();
    focusBefore = document.activeElement;
    dialog = document.createElement('dialog'); dialog.className = 'pearl-settings-dialog';
    dialog.setAttribute('aria-labelledby', 'pearlSettingsTitle');
    dialog.innerHTML = `<div class="pearl-settings-heading"><h2 id="pearlSettingsTitle">${title}</h2><button class="icon-btn" data-appearance-action="close" aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>${body}`;
    host.append(dialog);
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialog.addEventListener('click', e => {
      const action = e.target.closest('[data-appearance-action]')?.dataset.appearanceAction;
      if (action === 'close') close();
      else if (action === 'colors') openColors();
      else if (action === 'playback') openPlayback();
      else if (action === 'settings') window.openPearlSettings();
      else if (action === 'questions') { toggleQuestions(); window.openPearlSettings(); }
      else if (action === 'voice') { toggleVoiceAnswers(); window.openPearlSettings(); }
      else if (action === 'restart') { close(); restartLesson(); }
      if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); }
    });
    dialog.showModal();
  }
  window.openPearlSettings = () => {
    if (!vehiclePolicy.allows('settings')) { notice('주행중엔 설정을 바꿀 수 없어요.'); return; }
    const prefs = lessonPlaybackPrefs;
    const row = (action, label, detail) => `<button data-appearance-action="${action}"><strong>${label}</strong><small>${detail}</small></button>`;
    const toggle = (action, label, on) => `<button class="pearl-settings-switch" data-appearance-action="${action}" role="switch" aria-checked="${on}"><strong>${label}</strong><span aria-hidden="true">${on ? '켜짐' : '꺼짐'}</span></button>`;
    shell('설정', `<div class="pearl-settings-menu">
      ${row('playback', '재생 설정', `뒤로 ${lessonIntervalText(prefs.back)} · 앞으로 ${lessonIntervalText(prefs.forward)} · ${prefs.rate.toFixed(1)}배속`)}
      ${row('colors', '앱 색상', '라이트·다크 모드별 배경')}
      ${toggle('questions', '대화 중 질문', readStored(QUESTIONS_KEY) !== false)}
      ${micState() === 'none' ? '' : toggle('voice', '말로 답하기', readStored(VOICE_KEY) !== false)}
      ${currentMode === 'lesson' && lessonRun && !lessonRun.done && !isLessonResting() ? row('restart', '처음부터 듣기', '지금 수업을 처음부터') : ''}
    </div>`);
  };
  function openPlayback() {
    if (!vehiclePolicy.allows('settings')) { notice('주행중엔 설정을 바꿀 수 없어요.'); return; }
    let prefs = { ...lessonPlaybackPrefs }, editing = null;
    const intervalRow = (key, label) => `<div class="pearl-pb-row"><h3>${label}</h3><div class="pearl-pb-choices">${[15,30,60,120].map(n => `<button type="button" data-pb-key="${key}" data-pb-value="${n}" aria-pressed="${prefs[key] === n}">${lessonIntervalText(n)}</button>`).join('')}<button type="button" data-pb-custom="${key}" aria-pressed="${![15,30,60,120].includes(prefs[key])}">${[15,30,60,120].includes(prefs[key]) ? '직접 입력' : lessonIntervalText(prefs[key])}</button></div></div>`;
    shell('재생 설정', '<div id="pearlPlaybackBody"></div>');
    dialog.classList.add('pearl-playback-dialog');
    const draw = () => {
      dialog.querySelector('#pearlPlaybackBody').innerHTML = `<form id="pearlPlaybackForm" novalidate>
        ${intervalRow('back', '뒤로 이동')}${intervalRow('forward', '앞으로 이동')}
        <div class="pearl-pb-row"><h3>재생 속도</h3><div class="pearl-pb-choices">${LESSON_RATES.map(n => `<button type="button" data-pb-rate="${n}" aria-pressed="${prefs.rate === n}">${n.toFixed(1)}×</button>`).join('')}</div></div>
        <div class="pearl-pb-custom"${editing ? '' : ' hidden'}><label>${editing === 'back' ? '뒤로' : '앞으로'} 이동 시간<input id="pearlCustomTime" type="number" min="1" max="3600" step="1" inputmode="numeric" value="${editing ? prefs[editing] % 60 === 0 ? prefs[editing]/60 : prefs[editing] : 1}"></label><select id="pearlCustomUnit" aria-label="이동 시간 단위"><option value="1">초</option><option value="60"${editing && prefs[editing] % 60 === 0 ? ' selected' : ''}>분</option></select><button class="card-btn" type="button" data-pb-apply>적용</button></div>
        <div class="pearl-settings-footer"><p id="pearlPlaybackMessage" role="status">이 기기에 저장돼요.</p><button class="card-btn" type="submit">저장</button></div>
      </form>`;
    };
    const applyCustom = () => {
      if (!editing) return true;
      const n = Number(dialog.querySelector('#pearlCustomTime').value);
      const unit = Number(dialog.querySelector('#pearlCustomUnit').value), limit = unit === 60 ? 60 : 3600;
      if (!Number.isInteger(n) || n < 1 || n > limit) { dialog.querySelector('#pearlPlaybackMessage').textContent = `1부터 ${limit}까지 입력해 주세요.`; dialog.querySelector('#pearlCustomTime').focus(); return false; }
      prefs[editing] = n * Number(dialog.querySelector('#pearlCustomUnit').value); editing = null; return true;
    };
    dialog.addEventListener('click', e => {
      const button = e.target.closest('button'); if (!button) return;
      if (button.dataset.pbKey) { prefs[button.dataset.pbKey] = Number(button.dataset.pbValue); editing = null; draw(); }
      else if (button.dataset.pbCustom) { editing = button.dataset.pbCustom; draw(); dialog.querySelector('#pearlCustomTime').focus(); }
      else if (button.dataset.pbRate) { if (!applyCustom()) return; prefs.rate = Number(button.dataset.pbRate); draw(); }
      else if (button.hasAttribute('data-pb-apply') && applyCustom()) draw();
    });
    dialog.addEventListener('submit', e => {
      e.preventDefault();
      if (isDrivingMode) { close(); notice('주행중엔 설정을 바꿀 수 없어요.'); return; }
      if (!applyCustom()) return;
      try { if (saveLessonPlaybackPrefs(prefs)) close(); }
      catch (_) { dialog.querySelector('#pearlPlaybackMessage').textContent = '저장할 수 없어요. 기기 저장 공간을 확인해 주세요.'; }
    });
    draw();
  }

  function toHsv(hex) {
    const [r,g,b] = rgb(hex).map(v => v / 255), max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
    let h = !d ? 0 : max === r ? ((g-b)/d)%6 : max === g ? (b-r)/d+2 : (r-g)/d+4;
    return { h: (h*60+360)%360, s: max ? d/max : 0, v: max };
  }
  function toHex({h,s,v}) {
    const c=v*s, x=c*(1-Math.abs((h/60)%2-1)), m=v-c;
    const channels=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
    return '#'+channels.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('');
  }
  function openColors() {
    shell('앱 색상', `<form id="pearlColorForm" novalidate><div class="pearl-color-modes" role="group" aria-label="색상을 설정할 모드">${[['light','라이트 모드'],['dark','다크 모드']].map(([mode,label])=>`<button type="button" class="pearl-color-mode" data-color-mode="${mode}" aria-pressed="${profiles.mode===mode}"><span data-mode-swatch="${mode}" aria-hidden="true"></span>${label}</button>`).join('')}</div><div class="pearl-color-workbench"><div class="pearl-color-picker"><button type="button" class="pearl-color-plane" aria-label="색상판" aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"><span class="pearl-color-cursor" aria-hidden="true"></span></button><label class="pearl-hue-label" for="pearlHue">색상</label><input id="pearlHue" class="pearl-hue" type="range" min="0" max="359" step="1" aria-label="색상"><div class="pearl-color-preview" aria-label="선택한 두 색의 배경 미리보기"></div></div><div class="pearl-color-actions">${[['start','시작 색'],['end','끝 색']].map(([key,label])=>`<button type="button" class="pearl-color-choice" data-endpoint="${key}" aria-pressed="${key==='start'}"><span data-swatch="${key}" aria-hidden="true"></span>${label}</button>`).join('')}<div class="pearl-color-presets" aria-label="색상 조합"><button type="button" data-palette="pearl" aria-label="진주색" style="--preset:linear-gradient(120deg,#f8e9eb,#e7edf5)"></button><button type="button" data-palette="dark" aria-label="블랙 · 블랙" style="--preset:#151719"></button><button type="button" data-palette="mixed" aria-label="화이트 · 네이비" style="--preset:linear-gradient(120deg,#ffffff,#112c51)"></button></div><button type="button" class="pearl-color-details" aria-expanded="false" aria-controls="pearlColorCodes">상세 입력</button></div></div><div id="pearlColorCodes" class="pearl-color-fields" hidden>${[['start','시작 색'],['end','끝 색']].map(([key,label])=>`<div><label for="pearlHex-${key}">${label} 색상 코드</label><div class="pearl-color-control"><input type="text" id="pearlHex-${key}" data-hex="${key}" value="${saved[key].toUpperCase()}" aria-label="${label} 색상 코드" maxlength="7" spellcheck="false" autocomplete="off"></div></div>`).join('')}</div><div class="pearl-settings-footer"><p id="pearlColorMessage" role="status">이 기기에 저장돼요.</p><button class="primary-btn" type="submit">저장</button></div></form>`);
    dialog.classList.add('pearl-color-dialog');
    const draftProfiles = cloneProfiles(profiles);
    let editingMode = profiles.mode;
    draft = draftProfiles[editingMode];
    let selected='start', pointer=null;
    const hsv={ start:toHsv(draft.start), end:toHsv(draft.end) }, plane=dialog.querySelector('.pearl-color-plane'), hue=dialog.querySelector('#pearlHue'), cursor=dialog.querySelector('.pearl-color-cursor'), codes=dialog.querySelector('#pearlColorCodes'), details=dialog.querySelector('.pearl-color-details');
    const showDetails=open=>{ codes.hidden=!open; details.setAttribute('aria-expanded',String(open)); details.textContent=open?'상세 입력 닫기':'상세 입력'; };
    const sync=(updateCodes=true)=>{
      for (const mode of ['light','dark']) {
        dialog.querySelector(`[data-color-mode=${mode}]`).setAttribute('aria-pressed', String(mode === editingMode));
        dialog.querySelector(`[data-mode-swatch=${mode}]`).style.background = `linear-gradient(120deg,${draftProfiles[mode].start},${draftProfiles[mode].end})`;
      }
      dialog.querySelector('#pearlColorMessage').textContent = `${editingMode === 'light' ? '라이트' : '다크'} 모드 색상을 설정 중이에요.`;
      for(const key of ['start','end']){ dialog.querySelector(`[data-swatch=${key}]`).style.background=draft[key]; dialog.querySelector(`[data-endpoint=${key}]`).setAttribute('aria-pressed',String(key===selected)); if(updateCodes)dialog.querySelector(`[data-hex=${key}]`).value=draft[key].toUpperCase(); }
      const current=hsv[selected];
      plane.style.setProperty('--picker-hue',current.h); cursor.style.left=current.s*100+'%'; cursor.style.top=(1-current.v)*100+'%'; cursor.style.background=draft[selected];
      plane.setAttribute('aria-label',`${selected==='start'?'시작 색':'끝 색'} 색상판, 진하기 ${Math.round(current.s*100)}%, 밝기 ${Math.round(current.v*100)}%. 좌우 방향키로 진하기, 위아래 방향키로 밝기 조절`);
      hue.value=Math.round(current.h); hue.style.setProperty('--picker-hue',current.h); hue.setAttribute('aria-valuetext',`${Math.round(current.h)}도`);
      dialog.querySelector('.pearl-color-preview').style.background=`linear-gradient(120deg,${draft.start},${draft.end})`;
      apply(draft, editingMode);
    };
    const readCodes = () => {
      for (const key of ['start','end']) {
        const field = dialog.querySelector(`[data-hex=${key}]`), value = field.value.trim();
        if (!HEX.test(value)) { showDetails(true); dialog.querySelector('#pearlColorMessage').textContent = '색상 코드는 # 뒤에 6자리를 입력해 주세요.'; field.focus(); return false; }
        draft[key] = value.toLowerCase();
      }
      return true;
    };
    const change=()=>{ draft[selected]=toHex(hsv[selected]); dialog.querySelector('#pearlColorMessage').textContent='이 기기에 저장돼요.'; sync(); };
    const pick=e=>{ const r=plane.getBoundingClientRect(); hsv[selected].s=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)); hsv[selected].v=1-Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)); change(); };
    plane.addEventListener('pointerdown',e=>{ if(e.button!==0)return; e.preventDefault(); pointer=e.pointerId; plane.setPointerCapture(pointer); plane.focus({preventScroll:true}); pick(e); });
    plane.addEventListener('pointermove',e=>{ if(e.pointerId===pointer)pick(e); });
    plane.addEventListener('pointerup',e=>{ if(e.pointerId!==pointer)return; pick(e); pointer=null; if(plane.hasPointerCapture(e.pointerId))plane.releasePointerCapture(e.pointerId); });
    plane.addEventListener('pointercancel',()=>{ pointer=null; });
    plane.addEventListener('keydown',e=>{ const delta=e.shiftKey ? .1 : .01, c=hsv[selected]; if(e.key==='ArrowLeft')c.s=Math.max(0,c.s-delta); else if(e.key==='ArrowRight')c.s=Math.min(1,c.s+delta); else if(e.key==='ArrowUp')c.v=Math.min(1,c.v+delta); else if(e.key==='ArrowDown')c.v=Math.max(0,c.v-delta); else return; e.preventDefault(); change(); });
    hue.addEventListener('input',()=>{ hsv[selected].h=Number(hue.value); change(); });
    dialog.addEventListener('input',e=>{ const key=e.target.dataset.hex, value=e.target.value.trim(); if(key&&HEX.test(value)){ draft[key]=value.toLowerCase(); hsv[key]=toHsv(draft[key]); sync(false); } });
    dialog.addEventListener('click',e=>{
      const mode = e.target.closest('[data-color-mode]')?.dataset.colorMode;
      if (mode && mode !== editingMode) {
        if (!readCodes()) return;
        editingMode = mode; draft = draftProfiles[mode];
        hsv.start = toHsv(draft.start); hsv.end = toHsv(draft.end); sync();
      }
      const endpoint=e.target.closest('[data-endpoint]')?.dataset.endpoint;
      if(endpoint){ selected=endpoint; sync(false); }
      if(e.target===details){ showDetails(codes.hidden); if(!codes.hidden)dialog.querySelector(`[data-hex=${selected}]`).focus(); }
      const palette=e.target.closest('[data-palette]')?.dataset.palette;
      const presets={pearl:DEFAULT,dark:{start:'#151719',end:'#151719'},mixed:{start:'#ffffff',end:'#112c51'}};
      if(presets[palette]){ draft={...presets[palette]}; draftProfiles[editingMode]=draft; hsv.start=toHsv(draft.start); hsv.end=toHsv(draft.end); sync(); }
    });
    dialog.querySelector('form').addEventListener('submit',e=>{
      e.preventDefault();
      if(isDrivingMode){ close(); notice('주행중엔 설정을 바꿀 수 없어요.'); return; }
      if (!readCodes()) return;
      draftProfiles.mode = editingMode;
      try { settingsStore.write(KEY, draftProfiles); }
      catch (_) { dialog.querySelector('#pearlColorMessage').textContent='저장할 수 없어요. 기기 저장 공간을 확인해 주세요.'; return; }
      profiles = cloneProfiles(draftProfiles); saved = { ...profiles[profiles.mode] }; close();
    });
    sync();
  }
  appEvents.on('rendered', queueRefresh);
  appEvents.on('vehicleChanged', ({ driving }) => { if (driving) close(); queueRefresh(); });
  appEvents.on('closeOverlays', close);
  appEvents.on('back', () => { if (!dialog) return false; close(); return true; });
  window.addEventListener('resize', queueRefresh);
  apply(saved);
})();
