package io.dait.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class NeisClientTest {
    @Test
    fun keyIsAddedOnlyWhenPresent() {
        assertEquals(
            "https://open.neis.go.kr/hub/schoolInfo?Type=json",
            NeisClient.requestUrl("schoolInfo", "Type=json", ""),
        )
        assertEquals(
            "https://open.neis.go.kr/hub/schoolInfo?Type=json&KEY=a%2Bb",
            NeisClient.requestUrl("schoolInfo", "Type=json", "a+b"),
        )
    }

    @Test
    fun unknownServiceIsRejected() {
        assertThrows(IllegalArgumentException::class.java) {
            NeisClient.requestUrl("../other", "Type=json", "")
        }
    }
}
