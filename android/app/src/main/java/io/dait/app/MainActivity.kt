package io.dait.app

import android.annotation.SuppressLint
import android.app.Activity
import android.car.Car
import android.car.drivingstate.CarUxRestrictionsManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import java.util.Locale
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var car: Car? = null
    private var restrictions: CarUxRestrictionsManager? = null
    private var resumed = false
    private var simulatedDriving = false
    private var isRestricted = false
    private var navi: NaviBridge? = null
    private var tts: TextToSpeech? = null

    private val restrictionListener = CarUxRestrictionsManager.OnUxRestrictionsChangedListener { value ->
        runOnUiThread { applyPlatformRestriction(value.isRequiresDistractionOptimization) }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

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

        navi = NaviBridge(this) { json ->
            if (!isDestroyed) {
                webView.evaluateJavascript("window.onNaviUpdate && window.onNaviUpdate(${JSONObject.quote(json.toString())});", null)
            }
        }.also { it.connect() }

        // 주말 진로 체험의 기사 낭독용 (니카 녹음 음원이 없는 실시간 기사)
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) tts?.language = Locale.KOREAN
        }
    }

    override fun onStart() {
        super.onStart()
        resumed = true
        connectCarService()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onStop() {
        resumed = false
        try { restrictions?.unregisterListener() } catch (_: Exception) {}
        restrictions = null
        car?.disconnect()
        car = null
        super.onStop()
    }

    override fun onDestroy() {
        navi?.release()
        navi = null
        tts?.shutdown()
        tts = null
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

    private fun connectCarService() {
        try {
            car = Car.createCar(this, null, Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT) { connectedCar, ready ->
                runOnUiThread {
                    if (!resumed) { connectedCar.disconnect(); return@runOnUiThread }
                    if (!ready) { applyPlatformRestriction(true); return@runOnUiThread }
                    try {
                        restrictions = connectedCar.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as CarUxRestrictionsManager
                        restrictions?.registerListener(restrictionListener)
                        val blocked = restrictions?.currentCarUxRestrictions?.isRequiresDistractionOptimization != false
                        applyPlatformRestriction(blocked)
                    } catch (_: Exception) { applyPlatformRestriction(false) }
                }
            }
        } catch (_: Exception) { applyPlatformRestriction(false) }
    }

    private fun applyPlatformRestriction(blocked: Boolean) {
        isRestricted = blocked
        val effective = blocked || simulatedDriving
        runOnUiThread {
            webView.evaluateJavascript("window.setDrivingMode && window.setDrivingMode($effective);", null)
        }
    }

    inner class WebAppInterface {
        @JavascriptInterface
        fun neisGet(requestId: Int, service: String, query: String) {
            Thread {
                val body = try { NeisClient.fetch(service, query, BuildConfig.NEIS_API_KEY) } catch (_: Exception) { "" }
                runOnUiThread {
                    if (!isDestroyed) {
                        webView.evaluateJavascript("window.onNeisResult && window.onNeisResult($requestId, ${JSONObject.quote(body)});", null)
                    }
                }
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
        fun openUrl(url: String) {
            if (!url.startsWith("https://")) return
            runOnUiThread {
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: ActivityNotFoundException) {}
            }
        }

        @JavascriptInterface
        fun speak(text: String) {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "dait-news")
        }

        @JavascriptInterface
        fun stopSpeaking() {
            tts?.stop()
        }
    }
}
