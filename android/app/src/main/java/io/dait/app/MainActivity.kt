package io.dait.app

import android.annotation.SuppressLint
import android.app.Activity
import android.car.Car
import android.car.drivingstate.CarUxRestrictionsManager
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var car: Car? = null
    private var restrictions: CarUxRestrictionsManager? = null
    private var resumed = false
    private var simulatedDriving = false
    private var isRestricted = false
    private var navi: NaviBridge? = null

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
                val body = try { NeisClient.fetch(service, query) } catch (_: Exception) { "" }
                runOnUiThread {
                    if (!isDestroyed) {
                        webView.evaluateJavascript("window.onNeisResult && window.onNeisResult($requestId, ${JSONObject.quote(body)});", null)
                    }
                }
            }.start()
        }

        @JavascriptInterface
        fun tourGet(requestId: Int, service: String, query: String) {
            Thread {
                val body = try { TourClient.fetch(service, query) } catch (_: Exception) { "" }
                runOnUiThread {
                    if (!isDestroyed) {
                        webView.evaluateJavascript("window.onTourResult && window.onTourResult($requestId, ${JSONObject.quote(body)});", null)
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
    }
}
