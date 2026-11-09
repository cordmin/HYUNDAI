package io.dait.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer

// 수업 말이 멈춘 동안(발문 뒤 생각할 틈, 교시 사이 쉬는 시간) 작게 까는 배경음.
// 끊긴 것으로 오해하지 않게 하는 용도라, 길 안내나 통화가 소리를 가져가면 멈췄다가 돌려받으면 다시 튼다.
// 수업 말은 화면이 이 소리를 끈 뒤에 시작한다.
class BedSound(context: Context) {
    private val appContext = context.applicationContext
    private val audio = appContext.getSystemService(AudioManager::class.java)
    private val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()
    private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(attributes)
        .setWillPauseWhenDucked(true) // 소리 자리를 바로 못 받으면 기다렸다 켜지 않는다. 다른 소리를 밀어내지 않게 한다
        .setOnAudioFocusChangeListener(::onFocusChange)
        .build()

    private var player: MediaPlayer? = null
    private var wanted = false
    private var volume = 1f

    fun start() {
        if (wanted) return
        wanted = true
        if (audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) play()
    }

    fun stop() {
        wanted = false
        player?.release()
        player = null
        audio.abandonAudioFocusRequest(focus)
    }

    // 수업 음량 설정(0~100)을 따른다.
    fun setVolume(percent: Int) {
        volume = percent.coerceIn(0, 100) / 100f * LEVEL
        player?.setVolume(volume, volume)
    }

    private fun play() {
        val current = player
        if (current != null) { current.start(); return }
        try {
            appContext.assets.openFd(ASSET).use { file ->
                player = MediaPlayer().apply {
                    setAudioAttributes(attributes)
                    setDataSource(file.fileDescriptor, file.startOffset, file.length)
                    isLooping = true
                    prepare()
                    setVolume(volume, volume)
                    start()
                }
            }
        } catch (_: Exception) { player = null }
    }

    private fun onFocusChange(change: Int) {
        when (change) {
            AudioManager.AUDIOFOCUS_GAIN -> if (wanted) play()
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> player?.pause()
            AudioManager.AUDIOFOCUS_LOSS -> stop()
        }
    }

    companion object {
        private const val ASSET = "sounds/thinking-bed.wav"
        private const val LEVEL = 1f // 크기는 소리 파일에서 정한다. 더 줄이면 차 안에서 들리지 않는다
    }
}
