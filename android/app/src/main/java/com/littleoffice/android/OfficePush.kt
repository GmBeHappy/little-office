package com.littleoffice.android

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import org.json.JSONObject

private const val channelId = "workspace_inbox"
private const val preference = "device-push"
private const val tapAction = "com.littleoffice.android.OPEN_INBOX"
private const val tagPrefix = "workspace-inbox/"

internal data class PushRoute(
    val workspace: String,
    val recipient: String,
    val installation: String,
) {
    companion object {
        fun from(data: Map<String, String>): PushRoute? {
            if (
                data["type"] != "office-notification" ||
                    data["kind"] !in setOf("nudge", "summon", "wave", "call") ||
                    (data["notificationId"]?.toLongOrNull() ?: 0) <= 0
            )
                return null
            val workspace = data["workspaceId"] ?: return null
            val installation = data["installationId"] ?: return null
            val recipient = data["recipientId"]?.takeIf { it.isNotBlank() } ?: return null
            if (!validId(workspace) || !validId(installation)) return null
            return PushRoute(workspace, recipient, installation)
        }

        fun from(intent: Intent?): PushRoute? {
            if (intent?.action != tapAction) return null
            val workspace = intent.getStringExtra("workspaceId") ?: return null
            val installation = intent.getStringExtra("installationId") ?: return null
            val recipient = intent.getStringExtra("recipientId") ?: return null
            if (!validId(workspace) || !validId(installation) || recipient.isBlank()) return null
            return PushRoute(workspace, recipient, installation)
        }

        private fun validId(value: String) =
            runCatching { UUID.fromString(value).toString() == value }.getOrDefault(false)
    }
}

// This install signs in to one origin/account at a time. Opt-in belongs to each workspace.
// A blank workspace value is a pending DELETE: suppress delivery immediately, retry offline
// cleanup.
internal object OfficePush {
    private val writes = Mutex()

    private fun fingerprint(token: String) =
        android.util.Base64.encodeToString(
            MessageDigest.getInstance("SHA-256").digest(token.toByteArray()),
            android.util.Base64.NO_WRAP,
        )

    private fun credential(session: JSONObject?) =
        session?.optJSONObject("credential")?.takeIf {
            runCatching { Instant.parse(it.getString("expiresAt")).isAfter(Instant.now()) }
                .getOrDefault(false)
        }

    private fun matches(state: JSONObject, session: JSONObject?): Boolean {
        val token = credential(session)?.string("token") ?: return false
        return token.isNotBlank() &&
            state.string("origin") == session?.string("origin") &&
            state.string("session") == fingerprint(token)
    }

    private fun bound(store: CredentialStore) =
        store.read(preference)?.takeIf { matches(it, store.read("session")) }

    private fun messaging(ctx: Context): FirebaseMessaging? =
        if (FirebaseApp.getApps(ctx).any { it.name == FirebaseApp.DEFAULT_APP_NAME })
            FirebaseMessaging.getInstance()
        else null

    fun supported(ctx: Context) = messaging(ctx) != null

    fun enabled(ctx: Context, workspace: String) =
        bound(CredentialStore(ctx))
            ?.optJSONObject("workspaces")
            ?.optString(workspace)
            .orEmpty()
            .isNotBlank()

    fun allowed(ctx: Context): Boolean {
        if (
            Build.VERSION.SDK_INT >= 33 &&
                ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                    PackageManager.PERMISSION_GRANTED
        )
            return false
        val manager = ctx.getSystemService(NotificationManager::class.java)
        return manager.areNotificationsEnabled() &&
            manager.getNotificationChannel(channelId)?.importance !=
                NotificationManager.IMPORTANCE_NONE
    }

    fun channel(ctx: Context) {
        ctx.getSystemService(NotificationManager::class.java)
            .createNotificationChannel(
                NotificationChannel(
                    channelId,
                    ctx.getString(R.string.push_channel),
                    NotificationManager.IMPORTANCE_DEFAULT,
                )
            )
    }

    private fun cancelShown(ctx: Context, workspace: String? = null) {
        val manager = ctx.getSystemService(NotificationManager::class.java)
        val prefix = tagPrefix + (workspace?.let { "$it/" } ?: "")
        manager.activeNotifications
            .filter { it.tag?.startsWith(prefix) == true }
            .forEach { manager.cancel(it.tag, it.id) }
    }

    fun schedule(ctx: Context) {
        if (bound(CredentialStore(ctx)) == null) return
        val job =
            OneTimeWorkRequestBuilder<PushRegistrationWorker>()
                .setConstraints(
                    Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
                )
                .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork(preference, ExistingWorkPolicy.REPLACE, job)
    }

    fun clear(ctx: Context) {
        CredentialStore(ctx).save(preference, null)
        cancelShown(ctx)
        messaging(ctx)?.isAutoInitEnabled = false
    }

    suspend fun revoke(ctx: Context, api: OfficeAPI) =
        writes.withLock {
            val state = bound(CredentialStore(ctx))
            clear(ctx)
            if (state != null) {
                state.getJSONObject("workspaces").keys().asSequence().forEach { id ->
                    try {
                        unregister(api, id, state)
                    } catch (cancel: CancellationException) {
                        throw cancel
                    } catch (_: Exception) {}
                }
            }
        }

    suspend fun reconcile(ctx: Context, api: OfficeAPI, user: String, memberships: Set<String>) =
        writes.withLock {
            val store = CredentialStore(ctx)
            val state = store.read(preference) ?: return@withLock
            if (
                !matches(state, store.read("session")) ||
                    state.string("origin") != api.origin ||
                    state.string("owner") != user
            ) {
                clear(ctx)
                return@withLock
            }
            val choices = state.getJSONObject("workspaces")
            for (id in choices.keys().asSequence().toList()) if (id !in memberships) {
                cancelShown(ctx, id)
                choices.remove(id) // The server removes registrations when membership is revoked.
            }
            persist(ctx, store, state)
            schedule(ctx)
        }

    private fun persist(ctx: Context, store: CredentialStore, state: JSONObject) {
        if (!matches(state, store.read("session"))) return
        val choices = state.getJSONObject("workspaces")
        if (choices.length() == 0) clear(ctx)
        else {
            store.save(preference, state)
            messaging(ctx)?.isAutoInitEnabled =
                choices.keys().asSequence().any { choices.string(it).isNotBlank() }
        }
    }

    private suspend fun register(
        api: OfficeAPI,
        id: String,
        state: JSONObject,
        token: String,
        locale: String,
    ) {
        api.call(
            api.path(id, "/notifications/push-device"),
            "PUT",
            json(
                "installationId" to state.string("installationId"),
                "token" to token,
                "platform" to "android",
                "locale" to locale,
            ),
        )
    }

    private suspend fun unregister(api: OfficeAPI, id: String, state: JSONObject) {
        api.call(
            api.path(id, "/notifications/push-device"),
            "DELETE",
            json("installationId" to state.string("installationId")),
        )
    }

    suspend fun setEnabled(
        ctx: Context,
        api: OfficeAPI,
        user: String,
        id: String,
        locale: String,
        enable: Boolean,
    ) =
        writes.withLock {
            val store = CredentialStore(ctx)
            val session = store.read("session") ?: error("Please sign in again.")
            val token = credential(session)?.string("token") ?: error("Please sign in again.")
            check(
                api.origin == session.string("origin") &&
                    api.credential?.string("token") == token &&
                    user.isNotBlank()
            )
            val state =
                bound(store)?.takeIf { it.string("owner") == user }
                    ?: json(
                        "origin" to api.origin,
                        "owner" to user,
                        "installationId" to UUID.randomUUID().toString(),
                        "session" to fingerprint(token),
                        "workspaces" to JSONObject(),
                    )
            val choices = state.getJSONObject("workspaces")
            if (enable) {
                check(allowed(ctx)) { "Allow notifications in Android Settings." }
                val fcm = messaging(ctx) ?: error("System notifications are unavailable.")
                val language = if (locale == "th") "th" else "en"
                register(api, id, state, fcm.token.await(), language)
                choices.put(id, language)
                persist(ctx, store, state)
            } else {
                choices.put(id, "")
                persist(ctx, store, state)
                cancelShown(ctx, id)
                try {
                    unregister(api, id, state)
                    choices.remove(id)
                    persist(ctx, store, state)
                } finally {
                    schedule(ctx)
                }
            }
        }

    suspend fun sync(ctx: Context) =
        writes.withLock {
            val store = CredentialStore(ctx)
            val state = bound(store) ?: return@withLock
            val session = store.read("session") ?: return@withLock
            val api = OfficeAPI(state.string("origin"), session.getJSONObject("credential"))
            try {
                val choices = state.getJSONObject("workspaces")
                val token =
                    if (
                        allowed(ctx) &&
                            choices.keys().asSequence().any { choices.string(it).isNotBlank() }
                    )
                        messaging(ctx)?.token?.await()
                    else null
                for (id in choices.keys().asSequence().toList()) {
                    val locale = choices.string(id)
                    try {
                        if (locale.isEmpty()) {
                            unregister(api, id, state)
                            choices.remove(id)
                        } else if (token != null) {
                            val currentLocale =
                                ctx.getSharedPreferences("office-language", Context.MODE_PRIVATE)
                                    .getString("language", locale)
                                    .let { if (it == "th") "th" else "en" }
                            register(api, id, state, token, currentLocale)
                            choices.put(id, currentLocale)
                        }
                    } catch (e: APIError) {
                        if (e.status == 401) {
                            clear(ctx)
                            return@withLock
                        }
                        if (e.status !in listOf(403, 404)) throw e
                        choices.remove(id)
                        cancelShown(ctx, id)
                    }
                }
                persist(ctx, store, state)
            } finally {
                api.close()
            }
        }

    fun accepts(ctx: Context, route: PushRoute): Boolean {
        val state = bound(CredentialStore(ctx)) ?: return false
        return state.string("owner") == route.recipient &&
            state.string("installationId") == route.installation &&
            state.getJSONObject("workspaces").string(route.workspace).isNotBlank()
    }

    @SuppressLint("MissingPermission") // checked in allowed()
    fun deliver(ctx: Context, data: Map<String, String>) {
        val route = PushRoute.from(data) ?: return
        if (!accepts(ctx, route) || !allowed(ctx)) return
        val title = data["title"]?.takeIf { it.isNotBlank() } ?: return
        val body = data["body"]?.takeIf { it.isNotBlank() } ?: return
        channel(ctx)
        val tag = "$tagPrefix" + route.workspace + "/" + data["notificationId"]
        val intent =
            Intent(ctx, MainActivity::class.java)
                .setAction(tapAction)
                .setData(
                    Uri.Builder()
                        .scheme("littleoffice-push")
                        .authority("inbox")
                        .appendPath(route.workspace)
                        .appendPath(data["notificationId"])
                        .build()
                )
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("workspaceId", route.workspace)
                .putExtra("recipientId", route.recipient)
                .putExtra("installationId", route.installation)
        val tap =
            PendingIntent.getActivity(
                ctx,
                0,
                intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        val notification =
            NotificationCompat.Builder(ctx, channelId)
                .setSmallIcon(R.drawable.notification_bell)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(tap)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setAutoCancel(true)
                .build()
        ctx.getSystemService(NotificationManager::class.java).notify(tag, 0, notification)
    }
}

class PushRegistrationWorker(ctx: Context, params: WorkerParameters) :
    CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result =
        try {
            OfficePush.sync(applicationContext)
            Result.success()
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (_: Exception) {
            Result.retry()
        }
}

class OfficeMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        OfficePush.schedule(this)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        OfficePush.deliver(this, message.data)
    }
}
