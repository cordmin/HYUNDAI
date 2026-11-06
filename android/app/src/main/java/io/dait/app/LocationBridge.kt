package io.dait.app

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper

// 차 위치를 화면으로 넘긴다. 좌표는 여기서도 화면에서도 기록으로 남기지 않는다.
// Pleos FusedLocation이 준비 중이라 안드로이드 기본 위치를 쓴다. 제공되면 이 파일만 바꾼다.
class LocationBridge(context: Context, private val onUpdate: (Double, Double) -> Unit) {
    private val manager = context.getSystemService(LocationManager::class.java)
    private var listening = false

    // API 29까지는 나머지 메서드에 기본 구현이 없어 모두 적어 둔다.
    private val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) = send(location)
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
        @Deprecated("Platform callback")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    }

    val available: Boolean
        get() = try { manager.allProviders.any { it in PROVIDERS } } catch (_: Exception) { false }

    // 위치 제공자가 없는 차에서도 앱은 동작해야 하므로 실패하면 이 기능만 쉰다.
    @SuppressLint("MissingPermission")
    fun start() {
        if (listening) return
        try {
            val provider = PROVIDERS.firstOrNull { manager.isProviderEnabled(it) } ?: return
            manager.requestLocationUpdates(provider, UPDATE_MS, 0f, listener, Looper.getMainLooper())
            listening = true
            running = true
            manager.getLastKnownLocation(provider)?.let { send(it) }
        } catch (_: Exception) {}
    }

    fun stop() {
        if (!listening) return
        try { manager.removeUpdates(listener) } catch (_: Exception) {}
        listening = false
        running = false
    }

    private fun send(location: Location) = onUpdate(location.latitude, location.longitude)

    companion object {
        // 'fused'는 API 31부터 있는 제공자 이름이다. 없는 차에서는 GPS로 넘어간다.
        private val PROVIDERS = listOf("fused", LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
        // 멈춰 있어도 위치가 와야 지금 위치가 끊기지 않았는지 알 수 있다.
        private const val UPDATE_MS = 10_000L

        var running = false
            private set
    }
}
