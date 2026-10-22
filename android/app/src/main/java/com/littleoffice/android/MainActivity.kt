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
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import io.livekit.android.renderer.TextureViewRenderer
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    internal val model: OfficeModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) consume(intent)
        setContent { LittleOfficeTheme { OfficeApp(model) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        consume(intent)
    }

    private fun consume(intent: Intent?) {
        intent?.data?.let { model.callback(it.toString()) }
    }

    override fun onStop() {
        super.onStop()
        if (
            !isChangingConfigurations &&
                model.office?.media?.sharing != true &&
                model.office?.media?.needsProjection != true
        )
            model.office?.stop()
    }
}

private val Moss = Color(0xff52674c)
private val Cream = Color(0xfff5f4eb)

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
            ),
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
                else ->
                    Column(
                        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(28.dp),
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(
                            "little office",
                            style = MaterialTheme.typography.displaySmall,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            "A place to work together.",
                            Modifier.padding(top = 8.dp, bottom = 28.dp),
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            "Your team, one shared office. Walk over, say hello, and make something together."
                        )
                        Spacer(Modifier.height(28.dp))
                        OutlinedTextField(
                            model.server,
                            { model.server = it },
                            label = { Text("Server address") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Button(
                            onClick = {
                                model.signIn()?.let {
                                    try {
                                        CustomTabsIntent.Builder().build().launchUrl(context, it)
                                    } catch (e: Exception) {
                                        model.error = "No browser available for secure sign-in."
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                            enabled = !model.busy,
                        ) {
                            Text("Sign in with your browser")
                        }
                        Text(
                            "Continue with Google, your workspace SSO, or your existing account.",
                            Modifier.padding(top = 12.dp),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
            }
        }
    }
}

@Composable
fun Message(text: String, dismiss: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(text, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = dismiss) { Text("Dismiss") }
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
            Column(Modifier.weight(1f)) {
                Text(
                    "little office",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                )
                Text(model.account?.string("name").orEmpty())
            }
            TextButton(onClick = { model.logout() }) { Text("Sign out") }
        }
        Text("Your workspaces", style = MaterialTheme.typography.titleLarge)
        if (model.workspaces.isEmpty())
            Text("Create an office or accept an invitation to get started.")
        model.workspaces.forEach { workspace ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(18.dp)) {
                    Text(workspace.name, style = MaterialTheme.typography.titleLarge)
                    Text(
                        workspace.role.replaceFirstChar(Char::uppercase),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Row(Modifier.padding(top = 12.dp)) {
                        Button(onClick = { model.select(workspace) }) { Text("Enter office") }
                        TextButton(onClick = { settings = workspace }) {
                            Text("Members & settings")
                        }
                    }
                }
            }
        }
        Row {
            if (model.account?.string("workspaceId").isNullOrBlank())
                Button(onClick = { create = true }) { Text("New workspace") }
            TextButton(onClick = { model.action { model.load() } }) { Text("Refresh") }
        }
        if (model.account?.string("workspaceId").isNullOrBlank())
            TextButton(onClick = { join = true }) { Text("Accept an invitation") }
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
        title = { Text("New workspace") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("Name") })
                OutlinedTextField(
                    slug,
                    { slug = it.lowercase() },
                    label = { Text("Address (team-name)") },
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
                Text("Create")
            }
        },
        dismissButton = { TextButton(onClick = close) { Text("Cancel") } },
    )
}

@Composable
fun MapPicker(maps: List<JSONObject>, selected: String, select: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { open = true }) {
            Text(maps.find { it.string("id") == selected }?.string("name") ?: "Choose a map")
        }
        DropdownMenu(open, { open = false }) {
            maps.forEach { map ->
                DropdownMenuItem(
                    text = { Text(map.string("name")) },
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
        title = { Text(title) },
        text = { OutlinedTextField(value, { value = it }, label = { Text(label) }) },
        confirmButton = {
            TextButton(onClick = { submit(value) }, enabled = value.isNotBlank()) { Text(action) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
fun OfficeScreen(model: OfficeModel, office: OfficeSession) {
    BackHandler { model.leave() }
    val context = LocalContext.current
    var people by remember { mutableStateOf(false) }
    var emotes by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf(false) }
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
                TextButton(onClick = { model.leave() }) { Text("‹ Offices") }
                Column(Modifier.weight(1f)) {
                    Text(office.workspace.name, fontWeight = FontWeight.Bold)
                    Text(
                        if (office.connected)
                            "${office.snapshot?.people?.size ?: 0} online · ${office.snapshot?.me?.zone.orEmpty()}"
                        else "Disconnected",
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
                TextButton(onClick = { people = true }) { Text("People") }
            }
        }
        if (office.error.isNotBlank()) Message(office.error) { office.error = "" }
        if (office.notice.isNotBlank()) Message(office.notice) { office.notice = "" }
        if (office.media.error.isNotBlank())
            Text(
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
                        Text(if (office.needsTakeover) "Open here instead?" else "Join your office")
                        Button(onClick = { office.connect(office.needsTakeover) }) {
                            Text(if (office.needsTakeover) "Take over" else "Connect")
                        }
                    }
                }
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
                            Text(zone.replaceFirstChar(Char::uppercase))
                        }
                    }
                }
        }
        if (office.media.videos.isNotEmpty())
            LazyRow(Modifier.height(120.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(office.media.videos, key = { it.id }) { video ->
                    val room = office.media.room
                    if (room != null)
                        key(room, video.track) {
                            AndroidView(
                                factory = {
                                    TextureViewRenderer(it).apply {
                                        room.initVideoRenderer(this)
                                        video.track.addRenderer(this)
                                    }
                                },
                                modifier = Modifier.width(160.dp).fillMaxHeight(),
                                onRelease = {
                                    video.track.removeRenderer(it)
                                    it.release()
                                },
                            )
                        }
                }
            }
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilledTonalButton(
                enabled = office.media.connected,
                onClick = { mic.launch(Manifest.permission.RECORD_AUDIO) },
            ) {
                Text(if (office.media.microphone) "Mute" else "Mic")
            }
            FilledTonalButton(
                enabled = office.media.connected,
                onClick = { camera.launch(Manifest.permission.CAMERA) },
            ) {
                Text(if (office.media.camera) "Camera off" else "Camera")
            }
            FilledTonalButton(
                enabled = office.media.connected,
                onClick = { office.media.requestScreenShare() },
            ) {
                Text(if (office.media.sharing) "Stop sharing" else "Share screen")
            }
            FilledTonalButton(enabled = office.connected, onClick = { office.perform("jump") }) {
                Text("Jump")
            }
            FilledTonalButton(enabled = office.connected, onClick = { office.perform("sit") }) {
                Text("Sit")
            }
            FilledTonalButton(enabled = office.connected, onClick = { office.perform("sleep") }) {
                Text("Sleep")
            }
            FilledTonalButton(enabled = office.connected, onClick = { office.perform("fish") }) {
                Text("Fish")
            }
            FilledTonalButton(enabled = office.connected, onClick = { emotes = true }) {
                Text("React")
            }
            FilledTonalButton(enabled = office.connected, onClick = { status = true }) {
                Text("Status")
            }
            FilledTonalButton(
                enabled = office.connected && office.boardEnabled,
                onClick = {
                    office.move(0, 0)
                    office.board = true
                },
            ) {
                Text("Whiteboard")
            }
        }
    }
    if (people)
        AlertDialog(
            onDismissRequest = { people = false },
            title = { Text("People") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    office.snapshot?.people?.forEach { person ->
                        TextButton(
                            onClick = {
                                selected = person
                                people = false
                            }
                        ) {
                            Text("${person.name} · ${person.status} ${person.statusText}")
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { people = false }) { Text("Done") } },
        )
    selected?.let { person ->
        AlertDialog(
            onDismissRequest = { selected = null },
            title = { Text(person.name) },
            text = {
                Column {
                    Text(person.statusText.ifBlank { person.status })
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
                                    Text(title)
                                }
                            }
                }
            },
            confirmButton = { TextButton(onClick = { selected = null }) { Text("Done") } },
        )
    }
    if (emotes)
        AlertDialog(
            onDismissRequest = { emotes = false },
            title = { Text("Say it with a reaction") },
            text = {
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    listOf("👋", "❤️", "🎉", "😂", "👍", "☕").forEach { emoji ->
                        TextButton(
                            onClick = {
                                office.send(json("type" to "emote", "emoji" to emoji))
                                emotes = false
                            }
                        ) {
                            Text(emoji)
                        }
                    }
                }
            },
            confirmButton = {},
        )
    if (status) StatusDialog(office) { status = false }
    if (office.board)
        Dialog(
            onDismissRequest = { office.board = false },
            properties =
                androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Surface(Modifier.fillMaxSize()) {
                Column(Modifier.safeDrawingPadding()) {
                    TextButton(onClick = { office.board = false }) { Text("Close whiteboard") }
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
            title = { Text("${invitation.string("fromName")} invited you") },
            text = {
                Text(
                    if (invitation.string("kind") == "call") "Join a private conversation?"
                    else "Walk over to their location?"
                )
            },
            confirmButton = { TextButton(onClick = { respond(true) }) { Text("Accept") } },
            dismissButton = { TextButton(onClick = { respond(false) }) { Text("Decline") } },
        )
    }
}

@Composable
private fun StatusDialog(office: OfficeSession, close: () -> Unit) {
    var status by remember { mutableStateOf(office.snapshot?.me?.status ?: "available") }
    var text by remember { mutableStateOf(office.snapshot?.me?.statusText.orEmpty()) }
    AlertDialog(
        onDismissRequest = close,
        title = { Text("Your status") },
        text = {
            Column {
                listOf("available", "busy", "dnd", "away").forEach { value ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(status == value, { status = value })
                        Text(value.replaceFirstChar(Char::uppercase))
                    }
                }
                OutlinedTextField(
                    text,
                    { text = it.take(80) },
                    label = { Text("What are you working on?") },
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    office.send(json("type" to "status", "status" to status, "text" to text))
                    close()
                }
            ) {
                Text("Save")
            }
        },
        dismissButton = { TextButton(onClick = close) { Text("Cancel") } },
    )
}
