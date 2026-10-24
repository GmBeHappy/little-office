package com.littleoffice.android

import kotlin.math.*
import kotlin.random.Random
import org.json.JSONObject

private fun JSONObject.pixels(key: String) =
    optJSONArray(key)?.objects()?.map(Pixel::parse).orEmpty()

private fun rounded(value: Double) = floor(value + 0.5)

private fun Pixel.place(x: Double, y: Double, right: Boolean = true, bob: Double = 0.0) =
    copy(x = (x + if (right) this.x else -this.x - w).toFloat(), y = (y + this.y + bob).toFloat())

data class AnimalPosition(
    val x: Double,
    val y: Double,
    val right: Boolean,
    val moving: Boolean,
    val mode: String,
    val walkTime: Double,
    val poseTime: Double,
)

fun animalPosition(
    animal: JSONObject,
    index: Int,
    time: Double,
    still: Boolean = false,
): AnimalPosition {
    val route = animal.getJSONArray("route").objects()
    val durations = route.zipWithNext { a, b ->
        hypot(b.getDouble("x") - a.getDouble("x"), b.getDouble("y") - a.getDouble("y")) /
            animal.getDouble("speed") * 1000
    }
    val pause = animal.getDouble("pauseMs")
    val total = durations.sum() + durations.size * pause
    var phase =
        if (still || total == 0.0) 0.0
        else ((time + animal.getDouble("phaseOffsetMs")) % total + total) % total
    var segment = 0
    while (segment < durations.size - 1 && phase >= durations[segment] + pause) {
        phase -= durations[segment] + pause
        segment++
    }
    val a = route[segment]
    val b = route.getOrElse(segment + 1) { a }
    val duration = durations.getOrElse(segment) { 1.0 }.takeIf { it != 0.0 } ?: 1.0
    val t = if (still) 0.0 else min(1.0, phase / duration)
    val moving = !still && durations.isNotEmpty() && phase < duration
    return AnimalPosition(
        a.getDouble("x") + (b.getDouble("x") - a.getDouble("x")) * t,
        a.getDouble("y") + (b.getDouble("y") - a.getDouble("y")) * t,
        if (still) true
        else if (a.getDouble("x") == b.getDouble("x")) index % 2 == 0
        else b.getDouble("x") > a.getDouble("x"),
        moving,
        if (moving) "walk" else if (!still && (segment + index) % 2 == 0) "graze" else "idle",
        if (still) 0.0 else min(phase, duration),
        if (still) 0.0 else max(0.0, phase - duration),
    )
}

fun effectPixels(effects: List<JSONObject>, time: Double, still: Boolean): List<Pixel> = buildList {
    effects.forEach { effect ->
        val x = effect.getDouble("x")
        val y = effect.getDouble("y")
        val seed = x * 0.13 + y * 0.07
        val color = effect.getLong("color")
        if (effect.string("kind") == "ripple") {
            val phase = time / 1100 + seed
            add(
                Pixel(
                    rounded(x + if (still) 0.0 else sin(phase) * 4).toFloat(),
                    y.toFloat(),
                    effect.getDouble("w").toFloat(),
                    effect.getDouble("h").toFloat(),
                    color,
                    if (still) 1f else (0.7 + sin(phase + 1) * 0.25).toFloat(),
                )
            )
        } else if (!still)
            repeat(4) { i ->
                val phase = (time / (6500 + i * 700) + seed + i * 0.27) % 1
                val sway = sin(phase * PI * 4 + seed + i)
                add(
                    Pixel(
                        rounded(
                                x +
                                    (i / 3.0 * 2 - 1) * effect.getDouble("spread") +
                                    sway * 7 +
                                    phase * 9
                            )
                            .toFloat(),
                        rounded(y + phase * effect.getDouble("fall")).toFloat(),
                        if (abs(sway) > 0.5) 4f else 2f,
                        2f,
                        color,
                        min(1.0, min(phase * 8, (1 - phase) * 5)).toFloat(),
                    )
                )
            }
    }
}

class NativeWorld(val scene: Scene, random: Random = Random.Default) {
    private val animation = scene.animation
    private val habitat = animation?.optJSONObject("habitat")
    private val effects = animation?.optJSONArray("effects")?.objects().orEmpty()
    private val atlas =
        habitat
            ?.optJSONObject("atlas")
            ?.let { value -> value.keys().asSequence().associateWith { value.pixels(it) } }
            .orEmpty()
    val farm = animation?.optJSONObject("farm")?.let { FarmWorld(it, scene.blocks, random) }

    fun effects(time: Double, still: Boolean) = effectPixels(effects, time, still)

    fun target(person: Person?, time: Double, wildlife: Boolean, activities: Boolean): Int {
        if (person == null || person.zone != "floor" || !activities || habitat == null) return -1
        var target = -1
        var distance = habitat.getDouble("interactionRadius")
        val station = habitat.optJSONObject("station")
        fun consider(id: Int, x: Double, y: Double) {
            val d = hypot(person.x - x, person.y - y)
            if (d < distance) {
                distance = d
                target = id
            }
        }
        if (station != null && station.has("x"))
            consider(0, station.getDouble("x"), station.getDouble("y"))
        if (wildlife)
            habitat.getJSONArray("animals").objects().forEachIndexed { index, animal ->
                val p = animalPosition(animal, index, time)
                consider(animal.getInt("target"), p.x, p.y)
            }
        return target
    }

    fun prompt(target: Int): String =
        habitat?.optJSONObject("style")?.string(if (target == 0) "activity" else "quick").orEmpty()

    fun habitatPixels(
        state: JSONObject,
        time: Double,
        wildlife: Boolean,
        activities: Boolean,
        still: Boolean,
    ): List<Pixel> = buildList {
        val h = habitat ?: return@buildList
        val station = h.getJSONObject("station")
        if (activities && station.has("x")) {
            val step =
                if (time - state.optDouble("updatedAt", 0.0) < h.getDouble("resetMs"))
                    state.optInt("step")
                else 0
            val stages = station.getJSONArray("stages")
            val stage = stages.getJSONObject(step.coerceIn(0, stages.length() - 1))
            val rects = stage.pixels("rectangles")
            val motions = stage.getJSONArray("motions").objects()
            for (i in 0..rects.size) {
                motions
                    .filter { it.getInt("before") == i }
                    .forEach { motion ->
                        var offset =
                            if (still) 0.0
                            else
                                sin(time * 2 * PI / motion.getDouble("periodMs")) *
                                    motion.getDouble("amplitude")
                        if (motion.getBoolean("roundOffset")) offset = rounded(offset)
                        motion.pixels("rectangles").forEach { p ->
                            add(
                                p.place(
                                    station.getDouble("x") +
                                        if (motion.string("axis") == "x") offset else 0.0,
                                    station.getDouble("y") +
                                        if (motion.string("axis") == "y") offset else 0.0,
                                )
                            )
                        }
                    }
                if (i < rects.size)
                    add(rects[i].place(station.getDouble("x"), station.getDouble("y")))
            }
        }
        if (wildlife)
            h.getJSONArray("animals").objects().forEachIndexed { index, animal ->
                // Reduced ambient motion does not freeze server-authoritative wildlife positions.
                val p = animalPosition(animal, index, time)
                val frame =
                    when (p.mode) {
                        "walk" -> floor(p.walkTime / 160).toInt() % 2
                        "graze" -> floor(p.poseTime / 240).toInt() % 2
                        else -> 0
                    }
                val x = rounded(p.x)
                val y = rounded(p.y)
                h.pixels("shadow").forEach { add(it.place(x, y)) }
                atlas["${p.mode}-$frame"].orEmpty().forEach { add(it.place(x, y, p.right)) }
                if (
                    activities &&
                        state.optInt("animal", -1) == index &&
                        state.optDouble("affectionUntil", 0.0) > time
                ) {
                    val bob =
                        if (p.mode == "walk" && floor(p.walkTime / 160).toInt() % 2 == 1) -1.0
                        else 0.0
                    h.pixels("affection").forEach { add(it.place(x, y, p.right, bob)) }
                }
            }
    }
}

data class FarmTarget(val kind: String, val index: Int, val x: Double, val y: Double)

data class FarmAnimal(
    val kind: String,
    var x: Double,
    var y: Double,
    val variant: String = "light",
    var until: Double = 0.0,
    var tx: Double = x,
    var ty: Double = y,
    var mode: String = "idle",
    var since: Double = 0.0,
    var walkTime: Double = 0.0,
    var right: Boolean = true,
    var fast: Boolean = false,
)

class FarmWorld(
    val definition: JSONObject,
    val blocks: List<JSONObject>,
    private val random: Random = Random.Default,
) {
    private val atlas =
        definition.getJSONObject("atlas").let { value ->
            value.keys().asSequence().associateWith { value.pixels(it) }
        }
    private val shadows =
        definition.getJSONObject("shadows").let { value ->
            value.keys().asSequence().associateWith { value.pixels(it) }
        }
    private val spots = definition.getJSONArray("eggSpots").objects()
    private val plots = definition.getJSONArray("plots").objects()
    val eggs = mutableMapOf<Int, Double>()
    val planted = MutableList(plots.size) { 0.0 }
    var eggCount = 0
    var cropCount = 0
    var fishCount = 0
    private val caughtFish = mutableSetOf<Double>()
    private var nextEgg = definition.getDouble("firstEggMs")
    private val hens =
        definition.getJSONArray("hens").objects().map {
            FarmAnimal(
                "hen",
                it.getDouble("x"),
                it.getDouble("y"),
                it.string("variant"),
                it.getDouble("until"),
            )
        }
    private val animals =
        definition.getJSONArray("animals").objects().map {
            FarmAnimal(
                it.string("kind"),
                it.getDouble("x"),
                it.getDouble("y"),
                until = 2000 + random.nextDouble() * 3000,
            )
        }

    fun target(x: Double, y: Double, time: Double): FarmTarget? {
        var best: FarmTarget? = null
        var distance = Double.POSITIVE_INFINITY
        fun consider(kind: String, index: Int, p: JSONObject, radius: Double) {
            val d = hypot(x - p.getDouble("x"), y - p.getDouble("y"))
            if (d < radius && d < distance) {
                distance = d
                best = FarmTarget(kind, index, p.getDouble("x"), p.getDouble("y"))
            }
        }
        eggs.forEach { (index, until) ->
            if (until > time)
                consider("egg", index, spots[index], definition.getDouble("eggRadius"))
        }
        planted.forEachIndexed { index, start ->
            if (start == 0.0)
                consider("plant", index, plots[index], definition.getDouble("cropRadius"))
            else if (time - start >= definition.getDouble("growthMs"))
                consider("harvest", index, plots[index], definition.getDouble("cropRadius"))
        }
        return best
    }

    fun interact(target: FarmTarget, time: Double): String =
        when (target.kind) {
            "egg" -> {
                eggs.remove(target.index)
                eggCount++
                nextEgg = min(nextEgg, time + definition.getDouble("eggPickupDelayMs"))
                "🥚"
            }
            "plant" -> {
                planted[target.index] = time
                "🌱"
            }
            else -> {
                planted[target.index] = 0.0
                cropCount++
                "🌾"
            }
        }

    private fun walkable(x: Double, y: Double) =
        listOf(-22, 0, 22).all { dx ->
            listOf(-8, 0, 8).all { dy ->
                val px = x + dx
                val py = y + dy
                px >= 42 &&
                    px <= 1080 &&
                    py >= 68 &&
                    py <= 660 &&
                    blocks.none {
                        px > it.getDouble("x") - 10 &&
                            px < it.getDouble("x") + it.getDouble("w") + 10 &&
                            py > it.getDouble("y") - 5 &&
                            py < it.getDouble("y") + it.getDouble("h") + 10
                    }
            }
        }

    fun update(time: Double, delta: Double, me: Person?, wildlife: Boolean, wallTime: Double) {
        if (eggs.size < definition.getInt("maxEggs") && time > nextEgg) {
            val free = spots.indices.filter { it !in eggs }
            if (free.isNotEmpty())
                eggs[free.random(random)] = time + definition.getDouble("eggLifetimeMs")
            nextEgg =
                time +
                    definition.getDouble("eggIntervalMs") +
                    random.nextDouble() * definition.getDouble("eggIntervalJitterMs")
        }
        eggs.entries.removeAll { it.value < time }
        me?.fishing?.let { fish ->
            val bite = fish.getDouble("bite")
            if (wallTime >= bite && caughtFish.add(bite)) fishCount++
        }
        if (!wildlife) return
        val step = delta.coerceIn(0.0, definition.getDouble("maxStepMs"))
        val yard = definition.getJSONObject("henYard")
        (hens + animals).forEach { a ->
            val hen = a.kind == "hen"
            if (
                hen &&
                    a.mode != "walk" &&
                    me != null &&
                    hypot(a.x - me.x, a.y - me.y) < definition.getDouble("henScatterRadius")
            ) {
                a.tx =
                    (a.x +
                            if (a.x >= me.x) definition.getDouble("henScatterX")
                            else -definition.getDouble("henScatterX"))
                        .coerceIn(yard.getDouble("x"), yard.getDouble("x") + yard.getDouble("w"))
                a.ty =
                    (a.y +
                            if (a.y >= me.y) definition.getDouble("henScatterY")
                            else -definition.getDouble("henScatterY"))
                        .coerceIn(yard.getDouble("y"), yard.getDouble("y") + yard.getDouble("h"))
                a.mode = "walk"
                a.fast = true
            }
            if (a.mode == "walk") {
                val dx = a.tx - a.x
                val dy = a.ty - a.y
                val distance = hypot(dx, dy)
                val speed =
                    definition.getDouble(
                        if (hen) if (a.fast) "henFastSpeed" else "henSpeed"
                        else if (a.kind == "cow") "cowSpeed" else "sheepSpeed"
                    ) * step / 1000
                if (distance <= speed) {
                    a.x = a.tx
                    a.y = a.ty
                    a.mode =
                        if (random.nextDouble() < if (hen) 0.45 else 0.5)
                            if (hen) "peck" else "graze"
                        else "idle"
                    a.until =
                        time +
                            (if (hen) 900 else 1500) +
                            random.nextDouble() * (if (hen) 2800 else 4000)
                    a.since = time
                    a.fast = false
                } else {
                    val x = a.x + dx / distance * speed
                    val y = a.y + dy / distance * speed
                    if (hen || walkable(x, y)) {
                        a.x = x
                        a.y = y
                        a.walkTime += step
                        a.right = dx >= 0
                    } else {
                        a.mode = "idle"
                        a.until = time + 600
                    }
                }
            } else if (time > a.until) {
                if (hen) {
                    a.tx = yard.getDouble("x") + random.nextDouble() * yard.getDouble("w")
                    a.ty = yard.getDouble("y") + random.nextDouble() * yard.getDouble("h")
                } else
                    for (attempt in 0 until 24) {
                        val x = 70 + random.nextDouble() * 980
                        val y = 100 + random.nextDouble() * 540
                        if (walkable(x, y)) {
                            a.tx = x
                            a.ty = y
                            break
                        }
                    }
                a.mode = "walk"
            }
        }
    }

    fun animalPixels(a: FarmAnimal, time: Double): List<Pixel> = buildList {
        addAll(shadows[a.kind].orEmpty().map { it.place(a.x, a.y) })
        val hen = a.kind == "hen"
        val frame =
            when (a.mode) {
                "walk" -> floor(a.walkTime / (if (hen) 120 else 160)).toInt() % 2
                "peck" -> floor((time - a.since) / 160).toInt() % 2
                "graze" -> floor((time - a.since) / 240).toInt() % 2
                else -> if (hen && sin(time / 400 + a.x) > 0.6) 1 else 0
            }
        val key = if (hen) "hen-${a.variant}-${a.mode}-$frame" else "${a.kind}-${a.mode}-$frame"
        val bob = if (hen && a.mode == "peck" && sin(time / 400 + a.x) > 0.6) -1.0 else 0.0
        atlas[key].orEmpty().forEach { add(it.place(a.x, a.y, a.right, bob)) }
    }

    fun icon(emoji: String, remaining: Double): List<Pixel> {
        val name = definition.optJSONObject("iconEmojis")?.string(emoji).orEmpty()
        if (name.isEmpty() || remaining <= 0) return emptyList()
        val rise = (3000 - remaining) / 3000 * 14
        return atlas["icon-$name"].orEmpty().map {
            it.place(0.0, -76 - rise).copy(alpha = min(1.0, remaining / 600).toFloat())
        }
    }

    fun pixels(time: Double, wildlife: Boolean): List<Pixel> = buildList {
        eggs.keys.forEach { index ->
            atlas["egg"].orEmpty().forEach {
                add(it.place(spots[index].getDouble("x"), spots[index].getDouble("y")))
            }
        }
        planted.forEachIndexed { index, start ->
            if (start != 0.0) {
                val age = (time - start) / definition.getDouble("growthMs")
                val stage =
                    when {
                        age < 0.25 -> 0
                        age < 0.55 -> 1
                        age < 1 -> 2
                        else -> 3
                    }
                atlas["crop-$stage"].orEmpty().forEach {
                    add(it.place(plots[index].getDouble("x"), plots[index].getDouble("y")))
                }
            }
        }
        if (wildlife) (hens + animals).forEach { addAll(animalPixels(it, time)) }
    }
}
