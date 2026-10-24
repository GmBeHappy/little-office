/// A presentation completion must still own the latest server authorization, even in the same room.
public struct CaptureAuthorization {
  private var revision: UInt64 = 0
  private var enabled = false
  public init() {}
  public mutating func begin(enabled: Bool) -> UInt64 {
    revision &+= 1
    self.enabled = enabled
    return revision
  }
  public func isCurrent(_ request: UInt64, enabled: Bool) -> Bool {
    revision == request && self.enabled == enabled
  }
}
