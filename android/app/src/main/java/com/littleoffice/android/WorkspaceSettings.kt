package com.littleoffice.android

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import org.json.JSONObject

@Composable
fun WorkspaceSettings(model: OfficeModel, workspace: Workspace, close: () -> Unit) {
    var detail by remember { mutableStateOf<JSONObject?>(null) }
    var name by remember { mutableStateOf(workspace.name) }
    var map by remember { mutableStateOf(workspace.mapId) }
    var invite by remember { mutableStateOf(false) }
    var remove by remember { mutableStateOf<JSONObject?>(null) }
    var invitationURL by remember { mutableStateOf("") }
    val role = detail?.string("role") ?: workspace.role
    val context = LocalContext.current
    fun reload() {
        model.action { detail = model.api!!.call(model.api!!.path(workspace.id)) }
    }
    LaunchedEffect(workspace.id) { reload() }
    Dialog(
        onDismissRequest = close,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(Modifier.fillMaxSize()) {
            Column(
                Modifier.safeDrawingPadding().verticalScroll(rememberScrollState()).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                TextButton(onClick = close) { Text("‹ Workspaces") }
                Text(workspace.name, style = MaterialTheme.typography.headlineMedium)
                if (model.error.isNotBlank())
                    Text(model.error, color = MaterialTheme.colorScheme.error)
                if (model.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                if (role != "member") {
                    OutlinedTextField(
                        name,
                        { name = it },
                        label = { Text("Workspace name") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    MapPicker(model.maps, map) { map = it }
                    Button(
                        enabled = !model.busy && name.trim().length in 2..60,
                        onClick = {
                            model.action {
                                model.api!!.call(
                                    model.api!!.path(workspace.id),
                                    "PATCH",
                                    json("name" to name.trim(), "mapId" to map),
                                )
                                model.load()
                            }
                        },
                    ) {
                        Text("Save workspace")
                    }
                }
                Text("Members", style = MaterialTheme.typography.titleLarge)
                detail?.getJSONArray("members")?.objects()?.forEach { member ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp)) {
                            Text(
                                member.string("name"),
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Text(member.string("email"), style = MaterialTheme.typography.bodySmall)
                            if (role == "owner") {
                                Row(Modifier.horizontalScroll(rememberScrollState())) {
                                    listOf("owner", "admin", "member").forEach { role ->
                                        FilterChip(
                                            member.string("role") == role,
                                            onClick = {
                                                model.action {
                                                    model.api!!.call(
                                                        model.api!!.path(
                                                            workspace.id,
                                                            "/members/${member.getString("id")}",
                                                        ),
                                                        "PATCH",
                                                        json("role" to role),
                                                    )
                                                    detail =
                                                        model.api!!.call(
                                                            model.api!!.path(workspace.id)
                                                        )
                                                    model.load()
                                                }
                                            },
                                            label = { Text(role) },
                                            enabled = !model.busy,
                                        )
                                    }
                                }
                                TextButton(onClick = { remove = member }) { Text("Remove member") }
                            } else Text(member.string("role"))
                        }
                    }
                }
                if (role != "member") {
                    Button(onClick = { invite = true }) { Text("Invite a teammate") }
                    if (invitationURL.isNotEmpty()) {
                        Text("Invitation ready. Share it with the invited email address.")
                        OutlinedButton(
                            onClick = {
                                (context.getSystemService(Context.CLIPBOARD_SERVICE)
                                        as ClipboardManager)
                                    .setPrimaryClip(
                                        ClipData.newPlainText("Workspace invitation", invitationURL)
                                    )
                            }
                        ) {
                            Text("Copy invitation link")
                        }
                    }
                    detail?.getJSONArray("invitations")?.objects()?.forEach { invitation ->
                        Row {
                            Text(invitation.string("email"), Modifier.weight(1f))
                            TextButton(
                                onClick = {
                                    model.action {
                                        model.api!!.call(
                                            model.api!!.path(
                                                workspace.id,
                                                "/invitations/${invitation.getString("id")}",
                                            ),
                                            "DELETE",
                                        )
                                        detail = model.api!!.call(model.api!!.path(workspace.id))
                                    }
                                }
                            ) {
                                Text("Revoke")
                            }
                        }
                    }
                }
                TextButton(onClick = { reload() }) { Text("Refresh") }
            }
        }
    }
    if (invite)
        TextEntryDialog(
            "Invite teammate",
            "Email address",
            "Create invitation",
            { invite = false },
        ) { email ->
            model.action {
                val result =
                    model.api!!.call(
                        model.api!!.path(workspace.id, "/invitations"),
                        "POST",
                        json("email" to email.trim().lowercase(), "role" to "member"),
                    )
                invitationURL = result.getString("url")
                invite = false
                detail = model.api!!.call(model.api!!.path(workspace.id))
            }
        }
    remove?.let { member ->
        AlertDialog(
            onDismissRequest = { remove = null },
            title = { Text("Remove ${member.string("name")}?") },
            text = { Text("Their access to this workspace will end immediately.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        model.action {
                            model.api!!.call(
                                model.api!!.path(
                                    workspace.id,
                                    "/members/${member.getString("id")}",
                                ),
                                "DELETE",
                            )
                            remove = null
                            if (member.string("id") == model.account?.string("id")) close()
                            else detail = model.api!!.call(model.api!!.path(workspace.id))
                            model.load()
                        }
                    }
                ) {
                    Text("Remove")
                }
            },
            dismissButton = { TextButton(onClick = { remove = null }) { Text("Cancel") } },
        )
    }
}
