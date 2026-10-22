package com.littleoffice.android

import java.net.URI
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import kotlin.math.*
import org.json.JSONArray
import org.json.JSONObject

fun json(vararg values: Pair<String, Any?>) =
    JSONObject().apply { values.forEach { put(it.first, it.second ?: JSONObject.NULL) } }

fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }

fun JSONObject.string(key: String, fallback: String = "") =
    if (isNull(key)) fallback else optString(key, fallback)

object NativeAuth {
    fun origin(value: String): String {
        val uri = URI(value.trim())
        require(
            uri.host != null &&
                uri.rawUserInfo == null &&
                uri.rawQuery == null &&
                uri.rawFragment == null &&
                uri.path.orEmpty() in listOf("", "/")
        ) {
            "Enter an HTTPS server address without a path."
        }
        require(
            uri.scheme == "https" ||
                (uri.scheme == "http" && uri.host in listOf("localhost", "127.0.0.1"))
        ) {
            "HTTPS is required. For local development use localhost with adb reverse."
        }
        require(uri.port == -1 || uri.port in 1..65535) { "Invalid server port." }
        val port = uri.port.takeIf { it != -1 && it != if (uri.scheme == "https") 443 else 80 }
        return "${uri.scheme}://${uri.host.lowercase()}${if (port != null) ":$port" else ""}"
    }

    fun random() =
        Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(ByteArray(32).also { SecureRandom().nextBytes(it) })

    fun challenge(verifier: String) =
        Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(
                MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII))
            )

    fun callback(value: String, state: String): String {
        val uri = URI(value)
        require(
            uri.scheme == "littleoffice" &&
                uri.host == "auth" &&
                uri.port == -1 &&
                uri.rawUserInfo == null &&
                uri.path.orEmpty() in listOf("", "/") &&
                uri.fragment == null
        ) {
            "Invalid sign-in callback."
        }
        val params = uri.rawQuery.orEmpty().split('&').map { it.split('=', limit = 2) }
        require(
            params.size == 2 &&
                params.all { it.size == 2 } &&
                params.map { it[0] }.toSet() == setOf("code", "state")
        ) {
            "Invalid sign-in response."
        }
        val values = params.associate { it[0] to it[1] }
        require(
            MessageDigest.isEqual(values.getValue("state").toByteArray(), state.toByteArray())
        ) {
            "Sign-in state does not match. Start again."
        }
        return values.getValue("code").also {
            require(it.matches(Regex("[A-Za-z0-9_-]{43}"))) { "Invalid sign-in code." }
        }
    }
}

data class Workspace(val id: String, val name: String, val role: String, val mapId: String) {
    companion object {
        fun parse(j: JSONObject) =
            Workspace(j.getString("id"), j.getString("name"), j.string("role"), j.string("mapId"))
    }
}

data class Pixel(val x: Float, val y: Float, val w: Float, val h: Float, val color: Long) {
    companion object {
        fun parse(j: JSONObject) =
            Pixel(
                j.getDouble("x").toFloat(),
                j.getDouble("y").toFloat(),
                j.getDouble("w").toFloat(),
                j.getDouble("h").toFloat(),
                j.getLong("color"),
            )
    }
}

data class Person(
    val id: String,
    val name: String,
    val avatar: String,
    val x: Float,
    val y: Float,
    val direction: String,
    val moving: Boolean,
    val pose: String,
    val zone: String,
    val conversation: String,
    val room: String,
    val seq: Int,
    val status: String,
    val statusText: String,
    val fishing: JSONObject?,
) {
    fun canHear(other: Person) =
        conversation == other.conversation &&
            (conversation != "floor" ||
                (zone == other.zone && hypot(x - other.x, y - other.y) <= 190))

    companion object {
        fun parse(j: JSONObject) =
            Person(
                j.getString("id"),
                j.getString("name"),
                j.getString("avatar"),
                j.getDouble("x").toFloat(),
                j.getDouble("y").toFloat(),
                j.getString("direction"),
                j.getBoolean("moving"),
                j.getString("pose"),
                j.getString("zone"),
                j.getString("conversation"),
                j.getString("room"),
                j.getInt("seq"),
                j.string("status"),
                j.string("statusText"),
                j.optJSONObject("fishing"),
            )
    }
}

data class Snapshot(
    val self: String,
    val revision: Int,
    val people: List<Person>,
    val locks: JSONObject,
) {
    val me
        get() = people.find { it.id == self }

    companion object {
        fun parse(j: JSONObject, workspace: String): Snapshot? {
            if (j.string("workspaceId") != workspace) return null
            require(j.getInt("protocolVersion") == 1) {
                "Update Little Office to connect to this server."
            }
            return Snapshot(
                j.getString("self"),
                j.getJSONObject("workspace").getInt("revision"),
                j.getJSONArray("people").objects().map(Person::parse),
                j.optJSONObject("locks") ?: JSONObject(),
            )
        }
    }
}

data class Scene(
    val revision: Int,
    val width: Float,
    val height: Float,
    val rectangles: List<Pixel>,
    val labels: List<JSONObject>,
) {
    companion object {
        fun parse(j: JSONObject): Scene {
            require(j.getInt("version") == 1) { "Unsupported map version." }
            return Scene(
                j.getInt("revision"),
                j.getDouble("width").toFloat(),
                j.getDouble("height").toFloat(),
                j.getJSONArray("rectangles").objects().map(Pixel::parse),
                j.getJSONArray("labels").objects(),
            )
        }
    }
}

data class Avatar(val frames: Map<String, List<Pixel>>, val skin: Long) {
    companion object {
        fun parse(j: JSONObject): Avatar {
            require(j.getInt("version") == 2) { "Update your server's avatar atlas." }
            val frames = j.getJSONObject("frames")
            return Avatar(
                frames.keys().asSequence().associateWith {
                    frames.getJSONArray(it).objects().map(Pixel::parse)
                },
                j.optLong("skin", 0xe0aa79),
            )
        }
    }
}

/** Matches PixelMap and the Swift client in milliseconds, including landing squash. */
class AvatarAnimation {
    var jumpStart = Double.NEGATIVE_INFINITY
    var nudgeStart = Double.NEGATIVE_INFINITY
    var nudgeSender = false
    var emote = ""
    var emoteUntil = 0.0
    var waveUntil = 0.0
    private var walkTime = 0.0
    private var pose = "stand"
    private var poseSince = 0.0

    data class Frame(
        val index: Int,
        val height: Float,
        val squash: Float,
        val bob: Float,
        val offsetX: Float,
        val offsetY: Float,
        val reaction: String,
    )

    fun update(
        time: Double,
        delta: Double,
        moving: Boolean,
        nextPose: String,
        direction: String,
        reduced: Boolean,
    ): Frame {
        walkTime = if (moving) walkTime + delta.coerceIn(0.0, 50.0) else 0.0
        val step = (walkTime / 110).toInt() % 4
        if (pose != nextPose) {
            pose = nextPose
            poseSince = time
        }
        val settle =
            if (reduced || pose in listOf("stand", "fish")) 0.0
            else -4 * max(0.0, 1 - (time - poseSince) / 250)
        val breathe = if (!reduced && pose == "sleep") sin(time / 650) else 0.0
        val elapsed = time - jumpStart
        val airborne = elapsed >= 0 && elapsed < 520
        val height = if (airborne) 28 * 4 * (elapsed / 520) * (1 - elapsed / 520) else 0.0
        val squash =
            if (elapsed >= 520 && elapsed < 650) 0.16 * sin((elapsed - 520) / 130 * PI) else 0.0
        val nudgeTime = if (nudgeStart.isFinite()) time - nudgeStart else 500.0
        val reacting = nudgeTime >= 0 && nudgeTime < 500
        val motion = if (!reduced && reacting) sin(nudgeTime / 500 * PI) else 0.0
        val push = if (nudgeSender) motion * 8 else motion * sin(nudgeTime / 35) * 4
        val nx =
            if (!nudgeSender) push
            else if (direction == "left") -push else if (direction == "right") push else 0.0
        val ny =
            if (nudgeSender && direction == "up") -push
            else if (nudgeSender && direction == "down") push else 0.0
        val reaction =
            if (reacting && !nudgeSender) "!"
            else if (emoteUntil > time) emote
            else if (pose == "sleep") "Zzz" else if (waveUntil > time) "👋" else ""
        return Frame(
            if (airborne) 4 else step,
            height.toFloat(),
            squash.toFloat(),
            if (airborne || step % 2 == 0) 0f else -1f,
            nx.toFloat(),
            (ny + settle + breathe).toFloat(),
            reaction,
        )
    }

    companion object {
        fun touchDirection(x: Float, y: Float): Pair<Int, Int> {
            if (hypot(x, y) < 10) return 0 to 0
            val threshold = max(abs(x), abs(y)) * 0.4f
            return (if (abs(x) >= threshold) if (x > 0) 1 else -1 else 0) to
                (if (abs(y) >= threshold) if (y > 0) 1 else -1 else 0)
        }
    }
}
