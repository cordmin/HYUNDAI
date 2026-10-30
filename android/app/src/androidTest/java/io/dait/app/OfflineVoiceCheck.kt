package io.dait.app

import android.app.Activity
import android.app.Instrumentation
import android.os.Bundle
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.StorageService

/** Native recogniser check with synthetic speech, never a user's microphone recording. */
class OfflineVoiceCheck : Instrumentation() {
    override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); start() }
    override fun onStart() {
        val report = Bundle()
        try {
            val results = mutableListOf<String>()
            var failed = false
            Model(StorageService.sync(targetContext, "model-ko", "speech-model")).use { model ->
                for ((file, expected) in listOf("yes.wav" to "talk_ready", "no.wav" to "talk_missing", "science.wav" to "school_science", "dodge.wav" to "listen_ack", "rest.wav" to "rest_tired", "unknown.wav" to "unknown")) {
                    val wav = context.assets.open(file).use { it.readBytes() }
                    check(String(wav, 0, 4) == "RIFF" && String(wav, 36, 4) == "data")
                    val pcm = wav.copyOfRange(44, wav.size)
                    val grammar = targetContext.assets.open("conversation-grammar.json").bufferedReader().use {
                        JSONObject(it.readText()).optJSONArray(if (file == "science.wav") "SUBJECT" else if (file == "dodge.wav") "AFTER_EVENT" else "PREP")?.toString()
                    }
                    (if (grammar == null) Recognizer(model, 16000f) else ContextRecognizer(model, grammar)).use { recognizer ->
                        val text = StringBuilder()
                        for (offset in pcm.indices step 6400) {
                            val bytes = pcm.copyOfRange(offset, minOf(offset + 6400, pcm.size))
                            if (recognizer.acceptWaveForm(bytes, bytes.size)) text.append(JSONObject(recognizer.result).optString("text")).append(' ')
                        }
                        text.append(JSONObject(recognizer.finalResult).optString("text"))
                        val talk = Conversation(file != "dodge.wav")
                        if (file == "science.wav") talk.answer("챙겼어")
                        val value = text.toString()
                        val reference = (recognizer as? ContextRecognizer)?.finishReference() ?: value
                        val actual = if (!Conversation.acceptsRecognition(talk.stage, value, reference)) "unknown" else talk.answer(value).clip
                        results.add("$file: $actual ($text) [reference=$reference]")
                        if (actual != expected) failed = true
                    }
                }
                Recognizer(model, 16000f).use { recognizer ->
                    val silence = ByteArray(32000)
                    recognizer.acceptWaveForm(silence, silence.size)
                    check(JSONObject(recognizer.finalResult).optString("text").isBlank())
                }
            }
            check(!failed) { results.joinToString("; ") }
            report.putString("stream", "Offline speech branches 6/6 and silence passed. " + results.joinToString("; "))
            finish(Activity.RESULT_OK, report)
        } catch (failure: Throwable) {
            report.putString("stream", "FAIL: ${failure.javaClass.simpleName}: ${failure.message}")
            finish(Activity.RESULT_CANCELED, report)
        }
    }
}
