package io.dait.app

import org.junit.Assert.*
import org.junit.Test

class JourneySessionTest {
    @Test fun unknownOrRestrictedVehicleNeverStartsPlayback() {
        val state = JourneySession()
        assertFalse(state.play())
        assertFalse(state.selectScene(Scene.AFTERNOON))
        state.setRestriction(false)
        assertTrue(state.play())
        state.setRestriction(true)
        assertFalse(state.playing)
        assertFalse(state.play())
        state.setRestriction(false)
        assertFalse(state.playing) // Clearing restrictions must not auto-resume speech.
    }

    @Test fun skippingStopsWithoutAdvancingToAnotherQuestion() {
        val state = JourneySession()
        state.setRestriction(false)
        state.selectScene(Scene.AFTERNOON)
        state.play()
        state.skip()
        assertFalse(state.playing)
        assertTrue(state.skipped)
        assertEquals(Scene.AFTERNOON, state.scene)
    }

    @Test fun choosingAnotherSceneStopsPreviousPlayback() {
        val state = JourneySession()
        state.setRestriction(false)
        state.play()
        state.selectScene(Scene.ARRIVAL)
        assertFalse(state.playing)
        assertFalse(state.skipped)
        assertEquals(Scene.ARRIVAL, state.scene)
    }
}
