import Foundation

public enum OIDCInput {
  public static func body(issuer: String, clientId: String, domain: String, clientSecret: String)
    -> [String: String]
  {
    var fields = ["issuer": issuer, "clientId": clientId, "domain": domain]
    // The API treats omission as preserving the saved secret; an empty string is invalid.
    if !clientSecret.isEmpty { fields["clientSecret"] = clientSecret }
    return fields
  }
}
