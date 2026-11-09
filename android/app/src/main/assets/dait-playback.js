/* Shared playback contracts. Pure state and planning stay independent of DOM/native APIs. */
(function (root) {
  'use strict';
  class Events {
    constructor() { this.listeners = new Map(); }
    on(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); return () => this.listeners.get(type)?.delete(listener); }
    has(type) { return !!this.listeners.get(type)?.size; }
    emit(type, value) { return [...(this.listeners.get(type) || [])].map(listener => listener(value)); }
  }
  class LessonSession {
    constructor() { this.userPaused = false; this.stopped = false; this.interrupted = false; this.ended = false; }
    get state() { return this.ended ? 'ended' : this.userPaused ? 'paused' : this.stopped ? 'stopped' : this.interrupted ? 'interrupted' : 'playing'; }
    start() { this.userPaused = false; this.stopped = false; this.interrupted = false; }
    interrupt() { this.interrupted = true; }
    resumeFromSystem() { if (this.userPaused || this.stopped || this.ended) return false; this.interrupted = false; return true; }
    attach(run) {
      Object.defineProperties(run, {
        paused: { enumerable: true, get: () => this.userPaused, set: value => { this.userPaused = !!value; } },
        stopped: { enumerable: true, get: () => this.stopped, set: value => { this.stopped = !!value; } },
        done: { enumerable: true, get: () => this.ended, set: value => { this.ended = !!value; } }
      });
      return run;
    }
  }
  class VehiclePolicy {
    constructor() { this.restricted = false; }
    update(restricted) { this.restricted = !!restricted; }
    allows(command) { return !this.restricted || ['play', 'pause', 'seek-relative', 'volume'].includes(command); }
  }
  class SettingsStore {
    constructor(storage) { this.storage = storage; }
    read(key, fallback, validate = () => true) { try { const value = JSON.parse(this.storage.getItem(key)); return value !== null && validate(value) ? value : fallback; } catch (_) { return fallback; } }
    write(key, value) { this.storage.setItem(key, JSON.stringify(value)); }
  }
  class AudioAdapter {
    constructor(getBridge, getAudio) { this.getBridge = getBridge; this.getAudio = getAudio; }
    get bridge() { return this.getBridge(); }
    speak(clips, seq, browserPlay) { if (this.bridge) this.bridge.speak(JSON.stringify(clips), seq); else browserPlay(); }
    playClip(src, onError) { const audio = this.getAudio(); audio.src = src; audio.play().catch(onError); }
    stop() { if (this.bridge) this.bridge.stopSpeech(); else this.getAudio().pause(); }
    seek(positionMs, seq, isCurrent) {
      if (this.bridge) { this.bridge.seekSpeech?.(positionMs, seq); return; }
      const audio = this.getAudio(), seek = () => { if (isCurrent()) audio.currentTime = positionMs / 1000; };
      audio.onloadedmetadata = seek;
      if (audio.readyState >= 1) seek();
    }
    setVolume(percent) { const audio = this.getAudio(); audio.volume = percent / 100; audio.muted = percent === 0; this.bridge?.setSpeechVolume?.(percent); }
    // audio 태그는 새 음원(src)을 열 때 속도를 defaultPlaybackRate로 되돌리므로 둘 다 맞춘다.
    setRate(rate) {
      if (this.bridge?.setSpeechRate) { this.bridge.setSpeechRate(rate); return; }
      if (this.bridge) return;
      const audio = this.getAudio();
      audio.defaultPlaybackRate = rate;
      audio.playbackRate = rate;
    }
    hold() { if (this.bridge) this.bridge.holdSpeech(); else this.getAudio().pause(); }
    resume(onError) { if (this.bridge) this.bridge.proceedSpeech(); else this.getAudio().play().catch(onError); }
  }
  // 말이 멈춘 동안(생각할 틈·쉬는 시간) 작게 까는 배경음. 같은 상태를 거듭 알려도 한 번만 켜고 끈다.
  class BedAdapter {
    constructor(getBridge, getAudio) { this.getBridge = getBridge; this.getAudio = getAudio; this.on = false; }
    set(on, volumePercent = 100) {
      on = !!on;
      if (on === this.on) return;
      this.on = on;
      const bridge = this.getBridge();
      if (bridge) { if (bridge.startBed) on ? bridge.startBed() : bridge.stopBed(); return; }
      const audio = this.getAudio();
      if (!audio) return;
      if (!on) { audio.pause(); return; }
      audio.loop = true;
      audio.volume = Math.max(0, Math.min(1, volumePercent / 100 * BedAdapter.LEVEL));
      const playing = audio.play();
      if (playing && typeof playing.catch === 'function') playing.catch(() => {});
    }
  }
  BedAdapter.LEVEL = 1; // 크기는 소리 파일에서 정한다
  class ArrivalPlanner {
    constructor(lesson) { this.lesson = lesson; }
    fit(run, seconds, rate, rested = 0) { return this.lesson.fitTrip(run.pieces, run.index, seconds + rested, run.lesson, run.trip, rate); }
    remaining(pieces, index, position, rate) {
      return pieces.slice(index).reduce((sum, piece, n) => {
        if (this.lesson.isBreak(piece)) return sum;
        const speech = this.lesson.speechSeconds(piece), offset = n ? 0 : position;
        return sum + Math.max(0, speech - offset) / rate + Math.max(0, (piece.wait || 0) - Math.max(0, offset - speech));
      }, 0);
    }
  }
  const api = { Events, LessonSession, VehiclePolicy, SettingsStore, AudioAdapter, BedAdapter, ArrivalPlanner };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DaitPlayback = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
