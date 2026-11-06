package com.littleoffice.android

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import org.json.JSONObject

data class InboxItem(val id: Long, val kind: String, val actorName: String, val createdAt: Instant, val read: Boolean) {
    companion object {
        fun parse(data: JSONObject) = InboxItem(data.getLong("id"), data.getString("kind"),
            data.getString("actorName"), Instant.parse(data.getString("createdAt")), !data.isNull("readAt"))
    }
}

class WorkspaceInbox(private val api: OfficeAPI, private val workspaceId: String) {
    var items by mutableStateOf(emptyList<InboxItem>())
        private set
    var unreadCount by mutableIntStateOf(0)
        private set
    var nextCursor by mutableStateOf<Long?>(null)
        private set
    var loading by mutableStateOf(false)
        private set
    var saving by mutableStateOf(false)
        private set
    var error by mutableStateOf("")
        private set
    private var scope: CoroutineScope? = null
    private var fetch: Job? = null

    fun connect(connectedScope: CoroutineScope) {
        scope = connectedScope
        refresh()
    }
    fun clear() {
        scope = null
        fetch?.cancel()
        fetch = null
        loading = false
        saving = false
        error = ""
        nextCursor = null
        items = emptyList()
        unreadCount = 0
    }
    fun refresh() = load(null)
    fun loadMore() { if (!loading) nextCursor?.let(::load) }
    private fun load(before: Long?) {
        val session = scope ?: return
        fetch?.cancel()
        loading = true
        error = ""
        fetch = session.launch {
            try {
                val path = "/notifications" + (before?.let { "?before=$it" } ?: "")
                val result = api.call(api.path(workspaceId, path))
                val page = result.getJSONArray("items").objects().map(InboxItem::parse)
                ensureActive()
                items = if (before == null) page else (items + page).distinctBy { it.id }
                unreadCount = result.getInt("unreadCount")
                nextCursor = if (result.isNull("nextCursor")) null else result.getLong("nextCursor")
            } catch (cancel: CancellationException) { throw cancel }
            catch (_: Exception) { error = "Could not load notifications." }
            finally { if (kotlin.coroutines.coroutineContext[Job]?.isActive == true) loading = false }
        }
    }

    fun markRead(id: Long? = null) {
        val session = scope ?: return
        if (saving) return
        saving = true
        session.launch {
            try {
                val suffix = id?.let { "/notifications/$it/read" } ?: "/notifications/read-all"
                api.call(api.path(workspaceId, suffix), "POST")
                ensureActive()
                refresh()
            } catch (cancel: CancellationException) { throw cancel }
            catch (_: Exception) { error = "Could not mark notifications as read." }
            finally { if (scope === session) saving = false }
        }
    }
}

@Composable
fun NotificationBell(inbox: WorkspaceInbox, connected: Boolean, open: () -> Unit) {
    val name = officeTranslation("Notifications")
    val unread = officeTranslation("{count} unread notifications").replace("{count}", inbox.unreadCount.toString())
    IconButton(enabled = connected, onClick = open, modifier = Modifier.semantics { contentDescription = if (inbox.unreadCount > 0) unread else name }) {
        BadgedBox(badge = {
            if (inbox.unreadCount > 0) Badge(containerColor = Color(0xffba1a1a), contentColor = Color.White) {
                Text(if (inbox.unreadCount > 99) "99+" else inbox.unreadCount.toString())
            }
        }) { Icon(painterResource(R.drawable.notification_bell), null) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationCenter(inbox: WorkspaceInbox, close: () -> Unit) {
    val locale = officeLocale()
    val date = remember(locale) { DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT)
        .withLocale(locale).withZone(ZoneId.systemDefault()) }
    LaunchedEffect(inbox) { inbox.refresh() }
    ModalBottomSheet(onDismissRequest = close, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().heightIn(max = 640.dp).padding(horizontal = 16.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                OfficeText("Notifications", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                if (inbox.unreadCount > 0) TextButton(enabled = !inbox.saving, onClick = { inbox.markRead() }) {
                    OfficeText("Mark all as read")
                }
                TextButton(onClick = close) { OfficeText("Done") }
            }
            if (inbox.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            if (inbox.error.isNotEmpty()) Row(verticalAlignment = Alignment.CenterVertically) {
                OfficeText(inbox.error, Modifier.weight(1f))
                TextButton(onClick = { inbox.refresh() }) { OfficeText("Retry") }
            } else if (!inbox.loading && inbox.items.isEmpty()) {
                OfficeText("No notifications yet.", Modifier.padding(vertical = 20.dp))
            }
            LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp), contentPadding = PaddingValues(bottom = 16.dp)) {
                items(inbox.items, key = { it.id }) { item ->
                    val template = when (item.kind) {
                        "nudge" -> "{name} nudged you"
                        "wave" -> "{name} waved at you"
                        "summon" -> "{name} invited you to join them"
                        "call" -> "{name} invited you to a private call"
                        else -> "Notification from {name}"
                    }
                    val title = officeTranslation(template).replace("{name}", item.actorName)
                    val state = officeTranslation(if (item.read) "Read" else "Unread")
                    Surface(onClick = { inbox.markRead(item.id) }, enabled = !item.read && !inbox.saving,
                        shape = MaterialTheme.shapes.medium, color = if (item.read) MaterialTheme.colorScheme.surface
                            else MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.fillMaxWidth().semantics { contentDescription = "$state. $title" }) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            if (!item.read) Surface(Modifier.size(8.dp), shape = CircleShape, color = Color(0xffba1a1a)) {}
                            Column {
                                Text(title, fontWeight = if (item.read) FontWeight.Normal else FontWeight.SemiBold)
                                Text(date.format(item.createdAt), style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
                if (inbox.nextCursor != null) item {
                    TextButton(enabled = !inbox.loading, onClick = { inbox.loadMore() }) { OfficeText("Load more") }
                }
            }
        }
    }
}
