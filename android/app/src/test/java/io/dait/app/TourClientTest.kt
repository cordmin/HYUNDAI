package io.dait.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class TourClientTest {
    @Test
    fun requestGoesToRelayWithoutKey() {
        assertEquals(
            "https://relay-khaki-omega.vercel.app/tour/searchKeyword2?_type=json",
            TourClient.requestUrl("searchKeyword2", "_type=json"),
        )
    }

    @Test
    fun unknownServiceIsRejected() {
        assertThrows(IllegalArgumentException::class.java) {
            TourClient.requestUrl("../other", "_type=json")
        }
    }
}
