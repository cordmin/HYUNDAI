package io.dait.app

import android.content.Context
import android.media.MediaMetadata
import android.media.browse.MediaBrowser
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Bundle
import android.os.SystemClock
import android.service.media.MediaBrowserService

// 차가 수업을 음악처럼 다루게 한다. 핸들의 재생·멈춤·이전 버튼이 수업에 오고, 차의 미디어 화면에 수업 이름이 뜬다.
// 수업을 고르고 진행하는 것은 화면(dait-preview.html)이 하고, 여기서는 버튼을 화면에 넘기고 화면이 알려 준 상태를 차에 보인다.
object LessonMedia {
    const val PLAY = "play"
    const val PAUSE = "pause"
    const val PREVIOUS = "previous"

    private var session: MediaSession? = null

    // 미디어 화면이 앱보다 먼저 서비스에 붙을 수도 있으므로, 처음 찾는 쪽이 만든다.
    fun session(context: Context): MediaSession = session ?: MediaSession(context.applicationContext, "DaitLesson").also { created ->
        created.setCallback(object : MediaSession.Callback() {
            override fun onPlay() = send(PLAY)
            override fun onPause() = send(PAUSE)
            override fun onStop() = send(PAUSE) // 수업을 끝내 버리지 않고 멈추기만 한다
            override fun onSkipToPrevious() = send(PREVIOUS)
        })
        created.setPlaybackState(state(PlaybackState.STATE_NONE, 0L))
        session = created
    }

    // 듣는 수업이 없으면 버튼을 받지 않는다. 쉬는 시간과 멈춘 수업은 멈춤으로 보여, 재생 버튼이 이어 듣기가 된다.
    fun update(context: Context, active: Boolean, playing: Boolean, title: String, subtitle: String) {
        val media = session(context)
        if (!active) {
            media.setPlaybackState(state(PlaybackState.STATE_NONE, 0L))
            media.isActive = false
            return
        }
        media.setMetadata(MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, subtitle)
            .putString(MediaMetadata.METADATA_KEY_ALBUM, "다잇 수업")
            .build())
        val actions = PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or
            PlaybackState.ACTION_STOP or PlaybackState.ACTION_SKIP_TO_PREVIOUS
        media.setPlaybackState(state(if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED, actions))
        media.isActive = true
    }

    private fun state(value: Int, actions: Long): PlaybackState = PlaybackState.Builder()
        .setActions(actions)
        .setState(value, PlaybackState.PLAYBACK_POSITION_UNKNOWN, if (value == PlaybackState.STATE_PLAYING) 1f else 0f, SystemClock.elapsedRealtime())
        .build()

    private fun send(command: String) {
        MainActivity.current?.onMediaCommand(command)
    }
}

// 차의 미디어 화면이 다잇을 오디오 앱으로 찾고 수업 상태를 보게 하는 문. 고를 목록은 두지 않는다(수업은 앱 화면에서 고른다).
class LessonMediaService : MediaBrowserService() {
    override fun onCreate() {
        super.onCreate()
        sessionToken = LessonMedia.session(this).sessionToken
    }

    override fun onGetRoot(clientPackageName: String, clientUid: Int, rootHints: Bundle?): BrowserRoot = BrowserRoot(ROOT, null)

    override fun onLoadChildren(parentId: String, result: Result<MutableList<MediaBrowser.MediaItem>>) {
        result.sendResult(mutableListOf())
    }

    private companion object {
        const val ROOT = "dait-root"
    }
}
