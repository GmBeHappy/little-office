package com.littleoffice.android

import android.Manifest
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    internal val model: OfficeModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) consume(intent)
        setContent { ProvideOfficeLanguage { LittleOfficeTheme { OfficeApp(model) } } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        consume(intent)
    }

    private fun consume(intent: Intent?) {
        intent?.data?.let { model.callback(it.toString()) }
    }

    override fun onStart() {
        super.onStart()
        model.office?.resume()
    }

    override fun onStop() {
        super.onStop()
        if (
            !isChangingConfigurations &&
                model.office?.media?.sharing != true &&
                model.office?.media?.needsProjection != true &&
                model.office?.externalDocument != true
        )
            model.office?.suspendForBackground()
    }
}

private val Moss = Color(0xff607752)
private val Cream = Color(0xfff7f7ef)

@Composable
fun LittleOfficeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme =
            lightColorScheme(
                primary = Moss,
                secondary = Color(0xff737a61),
                primaryContainer = Color(0xffdce6ce),
                onPrimaryContainer = Color(0xff24331f),
                secondaryContainer = Color(0xffe1e8d7),
                onSecondaryContainer = Color(0xff34422a),
                background = Cream,
                surface = Cream,
                surfaceVariant = Color(0xffe9ecdf),
                onBackground = Color(0xff304337),
                onSurface = Color(0xff304337),
            ),
        typography = officeTypography(),
        content = content,
    )
}

@Composable
fun OfficeApp(model: OfficeModel) {
    val context = LocalContext.current
    Surface(Modifier.fillMaxSize()) {
        Column(Modifier.safeDrawingPadding().fillMaxSize()) {
            if (model.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            if (model.error.isNotBlank()) Message(model.error) { model.error = "" }
            val office = model.office
            when {
                office != null -> OfficeScreen(model, office)
                model.account != null -> WorkspaceScreen(model)
                else -> ConnectionScreen(model)
            }
        }
    }
}

@Composable
fun Message(text: String, dismiss: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            OfficeText(text, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = dismiss) { OfficeText("Dismiss") }
        }
    }
}

@Composable
fun WorkspaceScreen(model: OfficeModel) {
    var create by remember { mutableStateOf(false) }
    var join by remember { mutableStateOf(false) }
    var settings by remember { mutableStateOf<Workspace?>(null) }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            OfficeBrand(Modifier.weight(1f))
            TextButton(onClick = { model.logout() }) { OfficeText("Sign out") }
        }
        Spacer(Modifier.height(12.dp))
        OfficeText(
            "YOUR PEOPLE. YOUR PLACE.",
            color = MaterialTheme.colorScheme.primary,
            style = MaterialTheme.typography.labelMedium,
        )
        OfficeText(
            "Your workspaces",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
        )
        OfficeText(
            "Welcome back, ${model.account?.string("name").orEmpty()}.",
            style = MaterialTheme.typography.bodyLarge,
        )
        if (model.workspaces.isEmpty()) {
            OfficeScene(Modifier.fillMaxWidth().height(180.dp))
            OfficeText("Create an office or accept an invitation to get started.")
        }
        model.workspaces.forEach { workspace ->
            WorkspaceCard(workspace, { model.select(workspace) }, { settings = workspace })
        }
        Row {
            if (model.account?.string("workspaceId").isNullOrBlank())
                Button(onClick = { create = true }) { OfficeText("New workspace") }
            TextButton(onClick = { model.action { model.load() } }) { OfficeText("Refresh") }
        }
        if (model.account?.string("workspaceId").isNullOrBlank())
            TextButton(onClick = { join = true }) { OfficeText("Accept an invitation") }
    }
    if (create) WorkspaceCreate(model) { create = false }
    if (join)
        TextEntryDialog(
            "Accept invitation",
            "Paste your invitation link or token",
            "Join workspace",
            onDismiss = { join = false },
        ) { input ->
            model.action {
                val token = input.substringAfter("invite=", input).trim()
                require(token.matches(Regex("[a-f0-9]{64}"))) {
                    "Paste the complete invitation link or token."
                }
                model.api!!.call("/api/invitations/accept", "POST", json("token" to token))
                join = false
                model.load()
            }
        }
    settings?.let { WorkspaceSettings(model, it) { settings = null } }
}

@Composable
fun WorkspaceCreate(model: OfficeModel, close: () -> Unit) {
    var name by remember { mutableStateOf("") }
    var slug by remember { mutableStateOf("") }
    var map by remember { mutableStateOf(model.maps.firstOrNull()?.string("id").orEmpty()) }
    AlertDialog(
        onDismissRequest = close,
        title = { OfficeText("New workspace") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(name, { name = it }, label = { OfficeText("Name") })
                OutlinedTextField(
                    slug,
                    { slug = it.lowercase() },
                    label = { OfficeText("Address (team-name)") },
                )
                MapPicker(model.maps, map) { map = it }
            }
        },
        confirmButton = {
            TextButton(
                enabled =
                    !model.busy &&
                        name.trim().length in 2..60 &&
                        slug.matches(Regex("[a-z0-9]+(?:-[a-z0-9]+)*")) &&
                        slug.length in 3..48 &&
                        map.isNotBlank(),
                onClick = {
                    model.action {
                        model.api!!.call(
                            "/api/workspaces",
                            "POST",
                            json("name" to name.trim(), "slug" to slug, "mapId" to map),
                        )
                        model.load()
                        close()
                    }
                },
            ) {
                OfficeText("Create")
            }
        },
        dismissButton = { TextButton(onClick = close) { OfficeText("Cancel") } },
    )
}

@Composable
fun MapPicker(maps: List<JSONObject>, selected: String, select: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { open = true }) {
            OfficeText(maps.find { it.string("id") == selected }?.string("name") ?: "Choose a map")
        }
        DropdownMenu(open, { open = false }) {
            maps.forEach { map ->
                DropdownMenuItem(
                    text = { OfficeText(map.string("name")) },
                    onClick = {
                        select(map.string("id"))
                        open = false
                    },
                )
            }
        }
    }
}

@Composable
fun TextEntryDialog(
    title: String,
    label: String,
    action: String,
    onDismiss: () -> Unit,
    submit: (String) -> Unit,
) {
    var value by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { OfficeText(title) },
        text = { OutlinedTextField(value, { value = it }, label = { OfficeText(label) }) },
        confirmButton = {
            TextButton(onClick = { submit(value) }, enabled = value.isNotBlank()) {
                OfficeText(action)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { OfficeText("Cancel") } },
    )
}

@Composable
fun OfficeScreen(model: OfficeModel, office: OfficeSession) {
    BackHandler { model.leave() }
    val context = LocalContext.current
    var people by remember { mutableStateOf(false) }
    var settings by remember { mutableStateOf(false) }
    var rooms by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }
    var emotes by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf(false) }
    var shareOptions by remember { mutableStateOf(false) }
    var includeAudio by remember { mutableStateOf(false) }
    val screenAudioPermission =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) office.media.requestScreenShare(true)
            else
                office.notice =
                    "Audio permission is needed to share app audio. You can still share your screen without audio."
        }
    var selected by remember { mutableStateOf<Person?>(null) }
    val mic =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) office.media.toggleMicrophone()
            else office.notice = "Microphone permission is needed to speak."
        }
    val camera =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) office.media.toggleCamera()
            else office.notice = "Camera permission is needed to share video."
        }
    val projection =
        rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result
            ->
            office.media.startSharing(
                if (result.resultCode == android.app.Activity.RESULT_OK) result.data else null
            )
        }
    LaunchedEffect(office.media.needsProjection) {
        if (office.media.needsProjection)
            projection.launch(
                (context.getSystemService(android.content.Context.MEDIA_PROJECTION_SERVICE)
                        as android.media.projection.MediaProjectionManager)
                    .createScreenCaptureIntent()
            )
    }
    Column(Modifier.fillMaxSize()) {
        Surface(shadowElevation = 2.dp, color = Cream.copy(alpha = 0.96f)) {
            Row(
                Modifier.fillMaxWidth().padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = { model.leave() }) { OfficeText("‹ Offices") }
                Column(Modifier.weight(1f)) {
                    OfficeText(office.workspace.name, fontWeight = FontWeight.Bold)
                    OfficeText(
                        if (office.connected)
                            "${office.snapshot?.people?.size ?: 0} online · ${office.snapshot?.me?.zone.orEmpty()}"
                        else "Disconnected",
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
                var menu by remember { mutableStateOf(false) }
                Box {
                    TextButton(onClick = { menu = true }) { OfficeText("Menu") }
                    DropdownMenu(menu, { menu = false }) {
                        DropdownMenuItem(
                            text = { OfficeText("People") },
                            onClick = {
                                menu = false
                                people = true
                            },
                        )
                        DropdownMenuItem(
                            text = { OfficeText("Rooms") },
                            onClick = {
                                menu = false
                                rooms = true
                            },
                        )
                        DropdownMenuItem(
                            text = { OfficeText("Settings") },
                            onClick = {
                                menu = false
                                settings = true
                            },
                        )
                    }
                }
            }
        }
        if (office.error.isNotBlank()) Message(office.error) { office.error = "" }
        if (office.notice.isNotBlank()) Message(office.notice) { office.notice = "" }
        if (office.media.error.isNotBlank())
            OfficeText(
                office.media.error,
                Modifier.padding(8.dp),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        Box(Modifier.weight(1f).fillMaxWidth()) {
            OfficeMap(office, Modifier.fillMaxSize()) { selected = it }
            if (!office.connected)
                Surface(
                    Modifier.align(Alignment.Center),
                    shape = RoundedCornerShape(20.dp),
                    tonalElevation = 6.dp,
                ) {
                    Column(
                        Modifier.padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        OfficeText(
                            if (office.needsTakeover) "Open here instead?" else "Join your office"
                        )
                        Button(onClick = { office.connect(office.needsTakeover) }) {
                            OfficeText(if (office.needsTakeover) "Take over" else "Connect")
                        }
                    }
                }
            if (office.connected && office.interactionPrompt.isNotEmpty())
                FilledTonalButton(
                    onClick = { office.interact() },
                    modifier = Modifier.align(Alignment.TopCenter).padding(8.dp),
                ) {
                    OfficeText(office.interactionPrompt)
                }
            if (office.farmScore.isNotEmpty())
                OfficeText(office.farmScore, Modifier.align(Alignment.TopStart).padding(8.dp))
            if (office.connected)
                Row(
                    Modifier.align(Alignment.BottomStart).padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf("floor", "studio", "library").forEach { zone ->
                        FilledTonalButton(
                            onClick = { office.send(json("type" to "zone", "zone" to zone)) },
                            contentPadding = PaddingValues(horizontal = 12.dp),
                        ) {
                            OfficeText(zone.replaceFirstChar(Char::uppercase))
                        }
                    }
                }
        }
        MediaPanel(office)
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilledTonalButton(
                enabled = office.media.connected,
                onClick = { mic.launch(Manifest.permission.RECORD_AUDIO) },
            ) {
                OfficeText(if (office.media.microphone) "Mute" else "Mic")
            }
            FilledTonalButton(
                enabled = office.media.connected,
                onClick = { camera.launch(Manifest.permission.CAMERA) },
            ) {
                OfficeText(if (office.media.camera) "Camera off" else "Camera")
            }
            FilledTonalButton(
                enabled = office.media.connected,
                onClick = {
                    if (office.media.sharing) office.media.requestScreenShare()
                    else {
                        includeAudio = false
                        shareOptions = true
                    }
                },
            ) {
                OfficeText(if (office.media.sharing) "Stop sharing" else "Share screen")
            }
            if (office.snapshot?.me?.conversation?.startsWith("call:") == true)
                FilledTonalButton(onClick = { office.send(json("type" to "leave")) }) {
                    OfficeText("Leave call")
                }
            FilledTonalButton(enabled = office.connected, onClick = { office.perform("nudge") }) {
                OfficeText("Nudge nearby")
            }
            FilledTonalButton(enabled = office.connected, onClick = { office.perform("jump") }) {
                OfficeText("Jump")
            }
            FilledTonalButton(enabled = office.connected, onClick = { office.perform("sit") }) {
                OfficeText("Sit")
            }
            FilledTonalButton(enabled = office.connected, onClick = { office.perform("sleep") }) {
                OfficeText("Sleep")
            }
            FilledTonalButton(enabled = office.connected, onClick = { office.perform("fish") }) {
                OfficeText("Fish")
            }
            FilledTonalButton(enabled = office.connected, onClick = { emotes = true }) {
                OfficeText("React")
            }
            FilledTonalButton(enabled = office.connected, onClick = { status = true }) {
                OfficeText("Status")
            }
            FilledTonalButton(
                enabled = office.connected && office.boardEnabled,
                onClick = {
                    office.move(0, 0)
                    office.board = true
                },
            ) {
                OfficeText("Whiteboard")
            }
        }
    }
    if (people)
        AlertDialog(
            onDismissRequest = { people = false },
            title = { OfficeText("People") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    OutlinedTextField(
                        search,
                        { search = it },
                        label = { OfficeText("Search people") },
                    )
                    office.snapshot
                        ?.people
                        ?.filter { it.name.contains(search, ignoreCase = true) }
                        ?.forEach { person ->
                            TextButton(
                                onClick = {
                                    selected = person
                                    people = false
                                }
                            ) {
                                OfficeText(
                                    "${person.name} · ${person.activityIcon} ${person.activityText.ifBlank { person.activityStatus }}"
                                )
                            }
                        }
                }
            },
            confirmButton = { TextButton(onClick = { people = false }) { OfficeText("Done") } },
        )
    selected?.let { person ->
        AlertDialog(
            onDismissRequest = { selected = null },
            title = { OfficeText(person.name) },
            text = {
                Column {
                    OfficeText(
                        "${person.activityIcon} ${person.activityText.ifBlank { person.activityStatus }}"
                    )
                    if (person.id != office.snapshot?.self)
                        listOf(
                                "wave" to "Wave",
                                "nudge" to "Nudge",
                                "summon" to "Invite here",
                                "call" to "Private call",
                            )
                            .forEach { (action, title) ->
                                TextButton(
                                    onClick = {
                                        office.send(
                                            if (action == "summon" || action == "call")
                                                json(
                                                    "type" to "invite",
                                                    "target" to person.id,
                                                    "kind" to action,
                                                )
                                            else json("type" to action, "target" to person.id)
                                        )
                                        selected = null
                                    }
                                ) {
                                    OfficeText(title)
                                }
                            }
                }
            },
            confirmButton = { TextButton(onClick = { selected = null }) { OfficeText("Done") } },
        )
    }
    if (emotes)
        AlertDialog(
            onDismissRequest = { emotes = false },
            title = { OfficeText("Say it with a reaction") },
            text = {
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    listOf("👋", "❤️", "🎉", "😂", "👍", "☕").forEach { emoji ->
                        TextButton(
                            onClick = {
                                office.send(json("type" to "emote", "emoji" to emoji))
                                emotes = false
                            }
                        ) {
                            OfficeText(emoji)
                        }
                    }
                }
            },
            confirmButton = {},
        )
    if (shareOptions)
        AlertDialog(
            onDismissRequest = { shareOptions = false },
            title = { OfficeText("Share screen") },
            text = {
                Column {
                    OfficeText("Choose what to share in Android's next prompt.")
                    if (android.os.Build.VERSION.SDK_INT >= 29)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(includeAudio, { includeAudio = it })
                            OfficeText("Include app audio")
                        }
                    OfficeText(
                        "Only apps that allow playback capture can share audio. Your microphone keeps its current mute setting."
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        shareOptions = false
                        if (includeAudio)
                            screenAudioPermission.launch(Manifest.permission.RECORD_AUDIO)
                        else office.media.requestScreenShare()
                    }
                ) {
                    OfficeText("Continue")
                }
            },
            dismissButton = {
                TextButton(onClick = { shareOptions = false }) { OfficeText("Cancel") }
            },
        )
    if (settings) OfficeSettings(model, office) { settings = false }
    if (rooms) RoomsDialog(office) { rooms = false }
    if (status) StatusDialog(office) { status = false }
    if (office.board)
        Dialog(
            onDismissRequest = { office.closeBoard?.invoke() },
            properties =
                androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Surface(Modifier.fillMaxSize()) {
                Column(Modifier.safeDrawingPadding()) {
                    TextButton(onClick = { office.closeBoard?.invoke() }) {
                        OfficeText("Close whiteboard")
                    }
                    Whiteboard(office, Modifier.weight(1f))
                }
            }
        }
    office.invitations.firstOrNull()?.let { invitation ->
        fun respond(accept: Boolean) {
            office.send(
                json("type" to "respond", "id" to invitation.getString("id"), "accept" to accept)
            )
            office.invitations = office.invitations.drop(1)
        }
        AlertDialog(
            onDismissRequest = { respond(false) },
            title = { OfficeText("${invitation.string("fromName")} invited you") },
            text = {
                OfficeText(
                    if (invitation.string("kind") == "call") "Join a private conversation?"
                    else "Walk over to their location?"
                )
            },
            confirmButton = { TextButton(onClick = { respond(true) }) { OfficeText("Accept") } },
            dismissButton = { TextButton(onClick = { respond(false) }) { OfficeText("Decline") } },
        )
    }
}

@Composable
private fun StatusDialog(office: OfficeSession, close: () -> Unit) {
    var status by remember { mutableStateOf(office.snapshot?.me?.status ?: "available") }
    var text by remember { mutableStateOf(office.snapshot?.me?.statusText.orEmpty()) }
    var icon by remember { mutableStateOf(office.snapshot?.me?.statusIcon.orEmpty()) }
    AlertDialog(
        onDismissRequest = close,
        title = { OfficeText("Your status") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                listOf("available", "busy", "dnd", "away").forEach { value ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(status == value, { status = value })
                        OfficeText(value.replaceFirstChar(Char::uppercase))
                    }
                }
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    statusPresets.forEach { preset ->
                        TextButton(
                            onClick = {
                                status = preset.first
                                icon = preset.second
                                text = preset.third
                            }
                        ) {
                            OfficeText("${preset.second} ${preset.third}")
                        }
                    }
                }
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    statusIcons.forEach { value ->
                        FilterChip(
                            icon == value,
                            { icon = value },
                            label = { OfficeText(value.ifBlank { "Automatic" }) },
                        )
                    }
                }
                OutlinedTextField(
                    text,
                    { text = it.take(80) },
                    label = { OfficeText("What are you working on?") },
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    office.send(
                        json("type" to "status", "status" to status, "text" to text, "icon" to icon)
                    )
                    close()
                }
            ) {
                OfficeText("Save")
            }
        },
        dismissButton = { TextButton(onClick = close) { OfficeText("Cancel") } },
    )
}

@Composable
private fun RoomsDialog(office: OfficeSession, close: () -> Unit) {
    AlertDialog(
        onDismissRequest = close,
        title = { OfficeText("Rooms") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                office.scene?.zones.orEmpty().forEach { zone ->
                    val id = zone.string("id")
                    val locked = office.snapshot?.locks?.optBoolean(id) == true
                    OfficeText(
                        zone.string("name", id),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    OfficeText(
                        "${office.snapshot?.people?.count { it.zone == id } ?: 0} people · ${if (locked) "Locked" else "Open"}"
                    )
                    Row {
                        TextButton(
                            onClick = {
                                office.send(json("type" to "zone", "zone" to id))
                                close()
                            }
                        ) {
                            OfficeText("Enter room")
                        }
                        if (id != "floor")
                            TextButton(
                                onClick = {
                                    office.send(
                                        json("type" to "lock", "zone" to id, "locked" to !locked)
                                    )
                                }
                            ) {
                                OfficeText(if (locked) "Unlock" else "Lock")
                            }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = close) { OfficeText("Done") } },
    )
}
