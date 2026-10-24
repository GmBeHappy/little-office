package com.littleoffice.android

import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import org.json.JSONObject

@Composable
fun WorkspaceOptions(model: OfficeModel, workspace: Workspace, role: String) {
    var config by remember(workspace.id) { mutableStateOf<JSONObject?>(null) }
    var daily by remember { mutableStateOf(false) }
    var whiteboard by remember { mutableStateOf(true) }
    var wildlife by remember { mutableStateOf(true) }
    var activities by remember { mutableStateOf(true) }
    fun read(value: JSONObject) {
        config = value
        daily = value.optJSONObject("dailyMap")?.optBoolean("enabled") ?: false
        val features = value.optJSONObject("features")
        whiteboard = features?.optBoolean("whiteboard", true) ?: true
        wildlife = features?.optBoolean("wildlife", true) ?: true
        activities = features?.optBoolean("activities", true) ?: true
    }
    LaunchedEffect(workspace.id) {
        model.action {
            read(
                model.api!!
                    .call(model.api!!.path(workspace.id, "/config"))
                    .getJSONObject("workspace")
            )
        }
    }
    if (role != "member" && config != null) {
        HorizontalDivider()
        OfficeText("Features", style = MaterialTheme.typography.titleLarge)
        listOf(
                Triple("Whiteboard", whiteboard, { value: Boolean -> whiteboard = value }),
                Triple("Wildlife", wildlife, { value: Boolean -> wildlife = value }),
                Triple("Activities", activities, { value: Boolean -> activities = value }),
            )
            .forEach { (label, value, change) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OfficeText(label, Modifier.weight(1f))
                    Switch(value, change)
                }
            }
        Button(
            enabled = !model.busy,
            onClick = {
                model.action {
                    read(
                        model.api!!
                            .call(
                                model.api!!.path(workspace.id, "/admin/features"),
                                "PATCH",
                                json(
                                    "revision" to config!!.getInt("revision"),
                                    "features" to
                                        json(
                                            "whiteboard" to whiteboard,
                                            "wildlife" to wildlife,
                                            "activities" to activities,
                                        ),
                                ),
                            )
                            .getJSONObject("workspace")
                    )
                }
            },
        ) {
            OfficeText("Save features")
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OfficeText("Daily map", Modifier.weight(1f))
            Switch(daily, { daily = it })
        }
        Button(
            enabled = !model.busy,
            onClick = {
                model.action {
                    val current = config!!
                    read(
                        model.api!!
                            .call(
                                model.api!!.path(workspace.id, "/admin/workspace"),
                                "PATCH",
                                json(
                                    "revision" to current.getInt("revision"),
                                    "name" to current.getString("name"),
                                    "mapId" to current.getString("mapId"),
                                    "dailyMapEnabled" to daily,
                                ),
                            )
                            .getJSONObject("workspace")
                    )
                    model.load()
                }
            },
        ) {
            OfficeText("Save daily map")
        }
        TextButton(
            onClick = {
                model.action {
                    read(
                        model.api!!
                            .call(model.api!!.path(workspace.id, "/config"))
                            .getJSONObject("workspace")
                    )
                }
            }
        ) {
            OfficeText("Refresh settings")
        }
    }
    WorkspaceOIDC(model, workspace)
    if (role == "owner") WorkspaceActivity(model, workspace)
}

@Composable
private fun WorkspaceActivity(model: OfficeModel, workspace: Workspace) {
    val locale = officeLocale()
    var expanded by remember { mutableStateOf(false) }
    var entries by remember { mutableStateOf(emptyList<JSONObject>()) }
    var cursor by remember { mutableStateOf("") }
    var action by remember { mutableStateOf("") }
    fun load(more: Boolean = false) {
        model.action {
            val query = buildList {
                if (more && cursor.isNotEmpty()) add("before=$cursor")
                if (action.isNotEmpty()) add("action=$action")
            }
                .joinToString("&")
            val result = model.api!!.call(model.api!!.path(workspace.id, "/admin/activity?$query"))
            entries =
                (if (more) entries else emptyList()) + result.getJSONArray("entries").objects()
            cursor = result.string("nextCursor")
        }
    }
    TextButton(
        onClick = {
            expanded = !expanded
            if (expanded) load()
        }
    ) {
        OfficeText("Activity")
    }
    if (expanded) {
        Row(Modifier.horizontalScroll(rememberScrollState())) {
            listOf(
                    "" to "All",
                    "office.join" to "Joined",
                    "office.leave" to "Left",
                    "screen.start" to "Sharing",
                    "screen.stop" to "Stopped sharing",
                    "nudge" to "Nudges",
                    "member.role" to "Role changes",
                )
                .forEach { (value, label) ->
                    FilterChip(
                        action == value,
                        {
                            action = value
                            load()
                        },
                        label = { OfficeText(label) },
                    )
                }
        }
        if (entries.isEmpty()) OfficeText("No activity yet.")
        entries.forEach { item ->
            val label = activityLabels[item.string("action")] ?: item.string("action")
            OfficeText(
                "${item.string("actorName")} · ${officeTranslation(label)} ${item.string("targetName")}"
            )
            val details = item.optJSONObject("details")
            if (item.string("action") == "member.role" && details != null)
                OfficeText(
                    "${officeTranslation(details.string("from"))} → ${officeTranslation(details.string("to"))}"
                )
            details?.string("map")?.takeIf { it.isNotBlank() }?.let { OfficeText(it) }
            val date = runCatching { java.time.Instant.parse(item.string("createdAt")) }.getOrNull()
            OfficeText(
                date?.let {
                    java.time.format.DateTimeFormatter.ofLocalizedDateTime(
                            java.time.format.FormatStyle.MEDIUM,
                            java.time.format.FormatStyle.SHORT,
                        )
                        .withLocale(locale)
                        .withZone(java.time.ZoneId.systemDefault())
                        .format(it)
                } ?: item.string("createdAt"),
                style = MaterialTheme.typography.bodySmall,
            )
        }
        if (cursor.isNotEmpty())
            TextButton(onClick = { load(true) }, enabled = !model.busy) { OfficeText("Load more") }
    }
}

@Composable
private fun WorkspaceOIDC(model: OfficeModel, workspace: Workspace) {
    var expanded by remember { mutableStateOf(false) }
    var settings by remember { mutableStateOf<JSONObject?>(null) }
    var issuer by remember { mutableStateOf("") }
    var client by remember { mutableStateOf("") }
    var secret by remember { mutableStateOf("") }
    var domain by remember { mutableStateOf("") }
    var confirmSave by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val path = model.api!!.path(workspace.id, "/oidc")
    suspend fun load() {
        val result = model.api!!.call(path)
        settings = result
        val connection = result.optJSONObject("connection")
        issuer = connection?.string("issuer").orEmpty()
        client = connection?.string("clientId").orEmpty()
        domain = connection?.string("domain").orEmpty()
        secret = ""
    }
    TextButton(
        onClick = {
            expanded = !expanded
            if (expanded) model.action { load() }
        }
    ) {
        OfficeText("Workspace SSO")
    }
    if (!expanded) return
    val connection = settings?.optJSONObject("connection")
    OfficeText(
        if (connection?.optBoolean("enabled") == true) "Enabled for @${connection.string("domain")}"
        else "Workspace SSO is disabled."
    )
    if (connection?.optBoolean("enabled") == true && settings?.optBoolean("canLink") == true) {
        OfficeText(
            "Connect accounts in your browser using a recent personal sign-in, then return and refresh."
        )
        OutlinedButton(
            onClick = {
                CustomTabsIntent.Builder()
                    .build()
                    .launchUrl(
                        context,
                        Uri.parse(
                            "${model.api!!.origin}/workspaces?workspace=${Uri.encode(workspace.id)}"
                        ),
                    )
            }
        ) {
            OfficeText(
                if (settings?.optBoolean("linked") == true) "Reconnect your SSO account"
                else "Connect your SSO account"
            )
        }
    }
    if (settings?.optBoolean("canConfigure") == true) {
        OfficeText(
            "Changes require a personal sign-in from the last 10 minutes. If requested, sign out and sign in again using the canonical server https://app.littleoffice.app."
        )
        OutlinedTextField(
            issuer,
            { issuer = it.take(2048) },
            label = { OfficeText("Issuer URL") },
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            client,
            { client = it.take(512) },
            label = { OfficeText("Client ID") },
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            secret,
            { secret = it.take(4096) },
            label = { OfficeText("Client secret") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
        )
        if (connection != null) OfficeText("Leave blank to keep the saved secret")
        OutlinedTextField(
            domain,
            { domain = it.take(253) },
            label = { OfficeText("Organization email domain") },
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = { confirmSave = true },
            enabled =
                !model.busy &&
                    issuer.isNotBlank() &&
                    client.isNotBlank() &&
                    domain.isNotBlank() &&
                    (connection != null || secret.isNotBlank()),
        ) {
            OfficeText("Save connection")
        }
        if (connection != null) {
            SelectionContainer {
                Column {
                    OfficeText("Redirect URI: ${connection.string("redirectURI")}")
                    OfficeText("DNS TXT name: ${connection.string("dnsName")}")
                    OfficeText("DNS TXT value: ${connection.string("dnsValue")}")
                }
            }
            OfficeText(
                if (connection.optBoolean("verified")) "Domain verified"
                else "Domain not verified yet"
            )
            Row {
                TextButton(
                    enabled = !model.busy,
                    onClick = {
                        model.action {
                            model.api!!.call("$path/verify", "POST")
                            load()
                        }
                    },
                ) {
                    OfficeText("Verify DNS")
                }
                TextButton(
                    enabled = !model.busy,
                    onClick = {
                        model.action {
                            model.api!!.call(
                                path,
                                "PATCH",
                                json("enabled" to !connection.optBoolean("enabled")),
                            )
                            load()
                        }
                    },
                ) {
                    OfficeText(
                        if (connection.optBoolean("enabled")) "Disable SSO" else "Enable SSO"
                    )
                }
            }
        }
    } else if (workspace.role == "owner")
        OfficeText("Sign in with your personal owner account to configure SSO.")
    TextButton(onClick = { model.action { load() } }) { OfficeText("Refresh") }
    if (confirmSave)
        AlertDialog(
            onDismissRequest = { confirmSave = false },
            title = { OfficeText("Save connection?") },
            text = {
                OfficeText(
                    "Saving disables SSO and signs out its active sessions. Changing issuer, client ID or domain requires members to reconnect their accounts."
                )
            },
            confirmButton = {
                TextButton(
                    enabled = !model.busy,
                    onClick = {
                        model.action {
                            val body =
                                json(
                                    "issuer" to issuer.trim(),
                                    "clientId" to client.trim(),
                                    "domain" to domain.trim(),
                                )
                            if (secret.isNotEmpty()) body.put("clientSecret", secret)
                            model.api!!.call(path, "PUT", body)
                            secret = ""
                            confirmSave = false
                            load()
                        }
                    },
                ) {
                    OfficeText("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmSave = false }) { OfficeText("Cancel") }
            },
        )
}

private val activityLabels =
    mapOf(
        "office.join" to "Joined the office",
        "office.leave" to "Left the office",
        "screen.start" to "Started screen sharing",
        "screen.stop" to "Stopped screen sharing",
        "nudge" to "Nudged a teammate",
        "member.role" to "Changed a member's role",
    )
