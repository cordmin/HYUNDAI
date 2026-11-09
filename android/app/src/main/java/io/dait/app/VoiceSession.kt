package io.dait.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.PlaybackParams
import org.json.JSONObject

// 미리 만든 음원을 차례로 튼다.
// 길 안내나 통화가 소리를 가져가면 멈췄다가, 돌아오면 그 문장을 처음부터 다시 말한다.
// 모든 알림에 speak의 순번을 실어, 화면이 지난 말에 대한 늦은 알림을 버릴 수 있게 한다.
class VoiceSession(context: Context, private val onEvent: (JSONObject) -> Unit) {
    private enum class Phase { IDLE, SPEAKING }

    private val appContext = context.applicationContext
    private val audio = appContext.getSystemService(AudioManager::class.java)
    private val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(attributes)
        .setWillPauseWhenDucked(true) // 말소리는 작게 깔면 알아들을 수 없으므로 멈춘다.
        .setAcceptsDelayedFocusGain(true)
        .setOnAudioFocusChangeListener(::onFocusChange)
        .build()

    private var phase = Phase.IDLE
    private var suspended = false
    private var held = false // 사람이 일시정지를 눌렀다. 소리를 돌려받아도 저절로 잇지 않는다
    private var clips: List<String> = emptyList()
    private var index = 0
    private var turn = 0
    private var player: MediaPlayer? = null
    private var playbackVolume = appContext.getSharedPreferences("dait.audio", Context.MODE_PRIVATE)
        .getFloat("volume", 1f).coerceIn(0f, 1f)
    private var playbackRate = 1f
    fun setRate(rate: Float) {
        if (!rate.isFinite() || rate !in 0.8f..2f) return
        playbackRate = rate
        player?.let { current ->
            // Applying non-zero PlaybackParams may start a paused MediaPlayer.
            // Defer it until resume instead of briefly playing while held/interrupted.
            if (current.isPlaying) current.playbackParams = PlaybackParams().setSpeed(playbackRate)
        }
    }

    private var seekPosition = 0

    // 다잇 음원만 조절한다. 재생 위치·오디오 포커스·차량 시스템 음량은 바꾸지 않는다.
    fun setVolume(percent: Int) {
        playbackVolume = percent.coerceIn(0, 100) / 100f
        player?.setVolume(playbackVolume, playbackVolume)
    }

    fun seek(positionMs: Int, expectedTurn: Int) {
        if (expectedTurn != turn || phase != Phase.SPEAKING) return
        seekPosition = positionMs.coerceAtLeast(0)
        player?.let { current ->
            current.seekTo(seekPosition.coerceAtMost((current.duration - 1).coerceAtLeast(0)).toLong(), MediaPlayer.SEEK_CLOSEST)
        }
    }

    fun reportPosition(expectedTurn: Int) {
        if (expectedTurn != turn || phase != Phase.SPEAKING) return
        player?.let { current ->
            onEvent(JSONObject().put("event", "position").put("seq", turn).put("position", current.currentPosition))
        }
    }

    fun speak(nextClips: List<String>, nextTurn: Int) {
        clear()
        clips = nextClips
        turn = nextTurn
        phase = Phase.SPEAKING
        when (audio.requestAudioFocus(focus)) {
            AudioManager.AUDIOFOCUS_REQUEST_GRANTED -> playNext()
            AudioManager.AUDIOFOCUS_REQUEST_DELAYED -> { suspended = true; emit("paused") }
            else -> finish("stopped")
        }
    }

    // 사람이 누른 일시정지. 멈춘 동안 다른 앱이 소리를 쓰도록 소리를 돌려준다.
    fun hold() {
        if (phase == Phase.IDLE || held) return
        held = true
        player?.pause()
        audio.abandonAudioFocusRequest(focus)
        emit("paused")
    }

    // 이어 듣기. 소리를 다시 받아 멈춘 곳에서 잇는다. 바로 못 받으면 받을 때까지 기다린다.
    fun proceed() {
        if (!held && !suspended) return
        held = false
        suspended = false
        when (audio.requestAudioFocus(focus)) {
            AudioManager.AUDIOFOCUS_REQUEST_GRANTED -> resume(rewind = false)
            AudioManager.AUDIOFOCUS_REQUEST_DELAYED -> { suspended = true; emit("paused") }
            else -> finish("stopped")
        }
    }

    fun stop() {
        clear()
        audio.abandonAudioFocusRequest(focus)
    }

    fun release() = stop()

    private fun playNext() {
        if (index < clips.size) playCurrent() else finish("ended")
    }

    private fun playCurrent() {
        try {
            appContext.assets.openFd(assetPath(clips[index])).use { file ->
                player = MediaPlayer().apply {
                    setAudioAttributes(attributes)
                    setDataSource(file.fileDescriptor, file.startOffset, file.length)
                    setOnCompletionListener { onClipDone() }
                    setOnErrorListener { _, _, _ -> onClipDone(); true }
                    prepare()
                    setVolume(playbackVolume, playbackVolume)
                    if (seekPosition > 0) seekTo(seekPosition.coerceAtMost((duration - 1).coerceAtLeast(0)).toLong(), MediaPlayer.SEEK_CLOSEST)
                    playbackParams = PlaybackParams().setSpeed(playbackRate)
                    start()
                }
            }
        } catch (_: Exception) { onClipDone() }
    }

    // 수업 음원은 'lesson/동백꽃_i1'처럼 온다.
    private fun assetPath(clip: String) = "voices/$clip.m4a"

    private fun onClipDone() {
        releasePlayer()
        seekPosition = 0
        index++
        if (!suspended && !held) playNext() // 소리를 빼앗겼거나 멈춘 사이라면 돌아왔을 때 이어 간다.
    }

    private fun onFocusChange(change: Int) {
        when (change) {
            AudioManager.AUDIOFOCUS_GAIN -> if (suspended && !held) resume()
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> suspend()
            AudioManager.AUDIOFOCUS_LOSS -> finish("stopped")
        }
    }

    private fun suspend() {
        if (phase == Phase.IDLE || suspended || held) return
        suspended = true
        player?.pause()
        emit("paused")
    }

    private fun resume(rewind: Boolean = true) {
        suspended = false
        emit("resumed")
        val paused = player
        if (paused == null) playNext() else {
            if (rewind) paused.seekTo(resumePosition(paused))
            paused.playbackParams = PlaybackParams().setSpeed(playbackRate)
            paused.start()
        }
    }

    // 끊긴 곳 조금 앞에서 잇는다.
    private fun resumePosition(paused: MediaPlayer) = (paused.currentPosition - LESSON_REWIND_MS).coerceAtLeast(0)

    private fun finish(event: String) {
        stop()
        emit(event)
    }

    private fun clear() {
        releasePlayer()
        phase = Phase.IDLE
        suspended = false
        held = false
        clips = emptyList()
        index = 0
        seekPosition = 0
    }

    private fun releasePlayer() {
        player?.release()
        player = null
    }

    private fun emit(event: String) = onEvent(JSONObject().put("event", event).put("seq", turn))

    companion object {
        private const val LESSON_REWIND_MS = 3000
    }
}
