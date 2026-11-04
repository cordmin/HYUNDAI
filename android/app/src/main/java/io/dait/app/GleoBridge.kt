package io.dait.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

// Gleo가 assets/schema.json을 읽고 이 앱의 기능을 부른다. 답은 7초 안에 방송으로 돌려줘야 한다.
// 문서: https://document.pleos.ai/docs/pleos-only/app-integration-guide/guide/action_callback
object Gleo {
    const val START_LESSON = "START_LESSON"
    const val CONTROL_LESSON = "CONTROL_LESSON"
    const val GET_SCHOOL_PREP = "GET_SCHOOL_PREP"
    const val RESPONSE_ACTION = "ai.pleos.playground.intent.action.APP_ACTION_RESPONSE"
    private const val PARAM_EXTRA = "ACTION_PARAM"
    private const val PREFS = "gleo"
    private const val BRIEF_KEY = "schoolBrief"
    private const val TAG = "DaitGleo"
    private const val AFTERNOON_HOUR = 12

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

    // 화면이 정리한 다음 수업일 준비를 남겨 둔다. 앱을 열지 않고도 Gleo에 답하려고 쓴다.
    fun saveBrief(context: Context, json: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(BRIEF_KEY, json).apply()
    }

    fun schoolPrep(context: Context, now: LocalDateTime = LocalDateTime.now()): JSONObject {
        val saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(BRIEF_KEY, null)
        return prepResponse(saved?.let { try { JSONObject(it) } catch (_: Exception) { null } }, now)
    }

    // 오후에 물으면 오늘 수업은 지났으므로 다음 수업일을 고른다(첫 화면이 오후에 다음 점심을 보여 주는 것과 같다).
    // 남겨 둔 날 가운데 맞는 날이 없으면 앱을 한 번 열어 달라고 묻는다.
    fun prepResponse(brief: JSONObject?, now: LocalDateTime): JSONObject {
        if (brief == null || !brief.optBoolean("registered")) {
            return response(GET_SCHOOL_PREP, "fail", "The school is not registered in DAIT yet, so please register it in the app first.")
        }
        val today = now.toLocalDate()
        val first = if (now.hour >= AFTERNOON_HOUR) today.plusDays(1) else today
        val days = brief.optJSONArray("days") ?: JSONArray()
        val picked = (0 until days.length()).map { days.getJSONObject(it) }
            .mapNotNull { day -> parseYmd(day.optString("ymd"))?.let { it to day } }
            .filter { (date, _) -> date >= first }
            .minByOrNull { (date, _) -> date }
            ?: return response(GET_SCHOOL_PREP, "asking", "Please open DAIT once so it can check the next school day.")
        val (date, day) = picked
        val item = JSONObject().apply {
            put("day", dayLabel(date, today))
            put("prep", day.optString("prep"))
            put("notice", day.optString("notice"))
            put("meal", day.optString("meal"))
            put("subjects", day.optJSONArray("subjects") ?: JSONArray())
        }
        return response(GET_SCHOOL_PREP, "success", "Here is what to prepare for the next school day.", data = JSONArray().put(item))
    }

    private fun parseYmd(text: String): LocalDate? = try { LocalDate.parse(text, DateTimeFormatter.BASIC_ISO_DATE) } catch (_: Exception) { null }

    // 화면의 dayLabel과 같은 말: 오늘, 내일, 그 뒤는 요일.
    fun dayLabel(day: LocalDate, today: LocalDate): String = when (day) {
        today -> "오늘"
        today.plusDays(1) -> "내일"
        else -> WEEKDAYS[day.dayOfWeek.value % 7]
    }

    private val WEEKDAYS = listOf("일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일")
}

// 앱 화면을 앞에 띄우지 않아도 되는 부름은 방송으로 받는다. 내비가 앞에 있어도 그대로 둔다.
class GleoReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Gleo.GET_SCHOOL_PREP -> Gleo.respond(context, Gleo.schoolPrep(context))
            Gleo.CONTROL_LESSON -> {
                val handled = MainActivity.current?.handleGleo(Gleo.CONTROL_LESSON, Gleo.params(intent)) == true
                if (!handled) Gleo.respond(context, Gleo.response(Gleo.CONTROL_LESSON, "fail", "No DAIT lesson is playing right now."))
            }
        }
    }
}
