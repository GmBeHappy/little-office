package com.littleoffice.android

import android.annotation.SuppressLint
import android.net.Uri
import android.webkit.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import java.io.ByteArrayInputStream

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun Whiteboard(office: OfficeSession, modifier: Modifier = Modifier) {
    val origin = office.api.origin
    val page = "$origin/w/${office.workspace.id}/whiteboard"
    val credential = office.api.credential ?: return
    val closed = remember { java.util.concurrent.atomic.AtomicBoolean(false) }
    fun allowed(url: String) = runCatching {
        val uri = Uri.parse(url)
        val base = Uri.parse(origin)
        uri.scheme == base.scheme &&
            uri.host == base.host &&
            uri.port == base.port &&
            uri.userInfo == null
    }
        .getOrDefault(false)
    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                settings.cacheMode = WebSettings.LOAD_NO_CACHE
                settings.setSupportMultipleWindows(false)
                CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
                webViewClient =
                    object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(
                            view: WebView,
                            request: WebResourceRequest,
                        ): Boolean =
                            closed.get() ||
                                !allowed(request.url.toString()) ||
                                (request.isForMainFrame && request.url.path != Uri.parse(page).path)

                        override fun shouldInterceptRequest(
                            view: WebView,
                            request: WebResourceRequest,
                        ): WebResourceResponse? =
                            if (closed.get() || !allowed(request.url.toString()))
                                WebResourceResponse(
                                    "text/plain",
                                    "UTF-8",
                                    ByteArrayInputStream(ByteArray(0)),
                                )
                            else null

                        override fun onReceivedSslError(
                            view: WebView,
                            handler: SslErrorHandler,
                            error: android.net.http.SslError,
                        ) {
                            handler.cancel()
                        }
                    }
                val cookie =
                    "${credential.getString("cookieName")}=${Uri.encode(credential.getString("token"))}; Path=/; HttpOnly; SameSite=Strict${if (origin.startsWith("https:")) "; Secure" else ""}"
                CookieManager.getInstance().removeAllCookies {
                    CookieManager.getInstance().setCookie(origin, cookie) {
                        if (!closed.get()) loadUrl(page)
                    }
                }
            }
        },
        onRelease = { view ->
            closed.set(true)
            view.stopLoading()
            view.loadUrl("about:blank")
            view.clearHistory()
            view.clearCache(true)
            CookieManager.getInstance().removeAllCookies(null)
            WebStorage.getInstance().deleteAllData()
            view.destroy()
        },
    )
}
