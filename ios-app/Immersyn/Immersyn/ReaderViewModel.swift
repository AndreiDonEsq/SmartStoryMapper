import Combine
import Foundation

@MainActor
final class ReaderViewModel: ObservableObject {
    let story: ImmersiveStory

    /// Sentence that contains the **top visible** text (first line on screen).
    @Published private(set) var activeSentenceIndex: Int = 0

    private let audio = AudioTransitionController()
    private let haptics = HapticsController()
    private var didRunInitial = false

    init(story: ImmersiveStory) {
        self.story = story
    }

    /// Called from scroll: UTF-16 index from `UITextView` / `UITextInput`.
    func userScrolledTo(characterIndex: Int) {
        guard !story.chunks.isEmpty else { return }
        let next = story.sentenceIndex(containingCharacterIndex: characterIndex)
        guard next != activeSentenceIndex else { return }
        applySentenceIndex(next)
    }

    /// First line / initial audio once the text view has laid out (top-of-screen sentence).
    func startIfNeeded(characterIndexAtTopOfScreen: Int) {
        guard !didRunInitial, !story.chunks.isEmpty else { return }
        didRunInitial = true
        let next = story.sentenceIndex(containingCharacterIndex: characterIndexAtTopOfScreen)
        applySentenceIndex(next)
    }

    private func applySentenceIndex(_ next: Int) {
        activeSentenceIndex = next
        let chunk = story.chunks[next]
        audio.transitionToAudio(named: chunk.audioFileName)
        if let h = chunk.hapticOverride {
            haptics.playTransition(hapticOverride: h)
        }
    }
}
