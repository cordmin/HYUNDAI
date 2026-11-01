package io.dait.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

// 내비가 앱을 덮어도 여정 동안 말하고 들을 수 있게 앱을 앞쪽 작업으로 유지한다.
// 하는 일은 알림을 띄우는 것뿐이고, 말과 듣기는 VoiceSession이 맡는다.
class JourneyService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "다잇 여정", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_dait)
            .setContentTitle("다잇")
            .setContentText("함께 가고 있어요")
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(NOTIFICATION_ID, notification, foregroundTypes())
            else startForeground(NOTIFICATION_ID, notification)
        } catch (_: RuntimeException) {
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun foregroundTypes(): Int {
        val mic = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val media = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        return if (mic && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) media or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else media
    }

    companion object {
        private const val CHANNEL = "journey"
        private const val NOTIFICATION_ID = 1

        // 뒤에서 처음 시작하는 것은 안드로이드가 막는다. 그때는 앱이 앞에 있는 동안만 말하고 듣는다.
        fun start(context: Context) {
            try {
                context.startForegroundService(Intent(context, JourneyService::class.java))
            } catch (_: IllegalStateException) {}
        }

        fun stop(context: Context) = context.stopService(Intent(context, JourneyService::class.java))
    }
}
