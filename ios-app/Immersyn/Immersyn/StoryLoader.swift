import Foundation

enum StoryLoaderError: Error {
    case missingResource(String)
    case invalidUTF8
}

enum StoryLoader {
    /// Full text with `\n\n` between paragraphs, plus sentence chunks aligned with `story_map.json` keys.
    static func loadImmersiveStory(bundle: Bundle = .main) throws -> ImmersiveStory {
        let raw = try loadText(bundle: bundle)
        let map = try loadStoryMap(bundle: bundle)
        let displayText = displayTextForScroll(raw)
        let normalized = displayText.replacingOccurrences(of: "\n", with: " ")

        let pairs = splitSentencesWithRanges(normalized)
        let chunks: [SentenceChunk] = pairs.map { sentence, range in
            let m = map[sentence]
            return SentenceChunk(
                sentenceKey: sentence,
                range: range,
                audioFileName: m?.file,
                hapticOverride: m?.haptic
            )
        }

        return ImmersiveStory(displayText: displayText, chunks: chunks)
    }

    /// Paragraphs joined with `\n\n` (blank-line separation in the reader).
    static func displayTextForScroll(_ raw: String) -> String {
        let paragraphs = splitParagraphs(raw)
        return paragraphs.joined(separator: "\n\n")
    }

    /// Paragraphs: blocks separated by one or more blank lines; internal single newlines become spaces.
    static func splitParagraphs(_ text: String) -> [String] {
        let normalized = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        let blocks = normalized.components(separatedBy: "\n\n")
        return blocks
            .map { block -> String in
                block
                    .split(separator: "\n", omittingEmptySubsequences: true)
                    .map { $0.trimmingCharacters(in: .whitespaces) }
                    .filter { !$0.isEmpty }
                    .joined(separator: " ")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            }
            .filter { $0.count > 5 }
    }

    /// Sentence strings and UTF-16 ranges in `normalized` (same indices as `displayText` with newlines → spaces).
    static func splitSentencesWithRanges(_ normalized: String) -> [(String, NSRange)] {
        let pattern = "(?<=[.!?]) +"
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return []
        }
        let ns = normalized as NSString
        let len = ns.length
        var parts: [(String, NSRange)] = []
        var start = 0

        while start < len {
            let searchRange = NSRange(location: start, length: len - start)
            if let match = regex.firstMatch(in: normalized, options: [], range: searchRange) {
                let segmentRange = NSRange(location: start, length: match.range.location - start)
                let segment = ns.substring(with: segmentRange)
                let trimmed = segment.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmed.count > 5 {
                    parts.append((trimmed, segmentRange))
                }
                start = match.range.location + match.range.length
            } else {
                let tailRange = NSRange(location: start, length: len - start)
                let segment = ns.substring(with: tailRange)
                let trimmed = segment.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmed.count > 5 {
                    parts.append((trimmed, tailRange))
                }
                break
            }
        }

        return parts
    }

    /// Mirrors Kotlin `split(Regex("(?<=[.!?]) +"))` (strings only).
    static func splitSentences(_ text: String) -> [String] {
        let normalized = text.replacingOccurrences(of: "\n", with: " ")
        return splitSentencesWithRanges(normalized).map(\.0)
    }

    private static func loadText(bundle: Bundle) throws -> String {
        guard let url = bundle.url(forResource: "textToMap", withExtension: "txt") else {
            throw StoryLoaderError.missingResource("textToMap.txt")
        }
        return try String(contentsOf: url, encoding: .utf8)
    }

    private static func loadStoryMap(bundle: Bundle) throws -> [String: SoundMapping] {
        guard let url = bundle.url(forResource: "story_map", withExtension: "json") else {
            throw StoryLoaderError.missingResource("story_map.json")
        }
        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        return try decoder.decode([String: SoundMapping].self, from: data)
    }
}
