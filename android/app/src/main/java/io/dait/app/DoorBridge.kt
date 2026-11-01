package io.dait.app

import ai.pleos.playground.vehicle.Vehicle
import ai.pleos.playground.vehicle.api.Door
import ai.pleos.playground.vehicle.api.model.area.DoorArea
import ai.pleos.playground.vehicle.constant.area.DoorValue
import ai.pleos.playground.vehicle.listener.DoorPositionListener
import android.content.Context
import android.os.Handler
import android.os.Looper

// Pleos Vehicle SDK에서 아이가 내리는 문이 열리는 순간을 받아 화면으로 넘긴다.
// 운전석 문은 보호자가 먼저 내릴 수 있으므로 보지 않는다.
class DoorBridge(context: Context, private val onOpened: () -> Unit) {
    private val appContext = context.applicationContext
    private val handler = Handler(Looper.getMainLooper())
    private val areas = listOf(DoorValue.ROW_1_RIGHT, DoorValue.ROW_2_LEFT, DoorValue.ROW_2_RIGHT).map { DoorArea(it) }
    private val listeners = mutableMapOf<DoorArea, DoorPositionListener>()
    private var vehicle: Vehicle? = null
    private var door: Door? = null
    private var retries = 0

    // Vehicle 서비스가 없는 차에서도 앱은 동작해야 하므로 실패하면 이 기능만 쉰다.
    fun connect() {
        try {
            vehicle = Vehicle(appContext).also {
                it.initialize()
                door = it.getDoor()
            }
            scheduleRegister()
        } catch (_: Throwable) {}
    }

    // initialize는 연결 결과를 알려 주지 않으므로 시간을 두고 등록하고, 실패하면 몇 번 더 해 본다.
    private fun scheduleRegister() {
        handler.postDelayed({ register() }, RETRY_MS)
    }

    private fun register() {
        val connected = door ?: return
        areas.filterNot { it in listeners }.forEach { area ->
            val listener = watch(area)
            try {
                connected.registerDoorPosition(area, listener)
                listeners[area] = listener
            } catch (_: Exception) {
                retryLater(area)
            }
        }
    }

    private fun retryLater(area: DoorArea) {
        listeners.remove(area)
        if (retries++ < MAX_RETRIES) scheduleRegister()
    }

    // 처음 오는 값은 현재 상태이므로 기록만 하고, 닫혀 있다가 열릴 때만 알린다.
    private fun watch(area: DoorArea) = object : DoorPositionListener {
        private var wasOpen: Boolean? = null

        override fun onPositionUpdated(pos: Int?) {
            val open = (pos ?: 0) > 0
            if (open && wasOpen == false) handler.post { onOpened() }
            wasOpen = open
        }

        override fun onFailed(e: Exception) {
            handler.post { retryLater(area) }
        }
    }

    fun release() {
        handler.removeCallbacksAndMessages(null)
        listeners.forEach { (area, listener) ->
            try { door?.unregisterDoorPosition(area, listener) } catch (_: Exception) {}
        }
        listeners.clear()
        try { vehicle?.release() } catch (_: Throwable) {}
    }

    companion object {
        private const val RETRY_MS = 1500L
        private const val MAX_RETRIES = 5
    }
}
