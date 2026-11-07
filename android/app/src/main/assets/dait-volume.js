/* In-place volume for the shared WebView app, including its native speech player. */
(() => {
  'use strict';
  const KEY = 'dait.volume.v1';
  const bridge = window.AndroidBridge;
  let volume = 100, opened = false;
  try {
    const saved = settingsStore.read(KEY, null);
    if (saved !== null && String(saved).trim() !== '' && Number.isFinite(Number(saved))) volume = Math.round(Math.max(0, Math.min(100, Number(saved))));
    if (bridge?.getSpeechVolume) volume = Math.round(Math.max(0, Math.min(100, Number(bridge.getSpeechVolume()))));
    if (!Number.isFinite(volume)) volume = 100;
  } catch (_) { /* Storage can be unavailable; this trip's controls still work. */ }
  const icon = muted => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/>${muted ? '<path d="m16 9 5 6m0-6-5 6"/>' : '<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'}</svg>`;
  function sync() {
    const control = document.getElementById('pearlVolume');
    if (!control) return;
    control.classList.toggle('is-open', opened);
    const button = control.querySelector('button'), range = control.querySelector('input'), output = control.querySelector('output');
    button.innerHTML = icon(volume === 0);
    button.setAttribute('aria-expanded', String(opened));
    button.setAttribute('aria-label', volume === 0 ? '음량 조절 · 음소거' : '음량 조절');
    control.querySelector('.pearl-volume-panel').hidden = !opened;
    range.value = volume; range.style.setProperty('--volume-fill', volume + '%');
    range.setAttribute('aria-valuetext', volume === 0 ? '음소거' : volume + '%');
    output.textContent = volume + '%';
  }
  function setVolume(value, persist = true) {
    const number = Number(value); if (!Number.isFinite(number)) return;
    volume = Math.round(Math.max(0, Math.min(100, number)));
    audioAdapter.setVolume(volume);
    if (persist) { try { settingsStore.write(KEY, volume); } catch (_) { /* Keep the current trip's volume. */ } }
    sync();
  }
  function mount() {
    const nav = document.getElementById('pearlNav'), settingsButton = nav?.querySelector(':scope > .icon-btn');
    if (!settingsButton) return;
    const toolbar = document.createElement('div'); toolbar.className = 'pearl-tools';
    settingsButton.replaceWith(toolbar); toolbar.append(settingsButton);
    toolbar.insertAdjacentHTML('beforeend', `<div class="pearl-volume-control" id="pearlVolume"><button type="button" class="icon-btn" aria-label="음량 조절" aria-controls="pearlVolumePanel" aria-expanded="false"></button><div class="pearl-volume-panel" id="pearlVolumePanel" hidden><input id="pearlVolumeRange" type="range" min="0" max="100" step="1" value="${volume}" aria-label="음량" aria-orientation="vertical"><output for="pearlVolumeRange"></output></div></div>`);
    toolbar.querySelector('#pearlVolume button').addEventListener('click', () => { opened = !opened; sync(); });
    toolbar.querySelector('input').addEventListener('input', e => setVolume(e.target.value));
    settingsButton.addEventListener('click', () => { opened = false; sync(); });
    sync();
  }
  document.addEventListener('click', e => {
    if (opened && !e.composedPath().some(node => node instanceof Element && node.id === 'pearlVolume')) { opened = false; sync(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && opened) { opened = false; sync(); document.querySelector('#pearlVolume button')?.focus(); }
  });
  appEvents.on('navigationRendered', mount);
  appEvents.on('vehicleChanged', () => { opened = false; sync(); });
  appEvents.on('back', () => { if (!opened) return false; opened = false; sync(); return true; });
  setVolume(volume, false); mount();
})();
