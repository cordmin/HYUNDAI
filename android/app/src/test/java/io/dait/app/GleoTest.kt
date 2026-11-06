package io.dait.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class GleoTest {
    @Test
    fun responseCarriesTheFieldsGleoReads() {
        val answer = Gleo.response(Gleo.CONTROL_LESSON, "success", "Paused the DAIT lesson.", "beep")
        assertEquals(setOf("functionName", "status", "message", "mode"), answer.keySet())
        assertEquals("CONTROL_LESSON", answer.getString("functionName"))
    }
}
