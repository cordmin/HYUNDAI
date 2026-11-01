package io.dait.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.car.Car
import android.car.drivingstate.CarUxRestrictionsManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var car: Car? = null
    private var restrictions: CarUxRestrictionsManager? = null
    private var visible = false
    private var simulatedDriving = false
    private var isRestricted = true // 차 상태를 받기 전에는 주행 중으로 둔다.
    private var navi: NaviBridge? = null
    private var voice: VoiceSession? = null
    private var hasSpeechModel = false
    private var speechInput: LocalVoiceInput? = null
    private var journeyActive = false
    private var tts: TextToSpeech? = null

    private val restrictionListener = CarUxRestrictionsManager.OnUxRestrictionsChangedListener { value ->
        runOnUiThread { applyPlatformRestriction(value.isRequiresDistractionOptimization) }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

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
        connectCarService()

        // 주말 진로 체험의 기사 낭독용 (니카 녹음 음원이 없는 실시간 기사). 주차 중 화면에서만 쓴다.
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) tts?.language = Locale.KOREAN
        }
    }

    override fun onResume() {
        super.onResume()
        visible = true
        webView.onResume()
    }

    // 여정 중에는 내비가 앱을 덮어도 대화가 이어져야 하므로 웹 화면을 멈추지 않는다.
    override fun onPause() {
        super.onPause()
        visible = false
        if (!journeyActive) webView.onPause()
    }

    override fun onDestroy() {
        JourneyService.stop(this)
        voice?.release()
        voice = null
        tts?.shutdown()
        tts = null
        navi?.release()
        navi = null
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
        fun stopSpeech() {
            runOnUiThread { voice?.stop() }
        }

        @JavascriptInterface
        fun speakText(text: String) {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "dait-news")
        }

        @JavascriptInterface
        fun stopText() {
            tts?.stop()
        }

        @JavascriptInterface
        fun openUrl(url: String) {
            if (!url.startsWith("https://")) return
            runOnUiThread {
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: ActivityNotFoundException) {}
            }
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
    }
}
