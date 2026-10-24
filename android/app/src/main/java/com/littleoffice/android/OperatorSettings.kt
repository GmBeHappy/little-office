package com.littleoffice.android

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import org.json.JSONObject

/** Global controls require the server's explicit operator grant and a personal account. */
@Composable
fun OperatorSettings(model: OfficeModel, office: OfficeSession) {
    if (!office.operator || !model.account?.string("workspaceId").isNullOrBlank()) return
    var users by remember { mutableStateOf(emptyList<JSONObject>()) }
    var policy by remember { mutableStateOf<JSONObject?>(null) }
    var storage by remember { mutableStateOf<JSONObject?>(null) }
    var checked by remember { mutableStateOf(false) }
    var password by remember { mutableStateOf(true) }
    var sso by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }
    var create by remember { mutableStateOf(false) }
    var reset by remember { mutableStateOf<JSONObject?>(null) }
    var confirmation by remember { mutableStateOf<OperatorAction?>(null) }
    suspend fun reload() {
        users = office.api.call("/api/admin/users").getJSONArray("items").objects()
        policy = office.api.call("/api/config")
        password = policy!!.optBoolean("password")
        sso = policy!!.optBoolean("sso")
        storage = office.api.call("/api/admin/storage")
    }
    LaunchedEffect(office) { model.action { reload() } }
    OfficeText("Administration", style = MaterialTheme.typography.titleLarge)
    OfficeText(
        "These controls affect all accounts. Sensitive changes require a personal sign-in from the last 10 minutes."
    )
    TextButton(onClick = { model.action { reload() } }, enabled = !model.busy) {
        OfficeText("Refresh")
    }
    OfficeText("Login methods", style = MaterialTheme.typography.titleMedium)
    Row(verticalAlignment = Alignment.CenterVertically) {
        OfficeText("Password login", Modifier.weight(1f))
        Switch(password, { password = it })
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        OfficeText("OIDC single sign-on", Modifier.weight(1f))
        Switch(sso, { sso = it }, enabled = policy?.optBoolean("ssoConfigured") == true)
    }
    Button(
        enabled = !model.busy && (password || sso),
        onClick = {
            confirmation =
                OperatorAction(
                    "Save login methods?",
                    "Sessions using a disabled login method will be signed out.",
                    "/api/admin/auth",
                    "PATCH",
                    json("password" to password, "sso" to sso),
                )
        },
    ) {
        OfficeText("Save login methods")
    }
    HorizontalDivider()
    OfficeText("Accounts", style = MaterialTheme.typography.titleMedium)
    OutlinedTextField(
        search,
        { search = it },
        label = { OfficeText("Search people") },
        modifier = Modifier.fillMaxWidth(),
    )
    Button(enabled = password && !model.busy, onClick = { create = true }) {
        OfficeText("Create local account")
    }
    users
        .filter {
            search.isBlank() ||
                "${it.string("name")} ${it.string("username")}".contains(search, true)
        }
        .forEach { user ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    OfficeText(user.string("name"), style = MaterialTheme.typography.titleMedium)
                    OfficeText("${user.string("username")} · ${user.string("role")}")
                    if (user.string("id") != model.account?.string("id")) {
                        Row(Modifier.horizontalScroll(rememberScrollState())) {
                            TextButton(
                                enabled = !model.busy,
                                onClick = {
                                    val enabled = !user.optBoolean("approved")
                                    confirmation =
                                        OperatorAction(
                                            if (enabled) "Approve account?" else "Disable account?",
                                            if (enabled) "This account can sign in again."
                                            else "All active sessions will be signed out.",
                                            "/api/admin/users/${user.getString("id")}",
                                            "PATCH",
                                            json("approved" to enabled),
                                        )
                                },
                            ) {
                                OfficeText(
                                    if (user.optBoolean("approved")) "Disable" else "Approve"
                                )
                            }
                            if (user.optBoolean("approved"))
                                TextButton(
                                    enabled = !model.busy,
                                    onClick = {
                                        val role =
                                            if (user.string("role") == "owner") "member"
                                            else "owner"
                                        confirmation =
                                            OperatorAction(
                                                "Change global role?",
                                                "${user.string("name")} → $role",
                                                "/api/admin/users/${user.getString("id")}/role",
                                                "PATCH",
                                                json("role" to role),
                                            )
                                    },
                                ) {
                                    OfficeText(
                                        if (user.string("role") == "owner") "Make member"
                                        else "Make owner"
                                    )
                                }
                            if (user.string("role") == "member")
                                TextButton(
                                    enabled = !model.busy,
                                    onClick = {
                                        confirmation =
                                            OperatorAction(
                                                "Delete account?",
                                                "This permanently deletes ${user.string("name")} and their workspace memberships.",
                                                "/api/admin/users/${user.getString("id")}",
                                                "DELETE",
                                            )
                                    },
                                ) {
                                    OfficeText("Delete")
                                }
                        }
                    }
                    if (user.optBoolean("localPassword") && password)
                        TextButton(enabled = !model.busy, onClick = { reset = user }) {
                            OfficeText("Reset password")
                        }
                }
            }
        }
    HorizontalDivider()
    OfficeText("File storage", style = MaterialTheme.typography.titleMedium)
    storage?.let { info ->
        OfficeText(
            if (info.optBoolean("configured")) "S3 storage is configured."
            else "S3 storage is not configured."
        )
        OfficeText(
            "${info.string("endpoint")} · ${info.string("bucket")} · ${info.string("region")}"
        )
        OfficeText("PNG snapshots up to 5 MB")
        Button(
            enabled = info.optBoolean("configured") && !model.busy,
            onClick = {
                model.action {
                    office.api.call("/api/admin/storage/check", "POST")
                    checked = true
                }
            },
        ) {
            OfficeText("Check storage")
        }
        if (checked) OfficeText("Storage read, write and delete check passed.")
    }
    confirmation?.let { action ->
        AlertDialog(
            onDismissRequest = { confirmation = null },
            title = { OfficeText(action.title) },
            text = { OfficeText(action.message) },
            confirmButton = {
                TextButton(
                    enabled = !model.busy,
                    onClick = {
                        model.action {
                            office.api.call(action.path, action.method, action.body)
                            confirmation = null
                            reload()
                        }
                    },
                ) {
                    OfficeText("Confirm")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmation = null }) { OfficeText("Cancel") }
            },
        )
    }
    if (create || reset != null) {
        var username by remember { mutableStateOf("") }
        var name by remember { mutableStateOf("") }
        var temporary by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = {
                create = false
                reset = null
            },
            title = { OfficeText(if (create) "Create local account" else "Reset password") },
            text = {
                Column(
                    Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (create) {
                        OutlinedTextField(
                            username,
                            { username = it.take(30) },
                            label = { OfficeText("Username") },
                        )
                        OutlinedTextField(
                            name,
                            { name = it.take(40) },
                            label = { OfficeText("Name") },
                        )
                    } else OfficeText(reset?.string("name").orEmpty())
                    OutlinedTextField(
                        temporary,
                        { temporary = it.take(128) },
                        visualTransformation = PasswordVisualTransformation(),
                        label = { OfficeText("Temporary password") },
                    )
                    OfficeText(
                        "Use 12–128 characters. The user must change it at next sign-in. Resetting signs out all their sessions."
                    )
                    if (model.error.isNotEmpty())
                        OfficeText(model.error, color = MaterialTheme.colorScheme.error)
                }
            },
            confirmButton = {
                TextButton(
                    enabled =
                        !model.busy &&
                            temporary.length in 12..128 &&
                            (!create ||
                                (username.matches(Regex("[a-zA-Z0-9_]{3,30}")) &&
                                    name.isNotBlank())),
                    onClick = {
                        model.action {
                            if (create)
                                office.api.call(
                                    "/api/admin/users",
                                    "POST",
                                    json(
                                        "username" to username,
                                        "name" to name.trim(),
                                        "password" to temporary,
                                    ),
                                )
                            else
                                office.api.call(
                                    "/api/admin/reset-password",
                                    "POST",
                                    json(
                                        "userId" to reset!!.getString("id"),
                                        "password" to temporary,
                                    ),
                                )
                            temporary = ""
                            create = false
                            reset = null
                            reload()
                        }
                    },
                ) {
                    OfficeText("Save")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        temporary = ""
                        create = false
                        reset = null
                    }
                ) {
                    OfficeText("Cancel")
                }
            },
        )
    }
}

private data class OperatorAction(
    val title: String,
    val message: String,
    val path: String,
    val method: String,
    val body: JSONObject? = null,
)
