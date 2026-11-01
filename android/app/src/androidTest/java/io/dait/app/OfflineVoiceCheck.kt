package io.dait.app

import android.app.Activity
import android.app.Instrumentation
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Bundle
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.StorageService

/** Native recogniser check with synthetic speech, never a user's microphone recording. */
class OfflineVoiceCheck : Instrumentation() {
    private val prep = JSONArray(listOf("응", "네", "챙겼 어", "체육복 챙겼 어", "아직", "아니", "안 챙겼 어", "아직 안 챙겼 어", "다시 말해줘", "그만", "쉬고 싶어", "말하기 싫어", "피곤해", "<UNK>")).toString()
    private val subject = JSONArray(listOf("체육", "과학", "독서", "책", "국어", "수학", "미술", "그만", "쉬고 싶어", "<UNK>")).toString()

    private var focusCheck = false

    override fun onCreate(arguments: Bundle?) {
        super.onCreate(arguments)
        focusCheck = arguments?.getString("check") == "focus"
        start()
    }

    // Plays a clip, takes the audio away the way navigation guidance does, then gives it back.
    private fun checkFocusYield() {
        val events = LinkedBlockingQueue<String>()
        lateinit var session: VoiceSession
        runOnMainSync {
            session = VoiceSession(targetContext, null) { events.add(it.getString("event")) }
            session.speak(listOf("listen_parent"), "", 1)
        }
        val audio = targetContext.getSystemService(AudioManager::class.java)
        val guidance = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE).build())
            .build()
        Thread.sleep(1500)
        check(audio.requestAudioFocus(guidance) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { "guidance focus refused" }
        check(events.poll(3, TimeUnit.SECONDS) == "paused") { "did not pause" }
        Thread.sleep(1000)
        audio.abandonAudioFocusRequest(guidance)
        check(events.poll(3, TimeUnit.SECONDS) == "resumed") { "did not resume" }
        check(events.poll(20, TimeUnit.SECONDS) == "ended") { "did not finish" }
        runOnMainSync { session.release() }
    }

    override fun onStart() {
        val report = Bundle()
        if (focusCheck) {
            try {
                checkFocusYield()
                report.putString("stream", "Focus check passed: paused, resumed, ended.")
                finish(Activity.RESULT_OK, report)
            } catch (failure: Throwable) {
                report.putString("stream", "FAIL: ${failure.message}")
                finish(Activity.RESULT_CANCELED, report)
            }
            return
        }
        try {
            val results = mutableListOf<String>()
            var failed = false
            Model(StorageService.sync(targetContext, "model-ko", "speech-model")).use { model ->
                // The app's stage rules live in dait-journey.js and journey.test.js replays these results.
                for ((file, grammar, expected) in listOf(
                    Triple("yes.wav", prep, "챙"), Triple("no.wav", prep, "아"), Triple("science.wav", subject, "과학"),
                    Triple("dodge.wav", null, ""), Triple("rest.wav", prep, "싫어"), Triple("unknown.wav", prep, ""),
                )) {
                    val wav = context.assets.open(file).use { it.readBytes() }
                    check(String(wav, 0, 4) == "RIFF" && String(wav, 36, 4) == "data")
                    val pcm = wav.copyOfRange(44, wav.size)
                    (if (grammar == null) Recognizer(model, 16000f) else ContextRecognizer(model, grammar)).use { recognizer ->
                        val text = StringBuilder()
                        for (offset in pcm.indices step 6400) {
                            val bytes = pcm.copyOfRange(offset, minOf(offset + 6400, pcm.size))
                            if (recognizer.acceptWaveForm(bytes, bytes.size)) text.append(JSONObject(recognizer.result).optString("text")).append(' ')
                        }
                        text.append(JSONObject(recognizer.finalResult).optString("text"))
                        val value = text.toString()
                        val reference = (recognizer as? ContextRecognizer)?.finishReference() ?: value
                        results.add("$file: ($value) [reference=$reference]")
                        if (value.isBlank() || !value.contains(expected)) failed = true
                    }
                }
                Recognizer(model, 16000f).use { recognizer ->
                    val silence = ByteArray(32000)
                    recognizer.acceptWaveForm(silence, silence.size)
                    check(JSONObject(recognizer.finalResult).optString("text").isBlank())
                }
            }
            check(!failed) { results.joinToString("; ") }
            report.putString("stream", "Offline speech 6/6 and silence passed. " + results.joinToString("; "))
            finish(Activity.RESULT_OK, report)
        } catch (failure: Throwable) {
            report.putString("stream", "FAIL: ${failure.javaClass.simpleName}: ${failure.message}")
            finish(Activity.RESULT_CANCELED, report)
        }
    }
}
