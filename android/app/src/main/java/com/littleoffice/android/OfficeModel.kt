package com.littleoffice.android

import android.app.Application
import android.net.Uri
import android.os.SystemClock
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import java.time.Instant
import kotlinx.coroutines.*
import okhttp3.*
import org.json.JSONObject

class OfficeModel(application: Application) : AndroidViewModel(application) {
    private val store = CredentialStore(application)
    var server by
        mutableStateOf(
            store.read("server")?.string("origin")
                ?: store.read("session")?.string("origin")
                ?: "https://app.littleoffice.app"
        )
    var account by mutableStateOf<JSONObject?>(null)
    var workspaces by mutableStateOf(emptyList<Workspace>())
    var maps by mutableStateOf(emptyList<JSONObject>())
    var allMaps by mutableStateOf(emptyList<JSONObject>())
    var office by mutableStateOf<OfficeSession?>(null)
    var error by mutableStateOf("")
    var busy by mutableStateOf(false)
    var api: OfficeAPI? = null
        private set

    init {
        action {
            val saved = store.read("session") ?: return@action
            if (
                Instant.parse(saved.getJSONObject("credential").getString("expiresAt"))
                    .isBefore(Instant.now())
            ) {
                store.save("session", null)
                return@action
            }
            load(OfficeAPI(saved.getString("origin"), saved.getJSONObject("credential")))
        }
    }

    fun action(block: suspend () -> Unit) {
        viewModelScope.launch {
            busy = true
            error = ""
            try {
                block()
            } catch (cancel: CancellationException) {
                throw cancel
            } catch (e: Exception) {
                if (e is APIError && e.status == 401) {
                    clearSession()
                }
                error = e.message ?: "Something went wrong. Please try again."
            } finally {
                busy = false
            }
        }
    }

    suspend fun load(client: OfficeAPI = requireNotNull(api)) {
        val next = client.call("/api/account")
        val spaces =
            client.call("/api/workspaces").getJSONArray("items").objects().map(Workspace::parse)
        val config = client.call("/api/saas/config")
        api = client
        store.save("server", json("origin" to client.origin))
        account = next
        workspaces = spaces
        maps = config.getJSONArray("maps").objects()
        allMaps = config.optJSONArray("allMaps")?.objects() ?: maps
    }

    fun signIn(): Uri? =
        try {
            val origin = NativeAuth.origin(server)
            val verifier = NativeAuth.random()
            val state = NativeAuth.random()
            store.save(
                "pending",
                json(
                    "origin" to origin,
                    "verifier" to verifier,
                    "state" to state,
                    "expires" to System.currentTimeMillis() + 600000,
                ),
            )
            Uri.parse(
                "$origin/native/authorize?challenge=${NativeAuth.challenge(verifier)}&state=$state"
            )
        } catch (e: Exception) {
            error = e.message.orEmpty()
            null
        }

    fun callback(uri: String) = action {
        val pending = store.read("pending") ?: throw Exception("Start sign-in from this app first.")
        require(pending.getLong("expires") > System.currentTimeMillis()) {
            "Sign-in expired. Start again."
        }
        val code = NativeAuth.callback(uri, pending.getString("state"))
        store.save("pending", null)
        val origin = pending.getString("origin")
        val client = OfficeAPI(origin)
        val credential =
            try {
                client.call(
                    "/api/native/exchange",
                    "POST",
                    json("code" to code, "verifier" to pending.getString("verifier")),
                )
            } finally {
                client.close()
            }
        store.save("session", json("origin" to origin, "credential" to credential))
        server = origin
        load(OfficeAPI(origin, credential))
    }

    fun select(workspace: Workspace) {
        leave()
        api?.let {
            office =
                OfficeSession(getApplication(), it, workspace, viewModelScope).also { session ->
                    session.connect()
                }
        }
    }

    fun leave() {
        office?.stop()
        office = null
    }

    private fun clearSession() {
        leave()
        api?.close()
        api = null
        account = null
        workspaces = emptyList()
        store.save("session", null)
        store.save("pending", null)
    }

    fun logout() = action {
        val client = api
        leave()
        try {
            client?.call("/api/auth/sign-out", "POST")
        } finally {
            clearSession()
        }
    }

    override fun onCleared() {
        leave()
        api?.close()
    }
}

class OfficeSession(
    private val application: Application,
    val api: OfficeAPI,
    val workspace: Workspace,
    private val parentScope: CoroutineScope,
) {
    var snapshot by mutableStateOf<Snapshot?>(null)
    var scene by mutableStateOf<Scene?>(null)
    val avatars = mutableStateMapOf<String, Avatar>()
    val animations = mutableMapOf<String, AvatarAnimation>()
    var connected by mutableStateOf(false)
    var needsTakeover by mutableStateOf(false)
    var error by mutableStateOf("")
    var notice by mutableStateOf("")
    var world: NativeWorld? = null
    var worldTime = 0.0
    var interactionPrompt by mutableStateOf("")
    var farmScore by mutableStateOf("")
    var externalDocument by mutableStateOf(false)
    var closeBoard: (() -> Unit)? = null
    var operator by mutableStateOf(false)
    var board by mutableStateOf(false)
    var boardEnabled by mutableStateOf(false)
    var invitations by mutableStateOf(emptyList<JSONObject>())
    val media = OfficeMedia(application, parentScope) { send(it) }
    private var scope: CoroutineScope? = null
    private var socket: WebSocket? = null
    private var generation = 0
    private var retry: Job? = null
    private var reconnectAttempt = 0
    private var suspended = false
    var reconnecting by mutableStateOf(false)
        private set

    val preferences = OfficePreferences(application)
    private var direction = 0 to 0
    private var sequence = 0
    private val loading = mutableSetOf<String>()

    fun connect(takeover: Boolean = false) {
        stop()
        suspended = false
        val epoch = generation
        needsTakeover = false
        error = ""
        val scope =
            CoroutineScope(
                parentScope.coroutineContext + SupervisorJob(parentScope.coroutineContext[Job])
            )
        this.scope = scope
        scope.launch {
            try {
                val config = api.call(api.path(workspace.id, "/config"))
                val identity = api.call(api.path(workspace.id, "/me"))
                operator =
                    identity.optBoolean("operator") &&
                        api.credential?.string("workspaceId").isNullOrBlank()
                require(config.getInt("protocolVersion") == 1) {
                    "Update Little Office to connect."
                }
                boardEnabled =
                    config
                        .getJSONObject("workspace")
                        .optJSONObject("features")
                        ?.optBoolean("whiteboard", true) ?: true
                scene = Scene.parse(api.call(api.path(workspace.id, "/scene")))
                socket =
                    api.socket(
                        workspace.id,
                        takeover,
                        object : WebSocketListener() {
                            override fun onMessage(webSocket: WebSocket, text: String) {
                                scope.launch {
                                    if (generation == epoch)
                                        try {
                                            handle(
                                                JSONObject(text),
                                                config.optBoolean("mediaConfigured"),
                                            )
                                        } catch (e: Exception) {
                                            fail(e.message.orEmpty())
                                        }
                                }
                            }

                            override fun onFailure(
                                webSocket: WebSocket,
                                t: Throwable,
                                response: Response?,
                            ) {
                                scope.launch {
                                    if (generation == epoch)
                                        recover(t.message ?: "Connection lost. Reconnecting…")
                                }
                            }

                            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                                scope.launch {
                                    if (generation == epoch) {
                                        needsTakeover = code == 4001
                                        if (needsTakeover)
                                            fail("This workspace is open on another device.")
                                        else
                                            recover(
                                                reason.ifBlank { "Connection lost. Reconnecting…" }
                                            )
                                    }
                                }
                            }

                            override fun onClosing(
                                webSocket: WebSocket,
                                code: Int,
                                reason: String,
                            ) {
                                webSocket.close(code, reason)
                            }
                        },
                    )
                var lastPing = SystemClock.elapsedRealtime()
                while (isActive) {
                    delay(80)
                    if (connected) {
                        sendMove()
                        if (SystemClock.elapsedRealtime() - lastPing >= 10000) {
                            send(json("type" to "ping"))
                            lastPing = SystemClock.elapsedRealtime()
                        }
                    }
                }
            } catch (cancel: CancellationException) {
                throw cancel
            } catch (e: Exception) {
                if (generation == epoch) {
                    if (e is APIError && e.status in listOf(401, 403, 404))
                        fail(e.message.orEmpty())
                    else recover(e.message.orEmpty())
                }
            }
        }
    }

    fun suspendForBackground() {
        if (!needsTakeover) suspended = true
        stop()
    }

    fun resume() {
        if (suspended && !needsTakeover) connect()
    }

    private fun recover(message: String) {
        error = message
        stop()
        reconnecting = true
        val epoch = generation
        retry = parentScope.launch {
            delay((1000L shl reconnectAttempt.coerceAtMost(4)).coerceAtMost(10000))
            reconnectAttempt++
            if (generation != epoch || suspended || needsTakeover) return@launch
            try {
                api.call(api.path(workspace.id, "/me"))
            } catch (cancel: CancellationException) {
                throw cancel
            } catch (e: APIError) {
                if (e.status in listOf(401, 403, 404)) {
                    fail(e.message.orEmpty())
                    return@launch
                }
            } catch (_: Exception) {}
            if (generation == epoch) {
                retry = null
                connect()
            }
        }
    }

    private fun fail(message: String) {
        error = message
        stop()
    }

    private fun handle(event: JSONObject, mediaEnabled: Boolean) {
        if (event.string("workspaceId") != workspace.id) return
        val now = SystemClock.elapsedRealtime().toDouble()
        when (event.string("type")) {
            "snapshot" -> {
                val next = Snapshot.parse(event, workspace.id) ?: return
                if (next.revision != scene?.revision)
                    scope?.launch {
                        try {
                            val nextScene = Scene.parse(api.call(api.path(workspace.id, "/scene")))
                            if (nextScene.revision == snapshot?.revision) scene = nextScene
                        } catch (cancel: CancellationException) {
                            throw cancel
                        } catch (e: Exception) {
                            error = e.message.orEmpty()
                        }
                    }
                if (
                    snapshot?.me?.conversation != next.me?.conversation ||
                        snapshot?.revision != next.revision
                )
                    board = false
                boardEnabled =
                    next.workspace.optJSONObject("features")?.optBoolean("whiteboard", true) ?: true
                if (!boardEnabled) board = false
                snapshot = next
                connected = true
                reconnecting = false
                reconnectAttempt = 0
                sequence = maxOf(sequence, next.me?.seq ?: 0)
                if (mediaEnabled) media.update(next, api, workspace.id)
                next.people.forEach { person ->
                    animations.getOrPut(person.id) { AvatarAnimation() }
                    if (person.avatar !in avatars && loading.add(person.avatar))
                        scope?.launch {
                            try {
                                avatars[person.avatar] =
                                    Avatar.parse(
                                        api.call(
                                            api.path(
                                                workspace.id,
                                                "/avatar?appearance=${Uri.encode(person.avatar)}",
                                            )
                                        )
                                    )
                            } catch (cancel: CancellationException) {
                                throw cancel
                            } catch (e: Exception) {
                                error = e.message.orEmpty()
                            } finally {
                                loading.remove(person.avatar)
                            }
                        }
                }
                animations.keys.retainAll(next.people.map { it.id }.toSet())
            }
            "jump" -> animations[event.string("from")]?.jumpStart = now
            "wave" -> animations[event.string("from")]?.waveUntil = now + 2600
            "emote" ->
                animations[event.string("from")]?.let {
                    it.emote = event.string("emoji")
                    it.emoteUntil = now + 3000
                }
            "nudge-animation" -> {
                animations[event.string("from")]?.let {
                    it.nudgeStart = now
                    it.nudgeSender = true
                }
                animations[event.string("to")]?.let {
                    it.nudgeStart = now
                    it.nudgeSender = false
                }
            }
            "presenter" -> media.presenter(event.optBoolean("enabled"))
            "nudge" -> {
                notice = "${event.string("name", "Someone")} nudged you."
                media.playNudge()
            }
            "nudge-sent" -> media.playNudge()
            "notice",
            "error" -> notice = event.string("message")
            "invitation" -> invitations = invitations + event.getJSONObject("invitation")
            "invitation-ended" -> invitations = invitations.filter {
                    it.string("id") != event.string("id")
                }
            "user-updated" -> {
                notice = "Your account changed. Reconnect to refresh your access."
                stop()
            }
        }
    }

    fun send(command: JSONObject) {
        socket?.send(command.toString())
    }

    fun move(dx: Int, dy: Int) {
        if (direction != dx to dy) {
            direction = dx to dy
            sendMove()
        }
    }

    private fun sendMove() {
        if (connected)
            send(
                json(
                    "type" to "move",
                    "dx" to direction.first,
                    "dy" to direction.second,
                    "seq" to ++sequence,
                )
            )
    }

    fun interact() {
        if (!connected) return
        val state = snapshot ?: return
        val me = state.me ?: return
        val world = world ?: return
        val features = state.workspace.optJSONObject("features")
        if (features?.optBoolean("activities", true) == false) return
        val farm = world.farm
        val target = farm?.target(me.x.toDouble(), me.y.toDouble(), worldTime)
        if (target != null)
            send(json("type" to "emote", "emoji" to farm.interact(target, worldTime)))
        else {
            val habitatTarget =
                world.target(
                    me,
                    System.currentTimeMillis().toDouble(),
                    features?.optBoolean("wildlife", true) ?: true,
                    true,
                )
            if (habitatTarget >= 0)
                send(
                    json(
                        "type" to "interact",
                        "target" to habitatTarget,
                        "revision" to state.habitat.optInt("revision"),
                    )
                )
        }
    }

    fun perform(action: String) {
        if (!connected) return
        if (action in listOf("stand", "sit", "sleep", "fish")) {
            move(0, 0)
            send(
                json(
                    "type" to "pose",
                    "pose" to if (snapshot?.me?.pose == action) "stand" else action,
                )
            )
        } else send(json("type" to action))
    }

    fun stop() {
        retry?.cancel()
        retry = null
        reconnecting = false
        generation++
        direction = 0 to 0
        connected = false
        board = false
        socket?.close(1000, "Leaving office")
        socket = null
        scope?.cancel()
        scope = null
        media.stop()
        snapshot = null
        invitations = emptyList()
        loading.clear()
        animations.clear()
    }
}
