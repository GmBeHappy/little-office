package com.littleoffice.android

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.*
import io.livekit.android.ConnectOptions
import io.livekit.android.LiveKit
import io.livekit.android.audio.ScreenAudioCapturer
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.track.LocalAudioTrack
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.RemoteAudioTrack
import io.livekit.android.room.track.RemoteTrackPublication
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoCaptureParameter
import io.livekit.android.room.track.VideoEncoding
import io.livekit.android.room.track.VideoTrack
import io.livekit.android.room.track.screencapture.ScreenCaptureParams
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import livekit.org.webrtc.audio.JavaAudioDeviceModule
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

    data class Video(
        val id: String,
        val name: String,
        val track: VideoTrack,
        val publisher: String,
        val screen: Boolean,
        val local: Boolean,
    )

    var speakers by mutableStateOf(emptySet<String>())
        private set

    private val preferences = context.getSharedPreferences("office-media", Context.MODE_PRIVATE)
    var quality by mutableStateOf(preferences.getString("quality", "maximum") ?: "maximum")
        private set

    var audioDevices by mutableStateOf(emptyList<com.twilio.audioswitch.AudioDevice>())
        private set

    var audioDevice by mutableStateOf<com.twilio.audioswitch.AudioDevice?>(null)
        private set

    private var nudge: android.media.MediaPlayer? = null
    private var audioDeviceListener:
        ((List<com.twilio.audioswitch.AudioDevice>, com.twilio.audioswitch.AudioDevice?) -> Unit)? =
        null
    private var retryAfter = 0L
    private val shareGate = ShareAuthorization()
    private val shareMutex = Mutex()
    private var screenAudioRequested = false
    private var screenAudio: ScreenAudioCapturer? = null
    var sharingAudio by mutableStateOf(false)
        private set

    private var roomId = ""
    private var latest: Snapshot? = null
    private var connection: Job? = null
    private var events: Job? = null
    private var generation = 0

    fun update(snapshot: Snapshot, api: OfficeAPI, workspace: String) {
        val next = snapshot.me?.room.orEmpty()
        latest = snapshot
        if (
            next == roomId &&
                (connected ||
                    connection?.isActive == true ||
                    System.currentTimeMillis() < retryAfter)
        ) {
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
                applyQuality(candidate)
                val listener:
                    (
                        List<com.twilio.audioswitch.AudioDevice>,
                        com.twilio.audioswitch.AudioDevice?,
                    ) -> Unit =
                    { devices, selected ->
                        if (generation == epoch) {
                            audioDevices = devices
                            audioDevice = selected
                        }
                    }
                audioDeviceListener = listener
                candidate.audioSwitchHandler?.registerAudioDeviceChangeListener(listener)
                events = scope.launch {
                    candidate.events.collect { event ->
                        if (room !== candidate) return@collect
                        if (event is RoomEvent.Disconnected) {
                            shareGate.update(false)
                            clearScreenAudio(candidate)
                            connected = false
                            microphone = false
                            camera = false
                            sharing = false
                            needsProjection = false
                            videos = emptyList()
                            retryAfter = System.currentTimeMillis() + 3000
                            error = "Media disconnected. Retrying…"
                        }
                        if (event is RoomEvent.ActiveSpeakersChanged) {
                            speakers =
                                candidate.activeSpeakers.mapNotNull { it.identity?.value }.toSet()
                            send(
                                json(
                                    "type" to "microphone",
                                    "room" to roomId,
                                    "enabled" to microphone,
                                    "speaking" to candidate.localParticipant.isSpeaking,
                                )
                            )
                        }
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
                    retryAfter = System.currentTimeMillis() + 3000
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
                    (publication.track as? RemoteAudioTrack)?.setVolume(
                        person?.let(me::volumeFor) ?: 0.0
                    )
                }
        }
        videos =
            (listOf(current.localParticipant) + current.remoteParticipants.values).flatMap {
                participant ->
                participant.trackPublications.values.mapNotNull { pub ->
                    val track = pub.track as? VideoTrack
                    if (track == null || pub.muted) null
                    else
                        Video(
                            pub.sid,
                            participant.name ?: "Teammate",
                            track,
                            participant.identity?.value.orEmpty(),
                            pub.source == Track.Source.SCREEN_SHARE,
                            participant === current.localParticipant,
                        )
                }
            }
    }

    fun reportView(publisher: String?) {
        if (connected)
            send(json("type" to "screen-view", "room" to roomId, "publisher" to publisher))
    }

    fun selectAudioDevice(device: com.twilio.audioswitch.AudioDevice) {
        room?.audioSwitchHandler?.selectDevice(device)
    }

    fun switchCamera() {
        val publication =
            room?.localParticipant?.trackPublications?.values?.firstOrNull {
                it.source == Track.Source.CAMERA
            }
        try {
            (publication?.track as? LocalVideoTrack)?.switchCamera()
        } catch (e: Exception) {
            error = e.message.orEmpty()
        }
    }

    fun chooseQuality(value: String) {
        if (value !in listOf("maximum", "high", "balanced")) return
        quality = value
        preferences.edit().putString("quality", value).apply()
        room?.let { current ->
            applyQuality(current)
            current.localParticipant.trackPublications.values.forEach { publication ->
                (publication.track as? LocalVideoTrack)?.let { track ->
                    if (publication.source == Track.Source.CAMERA) {
                        try {
                            track.restartTrack(current.videoTrackCaptureDefaults)
                        } catch (e: Exception) {
                            error = e.message.orEmpty()
                        }
                    }
                }
            }
        }
    }

    private fun applyQuality(current: Room) {
        val capture =
            when (quality) {
                "maximum" -> VideoCaptureParameter(3840, 2160, 60)
                "high" -> VideoCaptureParameter(1920, 1080, 60)
                else -> VideoCaptureParameter(1280, 720, 30)
            }
        val cameraRate =
            when (quality) {
                "maximum" -> 20000000
                "high" -> 6000000
                else -> 2500000
            }
        val screenRate =
            when (quality) {
                "maximum" -> 30000000
                "high" -> 10000000
                else -> 5000000
            }
        current.videoTrackCaptureDefaults =
            current.videoTrackCaptureDefaults.copy(captureParams = capture)
        current.screenShareTrackCaptureDefaults =
            current.screenShareTrackCaptureDefaults.copy(captureParams = capture)
        current.videoTrackPublishDefaults =
            current.videoTrackPublishDefaults.copy(
                videoEncoding = VideoEncoding(cameraRate, capture.maxFps)
            )
        current.screenShareTrackPublishDefaults =
            current.screenShareTrackPublishDefaults.copy(
                videoEncoding = VideoEncoding(screenRate, capture.maxFps)
            )
    }

    fun playNudge() {
        nudge?.release()
        nudge =
            android.media.MediaPlayer.create(context, com.littleoffice.android.R.raw.nudge)?.apply {
                setVolume(0.5f, 0.5f)
                setOnCompletionListener {
                    it.release()
                    if (nudge === it) nudge = null
                }
                start()
            }
    }

    fun toggleMicrophone() = scope.launch {
        val current = room ?: return@launch
        val epoch = generation
        try {
            val enabled = !microphone
            if (screenAudio != null)
                (current.lkObjects.audioDeviceModule as? JavaAudioDeviceModule)
                    ?.setAudioRecordEnabled(enabled)
            else {
                (current.lkObjects.audioDeviceModule as? JavaAudioDeviceModule)
                    ?.setAudioRecordEnabled(true)
                check(current.localParticipant.setMicrophoneEnabled(enabled)) {
                    "Could not change microphone."
                }
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

    fun requestScreenShare(withAudio: Boolean = false) {
        if (!sharing) screenAudioRequested = withAudio && android.os.Build.VERSION.SDK_INT >= 29
        send(json("type" to "present", "enabled" to !sharing))
    }

    fun presenter(enabled: Boolean) {
        shareGate.update(enabled)
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
            shareGate.update(false)
            send(json("type" to "present", "enabled" to false))
            return
        }
        val current = room ?: return
        val epoch = generation
        val ticket = shareGate.ticket
        scope.launch {
            shareMutex.withLock {
                if (!shareGate.accepts(ticket) || epoch != generation) return@withLock
                try {
                    // A newer grant may supersede queued cleanup of the previous projection.
                    clearScreenAudio(current)
                    current.localParticipant.setScreenShareEnabled(false)
                    current.localParticipant.setMicrophoneEnabled(microphone)
                    (current.lkObjects.audioDeviceModule as? JavaAudioDeviceModule)
                        ?.setAudioRecordEnabled(true)
                    check(
                        current.localParticipant.setScreenShareEnabled(
                            true,
                            ScreenCaptureParams(
                                permission,
                                onStop = {
                                    scope.launch {
                                        if (epoch == generation && shareGate.accepts(ticket)) {
                                            shareGate.update(false)
                                            stopSharing()
                                        }
                                    }
                                },
                            ),
                        )
                    ) {
                        "Could not share screen."
                    }
                    if (!shareGate.accepts(ticket) || epoch != generation) {
                        current.localParticipant.setScreenShareEnabled(false)
                        return@withLock
                    }
                    if (screenAudioRequested && android.os.Build.VERSION.SDK_INT >= 29) {
                        try {
                            if (
                                androidx.core.content.ContextCompat.checkSelfPermission(
                                    context,
                                    android.Manifest.permission.RECORD_AUDIO,
                                ) != android.content.pm.PackageManager.PERMISSION_GRANTED
                            )
                                throw SecurityException("Audio permission was revoked.")
                            context.startForegroundService(
                                Intent(context, ShareAudioService::class.java)
                            )
                            val module =
                                current.lkObjects.audioDeviceModule as? JavaAudioDeviceModule
                                    ?: error("Audio capture is unavailable.")
                            module.setAudioRecordEnabled(microphone)
                            check(current.localParticipant.setMicrophoneEnabled(true))
                            val audio =
                                current.localParticipant
                                    .getTrackPublication(Track.Source.MICROPHONE)
                                    ?.track as? LocalAudioTrack ?: error("Audio track unavailable.")
                            screenAudio =
                                ScreenAudioCapturer.createFromScreenShareTrack(
                                    current.localParticipant
                                        .getTrackPublication(Track.Source.SCREEN_SHARE)
                                        ?.track
                                ) ?: error("Screen audio unavailable.")
                            audio.setAudioBufferCallback(screenAudio)
                            sharingAudio = true
                        } catch (e: Exception) {
                            clearScreenAudio(current)
                            current.localParticipant.setMicrophoneEnabled(microphone)
                            (current.lkObjects.audioDeviceModule as? JavaAudioDeviceModule)
                                ?.setAudioRecordEnabled(true)
                            error = "Screen is shared without app audio: ${e.message.orEmpty()}"
                        }
                    }
                    if (!shareGate.accepts(ticket) || epoch != generation) {
                        clearScreenAudio(current)
                        current.localParticipant.setScreenShareEnabled(false)
                        current.localParticipant.setMicrophoneEnabled(microphone)
                        (current.lkObjects.audioDeviceModule as? JavaAudioDeviceModule)
                            ?.setAudioRecordEnabled(true)
                        return@withLock
                    }
                    sharing = true
                    send(json("type" to "screen-share", "room" to roomId, "enabled" to true))
                    subscriptions()
                } catch (cancel: CancellationException) {
                    throw cancel
                } catch (e: Exception) {
                    clearScreenAudio(current)
                    runCatching {
                        current.localParticipant.setScreenShareEnabled(false)
                        current.localParticipant.setMicrophoneEnabled(microphone)
                        (current.lkObjects.audioDeviceModule as? JavaAudioDeviceModule)
                            ?.setAudioRecordEnabled(true)
                    }
                    if (epoch == generation && shareGate.accepts(ticket)) {
                        error = e.message.orEmpty()
                        send(json("type" to "present", "enabled" to false))
                    }
                }
            }
        }
    }

    private fun clearScreenAudio(current: Room?) {
        (current?.localParticipant?.getTrackPublication(Track.Source.MICROPHONE)?.track
                as? LocalAudioTrack)
            ?.setAudioBufferCallback(null)
        if (android.os.Build.VERSION.SDK_INT >= 29) screenAudio?.releaseAudioResources()
        screenAudio = null
        sharingAudio = false
        context.stopService(Intent(context, ShareAudioService::class.java))
    }

    private fun stopSharing() {
        val current = room ?: return
        val stopTicket = shareGate.ticket
        sharing = false
        send(json("type" to "screen-share", "room" to roomId, "enabled" to false))
        send(json("type" to "present", "enabled" to false))
        scope.launch {
            shareMutex.withLock {
                if (stopTicket != shareGate.ticket || room !== current) return@withLock
                try {
                    clearScreenAudio(current)
                    current.localParticipant.setScreenShareEnabled(false)
                    current.localParticipant.setMicrophoneEnabled(microphone)
                    (current.lkObjects.audioDeviceModule as? JavaAudioDeviceModule)
                        ?.setAudioRecordEnabled(true)
                } catch (_: Exception) {}
            }
        }
    }

    fun stop() {
        shareGate.update(false)
        clearScreenAudio(room)
        generation++
        connection?.cancel()
        connection = null
        events?.cancel()
        events = null
        audioDeviceListener?.let {
            room?.audioSwitchHandler?.unregisterAudioDeviceChangeListener(it)
        }
        audioDeviceListener = null
        room?.release()
        room = null
        nudge?.release()
        nudge = null
        audioDevices = emptyList()
        audioDevice = null
        speakers = emptySet()
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
