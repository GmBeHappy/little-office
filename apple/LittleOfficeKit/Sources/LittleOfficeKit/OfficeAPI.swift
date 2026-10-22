import Foundation

public final class OfficeAPI: @unchecked Sendable {
  public let origin: URL
  public let credential: Credential?
  private let session: URLSession
  public init(origin: URL, credential: Credential? = nil) throws {
    guard origin.host != nil, origin.user == nil, origin.password == nil,
      origin.query == nil, origin.fragment == nil, ["", "/"].contains(origin.path),
      origin.scheme == "https"
        || (origin.scheme == "http" && ["localhost", "127.0.0.1"].contains(origin.host!))
    else {
      throw APIError(
        status: 0, message: "Use an HTTPS server address (HTTP is allowed only on localhost).")
    }
    self.origin = origin
    self.credential = credential
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 20
    configuration.httpShouldSetCookies = false
    session = URLSession(
      configuration: configuration, delegate: SameOriginRedirects(origin: origin),
      delegateQueue: nil)
  }
  public func request(_ path: String, method: String = "GET", body: [String: Any]? = nil) throws
    -> URLRequest
  {
    guard path.hasPrefix("/"), !path.hasPrefix("//"),
      let url = URL(string: path, relativeTo: origin)?.absoluteURL,
      url.scheme == origin.scheme, url.host == origin.host, url.port == origin.port
    else { throw APIError(status: 0, message: "Invalid API address.") }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue(
      origin.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")),
      forHTTPHeaderField: "Origin")
    if let credential {
      request.setValue("Bearer \(credential.token)", forHTTPHeaderField: "Authorization")
    }
    if let body {
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    return request
  }
  public func call<T: Decodable>(_ path: String, method: String = "GET", body: [String: Any]? = nil)
    async throws -> T
  {
    let (data, response) = try await session.data(for: request(path, method: method, body: body))
    guard let response = response as? HTTPURLResponse else {
      throw APIError(status: 0, message: "Invalid server response.")
    }
    guard (200..<300).contains(response.statusCode) else {
      let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
      throw APIError(
        status: response.statusCode,
        message: value?["error"] as? String ?? "Request failed. Please try again.")
    }
    return try JSONDecoder().decode(T.self, from: data)
  }
  public func socket(workspaceId: String, takeover: Bool = false) throws -> URLSessionWebSocketTask
  {
    var request = try request(
      "/api/workspaces/\(workspaceId)/office?protocol=1" + (takeover ? "&takeover=1" : ""))
    var url = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!
    url.scheme = origin.scheme == "https" ? "wss" : "ws"
    request.url = url.url
    return session.webSocketTask(with: request)
  }
  public func workspacePath(_ id: String, _ suffix: String) -> String {
    "/api/workspaces/\(id)\(suffix)"
  }
}
private final class SameOriginRedirects: NSObject, URLSessionTaskDelegate {
  let origin: URL
  init(origin: URL) { self.origin = origin }
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    let allowed =
      request.url?.scheme == origin.scheme && request.url?.host == origin.host
      && request.url?.port == origin.port
    completionHandler(allowed ? request : nil)
  }
}
