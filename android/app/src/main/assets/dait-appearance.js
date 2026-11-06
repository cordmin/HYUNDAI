/* Appearance only: native lesson, navigation, rewards and driving rules stay in the app. */
(() => {
  'use strict';
  const KEY = 'dait.pearl.colors.v1';
  const DEFAULT = { start: '#f8e9eb', end: '#e7edf5' };
  const HEX = /^#[0-9a-f]{6}$/i;
  const host = document.querySelector('.pleos-display');
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const luminance = c => c.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const contrast = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  const valid = colors => colors && HEX.test(colors.start) && HEX.test(colors.end);
  let saved = { ...DEFAULT };
  try { const value = JSON.parse(localStorage.getItem(KEY)); if (valid(value)) saved = { start: value.start, end: value.end }; } catch (_) { /* Invalid/missing settings use Pearl. */ }
  let active = { ...saved }, draft = null, dialog = null, focusBefore = null, frame = 0, noticeTimer;
  const PANES = '.home-card,.dialogue-card,.settings-card,.pearl-record-row,.pearl-badge,.pearl-page-title,.lesson-row,.pearl-homework,.pearl-nav nav,.pearl-eta,.pearl-nav .icon-btn';
  const TEXT = '.question-title,.card-label,.question-promise,.main-question,.card-sub,.lesson-title,.lesson-meta,.pearl-badge span,.pearl-page-title h1,.pearl-page-title span,.pearl-record-row strong,.pearl-record-row span,.pearl-hint,.pearl-empty,.pearl-feathers,.pearl-feathers strong,.pearl-nav nav button,.pearl-eta,.pearl-nav .icon-btn,.pearl-record-tabs button,.top-label,.back-btn,.lesson-progress-times span,.drive-sentence,.drive-sub,.settings-message,.settings-title,.settings-card h2,.settings-card .card-focus,.school-input,.choice-chip,.heard-bubble,.place-name,.place-address,.pearl-homework>span,.drive-btn:not(.primary)';

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
    if ((element.matches('[aria-current=page],[aria-selected=true]') || element.closest('.pearl-feathers')) && blue >= 4.5) return { ink: '#245ed0', score: blue };
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
    const path = svg.querySelector('path:not(.pearl-logo-outline)');
    if (path && !svg.querySelector('.pearl-logo-outline')) {
      const outline = path.cloneNode(); outline.classList.add('pearl-logo-outline');
      outline.setAttribute('stroke-width', '4.4'); outline.setAttribute('aria-hidden', 'true'); svg.insertBefore(outline, path);
    }
    svg.querySelector('.pearl-logo-outline')?.setAttribute('stroke', bright ? '#18314a' : '#ffffff');
    brand.dataset.logoOutline = needsOutline ? 'on' : 'off'; brand.dataset.logoEffect = bright ? 'shadow' : 'glow';
    svg.style.filter = bright ? 'drop-shadow(0 2px 2px #00000040) drop-shadow(0 4px 7px #0000001a)' : 'drop-shadow(0 0 2px #ffffff7a) drop-shadow(0 0 7px #ffffff3b)';
  }
  function refresh() { frame = 0; refreshInk(); refreshLogo(); }
  function queueRefresh() { if (!frame) frame = requestAnimationFrame(refresh); }
  function apply(colors) {
    active = { ...colors };
    document.documentElement.style.setProperty('--bg-top', colors.start);
    document.documentElement.style.setProperty('--bg-bottom', colors.end);
    const dark = luminance(rgb(colors.start)) + luminance(rgb(colors.end)) < .55;
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
      else if (action === 'school') { close(); openSettings(); }
      if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); }
    });
    dialog.showModal();
  }
  window.openPearlSettings = () => {
    if (isDrivingMode) { notice('주행중엔 설정을 바꿀 수 없어요.'); return; }
    shell('설정', '<div class="pearl-settings-menu"><button data-appearance-action="colors">앱 색상<small>두 가지 색으로 만드는 배경</small></button><button data-appearance-action="school">학교 · 대화 설정<small>다니는 학교와 하교 대화</small></button></div>');
  };
  function openColors() {
    shell('앱 색상', `<form id="pearlColorForm" novalidate><p class="pearl-color-note">두 가지 색을 골라 배경을 바꿔 보세요.</p><div class="pearl-color-fields">${[['start', '시작 색'], ['end', '끝 색']].map(([key, label]) => `<div><label for="pearlColor-${key}">${label}</label><div class="pearl-color-control"><input type="color" id="pearlColor-${key}" data-color="${key}" value="${saved[key]}" aria-label="${label} 선택"><input type="text" data-hex="${key}" value="${saved[key].toUpperCase()}" aria-label="${label} 색상 코드" maxlength="7" spellcheck="false" autocomplete="off"></div></div>`).join('')}</div><div class="pearl-color-presets" aria-label="색상 조합"><button type="button" data-palette="pearl">진주색</button><button type="button" data-palette="dark">블랙 · 블랙</button><button type="button" data-palette="mixed">화이트 · 네이비</button></div><div class="pearl-color-preview" aria-hidden="true"></div><div class="pearl-settings-footer"><p id="pearlColorMessage" role="status">이 기기에 저장돼요.</p><button class="primary-btn" type="submit">저장</button></div></form>`);
    draft = { ...saved };
    const sync = () => {
      for (const key of ['start', 'end']) { dialog.querySelector(`[data-color=${key}]`).value = draft[key]; dialog.querySelector(`[data-hex=${key}]`).value = draft[key].toUpperCase(); }
      dialog.querySelector('.pearl-color-preview').style.background = `linear-gradient(120deg,${draft.start},${draft.end})`;
      apply(draft);
    };
    dialog.addEventListener('input', e => {
      const key = e.target.dataset.color || e.target.dataset.hex;
      if (key && HEX.test(e.target.value.trim())) { draft[key] = e.target.value.trim().toLowerCase(); sync(); }
    });
    dialog.addEventListener('click', e => {
      const palette = e.target.dataset.palette;
      const presets = { pearl: DEFAULT, dark: { start: '#151719', end: '#151719' }, mixed: { start: '#ffffff', end: '#112c51' } };
      if (presets[palette]) { draft = { ...presets[palette] }; sync(); }
    });
    dialog.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      if (isDrivingMode) { close(); notice('주행중엔 설정을 바꿀 수 없어요.'); return; }
      for (const key of ['start', 'end']) {
        const field = dialog.querySelector(`[data-hex=${key}]`), value = field.value.trim();
        if (!HEX.test(value)) { dialog.querySelector('#pearlColorMessage').textContent = '색상 코드는 # 뒤에 6자리를 입력해 주세요.'; field.focus(); return; }
        draft[key] = value.toLowerCase();
      }
      try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch (_) { dialog.querySelector('#pearlColorMessage').textContent = '저장할 수 없어요. 기기 저장 공간을 확인해 주세요.'; return; }
      saved = { ...draft }; close();
    });
    sync();
  }
  // Refresh after the existing render, without replacing its playback or trip state.
  const renderStage = window.renderStage;
  window.renderStage = function (...args) { const result = renderStage.apply(this, args); queueRefresh(); return result; };
  const setDriving = window.setDrivingMode;
  window.setDrivingMode = function (driving, ...args) { if (driving) close(); const result = setDriving.call(this, driving, ...args); queueRefresh(); return result; };
  window.addEventListener('resize', queueRefresh);
  apply(saved);
})();
