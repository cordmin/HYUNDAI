package io.dait.app

import android.Manifest
import android.app.Activity
import android.car.Car
import android.car.drivingstate.CarUxRestrictionsManager
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import java.util.Locale
import org.json.JSONObject

class MainActivity : Activity() {
    private enum class Phase { READY, PLAYING, LISTENING, PAUSED, FINISHED }
    private lateinit var session: JourneySession
    private lateinit var voiceInput: LocalVoiceInput
    private var conversation: Conversation? = null
    private var reply: TalkReply? = null
    private var phase = Phase.READY
    private var status = ""
    private var heard = ""
    private var partial = ""
    private var selectedVoice = "Cruz"
    private var modelReady = false
    private var resumed = false
    private var epoch = 0
    private var player: MediaPlayer? = null
    private var car: Car? = null
    private var restrictions: CarUxRestrictionsManager? = null
    private var pendingMorning: Boolean? = null
    private var pendingMic = false
    private var liveText: TextView? = null
    private val handler = Handler(Looper.getMainLooper())
    private val grammars by lazy {
        assets.open("conversation-grammar.json").bufferedReader().use { JSONObject(it.readText()) }
    }
    private val audio by lazy { getSystemService(AudioManager::class.java) }
    private val speechAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
    private val focus by lazy {
        AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(speechAttributes)
            .setOnAudioFocusChangeListener { change ->
                if (change != AudioManager.AUDIOFOCUS_GAIN) runOnUiThread { interrupt() }
            }.build()
    }
    private val restrictionListener = CarUxRestrictionsManager.OnUxRestrictionsChangedListener { value ->
        runOnUiThread { applyRestriction(value.isRequiresDistractionOptimization) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = JourneySession()
        selectedVoice = getPreferences(MODE_PRIVATE).getString("voice", "Cruz")
            ?.takeIf { it in DemoLibrary.voices } ?: "Cruz"
        voiceInput = LocalVoiceInput(this) { ready ->
            if (!isDestroyed) {
                modelReady = ready
                if (!ready) status = "음성 인식을 준비하지 못했어요"
                render()
            }
        }
        render()
    }

    override fun onStart() {
        super.onStart()
        resumed = true
        applyRestriction(true)
        try {
            car = Car.createCar(this, null, Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT) { connectedCar, ready ->
                runOnUiThread {
                    if (!resumed) { connectedCar.disconnect(); return@runOnUiThread }
                    if (!ready) { applyRestriction(true); return@runOnUiThread }
                    try {
                        restrictions = connectedCar.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as CarUxRestrictionsManager
                        restrictions?.registerListener(restrictionListener)
                        applyRestriction(restrictions?.currentCarUxRestrictions?.isRequiresDistractionOptimization != false)
                    } catch (_: Exception) { applyRestriction(true) }
                }
            }
        } catch (_: Exception) { applyRestriction(true) }
    }

    override fun onStop() {
        resumed = false
        applyRestriction(true)
        try { restrictions?.unregisterListener() } catch (_: Exception) { }
        restrictions = null
        car?.disconnect()
        car = null
        super.onStop()
    }

    override fun onDestroy() {
        cancelAudioAndMic()
        voiceInput.close()
        super.onDestroy()
    }

    private fun applyRestriction(blocked: Boolean) {
        session.setRestriction(blocked)
        if (blocked) {
            cancelAudioAndMic()
            if (conversation != null) phase = Phase.PAUSED
        }
        render()
    }

    private fun cancelAudioAndMic() {
        epoch++
        handler.removeCallbacksAndMessages(null)
        voiceInput.stop()
        player?.release()
        player = null
        session.stop()
        audio.abandonAudioFocusRequest(focus)
    }

    private fun interrupt() {
        cancelAudioAndMic()
        if (conversation != null) phase = Phase.PAUSED
        status = "잠시 멈췄어요"
        render()
    }

    private fun start(morning: Boolean) {
        if (session.restricted) return
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingMorning = morning
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 10)
        } else beginConversation(morning)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != 10) return
        val mode = pendingMorning
        pendingMorning = null
        val resumeMic = pendingMic
        pendingMic = false
        if (session.restricted || !resumed) return
        if (mode != null) beginConversation(mode)
        else if (resumeMic && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) listen(false)
        else { status = "마이크 권한이 필요해요"; render() }
    }

    private fun beginConversation(morning: Boolean) {
        if (session.restricted) return
        cancelAudioAndMic()
        session.selectScene(if (morning) Scene.MORNING else Scene.AFTERNOON)
        conversation = Conversation(morning)
        reply = conversation!!.reply
        heard = ""
        playReply()
    }

    private fun answer(value: String) {
        val talk = conversation ?: return
        if (session.restricted || talk.finished || value.isBlank()) return
        cancelAudioAndMic()
        heard = value.take(60)
        partial = ""
        reply = talk.answer(value)
        playReply()
    }

    private fun playReply() {
        val line = reply ?: return
        if (session.restricted || !resumed) return
        cancelAudioAndMic()
        if (audio.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED || !session.play()) {
            phase = Phase.PAUSED; status = "다른 안내가 끝나면 이어가요"; render(); return
        }
        phase = Phase.PLAYING
        status = ""
        val ticket = epoch
        try {
            player = MediaPlayer().apply {
                setAudioAttributes(speechAttributes)
                assets.openFd("voices/${selectedVoice.lowercase(Locale.ROOT)}/${line.clip}.wav").use { fd ->
                    setDataSource(fd.fileDescriptor, fd.startOffset, fd.length)
                }
                prepare()
                setOnCompletionListener {
                    if (ticket == epoch) {
                        player?.release(); player = null
                        session.stop(); audio.abandonAudioFocusRequest(focus)
                        phase = if (conversation?.finished == true) Phase.FINISHED else Phase.READY
                        render()
                        // Let the speaker tail end before opening the microphone.
                        if (phase == Phase.READY && line.clip != "error_repeat") handler.postDelayed({
                            if (ticket == epoch && resumed && !session.restricted && phase == Phase.READY) listen(false)
                        }, 700)
                    }
                }
                setOnErrorListener { _, _, _ ->
                    if (ticket == epoch) { interrupt(); status = "다시 눌러 들어 주세요"; render() }
                    true
                }
                start()
            }
        } catch (_: Exception) { interrupt(); status = "음원을 재생하지 못했어요" }
        render()
    }

    private fun listen(askPermission: Boolean) {
        if (session.restricted || !resumed || conversation?.finished != false) return
        cancelAudioAndMic()
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            phase = Phase.READY
            status = "마이크 권한이 필요해요"
            if (askPermission) { pendingMic = true; requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 10) }
            render(); return
        }
        if (!modelReady) { phase = Phase.READY; status = "음성 인식 준비 중"; render(); return }
        if (audio.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            phase = Phase.PAUSED; status = "다른 안내가 끝나면 이어가요"; render(); return
        }
        phase = Phase.LISTENING
        status = ""
        partial = ""
        val ticket = epoch
        val grammar = grammars.optJSONArray(conversation!!.stage.name)?.toString()
        val started = voiceInput.start(grammar, conversation!!.stage, { value ->
            if (ticket == epoch && !session.restricted && resumed) answer(value)
        }, {
            if (ticket == epoch) {
                cancelAudioAndMic(); phase = Phase.READY
                status = "잘 듣지 못했어요"; render()
            }
        }, { value ->
            if (ticket == epoch) {
                partial = value.take(60)
                liveText?.text = if (partial.isBlank()) "듣고 있어요" else partial
            }
        })
        if (!started) {
            cancelAudioAndMic(); phase = Phase.READY; status = "마이크를 확인해 주세요"
        }
        render()
    }

    private fun home() {
        cancelAudioAndMic()
        conversation = null
        reply = null
        phase = Phase.READY
        heard = ""; partial = ""; status = ""
        render()
    }

    @Deprecated("Platform back navigation")
    @Suppress("DEPRECATION")
    override fun onBackPressed() { if (conversation != null) home() else super.onBackPressed() }

    private fun changeVoice() {
        if (session.restricted) return
        cancelAudioAndMic()
        selectedVoice = if (selectedVoice == "Cruz") "Nika" else "Cruz"
        getPreferences(MODE_PRIVATE).edit().putString("voice", selectedVoice).apply()
        if (conversation != null) { phase = Phase.PAUSED; status = "" }
        render()
    }

    private fun render() {
        if (isFinishing || isDestroyed) return
        liveText = null
        val compact = resources.configuration.screenWidthDp < 600
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(if (compact) 24 else 48), dp(24), dp(if (compact) 24 else 48), dp(24))
            setBackgroundColor(color(R.color.surface))
        }
        val header = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        if (conversation != null && !session.restricted) header.addView(iconButton(R.drawable.ic_lucide_arrow_left, "처음으로") { home() }, LinearLayout.LayoutParams(dp(56), dp(56)))
        header.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        header.addView(text("예시 학교", 14f).apply { setTextColor(color(R.color.muted)); setPadding(0, 0, dp(16), 0) })
        header.addView(button(selectedVoice, R.drawable.ic_lucide_volume_2, false) { changeVoice() }.apply {
            textSize = 16f; isEnabled = !session.restricted
            contentDescription = "목소리 $selectedVoice, 눌러서 변경"
        }, LinearLayout.LayoutParams(dp(132), dp(56)))
        root.addView(header)

        if (session.restricted) {
            val body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
            body.addView(icon(R.drawable.ic_lucide_mic_off, 48, R.color.muted))
            body.addView(text("주차 후 이어갈게요", if (compact) 30f else 48f, true).apply { setPadding(0, dp(24), 0, 0) })
            root.addView(body, LinearLayout.LayoutParams(-1, 0, 1f))
        } else if (conversation == null) {
            val choices = LinearLayout(this).apply { orientation = if (compact) LinearLayout.VERTICAL else LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
            choices.addView(modeCard("등교 준비", R.drawable.ic_lucide_school) { start(true) },
                LinearLayout.LayoutParams(if (compact) -1 else 0, dp(if (compact) 160 else 300), if (compact) 0f else 1f).apply {
                    if (compact) bottomMargin = dp(20) else marginEnd = dp(24)
                })
            choices.addView(modeCard("하교 대화", R.drawable.ic_lucide_house) { start(false) },
                LinearLayout.LayoutParams(if (compact) -1 else 0, dp(if (compact) 160 else 300), if (compact) 0f else 1f))
            root.addView(choices, LinearLayout.LayoutParams(-1, 0, 1f))
            if (!modelReady) root.addView(text(if (status.isBlank()) "음성 인식 준비 중" else status, 15f).apply { setTextColor(color(R.color.muted)); gravity = Gravity.CENTER })
        } else {
            val body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
            body.addView(icon(if (phase == Phase.LISTENING) R.drawable.ic_lucide_mic else R.drawable.ic_lucide_volume_2, 44, R.color.accent))
            body.addView(text(reply?.title ?: "", if (compact) 32f else 52f, true).apply {
                gravity = Gravity.CENTER; maxLines = 2; setPadding(0, dp(28), 0, dp(20))
                accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
            })
            val stateText = when {
                status.isNotBlank() -> status
                phase == Phase.PLAYING -> ""
                phase == Phase.LISTENING -> if (partial.isBlank()) "듣고 있어요" else partial
                phase == Phase.PAUSED -> "잠시 멈췄어요"
                phase == Phase.FINISHED -> ""
                else -> "말해 주세요"
            }
            liveText = text(stateText, 20f).apply { gravity = Gravity.CENTER; maxLines = 1; setTextColor(color(R.color.muted)) }
            body.addView(liveText, LinearLayout.LayoutParams(-1, dp(36)))
            if (heard.isNotBlank() && phase != Phase.LISTENING) body.addView(text("“$heard”", 18f).apply {
                maxLines = 1; gravity = Gravity.CENTER; setTextColor(color(R.color.muted)); setPadding(0, dp(16), 0, 0)
            })
            root.addView(body, LinearLayout.LayoutParams(-1, 0, 1f))
            val options = LinearLayout(this).apply { gravity = Gravity.CENTER; orientation = if (compact) LinearLayout.VERTICAL else LinearLayout.HORIZONTAL }
            conversation!!.choices.forEach { value ->
                options.addView(button(value) { answer(value) }, LinearLayout.LayoutParams(if (compact) -1 else 0, dp(56), if (compact) 0f else 1f).apply {
                    if (compact) bottomMargin = dp(8) else { marginStart = dp(6); marginEnd = dp(6) }
                })
            }
            root.addView(options)
            val controls = LinearLayout(this).apply { gravity = Gravity.CENTER; setPadding(0, dp(20), 0, 0) }
            val label: String
            val symbol: Int
            when (phase) {
                Phase.PLAYING, Phase.LISTENING -> { label = "멈추기"; symbol = R.drawable.ic_lucide_square }
                Phase.FINISHED -> { label = "마치기"; symbol = R.drawable.ic_lucide_check }
                Phase.PAUSED -> { label = "다시 듣기"; symbol = R.drawable.ic_lucide_rotate_ccw }
                Phase.READY -> { label = "말하기"; symbol = R.drawable.ic_lucide_mic }
            }
            controls.addView(button(label, symbol, true) {
                when (phase) {
                    Phase.PLAYING, Phase.LISTENING -> interrupt()
                    Phase.FINISHED -> home()
                    Phase.PAUSED -> playReply()
                    Phase.READY -> listen(true)
                }
            }, LinearLayout.LayoutParams(dp(if (compact) 220 else 320), dp(72)))
            root.addView(controls)
        }
        setContentView(root)
    }

    private fun modeCard(label: String, resource: Int, click: () -> Unit) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
        background = shape(R.color.paper, 32, true)
        addView(icon(resource, 60, R.color.accent))
        addView(text(label, 32f, true).apply { gravity = Gravity.CENTER; setPadding(0, dp(28), 0, 0) })
        isClickable = true; isFocusable = true; contentDescription = label
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
        setOnClickListener { click() }
    }

    private fun icon(resource: Int, size: Int, tint: Int) = ImageView(this).apply {
        setImageResource(resource); imageTintList = ColorStateList.valueOf(color(tint))
        layoutParams = LinearLayout.LayoutParams(dp(size), dp(size))
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    private fun iconButton(resource: Int, label: String, click: () -> Unit) = ImageButton(this).apply {
        setImageResource(resource); imageTintList = ColorStateList.valueOf(color(R.color.ink))
        contentDescription = label; background = shape(R.color.control, 20)
        setPadding(dp(16), dp(16), dp(16), dp(16)); setOnClickListener { click() }
    }

    private fun text(value: String, size: Float, bold: Boolean = false) = TextView(this).apply {
        text = value; textSize = size; setTextColor(color(R.color.ink))
        typeface = Typeface.create(if (bold) "sans-serif-medium" else "sans-serif", Typeface.NORMAL)
        includeFontPadding = false
    }

    private fun button(label: String, resource: Int = 0, primary: Boolean = false, click: () -> Unit) = Button(this).apply {
        text = label; textSize = 20f; isAllCaps = false
        setTextColor(color(if (primary) R.color.on_accent else R.color.ink))
        background = shape(if (primary) R.color.accent else R.color.control, 22)
        setPadding(dp(24), 0, dp(24), 0)
        if (resource != 0) {
            val drawable = getDrawable(resource)!!.mutate()
            drawable.setTint(color(if (primary) R.color.on_accent else R.color.ink))
            drawable.setBounds(0, 0, dp(24), dp(24))
            setCompoundDrawables(drawable, null, null, null); compoundDrawablePadding = dp(12)
        }
        setOnClickListener { click() }
    }

    private fun shape(fill: Int, radius: Int, outline: Boolean = false) = RippleDrawable(ColorStateList.valueOf(0x22445566),
        GradientDrawable().apply { cornerRadius = dp(radius).toFloat(); setColor(color(fill)); if (outline) setStroke(dp(1), color(R.color.outline)) }, null)
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun color(id: Int) = getColor(id)
}
