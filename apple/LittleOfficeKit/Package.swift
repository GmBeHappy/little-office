// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "LittleOfficeKit", platforms: [.iOS("26.0"), .macOS("26.0")],
  products: [.library(name: "LittleOfficeKit", targets: ["LittleOfficeKit"])],
  targets: [
    .target(name: "LittleOfficeKit"),
    .testTarget(
      name: "LittleOfficeKitTests", dependencies: ["LittleOfficeKit"],
      resources: [.copy("Fixtures")]),
  ],
  swiftLanguageModes: [.v5])
