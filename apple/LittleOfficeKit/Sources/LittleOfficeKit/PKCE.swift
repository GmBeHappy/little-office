import CryptoKit
import Foundation
import Security

public struct PKCE {
  public let verifier: String
  public let state: String
  public var challenge: String { Data(SHA256.hash(data: Data(verifier.utf8))).base64URL }
  public init() throws {
    func random() throws -> String {
      var bytes = [UInt8](repeating: 0, count: 32)
      guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
        throw APIError(status: 0, message: "Unable to secure sign-in. Try again.")
      }
      return Data(bytes).base64URL
    }
    verifier = try random()
    state = try random()
  }
  public func code(from callback: URL) throws -> String {
    let parts = URLComponents(url: callback, resolvingAgainstBaseURL: false)
    guard callback.scheme == "littleoffice", callback.host == "auth",
      parts?.queryItems?.first(where: { $0.name == "state" })?.value == state,
      let code = parts?.queryItems?.first(where: { $0.name == "code" })?.value, code.count == 43
    else { throw APIError(status: 0, message: "Invalid sign-in response. Start again.") }
    return code
  }
}
extension Data {
  fileprivate var base64URL: String {
    base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(
      of: "/", with: "_"
    ).replacingOccurrences(of: "=", with: "")
  }
}

public enum CredentialStore {
  public static func save(_ credential: Credential, origin: URL) throws {
    let data = try JSONEncoder().encode(credential)
    let key: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "LittleOffice.session",
      kSecAttrAccount as String: origin.absoluteString,
    ]
    SecItemDelete(key as CFDictionary)
    var attributes = key
    attributes[kSecValueData as String] = data
    attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    let status = SecItemAdd(attributes as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw APIError(status: Int(status), message: "Unable to save sign-in in Keychain.")
    }
  }
  public static func load(origin: URL) -> Credential? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "LittleOffice.session",
      kSecAttrAccount as String: origin.absoluteString, kSecReturnData as String: true,
    ]
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data
    else { return nil }
    return try? JSONDecoder().decode(Credential.self, from: data)
  }
  public static func delete(origin: URL) {
    SecItemDelete(
      [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "LittleOffice.session",
        kSecAttrAccount as String: origin.absoluteString,
      ] as CFDictionary)
  }
}
