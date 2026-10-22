package com.littleoffice.android

import android.content.Context
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import org.junit.*
import org.junit.runner.RunWith

/**
 * Real-server integration through the activity's model; no mocked clocks or embedded credentials.
 */
@RunWith(AndroidJUnit4::class)
class NativeSmokeTest {
    @Test
    fun nativeHandoffWorkspaceMovementJumpAndKeystore() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val file = File(context.filesDir, "smoke-handoff.json")
        Assume.assumeTrue(
            "Run scripts/device-smoke.py with a disposable backend first",
            file.exists(),
        )
        val handoff =
            try {
                JSONObject(file.readText())
            } finally {
                file.delete()
            }
        require(handoff.getString("origin") == "http://localhost:3000")
        val store = CredentialStore(context)
        store.save("session", null)
        store.save("pending", handoff)
        val intent =
            android.content
                .Intent(context, MainActivity::class.java)
                .setData(android.net.Uri.parse(handoff.getString("url")))
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        val scenario = ActivityScenario.launch<MainActivity>(intent)
        fun waitFor(label: String, condition: (OfficeModel) -> Boolean) {
            val deadline = System.currentTimeMillis() + 15000
            while (System.currentTimeMillis() < deadline) {
                var ready = false
                scenario.onActivity { ready = condition(it.model) }
                if (ready) return
                Thread.sleep(40)
            }
            var error = ""
            scenario.onActivity { error = it.model.error + " " + it.model.office?.error.orEmpty() }
            Assert.fail("$label timed out: $error")
        }
        try {
            waitFor("Sign-in") { it.account != null && it.workspaces.isNotEmpty() }
            scenario.onActivity { it.model.select(it.model.workspaces.first()) }
            waitFor("Office socket") { it.office?.connected == true }
            waitFor("Avatar atlas") { model ->
                val office = model.office!!
                val me = office.snapshot!!.me!!
                office.avatars[me.avatar]
                    ?.frames
                    ?.get("${me.direction}-${me.pose}-0")
                    ?.isNotEmpty() == true
            }
            scenario.onActivity { it.model.office!!.perform("jump") }
            waitFor("Jump broadcast") { model ->
                val office = model.office!!
                office.animations[office.snapshot!!.self]?.jumpStart?.isFinite() == true
            }
            var beforeX = 0f
            var beforeY = 0f
            scenario.onActivity {
                val office = it.model.office!!
                beforeX = office.snapshot!!.me!!.x
                beforeY = office.snapshot!!.me!!.y
                office.move(1, 1)
            }
            waitFor("Server-authoritative movement") {
                val me = it.office!!.snapshot!!.me!!
                me.x != beforeX || me.y != beforeY
            }
            scenario.onActivity {
                it.model.office!!.move(0, 0)
                it.model.office!!.perform("sit")
            }
            waitFor("Sit broadcast") { it.office!!.snapshot!!.me!!.pose == "sit" }
            val saved = store.read("session")!!
            val encrypted =
                context
                    .getSharedPreferences("credentials", Context.MODE_PRIVATE)
                    .getString("session", "")!!
            Assert.assertFalse(
                encrypted.contains(saved.getJSONObject("credential").getString("token"))
            )
            Thread.sleep(500)
            val capture = CountDownLatch(1)
            scenario.onActivity { activity ->
                val bitmap =
                    android.graphics.Bitmap.createBitmap(
                        activity.window.decorView.width,
                        activity.window.decorView.height,
                        android.graphics.Bitmap.Config.ARGB_8888,
                    )
                android.view.PixelCopy.request(
                    activity.window,
                    bitmap,
                    { result ->
                        if (result == android.view.PixelCopy.SUCCESS)
                            File(context.filesDir, "office-smoke.png").outputStream().use {
                                bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
                            }
                        capture.countDown()
                    },
                    android.os.Handler(android.os.Looper.getMainLooper()),
                )
            }
            Assert.assertTrue(capture.await(5, TimeUnit.SECONDS))
            scenario.onActivity { it.model.leave() }
            waitFor("Leave workspace") { it.office == null }
            scenario.onActivity { it.model.logout() }
            waitFor("Sign out") { it.account == null && !it.busy }
            Assert.assertNull(store.read("session"))
        } finally {
            scenario.close()
            store.save("session", null)
            store.save("pending", null)
        }
    }
}
