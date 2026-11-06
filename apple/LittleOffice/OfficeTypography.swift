import SwiftUI

extension View {
  func officeFont(_ style: Font.TextStyle, size: CGFloat? = nil, weight: Font.Weight = .regular,
                  design: Font.Design = .default) -> some View {
    modifier(OfficeFont(style: style, size: size, weight: weight, design: design))
  }
}

enum OfficeThaiFont {
  static let regular = "IBMPlexSansThai-Regular"
  static let bold = "IBMPlexSansThai-Bold"
  static func name(_ weight: Font.Weight) -> String {
    switch weight {
    case .bold, .heavy, .black: return bold
    case .semibold: return "IBMPlexSansThai-SemiBold"
    case .medium: return "IBMPlexSansThai-Medium"
    default: return regular
    }
  }
}

private struct OfficeFont: ViewModifier {
  @Environment(\.locale) private var locale
  let style: Font.TextStyle
  let size: CGFloat?
  let weight: Font.Weight
  let design: Font.Design

  func body(content: Content) -> some View {
    if locale.language.languageCode?.identifier == "th" {
      content.font(.custom(OfficeThaiFont.name(weight), size: size ?? pointSize, relativeTo: style))
    } else if let size {
      content.font(.system(size: size, weight: weight, design: design))
    } else {
      content.font(.system(style, design: design, weight: weight))
    }
  }

  private var pointSize: CGFloat {
    switch style {
    case .largeTitle: return 34
    case .title: return 28
    case .title2: return 22
    case .title3: return 20
    case .headline, .body: return 17
    case .callout: return 16
    case .subheadline: return 15
    case .footnote: return 13
    case .caption: return 12
    case .caption2: return 11
    @unknown default: return 17
    }
  }
}
