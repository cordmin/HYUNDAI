package io.dait.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

// Gleo가 assets/schema.json을 읽고 이 앱의 기능을 부른다. 답은 7초 안에 방송으로 돌려줘야 한다.
// 문서: https://document.pleos.ai/docs/pleos-only/app-integration-guide/guide/action_callback
object Gleo {
    const val START_LESSON = "START_LESSON"
    const val CONTROL_LESSON = "CONTROL_LESSON"
    const val RESPONSE_ACTION = "ai.pleos.playground.intent.action.APP_ACTION_RESPONSE"
    private const val PARAM_EXTRA = "ACTION_PARAM"
    private const val TAG = "DaitGleo"

    // 문서 예시는 매개변수를 ACTION_PARAM 한 칸에 JSON으로 담고, 설명은 키마다 따로 담는다고 해서 둘 다 받는다.
    fun params(intent: Intent): JSONObject {
        val extras = intent.extras ?: return JSONObject()
        extras.getString(PARAM_EXTRA)?.let { text -> return try { JSONObject(text) } catch (_: Exception) { JSONObject() } }
        val result = JSONObject()
        for (key in extras.keySet()) {
            @Suppress("DEPRECATION")
            val value = extras.get(key)
            if (value is String || value is Number || value is Boolean) result.put(key, value)
        }
        return result
    }

    // message는 영어 한 문장이어야 한다. 앱이 바로 말을 시작할 때는 Gleo가 말하지 않게 silent로 둔다.
    fun response(functionName: String, status: String, message: String, mode: String = "voice", data: JSONArray? = null): JSONObject =
        JSONObject().apply {
            put("functionName", functionName)
            put("status", status)
            put("message", message)
            put("mode", mode)
            if (data != null) put("data", data.toString())
        }

    fun respond(context: Context, response: JSONObject) {
        Log.i(TAG, "respond $response")
        context.sendBroadcast(Intent(RESPONSE_ACTION).apply {
            putExtra("packageName", context.packageName)
            putExtra("response", response.toString())
        })
    }

}

// 앱 화면을 앞에 띄우지 않아도 되는 부름은 방송으로 받는다. 내비가 앞에 있어도 그대로 둔다.
class GleoReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Gleo.CONTROL_LESSON -> {
                val handled = MainActivity.current?.handleGleo(Gleo.CONTROL_LESSON, Gleo.params(intent)) == true
                if (!handled) Gleo.respond(context, Gleo.response(Gleo.CONTROL_LESSON, "fail", "No DAIT lesson is playing right now."))
            }
        }
    }
}
