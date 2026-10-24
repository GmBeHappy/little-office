package com.littleoffice.android

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class AnimationParityTest {
    private val fixtures =
        JSONObject(javaClass.classLoader!!.getResource("native-animation.json")!!.readText())
    private val scenes =
        fixtures.getJSONArray("scenes").objects().associate {
            it.string("mapId") to Scene.parse(JSONObject(it.toString()).put("revision", 1))
        }

    private fun pixels(expected: List<JSONObject>, actual: List<Pixel>, label: String) {
        assertEquals("$label count", expected.size, actual.size)
        expected.zip(actual).forEachIndexed { i, (e, a) ->
            assertEquals("$label $i x", e.getDouble("x"), a.x.toDouble(), 0.001)
            assertEquals("$label $i y", e.getDouble("y"), a.y.toDouble(), 0.001)
            assertEquals("$label $i w", e.getDouble("w"), a.w.toDouble(), 0.001)
            assertEquals("$label $i h", e.getDouble("h"), a.h.toDouble(), 0.001)
            assertEquals("$label $i color", e.getLong("color"), a.color)
            assertEquals("$label $i alpha", e.optDouble("alpha", 1.0), a.alpha.toDouble(), 0.00001)
        }
    }

    @Test
    fun wildlifeRoutesMatchEveryWebFixture() {
        fixtures.getJSONArray("animals").objects().forEach { f ->
            val animals =
                scenes
                    .getValue(f.string("mapId"))
                    .animation!!
                    .getJSONObject("habitat")
                    .getJSONArray("animals")
            val p =
                animalPosition(
                    animals.getJSONObject(f.getInt("index")),
                    f.getInt("index"),
                    f.getDouble("time"),
                )
            val e = f.getJSONObject("expected")
            assertEquals(e.getDouble("x"), p.x, 0.000001)
            assertEquals(e.getDouble("y"), p.y, 0.000001)
            assertEquals(e.getBoolean("right"), p.right)
            assertEquals(e.getBoolean("moving"), p.moving)
            assertEquals(e.string("mode"), p.mode)
            assertEquals(e.getDouble("walkTime"), p.walkTime, 0.000001)
            assertEquals(e.getDouble("poseTime"), p.poseTime, 0.000001)
        }
    }

    @Test
    fun habitatDrawingMatchesAllMapsStagesAndReducedMotion() {
        fixtures.getJSONArray("habitat").objects().forEach { f ->
            val world = NativeWorld(scenes.getValue(f.string("mapId")))
            pixels(
                f.getJSONArray("expected").objects(),
                world.habitatPixels(
                    f.getJSONObject("state"),
                    f.getDouble("time"),
                    true,
                    true,
                    f.getBoolean("still"),
                ),
                "${f.string("mapId")} ${f.getJSONObject("state").getInt("step")} ${f.getBoolean("still")}",
            )
        }
    }

    @Test
    fun ambientEffectsMatchWebPixels() {
        fixtures.getJSONArray("effects").objects().forEach { f ->
            val world = NativeWorld(scenes.getValue(f.string("mapId")))
            pixels(
                f.getJSONArray("expected").objects(),
                world.effects(f.getDouble("time"), f.getBoolean("still")),
                f.string("mapId"),
            )
        }
    }

    @Test
    fun farmAtlasMatchesMirroringAndAllGaits() {
        val world = NativeWorld(scenes.values.first { it.animation?.has("farm") == true }).farm!!
        fixtures.getJSONArray("farmAnimals").objects().forEach { f ->
            val a = f.getJSONObject("input")
            val animal =
                FarmAnimal(
                    f.string("kind"),
                    a.getDouble("x"),
                    a.getDouble("y"),
                    if (a.optLong("body") == 0xf5f2e8L) "light" else "dark",
                    mode = a.string("mode"),
                    since = a.getDouble("since"),
                    walkTime = a.getDouble("walkTime"),
                    right = a.string("direction") == "right",
                )
            pixels(
                f.getJSONArray("expected").objects(),
                world.animalPixels(animal, f.getDouble("time")),
                "${f.string("kind")} ${a.string("mode")} ${f.getDouble("time")}",
            )
        }
    }

    @Test
    fun farmTargetMatchesBoundaryAndExpiryCases() {
        fixtures.getJSONArray("farmTargets").objects().forEach { f ->
            val world =
                NativeWorld(scenes.values.first { it.animation?.has("farm") == true }).farm!!
            val eggs = f.getJSONArray("eggs")
            for (i in 0 until eggs.length()) {
                val e = eggs.getJSONArray(i)
                world.eggs[e.getInt(0)] = e.getDouble(1)
            }
            val planted = f.getJSONArray("plots")
            for (i in 0 until planted.length()) world.planted[i] = planted.getDouble(i)
            val p = f.getJSONObject("person")
            val target = world.target(p.getDouble("x"), p.getDouble("y"), f.getDouble("time"))
            val e = f.optJSONObject("expected")
            if (e == null) assertNull(target)
            else {
                assertNotNull(target)
                assertEquals(e.string("kind"), target!!.kind)
                assertEquals(e.getDouble("x"), target.x, 0.000001)
                assertEquals(e.getDouble("y"), target.y, 0.000001)
            }
        }
    }

    @Test
    fun statusActivityAndVolumePreserveWebRules() {
        val p =
            Person(
                "a",
                "A",
                "sage",
                100f,
                100f,
                "down",
                false,
                "stand",
                "floor",
                "floor",
                "room",
                0,
                "dnd",
                "Deep work",
                null,
                sharing = true,
                whiteboard = true,
            )
        assertEquals("dnd", p.activityStatus)
        assertEquals("🖥️", p.activityIcon)
        assertEquals("Sharing screen · Using whiteboard", p.activityText)
        assertEquals("busy", p.copy(status = "available").activityStatus)
        assertEquals(0.5, p.volumeFor(p.copy(x = 210f)), 0.00001)
        assertEquals(0.0, p.volumeFor(p.copy(zone = "studio")), 0.00001)
        assertEquals(0.0, p.volumeFor(p.copy(x = 291f)), 0.00001)
        assertEquals(
            1.0,
            p.copy(conversation = "call:1").volumeFor(p.copy(conversation = "call:1", x = 1000f)),
            0.00001,
        )
        assertEquals(listOf(4, 14, 14, 14), appearanceParts("custom:4:14:14:14"))
        assertEquals(appearanceParts("sage"), appearanceParts("custom:9:1:1:1"))
    }
}
