import UIKit

/// Default soft impact on each page snap; optional JSON override per paragraph.
final class HapticsController {
    private let soft = UIImpactFeedbackGenerator(style: .soft)
    private let light = UIImpactFeedbackGenerator(style: .light)
    private let medium = UIImpactFeedbackGenerator(style: .medium)
    private let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let notification = UINotificationFeedbackGenerator()

    init() {
        soft.prepare()
        notification.prepare()
    }

    /// Called when the reader snaps to a new page. If `hapticOverride` is set, it replaces the default soft tick.
    func playTransition(hapticOverride: HapticKind?) {
        if let hapticOverride {
            playMapped(hapticOverride)
        } else {
            soft.impactOccurred()
        }
    }

    private func playMapped(_ kind: HapticKind) {
        switch kind {
        case .light:
            light.impactOccurred()
        case .medium:
            medium.impactOccurred()
        case .heavy:
            heavy.impactOccurred()
        case .soft:
            soft.impactOccurred()
        case .rigid:
            rigid.impactOccurred()
        case .success:
            notification.notificationOccurred(.success)
        case .warning:
            notification.notificationOccurred(.warning)
        case .error:
            notification.notificationOccurred(.error)
        }
    }
}
