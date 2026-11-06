package io.dait.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.car.Car
import android.car.drivingstate.CarUxRestrictionsManager
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var car: Car? = null
    private var restrictions: CarUxRestrictionsManager? = null
    private var visible = false
    private var simulatedDriving = false
    private var isRestricted = true // 차 상태를 받기 전에는 주행 중으로 둔다.
    private var navi: NaviBridge? = null
    private var doors: DoorBridge? = null
    private var location: LocationBridge? = null
    private var voice: VoiceSession? = null
    private var hasSpeechModel = false
    private var speechInput: LocalVoiceInput? = null
    private var journeyActive = false
    private var pageReady = false
    private val gleoWaiting = mutableListOf<String>()
    private val gleoGuards = mutableMapOf<String, Runnable>()
    private val handler = Handler(Looper.getMainLooper())

    private val restrictionListener = CarUxRestrictionsManager.OnUxRestrictionsChangedListener { value ->
        runOnUiThread { applyPlatformRestriction(value.isRequiresDistractionOptimization) }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Removed preparation feature: discard its old cached response.
        getSharedPreferences("gleo", MODE_PRIVATE).edit().remove("schoolBrief").apply()

        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)
        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_NO_CACHE
            }
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    applyPlatformRestriction(isRestricted)
                    navi?.requestPlaces()
                    pageReady = true
                    // Gleo에는 이미 답했으므로, 내비의 남은 시간이 화면에 올 틈을 두고 수업을 고른다.
                    val waiting = gleoWaiting.toList()
                    gleoWaiting.clear()
                    if (waiting.isNotEmpty()) handler.postDelayed({ waiting.forEach { callPage(it) } }, GLEO_WAKE_DELAY_MS)
                }
            }
            addJavascriptInterface(WebAppInterface(), "AndroidBridge")
            loadUrl("file:///android_asset/dait-preview.html")
        }

        setContentView(webView)

        hasSpeechModel = !assets.list("model-ko").isNullOrEmpty()
        speechInput = if (hasSpeechModel) LocalVoiceInput(this) {} else null
        voice = VoiceSession(this, speechInput) { event ->
            callPage("window.onSpeechEvent && window.onSpeechEvent(${JSONObject.quote(event.toString())});")
        }
        navi = NaviBridge(this) { json ->
            callPage("window.onNaviUpdate && window.onNaviUpdate(${JSONObject.quote(json.toString())});")
        }.also { it.connect() }
        doors = DoorBridge(this) { callPage("window.onDoorOpened && window.onDoorOpened();") }.also { it.connect() }
        location = LocationBridge(this) { lat, lng -> callPage("window.onCarLocation && window.onCarLocation($lat, $lng);") }
        connectCarService()
        currentRef = WeakReference(this)
        // 최근 앱 목록에서 다시 열거나 시스템이 되살린 화면은 지난 Gleo 부름을 다시 하지 않는다.
        val fromHistory = intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0
        if (savedInstanceState == null && !fromHistory) handleLaunch(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleLaunch(intent)
    }

    // Gleo는 START_LESSON을 화면 띄우기로 부른다. 첫 실행이면 화면이 다 열린 뒤에 넘긴다.
    private fun handleLaunch(intent: Intent?) {
        if (intent?.action != Gleo.START_LESSON) return
        handleGleo(Gleo.START_LESSON, Gleo.params(intent))
        setIntent(Intent(intent).setAction(null))
    }

    // 화면이 답하지 못하고 Gleo가 기다리다 끊지 않게, 6초 안에 답이 없으면 앱이 대신 실패로 답한다.
    // 꺼져 있던 앱은 화면이 열리는 데 6초 넘게 걸리므로(에뮬레이터 확인) 수업 시작은 연다고 먼저 답하고 화면이 열리면 시작한다.
    fun handleGleo(functionName: String, params: JSONObject): Boolean {
        if (isDestroyed) return false
        runOnUiThread {
            val script = "window.onGleoAction && window.onGleoAction(${JSONObject.quote(functionName)}, ${JSONObject.quote(params.toString())});"
            if (!pageReady) {
                if (functionName == Gleo.START_LESSON) {
                    Gleo.respond(this, Gleo.response(functionName, "success", "Opening DAIT to start the lesson.", "beep"))
                    gleoWaiting.add(script)
                } else {
                    Gleo.respond(this, Gleo.response(functionName, "fail", "No DAIT lesson is playing right now."))
                }
                return@runOnUiThread
            }
            gleoGuards.remove(functionName)?.let { handler.removeCallbacks(it) }
            val guard = Runnable {
                gleoGuards.remove(functionName)
                Gleo.respond(this, Gleo.response(functionName, "fail", "DAIT could not finish the request in time."))
            }
            gleoGuards[functionName] = guard
            handler.postDelayed(guard, GLEO_GUARD_MS)
            callPage(script)
        }
        return true
    }

    // 핸들 버튼이나 차의 미디어 화면에서 온 재생·멈춤·이전을 화면의 수업에 넘긴다.
    fun onMediaCommand(command: String) {
        callPage("window.onMediaKey && window.onMediaKey(${JSONObject.quote(command)});")
    }

    override fun onResume() {
        super.onResume()
        visible = true
        webView.onResume()
        callPage("window.onAppResumed && window.onAppResumed();")
    }

    // 여정 중에는 내비가 앱을 덮어도 대화가 이어져야 하므로 웹 화면을 멈추지 않는다.
    override fun onPause() {
        super.onPause()
        visible = false
        if (!journeyActive) webView.onPause()
    }

    override fun onDestroy() {
        if (currentRef.get() === this) currentRef = WeakReference(null)
        // 화면이 닫혀도 기다리는 Gleo에는 답한다.
        gleoGuards.forEach { (name, guard) ->
            handler.removeCallbacks(guard)
            Gleo.respond(this, Gleo.response(name, "fail", "DAIT was closed before it could finish the request."))
        }
        gleoGuards.clear()
        LessonMedia.update(this, false, false, "", "")
        JourneyService.stop(this)
        voice?.release()
        voice = null
        navi?.release()
        navi = null
        doors?.release()
        doors = null
        location?.stop()
        location = null
        try { restrictions?.unregisterListener() } catch (_: Exception) {}
        restrictions = null
        car?.disconnect()
        car = null
        webView.destroy()
        super.onDestroy()
    }

    @Deprecated("Platform back navigation")
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == MIC_REQUEST) callPage("window.onMicAnswered && window.onMicAnswered();")
        if (requestCode == LOCATION_REQUEST) callPage("window.onLocationAnswered && window.onLocationAnswered();")
    }

    // 내비가 앱을 덮은 채로 출발해도 주행 시작을 알 수 있게 앱이 살아 있는 동안 계속 듣는다.
    private fun connectCarService() {
        try {
            car = Car.createCar(this, null, Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT) { connectedCar, ready ->
                runOnUiThread {
                    if (isDestroyed) { connectedCar.disconnect(); return@runOnUiThread }
                    if (!ready) { applyPlatformRestriction(true); return@runOnUiThread }
                    try {
                        restrictions = connectedCar.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as CarUxRestrictionsManager
                        restrictions?.registerListener(restrictionListener)
                        val blocked = restrictions?.currentCarUxRestrictions?.isRequiresDistractionOptimization != false
                        applyPlatformRestriction(blocked)
                    } catch (_: Exception) { applyPlatformRestriction(true) }
                }
            }
        } catch (_: Exception) { applyPlatformRestriction(true) }
    }

    private fun applyPlatformRestriction(blocked: Boolean) {
        isRestricted = blocked
        val effective = blocked || simulatedDriving
        callPage("window.setDrivingMode && window.setDrivingMode($effective, $blocked);")
    }

    private fun callPage(script: String) {
        runOnUiThread { if (!isDestroyed) webView.evaluateJavascript(script, null) }
    }

    private fun micGranted() = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    // 대략적인 위치로는 집과 학교를 나눌 수 없으므로 정확한 위치를 허락받아야 쓴다.
    private fun locationGranted() = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    inner class WebAppInterface {
        @JavascriptInterface
        fun neisGet(requestId: Int, service: String, query: String) {
            Thread {
                val body = try { NeisClient.fetch(service, query) } catch (_: Exception) { "" }
                callPage("window.onNeisResult && window.onNeisResult($requestId, ${JSONObject.quote(body)});")
            }.start()
        }

        @JavascriptInterface
        fun tourGet(requestId: Int, service: String, query: String) {
            Thread {
                val body = try { TourClient.fetch(service, query) } catch (_: Exception) { "" }
                callPage("window.onTourResult && window.onTourResult($requestId, ${JSONObject.quote(body)});")
            }.start()
        }

        // 개발용 앱인지 알려 준다. 화면은 제출용 앱에서 시연 버튼 줄을 숨긴다.
        @JavascriptInterface
        fun isDebugBuild(): Boolean = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0

        @JavascriptInterface
        fun toggleDrivingSim() {
            runOnUiThread {
                if (isRestricted) return@runOnUiThread
                simulatedDriving = !simulatedDriving
                applyPlatformRestriction(isRestricted)
            }
        }

        @JavascriptInterface
        fun speak(clipsJson: String, listen: String, turn: Int) {
            val array = JSONArray(clipsJson)
            val clips = List(array.length()) { array.getString(it) }
            runOnUiThread { voice?.speak(clips, listen, turn) }
        }

        @JavascriptInterface
        fun startRoute(placeJson: String) {
            val place = JSONObject(placeJson)
            runOnUiThread { navi?.startRoute(place) }
        }

        @JavascriptInterface
        fun stopSpeech() {
            runOnUiThread { voice?.stop() }
        }

        @JavascriptInterface
        fun holdSpeech() {
            runOnUiThread { voice?.hold() }
        }

        @JavascriptInterface
        fun proceedSpeech() {
            runOnUiThread { voice?.proceed() }
        }

        @JavascriptInterface
        fun seekSpeech(positionMs: Int, turn: Int) {
            runOnUiThread { voice?.seek(positionMs, turn) }
        }

        @JavascriptInterface
        fun reportSpeechPosition(turn: Int) {
            runOnUiThread { voice?.reportPosition(turn) }
        }

        // 'none'은 음성 인식 모델이 없음, 'ask'는 아직 마이크 허락을 받지 않음,
        // 'loading'은 모델을 읽는 중, 'ready'는 들을 수 있음.
        @JavascriptInterface
        fun micState(): String = when {
            !hasSpeechModel -> "none"
            !micGranted() -> "ask"
            speechInput?.ready == true -> "ready"
            else -> "loading"
        }

        @JavascriptInterface
        fun requestMic() {
            runOnUiThread { requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), MIC_REQUEST) }
        }

        @JavascriptInterface
        fun locationState(): String = when {
            location?.available != true -> "none"
            locationGranted() -> "ready"
            else -> "ask"
        }

        @JavascriptInterface
        fun requestLocation() {
            val permissions = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            runOnUiThread { requestPermissions(permissions, LOCATION_REQUEST) }
        }

        @JavascriptInterface
        fun setLocationOn(on: Boolean) {
            runOnUiThread { if (on && locationGranted()) location?.start() else location?.stop() }
        }

        // 화면이 Gleo 부름에 답한다. 답이 늦어 이미 실패로 답한 부름이면 버린다.
        @JavascriptInterface
        fun gleoRespond(responseJson: String) {
            val response = JSONObject(responseJson)
            runOnUiThread {
                val guard = gleoGuards.remove(response.optString("functionName")) ?: return@runOnUiThread
                handler.removeCallbacks(guard)
                Gleo.respond(this@MainActivity, response)
            }
        }

        // 화면이 수업 상태가 바뀔 때마다 알려 준다. 차의 미디어 화면과 핸들 버튼이 이 상태를 따른다.
        @JavascriptInterface
        fun setLessonMedia(active: Boolean, playing: Boolean, title: String, subtitle: String) {
            runOnUiThread { LessonMedia.update(this@MainActivity, active, playing, title, subtitle) }
        }

        @JavascriptInterface
        fun setJourneyActive(active: Boolean) {
            runOnUiThread {
                journeyActive = active
                if (active) {
                    JourneyService.start(this@MainActivity)
                } else {
                    JourneyService.stop(this@MainActivity)
                    if (!visible) webView.onPause()
                }
            }
        }
    }

    companion object {
        private const val MIC_REQUEST = 1
        private const val LOCATION_REQUEST = 2
        private const val GLEO_GUARD_MS = 6000L
        private const val GLEO_WAKE_DELAY_MS = 2000L
        private var currentRef = WeakReference<MainActivity>(null)
        val current: MainActivity? get() = currentRef.get()
    }
}
