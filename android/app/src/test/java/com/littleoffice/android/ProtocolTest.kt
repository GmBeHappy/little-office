package com.littleoffice.android

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ProtocolTest {
    private fun fixture(name: String) =
        requireNotNull(javaClass.classLoader?.getResourceAsStream(name)).bufferedReader().use {
            it.readText()
        }

    @Test
    fun pkceUsesRfc7636Vector() {
        assertEquals(
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
            NativeAuth.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
        )
        assertEquals(43, NativeAuth.random().length)
    }

    @Test
    fun originRejectsCredentialsPathsAndInsecureRemoteHosts() {
        listOf(
                "http://example.com",
                "https://user:pass@example.com",
                "https://example.com/api",
                "https://example.com?token=secret",
                "https://example.com#fragment",
                "file:///tmp/x",
                "http://localhost.evil.com",
                "https://example.com:70000",
            )
            .forEach {
                assertThrows(IllegalArgumentException::class.java) { NativeAuth.origin(it) }
            }
        assertEquals("http://localhost:3000", NativeAuth.origin("http://localhost:3000/"))
        assertEquals("https://example.com", NativeAuth.origin("https://example.com/"))
        assertEquals("https://example.com", NativeAuth.origin("https://EXAMPLE.com:443/"))
    }

    @Test
    fun callbackRejectsStateMismatchDuplicateAndTokenLeak() {
        val code = "a".repeat(43)
        assertEquals(
            code,
            NativeAuth.callback("littleoffice://auth?code=$code&state=expected", "expected"),
        )
        listOf(
                "littleoffice://auth?code=$code&state=wrong",
                "littleoffice://auth?code=$code&state=expected&state=expected",
                "https://auth?code=$code&state=expected",
                "littleoffice://auth/evil?code=$code&state=expected",
                "littleoffice://auth?token=secret&state=expected",
            )
            .forEach {
                assertThrows(IllegalArgumentException::class.java) {
                    NativeAuth.callback(it, "expected")
                }
            }
    }

    @Test
    fun credentialsNeverFollowRedirects() = runBlocking {
        MockWebServer().use { server ->
            MockWebServer().use { other ->
                server.enqueue(
                    MockResponse().setResponseCode(302).addHeader("Location", other.url("/stolen"))
                )
                val api = OfficeAPI(server.url("/").toString(), json("token" to "signed-session"))
                try {
                    api.call("/api/account")
                    fail("Redirect must fail")
                } catch (e: APIError) {
                    assertEquals(302, e.status)
                }
                assertEquals(
                    "Bearer signed-session",
                    server.takeRequest().getHeader("Authorization"),
                )
                assertEquals(0, other.requestCount)
                assertThrows(IllegalArgumentException::class.java) {
                    api.request("//attacker.test/token")
                }
                api.close()
            }
        }
    }

    @Test
    fun consumesSharedWebDrawingAndWorkspaceFixtures() {
        val snapshot = JSONObject(fixture("snapshot.json"))
        assertNull(Snapshot.parse(snapshot, "another-workspace"))
        assertNotNull(Snapshot.parse(snapshot, snapshot.getString("workspaceId"))?.me)
        snapshot.put("protocolVersion", 99)
        assertThrows(IllegalArgumentException::class.java) {
            Snapshot.parse(snapshot, snapshot.getString("workspaceId"))
        }
        val scene = Scene.parse(JSONObject(fixture("scene.json")))
        assertTrue(scene.width > 0)
        assertTrue(scene.rectangles.isNotEmpty())
        val atlas = Avatar.parse(JSONObject(fixture("avatar.json")))
        assertEquals(80, atlas.frames.size)
        assertTrue(atlas.frames.getValue("left-stand-4").isNotEmpty())
    }

    @Test
    fun jumpAndWalkingMatchWebTiming() {
        val animation = AvatarAnimation()
        animation.jumpStart = 1000.0
        assertEquals(
            28f,
            animation.update(1260.0, 16.0, false, "stand", "down", false).height,
            0.001f,
        )
        assertEquals(4, animation.update(1400.0, 16.0, false, "stand", "down", false).index)
        assertEquals(
            0.16f,
            animation.update(1585.0, 16.0, false, "stand", "down", false).squash,
            0.001f,
        )
        assertEquals(
            0f,
            animation.update(1650.0, 16.0, false, "stand", "down", false).squash,
            0.001f,
        )
        val walk = AvatarAnimation()
        repeat(10) { walk.update(it * 10.0, 10.0, true, "stand", "right", false) }
        assertEquals(1, walk.update(110.0, 10.0, true, "stand", "right", false).index)
        assertEquals(0, walk.update(120.0, 10.0, false, "stand", "right", false).index)
    }

    @Test
    fun idleAvatarHasFiniteTransformBeforeAnyNudge() {
        val idle = AvatarAnimation().update(1000.0, 16.0, false, "stand", "down", false)
        assertEquals(0f, idle.offsetX)
        assertEquals(0f, idle.offsetY)
        val animation =
            AvatarAnimation().apply {
                nudgeStart = 1000.0
                nudgeSender = true
            }
        val nudged = animation.update(1250.0, 16.0, false, "stand", "up", false)
        assertEquals(-8f, nudged.offsetY, 0.001f)
        animation.nudgeSender = false
        val reduced = animation.update(1250.0, 16.0, false, "stand", "down", true)
        assertEquals(0f, reduced.offsetX)
        assertEquals("!", reduced.reaction)
    }

    @Test
    fun joystickSupportsEightDirectionsAndDeadZone() {
        assertEquals(0 to 0, AvatarAnimation.touchDirection(3f, 4f))
        assertEquals(1 to 0, AvatarAnimation.touchDirection(100f, 20f))
        assertEquals(-1 to -1, AvatarAnimation.touchDirection(-50f, -70f))
    }

    @Test
    fun fishingMatchesAll88WebFixtures() {
        val frames = JSONArray(fixture("fishing.json")).objects()
        assertEquals(88, frames.size)
        frames.forEach { frame ->
            assertEquals(
                frame.getJSONArray("rectangles").objects().map(Pixel::parse),
                fishingPixels(
                    frame.getJSONObject("fishing"),
                    frame.getDouble("time"),
                    frame.getLong("skin"),
                    frame.getBoolean("reducedMotion"),
                ),
            )
        }
    }
}
