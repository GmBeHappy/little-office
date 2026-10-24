package com.littleoffice.android

import android.animation.ValueAnimator
import android.graphics.Bitmap
import android.graphics.Paint
import android.os.SystemClock
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.*
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.key.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import kotlin.math.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun OfficeMap(office: OfficeSession, modifier: Modifier = Modifier, select: (Person) -> Unit) {
    val actions = rememberCoroutineScope()
    val scene = office.scene
    val world = remember(office, scene?.mapId, scene?.revision) { scene?.let { NativeWorld(it) } }
    val worldStart = remember(world) { SystemClock.elapsedRealtime().toDouble() }
    DisposableEffect(world) {
        office.world = world
        onDispose { if (office.world === world) office.world = null }
    }
    val map =
        remember(scene) {
            scene?.let { value ->
                Bitmap.createBitmap(
                        value.width.toInt(),
                        value.height.toInt(),
                        Bitmap.Config.ARGB_8888,
                    )
                    .apply {
                        val canvas = android.graphics.Canvas(this)
                        canvas.drawColor(0xffd8dfbf.toInt())
                        val paint = Paint().apply { isAntiAlias = false }
                        (value.animation?.optJSONArray("background")?.objects()?.map(Pixel::parse)
                                ?: value.rectangles)
                            .forEach { p ->
                                paint.color = (p.color or 0xff000000).toInt()
                                canvas.drawRect(p.x, p.y, p.x + p.w, p.y + p.h, paint)
                            }
                        paint.isAntiAlias = true
                        paint.textAlign = Paint.Align.CENTER
                        paint.typeface =
                            android.graphics.Typeface.create(
                                "sans-serif",
                                android.graphics.Typeface.BOLD,
                            )
                        value.labels.forEach { l ->
                            paint.textSize = l.getDouble("size").toFloat()
                            paint.color =
                                runCatching {
                                        android.graphics.Color.parseColor(l.getString("color"))
                                    }
                                    .getOrDefault(0xff394331.toInt())
                            canvas.drawText(
                                l.getString("text"),
                                l.getDouble("x").toFloat(),
                                l.getDouble("y").toFloat(),
                                paint,
                            )
                        }
                    }
                    .asImageBitmap()
            }
        }
    var time by remember { mutableDoubleStateOf(SystemClock.elapsedRealtime().toDouble()) }
    var delta by remember { mutableDoubleStateOf(0.0) }
    LaunchedEffect(office) {
        var previous = 0L
        while (true) withFrameNanos { now ->
            delta = if (previous == 0L) 0.0 else (now - previous) / 1_000_000.0
            previous = now
            time = SystemClock.elapsedRealtime().toDouble()
        }
    }
    val positions = remember(office) { mutableMapOf<String, Offset>() }
    val paint = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textAlign = Paint.Align.CENTER
            typeface =
                android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.BOLD)
        }
    }
    val density = LocalDensity.current.density
    var scale by remember { mutableFloatStateOf(density) }
    var camera by remember { mutableStateOf(Offset.Zero) }
    var joystick by remember { mutableStateOf<Offset?>(null) }
    var thumb by remember { mutableStateOf(Offset.Zero) }
    val focus = remember { FocusRequester() }
    val keys = remember { mutableSetOf<Key>() }
    val reduced = !ValueAnimator.areAnimatorsEnabled()
    DisposableEffect(office) { onDispose { office.move(0, 0) } }
    LaunchedEffect(office.connected) {
        if (office.connected) focus.requestFocus()
        else {
            joystick = null
            keys.clear()
        }
    }
    Canvas(
        modifier
            .semantics {
                contentDescription =
                    "Office map. Drag to walk. Use the Jump button or a keyboard's arrow keys, WASD and space."
                customActions =
                    listOf(
                            "Walk up" to (0 to -1),
                            "Walk down" to (0 to 1),
                            "Walk left" to (-1 to 0),
                            "Walk right" to (1 to 0),
                        )
                        .map { (label, direction) ->
                            CustomAccessibilityAction(label) {
                                actions.launch {
                                    office.move(direction.first, direction.second)
                                    delay(250)
                                    office.move(0, 0)
                                }
                                true
                            }
                        }
            }
            .onFocusChanged {
                if (!it.isFocused) {
                    keys.clear()
                    joystick = null
                    office.move(0, 0)
                }
            }
            .focusRequester(focus)
            .focusable()
            .onKeyEvent { event ->
                val key = event.key
                if (
                    key in
                        listOf(
                            Key.DirectionLeft,
                            Key.DirectionRight,
                            Key.DirectionUp,
                            Key.DirectionDown,
                            Key.W,
                            Key.A,
                            Key.S,
                            Key.D,
                        )
                ) {
                    if (event.type == KeyEventType.KeyDown) keys.add(key) else keys.remove(key)
                    office.move(
                        (if (Key.DirectionRight in keys || Key.D in keys) 1 else 0) -
                            (if (Key.DirectionLeft in keys || Key.A in keys) 1 else 0),
                        (if (Key.DirectionDown in keys || Key.S in keys) 1 else 0) -
                            (if (Key.DirectionUp in keys || Key.W in keys) 1 else 0),
                    )
                    true
                } else if (
                    event.type == KeyEventType.KeyUp &&
                        key in listOf(Key.Z, Key.One, Key.Two, Key.Three)
                ) {
                    office.perform(
                        when (key) {
                            Key.Z -> "nudge"
                            Key.One -> "sit"
                            Key.Two -> "sleep"
                            else -> "fish"
                        }
                    )
                    true
                } else if (event.type == KeyEventType.KeyUp && key == Key.E) {
                    office.interact()
                    true
                } else if (event.type == KeyEventType.KeyUp && key == Key.Spacebar) {
                    office.perform("jump")
                    true
                } else false
            }
            .pointerInput(office, office.connected) {
                detectDragGestures(
                    onDragStart = {
                        if (office.connected) {
                            joystick = it
                            thumb = it
                        }
                    },
                    onDragEnd = {
                        joystick = null
                        office.move(0, 0)
                    },
                    onDragCancel = {
                        joystick = null
                        office.move(0, 0)
                    },
                ) { change, _ ->
                    joystick?.let { origin ->
                        thumb = change.position
                        val move =
                            AvatarAnimation.touchDirection(
                                (thumb.x - origin.x) / density,
                                (thumb.y - origin.y) / density,
                            )
                        office.move(move.first, move.second)
                        change.consume()
                    }
                }
            }
            .pointerInput(office) {
                detectTapGestures { point ->
                    val world = Offset(point.x / scale + camera.x, point.y / scale + camera.y)
                    office.snapshot
                        ?.people
                        ?.minByOrNull { hypot(world.x - it.x, world.y - (it.y - 16)) }
                        ?.let { if (hypot(world.x - it.x, world.y - (it.y - 16)) < 32) select(it) }
                }
            }
    ) {
        drawRect(Color(0xffdce2cc))
        if (scene == null || map == null) return@Canvas
        val me = office.snapshot?.me
        scale = max(density * 0.85f, min(size.width / scene.width, size.height / scene.height))
        val visibleWidth = size.width / scale
        val visibleHeight = size.height / scale
        val focusPoint =
            me?.let { positions[it.id] ?: Offset(it.x, it.y) }
                ?: Offset(scene.width / 2, scene.height / 2)
        fun axis(focus: Float, extent: Float, visible: Float) =
            if (extent <= visible) (extent - visible) / 2
            else (focus - visible / 2).coerceIn(0f, extent - visible)
        camera =
            Offset(
                axis(focusPoint.x, scene.width, visibleWidth),
                axis(focusPoint.y, scene.height, visibleHeight),
            )
        withTransform({
            scale(scale, scale, Offset.Zero)
            translate(-camera.x, -camera.y)
        }) {
            drawImage(map, filterQuality = FilterQuality.None)
            val wallTime = System.currentTimeMillis().toDouble()
            val farmTime = time - worldStart
            office.worldTime = farmTime
            val features = office.snapshot?.workspace?.optJSONObject("features")
            val wildlife = features?.optBoolean("wildlife", true) ?: true
            val activities = features?.optBoolean("activities", true) ?: true
            world?.effects(time, !office.preferences.effects)?.forEach { drawPixel(it) }
            world?.farm?.update(farmTime, delta, me, wildlife, wallTime)
            val farmTarget =
                if (activities && me != null)
                    world?.farm?.target(me.x.toDouble(), me.y.toDouble(), farmTime)
                else null
            val habitatTarget = world?.target(me, wallTime, wildlife, activities) ?: -1
            office.interactionPrompt =
                if (farmTarget != null)
                    when (farmTarget.kind) {
                        "egg" -> "Collect the egg"
                        "plant" -> "Plant seeds"
                        else -> "Harvest the wheat"
                    }
                else if (habitatTarget >= 0) world?.prompt(habitatTarget).orEmpty() else ""
            office.farmScore =
                world
                    ?.farm
                    ?.let { "🥚 ${it.eggCount}   🌾 ${it.cropCount}   🐟 ${it.fishCount}" }
                    .orEmpty()
            // Web painter order: ambient -1, habitat 940, farm 950, then people 1000+y.
            world
                ?.habitatPixels(
                    office.snapshot?.habitat ?: org.json.JSONObject(),
                    wallTime,
                    wildlife,
                    activities,
                    reduced,
                )
                ?.forEach { drawPixel(it) }
            world?.farm?.pixels(farmTime, wildlife)?.forEach { drawPixel(it) }
            val persons = office.snapshot?.people.orEmpty()
            positions.keys.retainAll(persons.map { it.id }.toSet())
            persons
                .sortedBy { it.y }
                .forEach { person ->
                    val previous = positions[person.id] ?: Offset(person.x, person.y)
                    val blend = (delta / 65).coerceIn(0.0, 1.0).toFloat()
                    val position =
                        Offset(
                            previous.x + (person.x - previous.x) * blend,
                            previous.y + (person.y - previous.y) * blend,
                        )
                    positions[person.id] = position
                    val frame =
                        office.animations
                            .getOrPut(person.id) { AvatarAnimation() }
                            .update(
                                time,
                                delta,
                                person.moving,
                                person.pose,
                                person.direction,
                                reduced,
                            )
                    val atlas = office.avatars[person.avatar]
                    translate(position.x, position.y) {
                        if (frame.nudgeOpacity > 0f) {
                            val width = 40 + frame.nudgeMotion * 15
                            val height = 19 + frame.nudgeMotion * 5
                            drawOval(
                                Color(0xffefb865).copy(alpha = frame.nudgeOpacity),
                                Offset(-width / 2, 3 - height / 2),
                                Size(width, height),
                                style = Stroke(2f),
                            )
                        }
                        if (person.id in office.media.speakers) {
                            val pulse = if (reduced) 0f else kotlin.math.sin(time / 150).toFloat()
                            drawCircle(
                                Color(0xff40ba78).copy(alpha = 0.85f),
                                29 + pulse * 2,
                                Offset(0f, -13 - frame.height),
                                style = Stroke(3f),
                            )
                        }
                        drawOval(
                            Color(0xff5c6551).copy(alpha = (0.18f - frame.height / 400)),
                            Offset(-15.5f + frame.height * 0.15f, -2f),
                            Size(31 - frame.height * 0.3f, 12 - frame.height * 0.1f),
                        )
                        if (person.id == office.snapshot?.self)
                            drawOval(
                                Color(0xfffff7d9),
                                Offset(-18.5f, -5.5f),
                                Size(37f, 17f),
                                style = Stroke(2f),
                            )
                        withTransform({
                            translate(
                                frame.offsetX,
                                -frame.height +
                                    frame.offsetY +
                                    8 * frame.squash +
                                    frame.bob * (1 - frame.squash),
                            )
                            scale(1 + frame.squash / 2, 1 - frame.squash, Offset.Zero)
                        }) {
                            if (person.direction == "up")
                                person.fishing?.let {
                                    fishingPixels(
                                            it,
                                            System.currentTimeMillis().toDouble(),
                                            atlas?.skin ?: 0xe0aa79,
                                            reduced,
                                        )
                                        .forEach { drawPixel(it) }
                                }
                            atlas
                                ?.frames
                                ?.get("${person.direction}-${person.pose}-${frame.index}")
                                ?.forEach { drawPixel(it) }
                            if (person.direction != "up")
                                person.fishing?.let {
                                    fishingPixels(
                                            it,
                                            System.currentTimeMillis().toDouble(),
                                            atlas?.skin ?: 0xe0aa79,
                                            reduced,
                                        )
                                        .forEach { drawPixel(it) }
                                }
                        }
                        val animation = office.animations[person.id]
                        val farmIcon =
                            animation
                                ?.let { world?.farm?.icon(it.emote, it.emoteUntil - time) }
                                .orEmpty()
                        farmIcon.forEach { drawPixel(it) }
                        drawContext.canvas.nativeCanvas.apply {
                            paint.textSize = office.preferences.nameSize
                            paint.color = 0xff394737.toInt()
                            val width = paint.measureText(person.name) + 12
                            val top = if (person.pose == "sleep") 20f else -60f - frame.height
                            val speaking = person.id in office.media.speakers
                            paint.color = if (speaking) 0xff28794f.toInt() else 0xfffaf7e8.toInt()
                            paint.alpha = (office.preferences.nameOpacity * 2.55f).toInt()
                            drawRoundRect(-width / 2, top - 12, width / 2, top + 4, 4f, 4f, paint)
                            paint.alpha = 255
                            paint.color =
                                if (speaking && office.preferences.nameOpacity >= 50)
                                    0xffffffff.toInt()
                                else 0xff394737.toInt()
                            drawText(person.name, 0f, top, paint)
                            if (
                                person.activityIcon.isNotEmpty() || person.activityText.isNotEmpty()
                            ) {
                                paint.textSize = 11f
                                drawText(
                                    "${person.activityIcon} ${person.activityText}".take(55),
                                    0f,
                                    top - 18f,
                                    paint,
                                )
                            }
                            paint.textSize = 10f
                            drawText(if (person.microphone) "●" else "×", width / 2 + 8, top, paint)
                            if (frame.reaction.isNotEmpty() && farmIcon.isEmpty()) {
                                paint.textSize = 24f
                                drawText(frame.reaction, 0f, top - 22, paint)
                            }
                        }
                    }
                }
        }
        joystick?.let { origin ->
            drawCircle(Color.Black.copy(alpha = 0.15f), 44 * density, origin)
            drawCircle(
                Color.White.copy(alpha = 0.7f),
                44 * density,
                origin,
                style = Stroke(2 * density),
            )
            val vector = thumb - origin
            val length = vector.getDistance()
            drawCircle(
                Color.White.copy(alpha = 0.8f),
                14 * density,
                origin + vector * min(1f, 34 * density / max(1f, length)),
            )
        }
    }
}

private fun DrawScope.drawPixel(p: Pixel) =
    drawRect(
        Color((p.color or 0xff000000).toInt()).copy(alpha = p.alpha.coerceIn(0f, 1f)),
        Offset(p.x, p.y),
        Size(p.w, p.h),
    )

fun fishingPixels(f: org.json.JSONObject, time: Double, skin: Long, reduced: Boolean): List<Pixel> {
    val start = f.getDouble("start")
    val bite = f.getDouble("bite")
    if (time < start || time >= bite + 1800) return emptyList()
    val result = mutableListOf<Pixel>()
    fun pixel(x: Double, y: Double, w: Double, h: Double, color: Long) {
        result +=
            Pixel(
                floor(x + 0.5).toFloat(),
                floor(y + 0.5).toFloat(),
                w.toFloat(),
                h.toFloat(),
                color,
            )
    }
    fun line(x: Double, y: Double, tx: Double, ty: Double, width: Double, color: Long) {
        val steps = ceil(max(abs(tx - x), abs(ty - y))).toInt()
        for (i in 0..steps) {
            val t = if (steps == 0) 0.0 else i.toDouble() / steps
            pixel(x + (tx - x) * t, y + (ty - y) * t, width, width, color)
        }
    }
    val side = if (f.getString("direction") == "left") -1.0 else 1.0
    val handX = side * 10
    val handY = -12.0
    val target = f.getJSONObject("target")
    val targetX = target.getDouble("x") - f.getDouble("x")
    val targetY = target.getDouble("y") - f.getDouble("y")
    val cast = if (reduced) 1.0 else min(1.0, (time - start) / 600)
    val catching = time >= bite
    val reel = if (catching) if (reduced) 1.0 else min(1.0, (time - bite) / 700) else 0.0
    val tipX = handX + (targetX - handX) * 0.8 * cast - side * reel * 8
    val tipY = -38 + targetY * 0.45 * cast - reel * 14
    val bob = if (reduced) 0.0 else sin(time / 260) * 1.5
    val hookX = handX + (targetX - handX) * cast + (side * 25 - targetX) * reel
    val hookY = handY + (targetY - handY) * cast - (targetY + 30) * reel + bob * (1 - reel)
    line(side * 10, -8.0, handX, handY, 4.0, skin)
    line(handX, handY, tipX, tipY, 3.0, 0x79543e)
    line(handX, handY, tipX, tipY, 1.0, 0xe1bd7d)
    line(tipX, tipY, hookX, hookY, 1.0, 0xfaf4d8)
    if (!catching) {
        if (cast == 1.0) {
            val ripple = if (reduced) 0.0 else floor((time / 180) % 4)
            pixel(targetX - 6 - ripple, targetY + 3, 12 + ripple * 2, 1.0, 0xd8f1df)
        }
        pixel(hookX - 2, hookY - 5, 4.0, 4.0, 0xd66854)
        pixel(hookX - 2, hookY - 1, 4.0, 3.0, 0xfff4d8)
    } else {
        val wiggle = if (reduced) 0.0 else sin((time - bite) / 65) * 2
        pixel(hookX - 4, hookY + 1, 9.0, 6.0, 0x437f87)
        pixel(hookX - 3, hookY + 2, 7.0, 3.0, 0xb8e2cd)
        pixel(hookX - 2 + wiggle, hookY + 7, 5.0, 3.0, 0xe3a663)
        pixel(hookX + 2, hookY + 2, 2.0, 2.0, 0x253c45)
        if (reel < 1)
            for (sign in listOf(-1, 1)) pixel(
                targetX + sign * (5 + reel * 12),
                targetY - sin(reel * PI) * 12,
                3.0,
                3.0,
                0xe7f6df,
            )
        else {
            pixel(hookX - 12, hookY - 3, 3.0, 3.0, 0xf5cf70)
            pixel(hookX + 10, hookY + 6, 3.0, 3.0, 0xf5cf70)
        }
    }
    return result
}
