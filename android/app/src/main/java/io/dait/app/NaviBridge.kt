package io.dait.app

import android.content.Context
import ai.pleos.playground.navi.constants.NaviErrorCode
import ai.pleos.playground.navi.constants.NavigationStatus
import ai.pleos.playground.navi.data.DestinationArrivedInfo
import ai.pleos.playground.navi.data.DestinationInfo
import ai.pleos.playground.navi.data.RouteStartInfo
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import org.json.JSONObject

// Pleos NaviHelper에서 목적지와 남은 시간을 받아 화면으로 넘긴다.
// 남은 시간이 바뀌어도 알림이 따로 오지 않으므로 길 안내 중에는 주기적으로 묻는다.
class NaviBridge(context: Context, private val onUpdate: (JSONObject) -> Unit) {
    private val helper = NaviHelper(context.applicationContext)
    private var connected = false
    private var guiding = false
    private var polling = false
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())

    private val listener = object : NaviHelperEventListener {
        override fun onRouteStarted(routeStartInfo: RouteStartInfo) {
            guiding = true
            emit(JSONObject().put("event", "routeStarted").put("name", routeStartInfo.name)
                .put("remainTime", routeStartInfo.duration).put("remainDistance", routeStartInfo.distance))
            startPolling()
        }

        override fun onRouteCancelled() { guiding = false; emit(JSONObject().put("event", "routeCancelled")) }
        override fun onRouteEnded() { guiding = false; emit(JSONObject().put("event", "routeEnded")) }
        override fun onDestinationArrived(destinationArrivedInfo: DestinationArrivedInfo) {
            guiding = false
            emit(JSONObject().put("event", "arrived").put("name", destinationArrivedInfo.name))
        }

        override fun onNavigationStatus(status: NavigationStatus) {
            guiding = status == NavigationStatus.ROUTE_DRIVE
            emit(JSONObject().put("event", "status").put("status", status.name))
            if (guiding) startPolling()
        }

        override fun onDestinationInfo(destinationInfo: DestinationInfo) {
            emit(JSONObject().put("event", "destination")
                .put("name", destinationInfo.name).put("address", destinationInfo.address)
                .put("remainTime", destinationInfo.remainTime).put("remainDistance", destinationInfo.remainDistance))
        }

        override fun onError(errorCode: NaviErrorCode) { emit(JSONObject().put("event", "error").put("code", errorCode.name)) }
    }

    private val poll = object : Runnable {
        override fun run() {
            if (!connected || !guiding) { polling = false; return }
            try { helper.getDestinationInfo() } catch (_: Exception) {}
            handler.postDelayed(this, POLL_MS)
        }
    }

    fun connect() {
        try {
            helper.initialize(
                onConnected = {
                    connected = true
                    try {
                        helper.addListener(listener)
                        helper.getDestinationInfo()
                    } catch (_: Exception) {}
                    emit(JSONObject().put("event", "connected"))
                    // 이미 길 안내 중일 수 있으니 묻기 시작한다. 안내가 없으면 빈 값이 와서 화면이 무시한다.
                    guiding = true
                    startPolling()
                },
                onFailed = { emit(JSONObject().put("event", "unavailable")) },
            )
        } catch (_: Throwable) {
            emit(JSONObject().put("event", "unavailable"))
        }
    }

    fun release() {
        handler.removeCallbacks(poll)
        polling = false
        if (connected) {
            try { helper.removeListener(listener) } catch (_: Exception) {}
            try { helper.release() } catch (_: Exception) {}
        }
        connected = false
    }

    private fun startPolling() {
        if (polling) return
        polling = true
        handler.removeCallbacks(poll)
        handler.postDelayed(poll, POLL_MS)
    }

    private fun emit(json: JSONObject) { handler.post { onUpdate(json) } }

    companion object {
        private const val POLL_MS = 10_000L
    }
}
