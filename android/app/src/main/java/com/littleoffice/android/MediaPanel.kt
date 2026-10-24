package com.littleoffice.android

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import io.livekit.android.renderer.TextureViewRenderer

@Composable
private fun VideoTile(office: OfficeSession, video: OfficeMedia.Video, modifier: Modifier) {
    val room = office.media.room ?: return
    key(room, video.track) {
        AndroidView(
            factory = { context ->
                TextureViewRenderer(context).apply {
                    room.initVideoRenderer(this)
                    video.track.addRenderer(this)
                }
            },
            modifier = modifier,
            onRelease = {
                video.track.removeRenderer(it)
                it.release()
            },
        )
    }
}

@Composable
fun MediaPanel(office: OfficeSession) {
    var mode by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf("") }
    var pinned by remember { mutableStateOf("") }
    var viewers by remember { mutableStateOf(false) }
    val videos = office.media.videos
    val screens = videos.filter { it.screen }
    val cameras = videos.filter { !it.screen }
    val screen =
        screens.find { it.id == pinned }
            ?: screens.find { it.id == selected }
            ?: screens.firstOrNull()
    val publisher = screen?.takeIf { mode == "screen" && !it.local }?.publisher
    LaunchedEffect(publisher, office.snapshot?.me?.room, office.connected) {
        office.media.reportView(publisher)
    }
    DisposableEffect(office) { onDispose { office.media.reportView(null) } }
    LaunchedEffect(screens.map { it.id }, cameras.map { it.id }) {
        if (screens.none { it.id == pinned }) pinned = ""
        if (screens.none { it.id == selected }) selected = ""
        if (mode == "screen" && screens.isEmpty()) mode = if (cameras.isNotEmpty()) "grid" else ""
        if (mode == "grid" && cameras.isEmpty()) mode = if (screens.isNotEmpty()) "screen" else ""
    }
    if (videos.isNotEmpty())
        LazyRow(Modifier.height(130.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            items(videos, key = { it.id }) { video ->
                Column(
                    Modifier.width(170.dp).clickable {
                        selected = video.id
                        mode = if (video.screen) "screen" else "grid"
                    }
                ) {
                    VideoTile(office, video, Modifier.fillMaxWidth().weight(1f))
                    OfficeText(
                        "${video.name}${if (video.screen) " · Screen" else ""}",
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }
        }
    if (mode.isNotEmpty())
        Dialog(
            onDismissRequest = { mode = "" },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Surface(Modifier.fillMaxSize()) {
                Column(Modifier.safeDrawingPadding().padding(8.dp)) {
                    Row(
                        Modifier.horizontalScroll(rememberScrollState()),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        TextButton(onClick = { mode = "" }) { OfficeText("Close") }
                        if (cameras.isNotEmpty())
                            TextButton(onClick = { mode = "grid" }) { OfficeText("Camera grid") }
                        if (screens.isNotEmpty())
                            TextButton(onClick = { mode = "screen" }) {
                                OfficeText("Shared screen")
                            }
                        if (mode == "screen" && screen != null) {
                            TextButton(
                                onClick = { pinned = if (pinned == screen.id) "" else screen.id }
                            ) {
                                OfficeText(
                                    if (pinned == screen.id) "Unpin screen" else "Pin screen"
                                )
                            }
                            TextButton(onClick = { viewers = true }) {
                                OfficeText(
                                    "${office.snapshot?.people?.count { it.watching == screen.publisher && it.id != screen.publisher } ?: 0} watching"
                                )
                            }
                        }
                    }
                    if (mode == "screen" && screen != null) {
                        OfficeText(
                            "${screen.name}'s screen",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        VideoTile(office, screen, Modifier.fillMaxWidth().weight(1f))
                        Row(Modifier.horizontalScroll(rememberScrollState())) {
                            screens.forEach { video ->
                                TextButton(
                                    onClick = {
                                        selected = video.id
                                        pinned = ""
                                    }
                                ) {
                                    OfficeText(video.name)
                                }
                            }
                        }
                    } else
                        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                            cameras.chunked(2).forEach { row ->
                                Row(Modifier.fillMaxWidth()) {
                                    row.forEach { video ->
                                        Column(Modifier.weight(1f)) {
                                            VideoTile(
                                                office,
                                                video,
                                                Modifier.fillMaxWidth().aspectRatio(4f / 3f),
                                            )
                                            OfficeText(video.name)
                                        }
                                    }
                                }
                            }
                        }
                }
            }
        }
    if (viewers && screen != null)
        AlertDialog(
            onDismissRequest = { viewers = false },
            title = { OfficeText("Who's watching") },
            text = {
                Column {
                    val watching =
                        office.snapshot?.people.orEmpty().filter {
                            it.watching == screen.publisher && it.id != screen.publisher
                        }
                    if (watching.isEmpty()) OfficeText("No one is watching yet.")
                    watching.forEach { OfficeText(it.name) }
                }
            },
            confirmButton = { TextButton(onClick = { viewers = false }) { OfficeText("Done") } },
        )
}
