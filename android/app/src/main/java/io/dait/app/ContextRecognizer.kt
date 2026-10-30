package io.dait.app

import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer

/** A free-vocabulary pass guards against forcing unrelated speech into a short answer. */
class ContextRecognizer(model: Model, grammar: String) : Recognizer(model, 16000f, grammar) {
    private val reference = Recognizer(model, 16000f)
    private val referenceResults = StringBuilder()

    override fun acceptWaveForm(data: ShortArray, len: Int): Boolean {
        if (reference.acceptWaveForm(data, len)) referenceResults.append(JSONObject(reference.result).optString("text")).append(' ')
        return super.acceptWaveForm(data, len)
    }

    override fun acceptWaveForm(data: ByteArray, len: Int): Boolean {
        if (reference.acceptWaveForm(data, len)) referenceResults.append(JSONObject(reference.result).optString("text")).append(' ')
        return super.acceptWaveForm(data, len)
    }

    // Call after microphone input has stopped, on the same thread that closes this decoder.
    fun finishReference(): String = referenceResults.toString() + JSONObject(reference.finalResult).optString("text")
    override fun close() { reference.close(); super.close() }
}
