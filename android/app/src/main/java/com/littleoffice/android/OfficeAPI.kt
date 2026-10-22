package com.littleoffice.android

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class APIError(val status: Int, message: String) : Exception(message)

class OfficeAPI(origin: String, val credential: JSONObject? = null) {
    val origin = NativeAuth.origin(origin)
    // Redirects are rejected so bearer credentials never leave the configured origin.
    private val client =
        OkHttpClient.Builder()
            .followRedirects(false)
            .followSslRedirects(false)
            .callTimeout(20, TimeUnit.SECONDS)
            .pingInterval(20, TimeUnit.SECONDS)
            .build()

    fun request(path: String): Request.Builder {
        require(path.startsWith('/') && !path.startsWith("//") && !path.contains('\\'))
        val base = origin.toHttpUrl()
        val url = base.resolve(path) ?: throw IllegalArgumentException("Invalid API address.")
        require(
            url.scheme == base.scheme &&
                url.host == base.host &&
                url.port == base.port &&
                url.username.isEmpty() &&
                url.password.isEmpty()
        )
        return Request.Builder().url(url).header("Origin", origin).apply {
            credential?.let { header("Authorization", "Bearer ${it.getString("token")}") }
        }
    }

    suspend fun call(path: String, method: String = "GET", body: JSONObject? = null): JSONObject =
        withContext(Dispatchers.IO) {
            val request =
                request(path)
                    .method(
                        method,
                        if (method in listOf("GET", "HEAD")) null
                        else
                            (body ?: JSONObject())
                                .toString()
                                .toRequestBody("application/json".toMediaType()),
                    )
                    .build()
            client.newCall(request).execute().use {
                val text = it.body?.string().orEmpty()
                val result = runCatching {
                    if (text.trimStart().startsWith("[")) json("items" to org.json.JSONArray(text))
                    else JSONObject(text)
                }
                    .getOrNull()
                if (!it.isSuccessful)
                    throw APIError(
                        it.code,
                        result?.string("error")?.takeIf(String::isNotBlank)
                            ?: "Request failed (${it.code}).",
                    )
                result ?: throw APIError(it.code, "Invalid server response.")
            }
        }

    fun socket(workspace: String, takeover: Boolean, listener: WebSocketListener): WebSocket =
        client.newWebSocket(
            request(
                    "/api/workspaces/$workspace/office?protocol=1${if (takeover) "&takeover=1" else ""}"
                )
                .build(),
            listener,
        )

    fun path(id: String, suffix: String = "") = "/api/workspaces/$id$suffix"

    fun close() {
        client.dispatcher.cancelAll()
        client.connectionPool.evictAll()
    }
}
