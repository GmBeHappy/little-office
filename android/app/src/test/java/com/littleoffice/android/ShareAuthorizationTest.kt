package com.littleoffice.android

import org.junit.Assert.*
import org.junit.Test

class ShareAuthorizationTest {
    @Test
    fun revokeAndNewGrantInvalidatePendingProjectionAndOldStopCallback() {
        val gate = ShareAuthorization()
        assertFalse(gate.accepts(gate.ticket))
        gate.update(true)
        val pending = gate.ticket
        assertTrue(gate.accepts(pending))
        gate.update(false)
        assertFalse(gate.accepts(pending))
        gate.update(true)
        val replacement = gate.ticket
        assertFalse(gate.accepts(pending))
        assertTrue(gate.accepts(replacement))
        gate.update(false)
        assertFalse(gate.accepts(replacement))
    }
}
