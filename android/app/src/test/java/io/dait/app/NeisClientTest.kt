package io.dait.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class NeisClientTest {
    @Test
    fun requestGoesToRelayWithoutKey() {
        assertEquals(
            "https://relay-khaki-omega.vercel.app/neis/schoolInfo?Type=json",
            NeisClient.requestUrl("schoolInfo", "Type=json"),
        )
    }

    @Test
    fun unknownServiceIsRejected() {
        assertThrows(IllegalArgumentException::class.java) {
            NeisClient.requestUrl("../other", "Type=json")
        }
    }
}
