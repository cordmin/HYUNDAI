package io.dait.app

import android.content.Context
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import org.vosk.android.StorageService

/** Microphone PCM stays in memory and is recognised on the device. */
class LocalVoiceInput(context: Context, private val readyCallback: (Boolean) -> Unit) {
    private var model: Model? = null
    private var recognizer: Recognizer? = null
    private var service: SpeechService? = null
    private var epoch = 0
    private var closed = false
    val ready get() = model != null

    init {
        StorageService.unpack(context.applicationContext, "model-ko", "speech-model", { loaded ->
            if (closed) loaded.close() else { model = loaded; readyCallback(true) }
        }, { if (!closed) readyCallback(false) })
    }

    // onText gets the answer and the free-vocabulary reference; dait-journey.js decides whether it counts.
    fun start(grammar: String?, onText: (String, String) -> Unit, onEmpty: () -> Unit): Boolean {
        stop()
        val loaded = model ?: return false
        val ticket = epoch
        try {
            recognizer = if (grammar == null) Recognizer(loaded, 16000f) else ContextRecognizer(loaded, grammar)
            service = SpeechService(recognizer, 16000f)
            val listener = object : RecognitionListener {
                private fun text(json: String, field: String) = runCatching { JSONObject(json).optString(field) }.getOrDefault("")
                private fun finish(value: String) {
                    if (ticket != epoch || closed) return
                    service?.cancel()
                    service?.shutdown()
                    service = null
                    val reference = (recognizer as? ContextRecognizer)?.finishReference() ?: value
                    stop()
                    if (value.isBlank()) onEmpty() else onText(value, reference)
                }
                override fun onResult(hypothesis: String) {
                    val value = text(hypothesis, "text")
                    // Road noise comes back as <UNK>; keep listening so it does not use up the child's turn.
                    if (value.isNotBlank() && value != "<UNK>") finish(value)
                }
                override fun onPartialResult(hypothesis: String) = Unit
                override fun onFinalResult(hypothesis: String) = finish(text(hypothesis, "text"))
                override fun onError(exception: Exception) = finish("")
                override fun onTimeout() = finish("") // Tentative partial words must not trigger a branch.
            }
            if (service?.startListening(listener, 10000) != true) { stop(); return false }
            return true
        } catch (_: Exception) { stop(); return false }
    }

    fun stop() {
        epoch++ // Late callbacks from a cancelled question cannot advance the next one.
        service?.cancel()
        service?.shutdown()
        service = null
        recognizer?.close()
        recognizer = null
    }

    fun close() {
        closed = true
        stop()
        model?.close()
        model = null
    }
}
