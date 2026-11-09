// 다잇 화면: 소리 내기. 앱에서는 VoiceSession(Kotlin)이, 브라우저 미리보기에서는 audio 태그가 수업 음원을 튼다.

// ========================================================
// 소리 내기
// 앱에서는 VoiceSession이, 브라우저 미리보기에서는 audio 태그가 소리를 낸다.
// ========================================================
function speak(clips) {
  speechPhase = 'speaking';
  speechPaused = false;
  speechSeq++;
  syncLessonBed(); // 배경음을 먼저 끄고 말한다
  applyLessonAudioRate();
  audioAdapter.speak(clips, speechSeq, () => { previewQueue = clips.slice(); playPreviewClip(); });
}

// 브라우저 미리보기: 음원을 차례로 튼다.
function playPreviewClip() {
  const clip = previewQueue.shift();
  if (!clip) {
    window.onSpeechEvent(JSON.stringify({ event: 'ended', seq: speechSeq }));
    return;
  }
  const player = document.getElementById('audioPlayer');
  const seq = speechSeq; // 재생 실패 알림이 늦게 와도 그사이 시작한 다음 말을 끝내지 않게 한다
  const src = `voices/${clip}.m4a`;
  audioAdapter.playClip(src, e => {
    if (e.name === 'AbortError') return; // 위치 이동이나 일시정지가 진행 중인 재생 요청을 취소할 수 있다.
    console.log('Audio error:', e);
    window.onSpeechEvent(JSON.stringify({ event: 'ended', seq }));
  });
}

function stopSpeech() {
  speechPhase = 'idle';
  speechPaused = false;
  speechSeq++;
  audioAdapter.stop();
  syncLessonBed();
}

function holdSpeech() {
  audioAdapter.hold();
}

function proceedSpeech() {
  audioAdapter.resume(() => window.onSpeechEvent(JSON.stringify({ event: 'ended', seq: speechSeq })));
}

window.onSpeechEvent = function(jsonText) {
  const info = JSON.parse(jsonText);
  if (info.seq !== speechSeq) return; // 지난 말에 대한 늦은 알림
  if (info.event === 'position') {
    if (lessonRun && !lessonRun.done && Number.isFinite(info.position)) {
      lessonRun.positionSeconds = info.position / 1000;
      updateLessonProgress();
    }
    return;
  }
  if (info.event === 'paused' || info.event === 'resumed') {
    speechPaused = info.event === 'paused';
    if(speechPaused&&lessonRun?.done){cancelNextLessonCountdown();renderStage();updateDriveScreen();}
    if (currentMode === 'lesson' && lessonRun && !lessonRun.done) {
      if (speechPaused) lessonRun.playback.interrupt();
      else if (!lessonRun.playback.resumeFromSystem()) { holdSpeech(); speechPaused = true; }
      renderStage();
      syncLessonMedia();
    }
    syncLessonBed();
    return;
  }
  speechPhase = 'idle';
  if (currentMode === 'lesson') onLessonSpeech(info);
};

document.getElementById('audioPlayer').addEventListener('ended', playPreviewClip);
