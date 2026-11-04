package io.dait.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime

class GleoTest {
    private val wednesday = LocalDate.of(2026, 11, 4)
    private val morning = wednesday.atTime(7, 30)
    private val evening = wednesday.atTime(21, 0)

    private fun day(ymd: String, prep: String, meal: String) = JSONObject()
        .put("ymd", ymd).put("prep", prep).put("notice", "").put("meal", meal).put("subjects", JSONArray(listOf("국어", "체육")))

    private fun brief(vararg days: JSONObject) = JSONObject().put("registered", true).put("days", JSONArray(days.toList()))

    private fun answered(answer: JSONObject) = JSONArray(answer.getString("data")).getJSONObject(0)

    @Test
    fun morningAnswersTodayAndEveningAnswersTheNextSchoolDay() {
        val week = brief(day("20261104", "체육복", "카레"), day("20261105", "", "비빔밥"))
        val todayAnswer = Gleo.prepResponse(week, morning)
        assertEquals("success", todayAnswer.getString("status"))
        assertEquals("오늘", answered(todayAnswer).getString("day"))
        assertEquals("체육복", answered(todayAnswer).getString("prep"))
        val nightAnswer = answered(Gleo.prepResponse(week, evening))
        assertEquals("내일", nightAnswer.getString("day"))
        assertEquals("비빔밥", nightAnswer.getString("meal"))
    }

    @Test
    fun dayWordsFollowTheAskingDay() {
        assertEquals("월요일", Gleo.dayLabel(LocalDate.of(2026, 11, 9), wednesday))
        assertEquals("오늘", Gleo.dayLabel(wednesday, wednesday))
        assertEquals("내일", Gleo.dayLabel(wednesday.plusDays(1), wednesday))
    }

    @Test
    fun staleOrMissingSchoolInfoIsNotReadOut() {
        assertEquals("asking", Gleo.prepResponse(brief(day("20261103", "체육복", "카레")), morning).getString("status"))
        assertEquals("asking", Gleo.prepResponse(brief(day("20261104", "체육복", "카레")), evening).getString("status"))
        assertEquals("asking", Gleo.prepResponse(JSONObject().put("registered", true), morning).getString("status"))
        assertEquals("fail", Gleo.prepResponse(null, morning).getString("status"))
        assertEquals("fail", Gleo.prepResponse(JSONObject().put("registered", false), LocalDateTime.of(2026, 11, 4, 9, 0)).getString("status"))
    }

    @Test
    fun responseCarriesTheFieldsGleoReads() {
        val answer = Gleo.response(Gleo.CONTROL_LESSON, "success", "Paused the DAIT lesson.", "beep")
        assertEquals(setOf("functionName", "status", "message", "mode"), answer.keySet())
        assertEquals("CONTROL_LESSON", answer.getString("functionName"))
    }
}
