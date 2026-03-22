import Foundation

/// Optional haptic hint from `story_map.json` (e.g. `"haptic": "success"`).
enum HapticKind: String, Codable, CaseIterable {
    case light
    case medium
    case heavy
    case soft
    case rigid
    case success
    case warning
    case error
}

struct SoundMapping: Codable, Equatable {
    let label: String
    let file: String
    /// Optional; when present, overrides the default transition haptic.
    var haptic: HapticKind?

    enum CodingKeys: String, CodingKey {
        case label
        case file
        case haptic
    }

    init(label: String, file: String, haptic: HapticKind? = nil) {
        self.label = label
        self.file = file
        self.haptic = haptic
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        label = try c.decode(String.self, forKey: .label)
        file = try c.decode(String.self, forKey: .file)
        haptic = try c.decodeIfPresent(HapticKind.self, forKey: .haptic)
    }
}

struct StoryPage: Identifiable, Equatable {
    let id: Int
    let text: String
    let audioFileName: String?
    let hapticOverride: HapticKind?
}

/// One mapped sentence (keys in `story_map.json`) with UTF-16 `NSRange` into `displayText`.
struct SentenceChunk: Equatable {
    /// Trimmed sentence used for `story_map` lookup.
    let sentenceKey: String
    let range: NSRange
    let audioFileName: String?
    let hapticOverride: HapticKind?
}

/// Full scrollable story: `displayText` uses `\n\n` between paragraphs; chunks cover mapped sentences.
struct ImmersiveStory: Equatable {
    let displayText: String
    let chunks: [SentenceChunk]

    /// UTF-16 character index from `UITextView` (same as `NSString`/`NSRange`).
    func sentenceIndex(containingCharacterIndex idx: Int) -> Int {
        guard !chunks.isEmpty else { return 0 }
        if idx < chunks[0].range.location {
            return 0
        }
        for (i, c) in chunks.enumerated() {
            if NSLocationInRange(idx, c.range) {
                return i
            }
            if i + 1 < chunks.count, idx < chunks[i + 1].range.location {
                return i
            }
        }
        return chunks.count - 1
    }
}
