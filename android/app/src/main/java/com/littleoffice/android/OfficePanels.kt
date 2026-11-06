package com.littleoffice.android

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

@Composable
fun OfficeSettings(model: OfficeModel, office: OfficeSession, close: () -> Unit) {
    var tab by remember { mutableStateOf("Profile") }
    var workspace by remember { mutableStateOf(false) }
    Dialog(
        onDismissRequest = close,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.safeDrawingPadding().padding(16.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    OfficeText(
                        "Office settings",
                        Modifier.weight(1f),
                        style = MaterialTheme.typography.titleLarge,
                    )
                    TextButton(onClick = close) { OfficeText("Done") }
                }
                Row(
                    Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf("Profile", "Display", "Devices", "Help").forEach { value ->
                        FilterChip(tab == value, { tab = value }, label = { OfficeText(value) })
                    }
                    FilterChip(false, { workspace = true }, label = { OfficeText("Workspace") })
                    if (office.operator && model.account?.string("workspaceId").isNullOrBlank())
                        FilterChip(
                            tab == "Administration",
                            { tab = "Administration" },
                            label = { OfficeText("Administration") },
                        )
                }
                if (model.error.isNotBlank()) Message(model.error) { model.error = "" }
                if (model.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    when (tab) {
                        "Profile" -> ProfileSettings(model, office)
                        "Administration" -> OperatorSettings(model, office)
                        "Display" -> {
                            OfficeText("Name tag size")
                            Slider(
                                office.preferences.nameSize,
                                {
                                    office.preferences.nameSize = it
                                    office.preferences.save()
                                },
                                valueRange = 8f..16f,
                                steps = 7,
                            )
                            OfficeText("Name tag opacity")
                            Slider(
                                office.preferences.nameOpacity,
                                {
                                    office.preferences.nameOpacity = it
                                    office.preferences.save()
                                },
                                valueRange = 0f..100f,
                            )
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                OfficeText("Map effects", Modifier.weight(1f))
                                Switch(
                                    office.preferences.effects,
                                    {
                                        office.preferences.effects = it
                                        office.preferences.save()
                                    },
                                )
                            }
                            OfficeText("System reduced motion is respected for avatar animations.")
                            LanguagePicker()
                        }
                        "Devices" -> {
                            OfficeText(
                                "Microphone & speaker",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            OfficeText(
                                "Android routes your microphone with the selected communication device."
                            )
                            office.media.audioDevices.forEach { device ->
                                FilterChip(
                                    office.media.audioDevice == device,
                                    { office.media.selectAudioDevice(device) },
                                    label = { OfficeText(device.name) },
                                )
                            }
                            if (office.media.audioDevices.isEmpty())
                                OfficeText("Join a conversation to choose an audio device.")
                            OutlinedButton(
                                onClick = { office.media.switchCamera() },
                                enabled = office.media.camera,
                            ) {
                                OfficeText("Switch camera")
                            }
                            OfficeText(
                                "Video & screen quality",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            listOf(
                                    "maximum" to "Maximum · up to 4K / 60 fps",
                                    "high" to "High · up to 1080p / 60 fps",
                                    "balanced" to "Balanced · up to 720p / 30 fps",
                                )
                                .forEach { (value, label) ->
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        RadioButton(
                                            office.media.quality == value,
                                            { office.media.chooseQuality(value) },
                                        )
                                        OfficeText(label)
                                    }
                                }
                            OfficeText(
                                "Capture may be lower depending on your device and network. Screen quality changes apply to the next share."
                            )
                            if (office.media.error.isNotEmpty())
                                OfficeText(
                                    office.media.error,
                                    color = MaterialTheme.colorScheme.error,
                                )
                        }
                        else -> {
                            OfficeText(
                                "Walk: drag on the map or use arrow keys / WASD. Release to stop."
                            )
                            OfficeText(
                                "Space: jump. E: interact with a nearby activity. Tap a person to wave, nudge, invite or call."
                            )
                            OfficeText(
                                "Nearby people hear you in the commons. Rooms and private calls have separate conversations."
                            )
                            OfficeText(
                                "Screen sharing and whiteboards are scoped to your current conversation. Leave a private call using Leave call."
                            )
                            OfficeText(
                                "Camera and microphone start off. Backgrounding pauses your office unless you are sharing your screen."
                            )
                        }
                    }
                }
            }
        }
    }
    if (workspace) WorkspaceSettings(model, office.workspace) { workspace = false }
}

@Composable
private fun ProfileSettings(model: OfficeModel, office: OfficeSession) {
    val me = office.snapshot?.me
    var name by remember { mutableStateOf(me?.name ?: model.account?.string("name").orEmpty()) }
    var appearance by remember {
        mutableStateOf(me?.avatar ?: model.account?.string("avatar", "sage") ?: "sage")
    }
    val scoped = !model.account?.string("workspaceId").isNullOrBlank()
    if (scoped)
        OfficeText(
            "Sign in with your personal account at https://app.littleoffice.app to change your name or appearance. Workspace SSO can still change status."
        )
    OutlinedTextField(
        name,
        { name = it.take(40) },
        label = { OfficeText("Name") },
        enabled = !scoped,
        modifier = Modifier.fillMaxWidth(),
    )
    AvatarEditor(office, appearance, !scoped) { appearance = it }
    Button(
        enabled = !scoped && !model.busy && name.trim().length in 1..40,
        onClick = {
            model.action {
                office.api.call(
                    office.api.path(office.workspace.id, "/profile"),
                    "PATCH",
                    json("name" to name.trim(), "avatar" to appearance),
                )
                model.load()
                office.notice = "Profile saved."
            }
        },
    ) {
        OfficeText("Save profile")
    }
}
