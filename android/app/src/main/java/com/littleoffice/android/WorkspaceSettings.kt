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
    var inviteEmail by remember { mutableStateOf("") }
    var inviteRole by remember { mutableStateOf("member") }
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
                TextButton(onClick = close) { OfficeText("‹ Workspaces") }
                OfficeText(workspace.name, style = MaterialTheme.typography.headlineMedium)
                if (model.error.isNotBlank())
                    OfficeText(model.error, color = MaterialTheme.colorScheme.error)
                if (model.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                if (role != "member") {
                    OutlinedTextField(
                        name,
                        { name = it },
                        label = { OfficeText("Workspace name") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    MapPicker(model.allMaps, map) { map = it }
                    Button(
                        enabled = !model.busy && name.trim().length in 2..60,
                        onClick = {
                            model.action {
                                model.api!!.call(
                                    model.api!!.path(workspace.id, "/admin/workspace"),
                                    "PATCH",
                                    json(
                                        "name" to name.trim(),
                                        "mapId" to map,
                                        "revision" to requireNotNull(detail).getInt("revision"),
                                    ),
                                )
                                model.load()
                                detail = model.api!!.call(model.api!!.path(workspace.id))
                            }
                        },
                    ) {
                        OfficeText("Save workspace")
                    }
                }
                OfficeText("Members", style = MaterialTheme.typography.titleLarge)
                detail?.getJSONArray("members")?.objects()?.forEach { member ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp)) {
                            OfficeText(
                                member.string("name"),
                                style = MaterialTheme.typography.titleMedium,
                            )
                            OfficeText(
                                member.string("email"),
                                style = MaterialTheme.typography.bodySmall,
                            )
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
                                            label = { OfficeText(role) },
                                            enabled = !model.busy,
                                        )
                                    }
                                }
                                if (!member.optBoolean("approved", true))
                                    TextButton(
                                        onClick = {
                                            model.action {
                                                model.api!!.call(
                                                    model.api!!.path(
                                                        workspace.id,
                                                        "/members/${member.getString("id")}",
                                                    ),
                                                    "PATCH",
                                                    json(
                                                        "role" to member.string("role"),
                                                        "approved" to true,
                                                    ),
                                                )
                                                detail =
                                                    model.api!!.call(model.api!!.path(workspace.id))
                                            }
                                        }
                                    ) {
                                        OfficeText("Restore")
                                    }
                                TextButton(onClick = { remove = member }) {
                                    OfficeText("Remove member")
                                }
                            } else OfficeText(member.string("role"))
                        }
                    }
                }
                if (role != "member") {
                    Button(onClick = { invite = true }) { OfficeText("Invite a teammate") }
                    if (invitationURL.isNotEmpty()) {
                        OfficeText("Invitation ready. Share it with the invited email address.")
                        OutlinedButton(
                            onClick = {
                                (context.getSystemService(Context.CLIPBOARD_SERVICE)
                                        as ClipboardManager)
                                    .setPrimaryClip(
                                        ClipData.newPlainText("Workspace invitation", invitationURL)
                                    )
                            }
                        ) {
                            OfficeText("Copy invitation link")
                        }
                    }
                    detail?.getJSONArray("invitations")?.objects()?.forEach { invitation ->
                        Row {
                            OfficeText(invitation.string("email"), Modifier.weight(1f))
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
                                OfficeText("Revoke")
                            }
                        }
                    }
                }
                key(detail?.optInt("revision")) { WorkspaceOptions(model, workspace, role) }
                TextButton(onClick = { reload() }) { OfficeText("Refresh") }
            }
        }
    }
    if (invite)
        AlertDialog(
            onDismissRequest = { invite = false },
            title = { OfficeText("Invite teammate") },
            text = {
                Column {
                    OutlinedTextField(
                        inviteEmail,
                        { inviteEmail = it.take(254) },
                        label = { OfficeText("Email address") },
                    )
                    if (role == "owner")
                        Row {
                            listOf("member", "admin").forEach { value ->
                                FilterChip(
                                    inviteRole == value,
                                    { inviteRole = value },
                                    label = { OfficeText(value) },
                                )
                            }
                        }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !model.busy && inviteEmail.contains('@'),
                    onClick = {
                        model.action {
                            val result =
                                model.api!!.call(
                                    model.api!!.path(workspace.id, "/invitations"),
                                    "POST",
                                    json(
                                        "email" to inviteEmail.trim().lowercase(),
                                        "role" to if (role == "owner") inviteRole else "member",
                                    ),
                                )
                            invitationURL = result.getString("url")
                            invite = false
                            inviteEmail = ""
                            detail = model.api!!.call(model.api!!.path(workspace.id))
                        }
                    },
                ) {
                    OfficeText("Create invitation")
                }
            },
            dismissButton = { TextButton(onClick = { invite = false }) { OfficeText("Cancel") } },
        )
    remove?.let { member ->
        AlertDialog(
            onDismissRequest = { remove = null },
            title = { OfficeText("Remove ${member.string("name")}?") },
            text = { OfficeText("Their access to this workspace will end immediately.") },
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
                    OfficeText("Remove")
                }
            },
            dismissButton = { TextButton(onClick = { remove = null }) { OfficeText("Cancel") } },
        )
    }
}
