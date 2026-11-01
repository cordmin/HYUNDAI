package io.dait.app

import android.content.Context
import ai.pleos.playground.navi.constants.NaviErrorCode
import ai.pleos.playground.navi.constants.NavigationStatus
import ai.pleos.playground.navi.data.BookmarkInfo
import ai.pleos.playground.navi.data.DestinationArrivedInfo
import ai.pleos.playground.navi.data.DestinationInfo
import ai.pleos.playground.navi.data.RecentDestinationInfo
import ai.pleos.playground.navi.data.RouteInfo
import ai.pleos.playground.navi.data.RouteStartInfo
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import org.json.JSONArray
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
            emit(place(destinationInfo.name, destinationInfo.address, destinationInfo.latitude, destinationInfo.longitude,
                destinationInfo.poiId, destinationInfo.poiSubId, destinationInfo.poiProvider)
                .put("event", "destination")
                .put("remainTime", destinationInfo.remainTime).put("remainDistance", destinationInfo.remainDistance))
        }

        override fun onBookmarkInfo(bookmarkInfo: List<BookmarkInfo>) {
            emitPlaces(bookmarkInfo.map {
                place(it.name, it.address, it.latitude, it.longitude, it.poiId, it.poiSubId, it.poiProvider).put("category", it.category?.name)
            })
        }

        override fun onRecentDestinationInfo(recentDestinationInfo: List<RecentDestinationInfo>) {
            emitPlaces(recentDestinationInfo.map {
                place(it.name, it.address, it.latitude, it.longitude, it.poiId, it.poiSubId, it.poiProvider)
            })
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
                    requestPlaces()
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

    // 즐겨찾기와 최근 목적지를 묻는다. 화면이 뜨기 전에 온 답은 사라지므로 화면이 뜬 뒤에도 부른다.
    fun requestPlaces() {
        if (!connected) return
        try {
            helper.getBookmarkInfo()
            helper.getRecentDestinationInfo()
        } catch (_: Exception) {}
    }

    // 화면이 기억해 둔 학교나 집으로 길 안내를 시작한다.
    fun startRoute(place: JSONObject) {
        if (!connected) return
        try {
            helper.requestRoute(RouteInfo(
                latitude = place.getDouble("lat"),
                longitude = place.getDouble("lng"),
                poiName = place.optString("name"),
                poiId = place.optString("poiId"),
                address = place.optString("address"),
                poiSubId = place.optString("poiSubId"),
                poiProvider = place.optString("poiProvider"),
            ))
        } catch (_: Exception) { emit(JSONObject().put("event", "routeFailed")) }
    }

    private fun place(name: String?, address: String?, lat: Double, lng: Double, poiId: String?, poiSubId: String?, poiProvider: String?) =
        JSONObject().put("name", name).put("address", address).put("lat", lat).put("lng", lng)
            .put("poiId", poiId).put("poiSubId", poiSubId).put("poiProvider", poiProvider)

    private fun emitPlaces(places: List<JSONObject>) {
        emit(JSONObject().put("event", "places").put("places", JSONArray(places)))
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
