/* Appearance only: native lesson, navigation, rewards and driving rules stay in the app. */
(() => {
  'use strict';
  const KEY = 'dait.pearl.colors.v3';
  const PREVIOUS_KEY = 'dait.pearl.colors.v2';
  const LEGACY_KEY = 'dait.pearl.colors.v1';
  const DEFAULT = { start: '#f8e9eb', end: '#ecd9df' };
  const DARK = { start: '#30212a', end: '#452e38' };
  const COLOR_PRESETS = { pearl: DEFAULT, dark: DARK, mixed: { start: '#fffafb', end: '#e2c3cf' } };
  const HEX = /^#[0-9a-f]{6}$/i;
  const host = document.querySelector('.pleos-display');
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const luminance = c => c.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const contrast = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  const valid = colors => colors && HEX.test(colors.start) && HEX.test(colors.end);
  const cloneProfiles = value => ({ mode: value.mode, light: { ...value.light }, dark: { ...value.dark } });
  const isDark = colors => luminance(rgb(colors.start)) + luminance(rgb(colors.end)) < .55;
  let profiles = { mode: 'light', light: { ...DEFAULT }, dark: { ...DARK } };
  const stored = settingsStore.read(KEY, null);
  if (stored && ['light','dark'].includes(stored.mode) && valid(stored.light) && valid(stored.dark)) profiles = cloneProfiles(stored);
  else {
    const previous = settingsStore.read(PREVIOUS_KEY, null);
    const legacy = settingsStore.read(LEGACY_KEY, null);
    // The approved theme replaces old palettes once; keep their saved mode and leave old keys intact.
    if (previous && ['light','dark'].includes(previous.mode)) profiles.mode = previous.mode;
    else if (valid(legacy)) profiles.mode = isDark(legacy) ? 'dark' : 'light';
    try { settingsStore.write(KEY, profiles); } catch (_) { /* Still apply the new theme if storage is unavailable. */ }
  }
  let saved = { ...profiles[profiles.mode] };
  let active = { ...saved }, draft = null, dialog = null, focusBefore = null, frame = 0, noticeTimer;
  let backdropGlow = [0, 0, 0, 0], palette = DaitPalette.derive(active, profiles.mode);
  const PANES = '.pearl-notice,.home-card,.dialogue-card,.settings-card,.pearl-record-row,.pearl-badge,.pearl-page-title,.lesson-row,.pearl-nav nav,.pearl-nav .icon-btn,.pearl-record-tabs button,.lesson-dock,.pearl-settings-dialog,.pearl-settings-menu button,.pearl-pb-choices button';
  const TEXT = '.lesson-end h1,.lesson-end header p,.lesson-up-next h2,.lesson-up-next p,.lesson-next-top>span,.next-autoplay span,.lesson-end-note,.lesson-end-finish,.notice-copy strong,.notice-copy span,.pearl-notice>button,.pearl-badge span,.question-title,.card-label,.question-promise,.main-question,.card-sub,.lesson-title,.lesson-meta,.pearl-page-title h1,.pearl-page-title span,.pearl-record-row strong,.pearl-record-row span,.pearl-hint,.pearl-empty,.pearl-nav nav button,.pearl-nav .icon-btn,.pearl-record-tabs button,.top-label,.back-btn,.lesson-progress-times span,.drive-sentence,.drive-sub,.settings-message,.settings-title,.settings-card h2,.settings-card .card-focus,.choice-chip>span,.drive-btn:not(.primary),.pearl-player-meta,.pearl-player-times span,.pearl-seek,.lesson-dock-copy strong,.lesson-dock-copy>span,.pearl-settings-dialog h2,.pearl-settings-dialog h3,.pearl-settings-dialog strong,.pearl-settings-dialog small,.pearl-settings-dialog p,.pearl-settings-dialog label,.pearl-settings-dialog input:not([type=range]),.pearl-settings-dialog select,.pearl-settings-dialog button:not(.primary-btn):not(.card-btn),.pearl-settings-switch span,.pearl-volume-panel output';

  function backgroundAt(x, y) {
    const rect = host.getBoundingClientRect(), dx = Math.sin(2 * Math.PI / 3), dy = -Math.cos(2 * Math.PI / 3);
    const t = Math.max(0, Math.min(1, .5 + ((x - rect.left - rect.width / 2) * dx + (y - rect.top - rect.height / 2) * dy) / (rect.width * dx + rect.height * dy)));
    const a = rgb(active.start), b = rgb(active.end);
    // Match the subtle palette overlay above the user's 120deg background.
    const glowAt = Math.max(0, Math.min(1, .5 + (x - rect.left - rect.width / 2 + y - rect.top - rect.height / 2) / (rect.width + rect.height)));
    const alpha = Math.max(0, (glowAt - .3) / .7) * backdropGlow[3];
    let result = a.map((v, i) => (v + (b[i] - v) * t) * (1 - alpha) + backdropGlow[i] * alpha);
    // A wide lower-edge fade protects timing text across high-contrast gradients; no text plates.
    if (document.body.classList.contains('lesson-playing')) {
      const shade = Math.max(0, Math.min(1, ((y-rect.top)/rect.height-.65)/.35))*.20;
      result = result.map((v,i) => v*(1-shade)+rgb(palette.darkInk)[i]*shade);
    }
    return result;
  }
  function rgba(element) {
    const color = getComputedStyle(element).backgroundColor;
    const n = (color.match(/[\d.]+/g) || []).map(Number);
    if (color.startsWith('color(srgb ')) return [...n.slice(0, 3).map(value => value * 255), n[3] ?? 1];
    return n.length >= 3 ? [...n.slice(0, 3), n.length === 4 ? n[3] : 1] : [0, 0, 0, 0];
  }
  function measure(element) {
    if (!element.getClientRects().length || element.matches('.pearl-theme-btn[aria-pressed=true]')) return null;
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
    const dark = Math.min(...samples.map(v => contrast(v, luminance(rgb(palette.darkInk)))));
    const white = Math.min(...samples.map(v => contrast(v, 1)));
    const accentInk = palette.accent;
    const accent = Math.min(...samples.map(v => contrast(v, luminance(rgb(accentInk)))));
    if (element.matches('[aria-current=page],[aria-selected=true],[aria-pressed=true]') && accent >= 4.5) return { ink: accentInk, score: accent };
    let result = white > dark ? { ink: palette.lightInk, score: Math.min(...samples.map(v => contrast(v, luminance(rgb(palette.lightInk))))) } : { ink: palette.darkInk, score: dark };
    if (result.score < 5.2) {
      const black = Math.min(...samples.map(v => contrast(v, 0)));
      if (black > result.score) result = { ink: '#000000', score: black };
    }
    return result;
  }
  function refreshInk() {
    host.querySelectorAll('[data-pearl-ink]').forEach(e => { e.removeAttribute('data-pearl-ink'); e.style.removeProperty('--local-ink'); });
    host.querySelectorAll('[data-pearl-tint]').forEach(e => { e.style.removeProperty('background-color'); e.removeAttribute('data-pearl-tint'); });
    const elements = [...host.querySelectorAll(TEXT)];
    for (const element of elements) {
      let result = measure(element);
      if (!result || result.score >= 5.2) continue;
      // The approved rose settings surfaces are opaque; adjust ink without replacing their colors.
      if (host.dataset.settingsPalette === 'rose' && element.closest('.pearl-settings-dialog')) continue;
      const pane = element.closest(PANES);
      if (!pane) continue;
      // Stronger material only where an extreme custom background needs it.
      // Leave headlining text and time labels free of plates and filters.
      pane.style.setProperty('background-color', result.ink === palette.lightInk ? palette.darkInk + 'ee' : palette.lightInk + 'ee');
      pane.setAttribute('data-pearl-tint', '');
      result = measure(element);
      if (result.score < 4.5) pane.style.setProperty('background-color', palette.lightInk);
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
    const stops = palette.logo(bright);
    svg.querySelectorAll('#flowGradBadge stop').forEach((stop, index) => stop.setAttribute('stop-color', stops[index]));
    svg.querySelector('.brand-dot')?.setAttribute('fill', stops[0]);
    const needsOutline = colors.filter(c => contrast(luminance(c), luminance(rgb(stops[0]))) < 3).length >= 2;
    const path = svg.querySelector(':scope > path:not(.pearl-logo-outline)');
    let halo = svg.querySelector('.pearl-logo-halo');
    if (path && !halo) {
      const ns = 'http://www.w3.org/2000/svg', defs = svg.querySelector('defs');
      const filter = document.createElementNS(ns, 'filter');
      filter.id = 'pearlLogoOuterBlur';
      filter.setAttribute('filterUnits', 'userSpaceOnUse');
      filter.setAttribute('x', '-20'); filter.setAttribute('y', '-20');
      filter.setAttribute('width', '140'); filter.setAttribute('height', '80');
      filter.innerHTML = '<feGaussianBlur stdDeviation="0.8"/>';
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
      blurred.setAttribute('opacity', '.24');
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
    svg.querySelector('.pearl-logo-outline')?.setAttribute('stroke', bright ? palette.darkInk : palette.lightInk);
    brand.dataset.logoOutline = needsOutline ? 'on' : 'off'; brand.dataset.logoEffect = bright ? 'shadow' : 'glow';
    // Keep the original ribbon completely unfiltered. Only its exterior receives light.
    svg.style.filter = 'none';
    if (halo) halo.style.color = bright ? palette.darkInk : palette.lightInk;
    brand.dataset.logoOuter = 'adaptive';
  }
  function refresh() {
    frame = 0;
    const glow = getComputedStyle(host).getPropertyValue('--bg-glow').trim();
    backdropGlow = /^#[0-9a-f]{8}$/i.test(glow) ? [...rgb(glow), parseInt(glow.slice(7), 16) / 255] : [0, 0, 0, 0];
    refreshInk(); refreshLogo();
  }
  function queueRefresh() { if (!frame) frame = requestAnimationFrame(refresh); }
  function apply(colors, mode = profiles.mode) {
    active = { ...colors };
    document.documentElement.style.setProperty('--bg-top', colors.start);
    document.documentElement.style.setProperty('--bg-bottom', colors.end);
    palette = DaitPalette.derive(colors, mode);
    if (typeof CSS !== 'undefined' && !CSS.supports('backdrop-filter', 'blur(1px)') && !CSS.supports('-webkit-backdrop-filter', 'blur(1px)')) {
      for (const role of ['--glass','--glass-raised','--glass-menu','--glass-hover']) palette.tokens[role] = palette.tokens['--paper'];
    }
    for (const [name, value] of Object.entries(palette.tokens)) {
      document.documentElement.style.setProperty(name, value);
      host.style.setProperty(name, value);
    }
    host.classList.toggle('pearl-night', mode === 'dark');
    host.dataset.colorMode = mode;
    const reference = mode === 'dark' ? DARK : DEFAULT;
    host.dataset.settingsPalette = colors.start.toLowerCase() === reference.start && colors.end.toLowerCase() === reference.end ? 'rose' : 'custom';
    queueRefresh();
  }
  let noticeGeneration=0, noticeMotion=null, noticeExitTimer;
  const quietMotion=()=>isDrivingMode||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function dismissNotice(immediate=false){
    const generation=++noticeGeneration,node=document.getElementById('pearlNotice');
    clearTimeout(noticeTimer);clearTimeout(noticeExitTimer);noticeMotion?.cancel();
    if(!node||node.hidden)return;
    node.dataset.state='leaving';node.setAttribute('aria-hidden','true');
    const hide=()=>{if(generation===noticeGeneration)node.hidden=true};
    if(immediate||quietMotion()||!node.animate){hide();return}
    noticeMotion=node.animate([{opacity:1},{opacity:0}],{duration:320,easing:'ease-out',fill:'forwards'});
    noticeExitTimer=setTimeout(hide,320);
  }
  function notice(message, action = null) {
    let node = document.getElementById('pearlNotice');
    if (!node) { node = document.createElement('div'); node.id = 'pearlNotice'; node.className = 'pearl-notice'; node.setAttribute('role', 'status'); node.setAttribute('aria-atomic','true'); host.append(node); }
    const replacing=!node.hidden&&node.dataset.state==='visible',generation=++noticeGeneration;
    clearTimeout(noticeTimer);clearTimeout(noticeExitTimer);noticeMotion?.cancel();
    node.replaceChildren();node.hidden=false;node.dataset.state='visible';node.removeAttribute('aria-hidden');
    const actionable=!!action&&typeof action.onClick==='function'&&!isDrivingMode;
    node.classList.toggle('has-action',actionable);
    if(actionable){const icon=document.createElement('span');icon.className='notice-check';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12 4 4 8-8"/></svg>';node.append(icon)}
    const copy=document.createElement('div');copy.className='notice-copy';
    if(actionable&&action.title){const title=document.createElement('strong');title.textContent=action.title;copy.append(title)}
    const text=document.createElement('span');text.textContent=message+(actionable&&Number.isInteger(action.count)?' · '+action.count+'개':'');copy.append(text);node.append(copy);
    if(actionable){
      const button=document.createElement('button');button.type='button';button.textContent=action.label;
      button.setAttribute('aria-label',action.ariaLabel||action.label);
      button.addEventListener('click',()=>{if(generation!==noticeGeneration||node.hidden||node.dataset.state!=='visible'||isDrivingMode)return;const focused=document.activeElement===button;dismissNotice(true);action.onClick();if(focused)action.restoreFocus?.()});
      node.append(button);
    }
    if(actionable){const add=host.querySelector('[data-queue-add]');if(add){node.style.right=Math.max(12,host.getBoundingClientRect().right-add.getBoundingClientRect().left+8)+'px'}else node.style.right='12px'}else node.style.right='12px';
    if(!quietMotion()&&node.animate){
      // Repeated additions update the receipt in place instead of stacking or re-opening a panel.
      const moving=replacing?copy:node;
      noticeMotion=moving.animate(replacing?[{opacity:.35},{opacity:1}]:[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:replacing?130:210,easing:'cubic-bezier(.16,1,.3,1)'});
    }
    let remaining=actionable?4500:2800,started=performance.now();
    const pause=()=>{if(!noticeTimer)return;clearTimeout(noticeTimer);noticeTimer=null;remaining=Math.max(0,remaining-(performance.now()-started));};
    const resume=()=>{
      if(generation!==noticeGeneration||node.hidden||node.dataset.state!=='visible'||noticeTimer)return;
      if(node.contains(document.activeElement)&&document.activeElement.matches(':focus-visible'))return;
      started=performance.now();noticeTimer=setTimeout(()=>{if(generation===noticeGeneration)dismissNotice()},remaining);
    };
    noticeTimer=null;node.onpointerenter=null;node.onpointerleave=null;
    const actionButton=node.querySelector('button');
    if(actionButton){actionButton.onfocus=()=>{if(actionButton.matches(':focus-visible'))pause()};actionButton.onblur=()=>queueMicrotask(resume)}
    resume();queueRefresh();
  }
  function close() {
    if (!dialog) return;
    apply(saved); draft = null; dialog.close(); dialog.remove(); dialog = null;
    host.querySelector('.pearl-settings-shade')?.remove();
    if (focusBefore?.isConnected) focusBefore.focus();
  }
  function fitDialog() {
    if (!dialog) return;
    const rect = host.getBoundingClientRect();
    dialog.style.inset = `${rect.top}px ${window.innerWidth - rect.right}px ${window.innerHeight - rect.bottom}px ${rect.left}px`;
    dialog.style.setProperty('--settings-width', `${rect.width}px`);
    dialog.style.setProperty('--settings-height', `${rect.height}px`);
  }
  function shell(title, body) {
    if (dialog) close();
    focusBefore = document.activeElement;
    dialog = document.createElement('dialog'); dialog.className = 'pearl-settings-dialog';
    dialog.setAttribute('aria-labelledby', 'pearlSettingsTitle');
    dialog.innerHTML = `<div class="pearl-settings-heading">${!['재생 설정','재생목록','앱 색상'].includes(title) ? '' : '<button class="icon-btn pearl-settings-back" data-appearance-action="settings" aria-label="설정으로 돌아가기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button>'}<h2 id="pearlSettingsTitle">${title}</h2><button class="icon-btn" data-appearance-action="close" aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>${body}`;
    const shade = document.createElement('div');
    shade.className = 'pearl-settings-shade'; shade.setAttribute('aria-hidden', 'true');
    host.append(shade, dialog);
    fitDialog();
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialog.addEventListener('click', e => {
      const action = e.target.closest('[data-appearance-action]')?.dataset.appearanceAction;
      if (action === 'close') close();
      else if (action === 'colors') openColors();
      else if (action === 'playback') openPlayback();
      else if (action === 'playlist') { close(); window.openPlaylist(); }
      else if (action === 'settings') window.openPearlSettings();
      else if (action === 'series') { if (toggleSeries()) { window.openPearlSettings(); dialog.querySelector('[data-appearance-action="series"]').focus(); } }
      else if (action === 'series-cues') { lessonQueue.cues=!lessonQueue.cues;persistPlaylist();window.openPearlSettings();dialog.querySelector('[data-appearance-action="series-cues"]').focus(); }
      if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); }
    });
    dialog.showModal(); queueRefresh();
  }
  window.openPearlSettings = () => {
    if (!vehiclePolicy.allows('settings')) { notice('주행중엔 설정을 바꿀 수 없어요.'); return; }
    const prefs = lessonPlaybackPrefs;
    const icons = { playback: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>', playlist: '<path d="M4 6h13M4 11h9M4 16h7m6-4v7"/><circle cx="15" cy="19" r="2"/>', colors: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.2-2.5H18a4 4 0 0 0 4-4C22 6.7 17.5 3 12 3Z"/><path d="M7 10h.01M10 6.5h.01M15 7h.01M18 10.5h.01"/>' };
    const row = (action, label, detail) => `<button class="pearl-settings-row" data-appearance-action="${action}"><span class="pearl-settings-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[action]}</svg></span><span class="pearl-settings-copy"><strong>${label}</strong><small>${detail}</small></span><svg class="pearl-settings-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`;
    const toggle = (action, label, on) => `<button class="pearl-settings-switch" data-appearance-action="${action}" role="switch" aria-checked="${on}"><strong>${label}</strong><span aria-hidden="true">${on ? '켜짐' : '꺼짐'}</span></button>`;
    shell('설정', `<div class="pearl-settings-menu pearl-settings-home"><div class="pearl-settings-group">
      ${row('playback', '재생 설정', `뒤로 ${lessonIntervalText(prefs.back)} · 앞으로 ${lessonIntervalText(prefs.forward)} · ${prefs.rate.toFixed(1)}배속`)}
      ${row('playlist', '재생목록', '다음 수업 · 순서 바꾸기')}
      ${row('colors', '앱 색상', '라이트·다크 모드별 배경')}
      </div><h3 class="pearl-settings-section">이어서 듣기</h3>
      ${toggle('series', '시리즈 순서대로 듣기', seriesOn())}
      ${toggle('series-cues', '시리즈 연결 안내', lessonQueue.cues)}
    </div>`);
  };
  window.playlistNotice = notice;
  window.openDaitPanel = (title, body, className, handler) => {
    if (!vehiclePolicy.allows('settings')) { notice('주행중엔 재생목록을 바꿀 수 없어요.'); return null; }
    shell(title,body); if(className)dialog.classList.add(className);
    if(handler)dialog.addEventListener('click',handler);
    return dialog;
  };
  window.closeDaitPanel = close;
  function openPlayback() {
    if (!vehiclePolicy.allows('settings')) { notice('주행중엔 설정을 바꿀 수 없어요.'); return; }
    let prefs = { ...lessonPlaybackPrefs }, editing = null;
    const intervalRow = (key, label) => `<div class="pearl-pb-row"><h3>${label}</h3><div class="pearl-pb-choices">${[15,30,60,120].map(n => `<button type="button" data-pb-key="${key}" data-pb-value="${n}" aria-pressed="${prefs[key] === n}">${lessonIntervalText(n)}</button>`).join('')}<button type="button" data-pb-custom="${key}" aria-pressed="${![15,30,60,120].includes(prefs[key])}">${[15,30,60,120].includes(prefs[key]) ? '직접 입력' : lessonIntervalText(prefs[key])}</button></div></div>`;
    shell('재생 설정', '<div id="pearlPlaybackBody"></div>');
    dialog.classList.add('pearl-playback-dialog');
    const draw = () => {
      dialog.querySelector('#pearlPlaybackBody').innerHTML = `<form id="pearlPlaybackForm" novalidate>
        <div class="pearl-settings-group">${intervalRow('back', '뒤로 이동')}${intervalRow('forward', '앞으로 이동')}
        <div class="pearl-pb-row"><h3>재생 속도</h3><div class="pearl-pb-choices">${LESSON_RATES.map(n => `<button type="button" data-pb-rate="${n}" aria-pressed="${prefs.rate === n}">${n.toFixed(1)}×</button>`).join('')}</div></div></div>
        <div class="pearl-pb-custom"${editing ? '' : ' hidden'}><label>${editing === 'back' ? '뒤로' : '앞으로'} 이동 시간<input id="pearlCustomTime" type="number" min="1" max="3600" step="1" inputmode="numeric" value="${editing ? prefs[editing] % 60 === 0 ? prefs[editing]/60 : prefs[editing] : 1}"></label><select id="pearlCustomUnit" aria-label="이동 시간 단위"><option value="1">초</option><option value="60"${editing && prefs[editing] % 60 === 0 ? ' selected' : ''}>분</option></select><button class="card-btn" type="button" data-pb-apply>적용</button></div>
        <div class="pearl-settings-footer"><p id="pearlPlaybackMessage" role="status"></p><button class="card-btn" type="submit">저장</button></div>
      </form>`;
      queueRefresh();
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
    shell('앱 색상', `<form id="pearlColorForm" novalidate><div class="pearl-color-modes" role="group" aria-label="색상을 설정할 모드">${[['light','라이트 모드'],['dark','다크 모드']].map(([mode,label])=>`<button type="button" class="pearl-color-mode" data-color-mode="${mode}" aria-pressed="${profiles.mode===mode}"><span data-mode-swatch="${mode}" aria-hidden="true"></span>${label}</button>`).join('')}</div><div class="pearl-color-workbench"><div class="pearl-color-picker"><button type="button" class="pearl-color-plane" aria-label="색상판" aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"><span class="pearl-color-cursor" aria-hidden="true"></span></button><label class="pearl-hue-label" for="pearlHue">색상</label><input id="pearlHue" class="pearl-hue" type="range" min="0" max="359" step="1" aria-label="색상"><div class="pearl-color-preview" aria-label="선택한 두 색의 배경 미리보기"></div></div><div class="pearl-color-actions">${[['start','시작 색'],['end','끝 색']].map(([key,label])=>`<button type="button" class="pearl-color-choice" data-endpoint="${key}" aria-pressed="${key==='start'}"><span data-swatch="${key}" aria-hidden="true"></span>${label}</button>`).join('')}<div class="pearl-color-presets" aria-label="색상 조합"><button type="button" data-palette="pearl" aria-label="로즈 소프트" style="--preset:linear-gradient(120deg,#f8e9eb,#ecd9df)"></button><button type="button" data-palette="dark" aria-label="다크 로즈" style="--preset:linear-gradient(120deg,#30212a,#452e38)"></button><button type="button" data-palette="mixed" aria-label="웜 로즈" style="--preset:linear-gradient(120deg,#fffafb,#e2c3cf)"></button></div><button type="button" class="pearl-color-details" aria-expanded="false" aria-controls="pearlColorCodes">상세 입력</button></div></div><div id="pearlColorCodes" class="pearl-color-fields" hidden>${[['start','시작 색'],['end','끝 색']].map(([key,label])=>`<div><label for="pearlHex-${key}">${label} 색상 코드</label><div class="pearl-color-control"><input type="text" id="pearlHex-${key}" data-hex="${key}" value="${saved[key].toUpperCase()}" aria-label="${label} 색상 코드" maxlength="7" spellcheck="false" autocomplete="off"></div></div>`).join('')}</div><div class="pearl-settings-footer"><p id="pearlColorMessage" role="status">이 기기에 저장돼요.</p><button class="primary-btn" type="submit">저장</button></div></form>`);
    dialog.classList.add('pearl-color-dialog');
    const colorForm = dialog.querySelector('#pearlColorForm');
    const customColors = document.createElement('details');
    customColors.className = 'pearl-color-custom';
    customColors.innerHTML = '<summary>직접 색 고르기</summary>';
    customColors.addEventListener('toggle', queueRefresh);
    const colorPresets = dialog.querySelector('.pearl-color-presets');
    const presetNames = { pearl: '로즈 소프트', dark: '다크 로즈', mixed: '웜 로즈' };
    colorPresets.querySelectorAll('button').forEach(button => { button.textContent = presetNames[button.dataset.palette]; });
    colorForm.querySelector('.pearl-color-modes').after(dialog.querySelector('.pearl-color-preview'), colorPresets, customColors);
    customColors.append(dialog.querySelector('.pearl-color-workbench'), dialog.querySelector('#pearlColorCodes'));
    dialog.querySelector('#pearlColorMessage').textContent = '';
    const draftProfiles = cloneProfiles(profiles);
    let editingMode = profiles.mode;
    draft = draftProfiles[editingMode];
    let selected='start', pointer=null;
    const hsv={ start:toHsv(draft.start), end:toHsv(draft.end) }, plane=dialog.querySelector('.pearl-color-plane'), hue=dialog.querySelector('#pearlHue'), cursor=dialog.querySelector('.pearl-color-cursor'), codes=dialog.querySelector('#pearlColorCodes'), details=dialog.querySelector('.pearl-color-details');
    const showDetails=open=>{ if(open)customColors.open=true; codes.hidden=!open; details.setAttribute('aria-expanded',String(open)); details.textContent=open?'상세 입력 닫기':'상세 입력'; queueRefresh(); };
    const sync=(updateCodes=true)=>{
      for (const mode of ['light','dark']) {
        dialog.querySelector(`[data-color-mode=${mode}]`).setAttribute('aria-pressed', String(mode === editingMode));
        dialog.querySelector(`[data-mode-swatch=${mode}]`).style.background = `linear-gradient(120deg,${draftProfiles[mode].start},${draftProfiles[mode].end})`;
      }
      dialog.querySelector('#pearlColorMessage').textContent = '';
      for(const key of ['start','end']){ dialog.querySelector(`[data-swatch=${key}]`).style.background=draft[key]; dialog.querySelector(`[data-endpoint=${key}]`).setAttribute('aria-pressed',String(key===selected)); if(updateCodes)dialog.querySelector(`[data-hex=${key}]`).value=draft[key].toUpperCase(); }
      colorPresets.querySelectorAll('button').forEach(button => { const preset=COLOR_PRESETS[button.dataset.palette]; button.setAttribute('aria-pressed',String(draft.start===preset.start&&draft.end===preset.end)); });
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
      if(COLOR_PRESETS[palette]){ draft={...COLOR_PRESETS[palette]}; draftProfiles[editingMode]=draft; hsv.start=toHsv(draft.start); hsv.end=toHsv(draft.end); sync(); }
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
  window.togglePearlTheme = () => {
    if (isDrivingMode) return;
    profiles.mode = profiles.mode === 'dark' ? 'light' : 'dark';
    saved = { ...profiles[profiles.mode] };
    try { settingsStore.write(KEY, profiles); } catch (_) { /* 이번 화면에서만 바꾼다. */ }
    apply(saved);
    document.querySelector('.pearl-theme-btn')?.setAttribute('aria-pressed', String(profiles.mode === 'dark'));
  };
  appEvents.on('rendered', queueRefresh);
  appEvents.on('vehicleChanged', ({ driving }) => { if (driving) { close(); dismissNotice(); } queueRefresh(); });
  appEvents.on('closeOverlays', close);
  appEvents.on('back', () => { if (!dialog) return false; close(); return true; });
  window.addEventListener('resize', () => { fitDialog(); queueRefresh(); });
  if (window.ResizeObserver) new window.ResizeObserver(fitDialog).observe(host);
  apply(saved);
})();
