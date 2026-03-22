import SwiftUI

@main
struct ImmersynApp: App {
    @StateObject private var viewModel: ReaderViewModel

    init() {
        let story = (try? StoryLoader.loadImmersiveStory()) ?? ImmersiveStory(displayText: "", chunks: [])
        _viewModel = StateObject(wrappedValue: ReaderViewModel(story: story))
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if viewModel.story.displayText.isEmpty {
                    ZStack {
                        Color(red: 0.07, green: 0.07, blue: 0.07).ignoresSafeArea()
                        Text("Unable to load story.")
                            .font(.system(size: 17, design: .serif))
                            .foregroundStyle(Color(white: 0.6))
                    }
                } else {
                    ImmersiveReaderView(viewModel: viewModel)
                }
            }
            .preferredColorScheme(.dark)
        }
    }
}
