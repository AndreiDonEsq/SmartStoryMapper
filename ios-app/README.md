# Immersyn (iOS)

Native SwiftUI reader under [Immersyn/Immersyn.xcodeproj](Immersyn/Immersyn.xcodeproj). Deployment target: **iOS 17**.

## Bundle parity with Android

Keep these paths aligned with [android-app/app/src/main/assets](../android-app/app/src/main/assets):

| Android (`assets/`) | iOS (`Immersyn/Resources/`) |
|----------------------|-----------------------------|
| `textToMap.txt` | `textToMap.txt` (Copy Bundle Resources) |
| `story_map.json` | `story_map.json` |
| `audio/*.wav` | `audio/*.wav` (folder reference; same filenames as JSON `file`) |

Optional per-sentence haptics: add `"haptic": "light"` (or `medium`, `heavy`, `soft`, `rigid`, `success`, `warning`, `error`) to an entry in `story_map.json`. When omitted, a soft impact fires on each page change after the first screen.

## Text and audio on iOS

- **Display**: The full story is shown in one scrollable view. Paragraphs are separated by **two newlines** (`\n\n`); blocks come from blank-line splits in `textToMap.txt`, with single newlines inside a block folded to spaces.
- **Sentences & mapping**: The same sentence split as Android (`(?<=[.!?]) +` on newline→space text) builds **sentence chunks**. Each chunk’s text is looked up in `story_map.json` for optional **audio** and **haptic** overrides.
- **Top-of-screen audio**: While scrolling, the app resolves the **first line visible at the top** of the text view (via TextKit) and plays the ambient clip for **that** sentence from `story_map.json`.

## Reading / scrolling

Scroll the text freely. Audio updates when the **top visible** sentence changes. Optional haptics from JSON apply when that sentence includes a `haptic` field.

## Build

Open `Immersyn.xcodeproj` in Xcode, select an iPhone simulator, Run. From the CLI (adjust simulator name/OS as needed):

```bash
xcodebuild -scheme Immersyn -destination 'platform=iOS Simulator,name=iPhone 17' build
```
