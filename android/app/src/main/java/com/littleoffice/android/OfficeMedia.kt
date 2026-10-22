package com.littleoffice.android

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.*
import io.livekit.android.ConnectOptions
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.track.RemoteTrackPublication
import io.livekit.android.room.track.VideoTrack
import io.livekit.android.room.track.screencapture.ScreenCaptureParams
import kotlinx.coroutines.*
import org.json.JSONObject

class OfficeMedia(
    private val context: Context,
    private val scope: CoroutineScope,
    private val send: (JSONObject) -> Unit,
) {
    var room by mutableStateOf<Room?>(null)
        private set

    var connected by mutableStateOf(false)
        private set

    var microphone by mutableStateOf(false)
        private set

    var camera by mutableStateOf(false)
        private set

    var sharing by mutableStateOf(false)
        private set

    var needsProjection by mutableStateOf(false)
        private set

    var error by mutableStateOf("")
        private set

    var videos by mutableStateOf(emptyList<Video>())
        private set

    data class Video(val id: String, val name: String, val track: VideoTrack)

    private var roomId = ""
    private var latest: Snapshot? = null
    private var connection: Job? = null
    private var events: Job? = null
    private var generation = 0

    fun update(snapshot: Snapshot, api: OfficeAPI, workspace: String) {
        val next = snapshot.me?.room.orEmpty()
        latest = snapshot
        if (next == roomId) {
            subscriptions()
            return
        }
        stop()
        latest = snapshot
        roomId = next
        if (next.isBlank()) return
        val epoch = generation
        connection = scope.launch {
            try {
                val access = api.call(api.path(workspace, "/media/token"), "POST")
                if (generation != epoch || access.getString("room") != next) return@launch
                val candidate = LiveKit.create(context)
                room = candidate
                events = scope.launch {
                    candidate.events.collect { event ->
                        if (room !== candidate) return@collect
                        if (event is RoomEvent.Disconnected) {
                            connected = false
                            microphone = false
                            camera = false
                            sharing = false
                            needsProjection = false
                            videos = emptyList()
                            error = "Media disconnected. Reconnect the office to retry."
                        }
                        if (event is RoomEvent.ActiveSpeakersChanged)
                            send(
                                json(
                                    "type" to "microphone",
                                    "room" to roomId,
                                    "enabled" to microphone,
                                    "speaking" to candidate.localParticipant.isSpeaking,
                                )
                            )
                        subscriptions()
                    }
                }
                candidate.connect(
                    access.getString("url"),
                    access.getString("token"),
                    ConnectOptions(autoSubscribe = false),
                )
                if (generation != epoch) {
                    candidate.release()
                    return@launch
                }
                connected = true
                error = ""
                subscriptions()
            } catch (cancel: CancellationException) {
                throw cancel
            } catch (e: Exception) {
                if (generation == epoch) {
                    error = e.message ?: "Could not connect media."
                    connected = false
                    room?.release()
                    room = null
                }
            }
        }
    }

    private fun subscriptions() {
        val current = room ?: return
        val snap = latest ?: return
        val me = snap.me ?: return
        current.remoteParticipants.values.forEach { participant ->
            val person = snap.people.find { it.id == participant.identity?.value }
            participant.trackPublications.values
                .filterIsInstance<RemoteTrackPublication>()
                .forEach { publication ->
                    val audible = person?.let(me::canHear) ?: false
                    if (publication.subscribed != audible) publication.setSubscribed(audible)
                }
        }
        videos =
            (listOf(current.localParticipant) + current.remoteParticipants.values).flatMap {
                participant ->
                participant.trackPublications.values.mapNotNull { pub ->
                    val track = pub.track as? VideoTrack
                    if (track == null || pub.muted) null
                    else Video(pub.sid, participant.name ?: "Teammate", track)
                }
            }
    }

    fun toggleMicrophone() = scope.launch {
        val current = room ?: return@launch
        val epoch = generation
        try {
            val enabled = !microphone
            check(current.localParticipant.setMicrophoneEnabled(enabled)) {
                "Could not change microphone."
            }
            if (epoch == generation) {
                microphone = enabled
                send(json("type" to "microphone", "room" to roomId, "enabled" to enabled))
            }
        } catch (e: Exception) {
            if (epoch == generation) error = e.message.orEmpty()
        }
    }

    fun toggleCamera() = scope.launch {
        val current = room ?: return@launch
        val epoch = generation
        try {
            val enabled = !camera
            check(current.localParticipant.setCameraEnabled(enabled)) { "Could not change camera." }
            if (epoch == generation) {
                camera = enabled
                subscriptions()
            }
        } catch (e: Exception) {
            if (epoch == generation) error = e.message.orEmpty()
        }
    }

    fun requestScreenShare() {
        send(json("type" to "present", "enabled" to !sharing))
    }

    fun presenter(enabled: Boolean) {
        if (enabled && !sharing) needsProjection = true
        if (!enabled) {
            needsProjection = false
            stopSharing()
        }
    }

    fun startSharing(permission: Intent?) {
        if (!needsProjection) return
        needsProjection = false
        if (permission == null) {
            send(json("type" to "present", "enabled" to false))
            return
        }
        val current = room ?: return
        val epoch = generation
        scope.launch {
            try {
                check(
                    current.localParticipant.setScreenShareEnabled(
                        true,
                        ScreenCaptureParams(
                            permission,
                            onStop = { scope.launch { if (epoch == generation) stopSharing() } },
                        ),
                    )
                ) {
                    "Could not share screen."
                }
                if (epoch == generation) {
                    sharing = true
                    send(json("type" to "screen-share", "room" to roomId, "enabled" to true))
                    subscriptions()
                }
            } catch (cancel: CancellationException) {
                throw cancel
            } catch (e: Exception) {
                if (epoch == generation) {
                    error = e.message.orEmpty()
                    send(json("type" to "present", "enabled" to false))
                }
            }
        }
    }

    private fun stopSharing() {
        val current = room ?: return
        val wasSharing = sharing
        sharing = false
        if (!wasSharing) return
        send(json("type" to "screen-share", "room" to roomId, "enabled" to false))
        send(json("type" to "present", "enabled" to false))
        scope.launch {
            try {
                current.localParticipant.setScreenShareEnabled(false)
            } catch (_: Exception) {}
        }
    }

    fun stop() {
        generation++
        connection?.cancel()
        connection = null
        events?.cancel()
        events = null
        room?.release()
        room = null
        roomId = ""
        latest = null
        connected = false
        microphone = false
        camera = false
        sharing = false
        needsProjection = false
        videos = emptyList()
    }
}
