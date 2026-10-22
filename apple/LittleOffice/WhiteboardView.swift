import LittleOfficeKit
import SwiftUI
import WebKit

#if os(macOS)
  typealias PlatformViewRepresentable = NSViewRepresentable
#else
  typealias PlatformViewRepresentable = UIViewRepresentable
#endif
struct WhiteboardView: PlatformViewRepresentable {
  let api: OfficeAPI
  let workspaceId: String
  func makeCoordinator() -> Coordinator { Coordinator(origin: api.origin) }
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
    let view = WKWebView(frame: .zero, configuration: configuration)
    view.navigationDelegate = context.coordinator
    guard let credential = api.credential, let host = api.origin.host else { return view }
    let properties: [HTTPCookiePropertyKey: Any] = [
      .name: credential.cookieName,
      .value: credential.token.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
        ?? credential.token, .domain: host, .path: "/", .secure: api.origin.scheme == "https",
      HTTPCookiePropertyKey("HttpOnly"): true,
    ]
    guard let cookie = HTTPCookie(properties: properties) else { return view }
    let url = URL(string: "/w/\(workspaceId)/whiteboard", relativeTo: api.origin)!.absoluteURL
    Task { @MainActor in
      await configuration.websiteDataStore.httpCookieStore.setCookie(cookie)
      if !context.coordinator.closed { view.load(URLRequest(url: url)) }
    }
    return view
  }
  private static func clean(_ view: WKWebView) {
    (view.navigationDelegate as? Coordinator)?.closed = true
    view.stopLoading()
    view.loadHTMLString("", baseURL: nil)
    view.navigationDelegate = nil
    view.configuration.websiteDataStore.removeData(
      ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast
    ) {}
  }
  final class Coordinator: NSObject, WKNavigationDelegate {
    let origin: URL
    var closed = false
    init(origin: URL) { self.origin = origin }
    func webView(
      _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
      decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
      guard let url = action.request.url else {
        decisionHandler(.cancel)
        return
      }
      let sameOrigin =
        url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port
      decisionHandler(
        !closed && (sameOrigin || url.absoluteString == "about:blank") ? .allow : .cancel)
    }
  }
}
