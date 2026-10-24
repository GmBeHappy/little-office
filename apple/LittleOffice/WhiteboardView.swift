import LittleOfficeKit
import SwiftUI
import WebKit

@MainActor
final class BoardDownload: ObservableObject {
  @Published var loading = true
  @Published var error = ""
  @Published var exported: URL?
  weak var webView: WKWebView?
  @Published var closedByEditor = false
  func canClose() async -> Bool {
    guard let webView else { return true }
    // The web editor owns dirty/in-flight state and its beforeunload protection.
    do {
      return try await webView.evaluateJavaScript(
        "window.dispatchEvent(new Event(\"beforeunload\", {cancelable:true}))") as? Bool ?? false
    } catch { return false }
  }
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
    UUID().uuidString, isDirectory: true)
  func cleanup() {
    try? FileManager.default.removeItem(at: directory)
    exported = nil
  }
}
struct WhiteboardPanel: View {
  let api: OfficeAPI
  let workspaceId: String
  let close: () -> Void
  @State private var confirmClose = false
  @StateObject private var download = BoardDownload()
  var body: some View {
    ZStack {
      WhiteboardView(api: api, workspaceId: workspaceId, download: download)
      if download.loading { ProgressView("Opening whiteboard…").padding().glassEffect() }
    }.safeAreaInset(edge: .bottom) {
      if !download.error.isEmpty {
        Text(download.error).foregroundStyle(.red).padding().background(.regularMaterial)
      }
      if let url = download.exported {
        ShareLink("Save or share export", item: url).padding().buttonStyle(.glass)
      }
    }.interactiveDismissDisabled()
      .toolbar {
        Button("Done") {
          Task { if await download.canClose() { close() } else { confirmClose = true } }
        }
      }
      .alert("Discard unsaved whiteboard changes?", isPresented: $confirmClose) {
        Button("Keep editing", role: .cancel) {}
        Button("Discard and close", role: .destructive) { close() }
      } message: {
        Text(
          "Some changes may still be uploading. Wait for saving to finish, or close without saving them."
        )
      }
      .onChange(of: download.closedByEditor) { _, closed in if closed { close() } }
      .onDisappear { download.cleanup() }
  }
}
#if os(macOS)
  typealias PlatformViewRepresentable = NSViewRepresentable
#else
  typealias PlatformViewRepresentable = UIViewRepresentable
#endif
struct WhiteboardView: PlatformViewRepresentable {
  let api: OfficeAPI
  let workspaceId: String
  let download: BoardDownload
  func makeCoordinator() -> Coordinator {
    Coordinator(origin: api.origin, workspaceId: workspaceId, download: download)
  }
  #if os(macOS)
    func makeNSView(context: Context) -> WKWebView { makeWebView(context) }
    func updateNSView(_ view: WKWebView, context: Context) {}
    static func dismantleNSView(_ view: WKWebView, coordinator: Coordinator) { clean(view) }
  #else
    func makeUIView(context: Context) -> WKWebView { makeWebView(context) }
    func updateUIView(_ view: WKWebView, context: Context) {}
    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) { clean(view) }
  #endif
  private func makeWebView(_ context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    configuration.userContentController.add(context.coordinator, name: "whiteboardClose")
    configuration.userContentController.addUserScript(
      WKUserScript(
        source:
          "window.addEventListener('littleoffice-whiteboard-closed', () => window.webkit.messageHandlers.whiteboardClose.postMessage(null));",
        injectionTime: .atDocumentStart, forMainFrameOnly: true))
    let view = WKWebView(frame: .zero, configuration: configuration)
    view.navigationDelegate = context.coordinator
    view.uiDelegate = context.coordinator
    download.webView = view
    guard let credential = api.credential, api.origin.host != nil else {
      download.error = "Sign in again to open the whiteboard."
      download.loading = false
      return view
    }
    let value =
      credential.token.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
      ?? credential.token
    let cookieHeader =
      "\(credential.cookieName)=\(value); Path=/; HttpOnly"
      + (api.origin.scheme == "https" ? "; Secure" : "")
    // Omitting Domain creates a host-only cookie, including during storage redirects.
    guard
      let cookie = HTTPCookie.cookies(
        withResponseHeaderFields: ["Set-Cookie": cookieHeader], for: api.origin
      ).first
    else {
      download.error = "Cannot establish whiteboard session."
      download.loading = false
      return view
    }
    let url = URL(string: "/w/\(workspaceId)/whiteboard", relativeTo: api.origin)!.absoluteURL
    Task { @MainActor in
      await configuration.websiteDataStore.httpCookieStore.setCookie(cookie)
      if !context.coordinator.closed { view.load(URLRequest(url: url)) }
    }
    return view
  }
  private static func clean(_ view: WKWebView) {
    if let coordinator = view.navigationDelegate as? Coordinator {
      coordinator.closed = true
      coordinator.activeDownloads.forEach { $0.cancel { _ in } }
      coordinator.download.cleanup()
    }
    view.stopLoading()
    view.navigationDelegate = nil
    view.uiDelegate = nil
    view.configuration.userContentController.removeAllScriptMessageHandlers()
    view.configuration.userContentController.removeAllUserScripts()
    view.loadHTMLString("", baseURL: nil)
    view.configuration.websiteDataStore.removeData(
      ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast
    ) {}
  }
  final class Coordinator: NSObject, WKNavigationDelegate, WKDownloadDelegate, WKUIDelegate,
    WKScriptMessageHandler
  {
    let origin: URL
    let workspaceId: String
    let download: BoardDownload
    var closed = false
    var activeDownloads: [WKDownload] = []
    private var destinations: [ObjectIdentifier: URL] = [:]
    init(origin: URL, workspaceId: String, download: BoardDownload) {
      self.origin = origin
      self.workspaceId = workspaceId
      self.download = download
    }
    func userContentController(
      _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
    ) {
      guard !closed, message.name == "whiteboardClose", message.frameInfo.isMainFrame,
        let url = message.frameInfo.request.url,
        url.scheme == origin.scheme, url.host == origin.host, url.port == origin.port,
        url.path == "/w/\(workspaceId)/whiteboard"
      else { return }
      download.closedByEditor = true
    }
    func webView(
      _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
      for action: WKNavigationAction, windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
      // Reuse the scoped view so target=_blank exports pass the same navigation policy.
      if !closed, action.targetFrame == nil { webView.load(action.request) }
      return nil
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      download.loading = false
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
      failed(error)
    }
    func webView(
      _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
      withError error: Error
    ) { failed(error) }
    private func failed(_ error: Error) {
      if !closed {
        download.loading = false
        download.error = error.localizedDescription
      }
    }
    func webView(
      _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
      decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
      guard !closed, let url = action.request.url else {
        decisionHandler(.cancel)
        return
      }
      let sameOrigin =
        url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port
      let blob = url.absoluteString.hasPrefix(
        "blob:" + origin.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
          + "/")
      if blob
        || (sameOrigin && url.path.hasPrefix("/api/workspaces/\(workspaceId)/whiteboard/files/"))
      {
        decisionHandler(.download)
      } else {
        decisionHandler(sameOrigin || url.absoluteString == "about:blank" ? .allow : .cancel)
      }
    }
    func webView(
      _ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload
    ) { receive(download) }
    func webView(
      _ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload
    ) { receive(download) }
    private func receive(_ value: WKDownload) {
      activeDownloads.append(value)
      value.delegate = self
    }
    func download(
      _ value: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
      completionHandler: @escaping (URL?) -> Void
    ) {
      guard !closed else {
        completionHandler(nil)
        return
      }
      do {
        try FileManager.default.createDirectory(
          at: download.directory, withIntermediateDirectories: true)
        let name = URL(fileURLWithPath: suggestedFilename).lastPathComponent
        let destination = download.directory.appendingPathComponent(UUID().uuidString + "-" + name)
        destinations[ObjectIdentifier(value)] = destination
        completionHandler(destination)
      } catch {
        failed(error)
        completionHandler(nil)
      }
    }
    func download(
      _ value: WKDownload, willPerformHTTPRedirection response: HTTPURLResponse,
      newRequest request: URLRequest, decisionHandler: @escaping (WKDownload.RedirectPolicy) -> Void
    ) {
      // Downloads start only at this workspace's authorized file route. S3 receives no bearer header; the cookie is scoped to the canonical host.
      let url = request.url
      decisionHandler(
        !closed && url?.scheme == "https" && url?.user == nil && url?.password == nil
          && request.value(forHTTPHeaderField: "Authorization") == nil ? .allow : .cancel)
    }
    func downloadDidFinish(_ value: WKDownload) {
      if !closed { download.exported = destinations.removeValue(forKey: ObjectIdentifier(value)) }
      activeDownloads.removeAll { $0 === value }
    }
    func download(_ value: WKDownload, didFailWithError error: Error, resumeData: Data?) {
      if let url = destinations.removeValue(forKey: ObjectIdentifier(value)) {
        try? FileManager.default.removeItem(at: url)
      }
      activeDownloads.removeAll { $0 === value }
      failed(error)
    }
  }
}
