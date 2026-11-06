package com.littleoffice.android

import android.content.Context
import android.util.Base64
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.security.MessageDigest
import java.util.UUID
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OfficePushTest {
    @Test
    fun staleOrMisaddressedPushCannotSwitchAccountsOrWorkspaces() {
        // A distinct credential namespace leaves the app's signed-in session untouched.
        val app = ApplicationProvider.getApplicationContext<Context>()
        val context = app.createDeviceProtectedStorageContext()
        val store = CredentialStore(context)
        val workspace = UUID.randomUUID().toString()
        val installation = UUID.randomUUID().toString()
        val route = PushRoute(workspace, "fixture-member", installation)
        val origin = "https://fixture.example"
        val token = UUID.randomUUID().toString()
        val credential = json("token" to token, "expiresAt" to "2099-01-01T00:00:00Z")
        val digest = MessageDigest.getInstance("SHA-256").digest(token.toByteArray())
        fun saveSession(server: String = origin) {
            store.save("session", json("origin" to server, "credential" to credential))
        }
        try {
            saveSession()
            store.save(
                "device-push",
                json(
                    "origin" to origin,
                    "owner" to route.recipient,
                    "session" to Base64.encodeToString(digest, Base64.NO_WRAP),
                    "installationId" to installation,
                    "workspaces" to json(workspace to "en"),
                ),
            )
            assertTrue(OfficePush.accepts(context, route))
            assertFalse(
                OfficePush.accepts(context, route.copy(workspace = UUID.randomUUID().toString()))
            )
            assertFalse(
                OfficePush.accepts(context, route.copy(installation = UUID.randomUUID().toString()))
            )
            assertFalse(OfficePush.accepts(context, route.copy(recipient = "another-member")))
            saveSession("https://another.example")
            assertFalse(OfficePush.accepts(context, route))
            credential.put("token", UUID.randomUUID().toString())
            saveSession()
            assertFalse(OfficePush.accepts(context, route))
        } finally {
            store.save("session", null)
            store.save("device-push", null)
        }
    }
}
