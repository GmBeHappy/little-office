#!/usr/bin/env swift
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import Foundation

// The same four-tile mark and colors as components/Brand.tsx and app/globals.css.
let output = URL(fileURLWithPath: CommandLine.arguments.count > 1
  ? CommandLine.arguments[1] : "apple/LittleOffice/Assets.xcassets/AppIcon.appiconset")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
func color(_ hex: Int) -> CGColor {
  CGColor(srgbRed: CGFloat((hex >> 16) & 255) / 255,
    green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
}
func render(_ pixels: Int, filename: String) throws {
  let context = CGContext(data: nil, width: pixels, height: pixels, bitsPerComponent: 8,
    bytesPerRow: pixels * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
  let scale = CGFloat(pixels) / 1024
  context.scaleBy(x: scale, y: scale)
  context.setFillColor(color(0xFDFDF9))
  context.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
  context.translateBy(x: 512, y: 512)
  context.rotate(by: 8 * .pi / 180)
  for row in 0..<2 {
    for column in 0..<2 {
      context.setFillColor(color(row == column ? 0xA2AD83 : 0x72855E))
      context.addPath(CGPath(roundedRect: CGRect(x: -270 + column * 300, y: -270 + row * 300,
        width: 240, height: 240), cornerWidth: 20, cornerHeight: 20, transform: nil))
      context.fillPath()
    }
  }
  let destination = CGImageDestinationCreateWithURL(output.appendingPathComponent(filename) as CFURL,
    UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(destination, context.makeImage()!, nil)
  precondition(CGImageDestinationFinalize(destination), "Could not write app icon")
}
var images: [[String: String]] = []
try render(1024, filename: "AppIcon-iOS-1024.png")
images.append(["filename": "AppIcon-iOS-1024.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"])
for size in [16, 32, 128, 256, 512] {
  for scale in [1, 2] {
    let filename = "AppIcon-mac-\(size)@\(scale)x.png"
    try render(size * scale, filename: filename)
    images.append(["filename": filename, "idiom": "mac", "size": "\(size)x\(size)", "scale": "\(scale)x"])
  }
}
let contents: [String: Any] = ["images": images, "info": ["author": "xcode", "version": 1]]
try JSONSerialization.data(withJSONObject: contents, options: [.prettyPrinted, .sortedKeys])
  .write(to: output.appendingPathComponent("Contents.json"))
