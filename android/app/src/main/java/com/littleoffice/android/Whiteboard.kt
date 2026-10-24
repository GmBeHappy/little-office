package com.littleoffice.android

import android.annotation.SuppressLint
import android.net.Uri
import android.webkit.*
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.ByteArrayInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun Whiteboard(office: OfficeSession, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var exportBytes by remember { mutableStateOf<ByteArray?>(null) }
    var exportError by remember { mutableStateOf("") }
    val saveFile =
        rememberLauncherForActivityResult(
            ActivityResultContracts.CreateDocument("application/octet-stream")
        ) { uri ->
            office.externalDocument = false
            val bytes = exportBytes
            exportBytes = null
            if (uri != null && bytes != null)
                scope.launch {
                    try {
                        withContext(Dispatchers.IO) {
                            context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                                ?: error("Unable to open export destination.")
                        }
                    } catch (e: Exception) {
                        exportError = "Unable to save whiteboard. Please retry."
                    }
                }
        }
    val origin = office.api.origin
    val page = "$origin/w/${office.workspace.id}/whiteboard"
    val credential = office.api.credential ?: return
    var pendingFile by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    val chosenFiles = remember { java.util.concurrent.ConcurrentHashMap.newKeySet<String>() }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var webView by remember { mutableStateOf<WebView?>(null) }
    val filePicker =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            office.externalDocument = false
            if (uri != null && uri.scheme == "content") chosenFiles.add(uri.toString())
            pendingFile?.onReceiveValue(uri?.takeIf { it.scheme == "content" }?.let { arrayOf(it) })
            pendingFile = null
        }
    var confirmClose by remember { mutableStateOf(false) }
    DisposableEffect(office) {
        office.closeBoard = {
            webView?.evaluateJavascript(
                "(() => { const event = new Event('beforeunload', {cancelable:true}); return window.dispatchEvent(event); })()"
            ) { status ->
                if (status == "true") office.board = false else confirmClose = true
            } ?: run { confirmClose = true }
        }
        onDispose { office.closeBoard = null }
    }
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
    Box(modifier) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
                WebView(context).apply {
                    webView = this
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = false
                    settings.allowContentAccess = true
                    settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    settings.cacheMode = WebSettings.LOAD_NO_CACHE
                    settings.setSupportMultipleWindows(false)
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
                    val closeListener =
                        "if(location.href === ${JSONObject.quote(page)}) window.addEventListener('littleoffice-whiteboard-closed', () => OfficeExport.close());"
                    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT))
                        WebViewCompat.addDocumentStartJavaScript(this, closeListener, setOf(origin))
                    addJavascriptInterface(
                        object {
                            @JavascriptInterface
                            fun close() {
                                post {
                                    if (!closed.get() && this@apply.url == page)
                                        office.board = false
                                }
                            }

                            @JavascriptInterface
                            fun export(data: String, mime: String) {
                                // The bridge accepts bounded document bytes only; it cannot access
                                // credentials or arbitrary files.
                                if (
                                    closed.get() ||
                                        data.length > 14_000_000 ||
                                        mime !in listOf("image/png", "application/json")
                                )
                                    return
                                val bytes =
                                    runCatching {
                                        android.util.Base64.decode(
                                            data,
                                            android.util.Base64.DEFAULT,
                                        )
                                    }
                                        .getOrNull() ?: return
                                if (bytes.size > 10_000_000) return
                                post {
                                    if (!closed.get() && exportBytes == null) {
                                        exportBytes = bytes
                                        office.externalDocument = true
                                        saveFile.launch(
                                            "whiteboard." +
                                                if (mime == "image/png") "png" else "excalidraw"
                                        )
                                    }
                                }
                            }

                            @JavascriptInterface
                            fun failed() {
                                post {
                                    exportError =
                                        "Unable to export whiteboard. Try a smaller board."
                                }
                            }
                        },
                        "OfficeExport",
                    )
                    setDownloadListener { url, _, _, _, _ ->
                        if (
                            !closed.get() &&
                                url.startsWith("blob:$origin/") &&
                                this.url?.let(::allowed) == true
                        ) {
                            val quoted = JSONObject.quote(url)
                            evaluateJavascript(
                                """(async()=>{try{const b=await (await fetch($quoted)).blob();if(b.size>10000000||!['image/png','application/json'].includes(b.type))throw Error();const r=new FileReader();r.onload=()=>OfficeExport.export(r.result.split(',')[1],b.type);r.onerror=()=>OfficeExport.failed();r.readAsDataURL(b)}catch(e){OfficeExport.failed()}})()""",
                                null,
                            )
                        }
                    }
                    webChromeClient =
                        object : WebChromeClient() {
                            override fun onShowFileChooser(
                                view: WebView,
                                callback: ValueCallback<Array<Uri>>,
                                params: FileChooserParams,
                            ): Boolean {
                                if (closed.get() || view.url?.let(::allowed) != true) return false
                                pendingFile?.onReceiveValue(null)
                                pendingFile = callback
                                // Android's document picker grants only the file explicitly chosen
                                // by the user.
                                office.externalDocument = true
                                filePicker.launch(
                                    arrayOf(
                                        "image/*",
                                        "application/json",
                                        "application/octet-stream",
                                    )
                                )
                                return true
                            }
                        }
                    webViewClient =
                        object : WebViewClient() {
                            override fun onPageStarted(
                                view: WebView,
                                url: String?,
                                favicon: android.graphics.Bitmap?,
                            ) {
                                loading = true
                                error = ""
                            }

                            override fun onPageFinished(view: WebView, url: String?) {
                                loading = false
                                if (view.url == page) view.evaluateJavascript(closeListener, null)
                            }

                            override fun onReceivedError(
                                view: WebView,
                                request: WebResourceRequest,
                                failure: WebResourceError,
                            ) {
                                if (request.isForMainFrame) {
                                    loading = false
                                    error =
                                        "Unable to load whiteboard. Check your connection and retry."
                                }
                            }

                            override fun onReceivedHttpError(
                                view: WebView,
                                request: WebResourceRequest,
                                response: WebResourceResponse,
                            ) {
                                if (request.isForMainFrame && response.statusCode >= 400) {
                                    loading = false
                                    error = "Whiteboard unavailable (${response.statusCode})."
                                }
                            }

                            override fun shouldOverrideUrlLoading(
                                view: WebView,
                                request: WebResourceRequest,
                            ): Boolean {
                                val url = request.url
                                val filePrefix =
                                    "/api/workspaces/${office.workspace.id}/whiteboard/files/"
                                if (
                                    !closed.get() &&
                                        request.hasGesture() &&
                                        allowed(url.toString()) &&
                                        url.path?.startsWith(filePrefix) == true
                                ) {
                                    val fileId = url.path!!.removePrefix(filePrefix)
                                    scope.launch {
                                        try {
                                            exportBytes =
                                                office.api.snapshotBytes(
                                                    office.workspace.id,
                                                    fileId,
                                                )
                                            office.externalDocument = true
                                            saveFile.launch("whiteboard-snapshot.png")
                                        } catch (e: Exception) {
                                            exportError =
                                                e.message ?: "Unable to download snapshot."
                                        }
                                    }
                                    return true
                                }
                                if (url.toString().startsWith("blob:$origin/")) return false
                                return closed.get() ||
                                    !allowed(url.toString()) ||
                                    (request.isForMainFrame && url.path != Uri.parse(page).path)
                            }

                            override fun shouldInterceptRequest(
                                view: WebView,
                                request: WebResourceRequest,
                            ): WebResourceResponse? =
                                if (
                                    closed.get() ||
                                        (!allowed(request.url.toString()) &&
                                            request.url.toString() !in chosenFiles)
                                )
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
                office.externalDocument = false
                pendingFile?.onReceiveValue(null)
                pendingFile = null
                chosenFiles.clear()
                webView = null
                exportBytes = null
                view.removeJavascriptInterface("OfficeExport")
                view.stopLoading()
                view.loadUrl("about:blank")
                view.clearHistory()
                view.clearCache(true)
                CookieManager.getInstance().removeAllCookies(null)
                WebStorage.getInstance().deleteAllData()
                view.destroy()
            },
        )
        if (confirmClose)
            AlertDialog(
                onDismissRequest = { confirmClose = false },
                title = { OfficeText("Close whiteboard?") },
                text = {
                    OfficeText(
                        "Some changes may not be saved. Keep this open to reconnect or download an editable copy before closing."
                    )
                },
                confirmButton = {
                    TextButton(onClick = { office.board = false }) {
                        OfficeText("Close whiteboard")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { confirmClose = false }) { OfficeText("Keep open") }
                },
            )
        if (exportError.isNotEmpty())
            AlertDialog(
                onDismissRequest = { exportError = "" },
                text = { OfficeText(exportError) },
                confirmButton = {
                    TextButton(onClick = { exportError = "" }) { OfficeText("Done") }
                },
            )
        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth().align(Alignment.TopCenter))
        if (error.isNotEmpty())
            Surface(Modifier.align(Alignment.Center).padding(20.dp)) {
                Column(Modifier.padding(16.dp)) {
                    OfficeText(error)
                    Button(
                        onClick = {
                            error = ""
                            loading = true
                            webView?.loadUrl(page)
                        }
                    ) {
                        OfficeText("Retry")
                    }
                }
            }
    }
}
