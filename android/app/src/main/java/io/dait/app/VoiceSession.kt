package io.dait.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import org.json.JSONObject

// 미리 만든 음원을 차례로 틀고, 필요하면 이어서 아이의 답을 듣는다.
// 길 안내나 통화가 소리를 가져가면 멈췄다가, 돌아오면 그 문장을 처음부터 다시 말한다.
// 모든 알림에 speak의 순번을 실어, 화면이 지난 말에 대한 늦은 알림을 버릴 수 있게 한다.
class VoiceSession(context: Context, private val input: LocalVoiceInput?, private val onEvent: (JSONObject) -> Unit) {
    private enum class Phase { IDLE, SPEAKING, LISTENING }

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
    private var clips: List<String> = emptyList()
    private var index = 0
    private var listen = ""
    private var turn = 0
    private var player: MediaPlayer? = null

    fun speak(nextClips: List<String>, nextListen: String, nextTurn: Int) {
        clear()
        clips = nextClips
        listen = nextListen
        turn = nextTurn
        phase = Phase.SPEAKING
        when (audio.requestAudioFocus(focus)) {
            AudioManager.AUDIOFOCUS_REQUEST_GRANTED -> playNext()
            AudioManager.AUDIOFOCUS_REQUEST_DELAYED -> { suspended = true; emit("paused") }
            else -> finish("stopped")
        }
    }

    fun stop() {
        clear()
        audio.abandonAudioFocusRequest(focus)
    }

    fun release() {
        stop()
        input?.close()
    }

    // 말할 음원이 남았으면 틀고, 없으면 듣기로 넘어간다. 음원 없이 부르면 말없이 다시 듣는다.
    private fun playNext() {
        when {
            index < clips.size -> playCurrent()
            listen.isEmpty() -> finish("ended")
            !startListening() -> finish("micFailed")
        }
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
                    start()
                }
            }
        } catch (_: Exception) { onClipDone() }
    }

    // 'temp/...'처럼 폴더가 붙은 것은 임시 음성이고, 나머지는 팀 음원이다.
    private fun assetPath(clip: String) = when {
        isLessonClip(clip) -> "voices/$clip.m4a"
        '/' in clip -> "voices/$clip.wav"
        else -> "voices/nika/$clip.wav"
    }

    private fun isLessonClip(clip: String) = clip.startsWith("lesson/")

    private fun onClipDone() {
        releasePlayer()
        index++
        if (!suspended) playNext() // 소리를 빼앗긴 사이라면 돌아왔을 때 이어 간다.
    }

    private fun startListening(): Boolean {
        val voiceInput = input ?: return false
        val started = voiceInput.start(listen.takeUnless { it == FREE_SPEECH }, { text, reference ->
            phase = Phase.IDLE
            onEvent(JSONObject().put("event", "heard").put("seq", turn).put("text", text).put("reference", reference))
        }, {
            phase = Phase.IDLE
            emit("silence")
        })
        if (started) { phase = Phase.LISTENING; emit("listening") }
        return started
    }

    private fun onFocusChange(change: Int) {
        when (change) {
            AudioManager.AUDIOFOCUS_GAIN -> if (suspended) resume()
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> suspend()
            AudioManager.AUDIOFOCUS_LOSS -> finish("stopped")
        }
    }

    private fun suspend() {
        if (phase == Phase.IDLE || suspended) return
        suspended = true
        if (phase == Phase.SPEAKING) player?.pause() else input?.stop()
        emit("paused")
    }

    private fun resume() {
        suspended = false
        emit("resumed")
        if (phase == Phase.LISTENING) {
            if (!startListening()) finish("micFailed")
        } else {
            val paused = player
            if (paused == null) playNext() else { paused.seekTo(resumePosition(paused)); paused.start() }
        }
    }

    // 짧은 문장은 처음부터 다시 말하고, 긴 수업 조각은 끊긴 곳 조금 앞에서 잇는다.
    private fun resumePosition(paused: MediaPlayer) =
        if (isLessonClip(clips[index])) (paused.currentPosition - LESSON_REWIND_MS).coerceAtLeast(0) else 0

    private fun finish(event: String) {
        stop()
        emit(event)
    }

    private fun clear() {
        releasePlayer()
        input?.stop()
        phase = Phase.IDLE
        suspended = false
        clips = emptyList()
        index = 0
    }

    private fun releasePlayer() {
        player?.release()
        player = null
    }

    private fun emit(event: String) = onEvent(JSONObject().put("event", event).put("seq", turn))

    companion object {
        const val FREE_SPEECH = "free"
        private const val LESSON_REWIND_MS = 3000
    }
}
