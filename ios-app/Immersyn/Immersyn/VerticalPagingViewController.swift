import SwiftUI
import UIKit

/// Full-story `UITextView` scroll; ambient audio follows the **first sentence visible at the top** of the screen.
/// Mapped audio: cyan-ish underline. Mapped haptics: orange underline (haptic wins if both apply to the same range).
final class ImmersiveScrollTextViewController: UIViewController, UITextViewDelegate {
    weak var viewModel: ReaderViewModel?

    private let textView = UITextView()

    private var lastThrottleTime: CFTimeInterval = 0
    private var didFireInitialStart = false
    private var appliedStoryPlainText: String?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.07, green: 0.07, blue: 0.07, alpha: 1)

        textView.translatesAutoresizingMaskIntoConstraints = false
        textView.backgroundColor = .clear
        textView.textColor = UIColor(white: 0.92, alpha: 1)
        textView.isEditable = false
        textView.isSelectable = true
        textView.showsVerticalScrollIndicator = true
        textView.textContainer.lineFragmentPadding = 0
        if let desc = UIFontDescriptor.preferredFontDescriptor(withTextStyle: .body).withDesign(.serif) {
            textView.font = UIFont(descriptor: desc, size: 22)
        } else {
            textView.font = .systemFont(ofSize: 22)
        }
        textView.textContainerInset = UIEdgeInsets(top: 28, left: 20, bottom: 28, right: 20)
        textView.delegate = self
        view.addSubview(textView)

        NSLayoutConstraint.activate([
            textView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            textView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            textView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            textView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        applyStoryTextIfNeeded()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if !didFireInitialStart,
           textView.bounds.height > 0,
           let vm = viewModel,
           !vm.story.displayText.isEmpty {
            didFireInitialStart = true
            let idx = characterIndexAtTopOfVisibleText()
            vm.startIfNeeded(characterIndexAtTopOfScreen: idx)
        }
    }

    func configureFromViewModel() {
        applyStoryTextIfNeeded()
    }

    private func applyStoryTextIfNeeded() {
        guard let vm = viewModel else { return }
        let plain = vm.story.displayText
        if plain.isEmpty {
            textView.attributedText = nil
            textView.text = ""
            appliedStoryPlainText = nil
            return
        }
        if appliedStoryPlainText == plain { return }
        appliedStoryPlainText = plain
        textView.attributedText = makeAttributedStory(from: vm)
    }

    private func makeAttributedStory(from vm: ReaderViewModel) -> NSAttributedString {
        let plain = vm.story.displayText
        let mutable = NSMutableAttributedString(string: plain)
        let len = (plain as NSString).length
        guard len > 0 else { return mutable }

        let font = textView.font ?? .systemFont(ofSize: 22)
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.lineSpacing = 9
        paragraphStyle.lineBreakMode = .byWordWrapping

        mutable.addAttributes([
            .font: font,
            .foregroundColor: UIColor(white: 0.92, alpha: 1),
            .paragraphStyle: paragraphStyle,
        ], range: NSRange(location: 0, length: len))

        let audioUnderlineColor = UIColor(red: 0.42, green: 0.78, blue: 0.98, alpha: 1)
        let hapticUnderlineColor = UIColor(red: 1, green: 0.62, blue: 0.38, alpha: 1)

        for chunk in vm.story.chunks {
            let hasAudio = chunk.audioFileName != nil
            let hasHaptic = chunk.hapticOverride != nil
            guard hasAudio || hasHaptic else { continue }

            var r = chunk.range
            if r.location >= len { continue }
            if NSMaxRange(r) > len {
                r.length = len - r.location
            }
            guard r.length > 0 else { continue }

            if hasHaptic {
                mutable.addAttributes([
                    .underlineStyle: NSUnderlineStyle.single.rawValue,
                    .underlineColor: hapticUnderlineColor,
                ], range: r)
            } else if hasAudio {
                mutable.addAttributes([
                    .underlineStyle: NSUnderlineStyle.single.rawValue,
                    .underlineColor: audioUnderlineColor,
                ], range: r)
            }
        }

        return mutable
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        let t = CACurrentMediaTime()
        if t - lastThrottleTime < 0.045 { return }
        lastThrottleTime = t
        processTopOfScreenScroll()
    }

    private func processTopOfScreenScroll() {
        guard let viewModel else { return }
        let idx = characterIndexAtTopOfVisibleText()
        viewModel.userScrolledTo(characterIndex: idx)
    }

    /// UTF-16 index of content at the **top** visible line (first sentence on screen).
    private func characterIndexAtTopOfVisibleText() -> Int {
        let len = (textView.text as NSString?)?.length ?? 0
        guard len > 0 else { return 0 }

        let layoutManager = textView.layoutManager
        let textContainer = textView.textContainer
        layoutManager.ensureLayout(for: textContainer)

        let inset = textView.textContainerInset
        let offset = textView.contentOffset
        let bounds = textView.bounds

        // Top sliver of the visible area in text-container coordinates (TextKit space).
        let lineHeight = max(ceil(textView.font?.lineHeight ?? 24), 1)
        let rect = CGRect(
            x: offset.x + inset.left,
            y: offset.y + inset.top,
            width: max(1, bounds.width - inset.left - inset.right),
            height: lineHeight
        )

        let glyphRange = layoutManager.glyphRange(forBoundingRect: rect, in: textContainer)
        let idx: Int
        if glyphRange.length == 0 {
            let origin = CGPoint(x: rect.midX, y: rect.minY + 1)
            let gi = layoutManager.glyphIndex(for: origin, in: textContainer, fractionOfDistanceThroughGlyph: nil)
            idx = layoutManager.characterIndexForGlyph(at: gi)
        } else {
            let charRange = layoutManager.characterRange(forGlyphRange: glyphRange, actualGlyphRange: nil)
            idx = charRange.location
        }
        return min(max(0, idx), max(0, len - 1))
    }
}

struct ImmersiveScrollReader: UIViewControllerRepresentable {
    @ObservedObject var viewModel: ReaderViewModel

    func makeUIViewController(context: Context) -> ImmersiveScrollTextViewController {
        let vc = ImmersiveScrollTextViewController()
        vc.viewModel = viewModel
        return vc
    }

    func updateUIViewController(_ vc: ImmersiveScrollTextViewController, context: Context) {
        vc.viewModel = viewModel
        vc.configureFromViewModel()
    }
}
