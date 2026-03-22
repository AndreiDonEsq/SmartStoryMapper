import SwiftUI

struct ImmersiveReaderView: View {
    @ObservedObject var viewModel: ReaderViewModel

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color(red: 0.07, green: 0.07, blue: 0.07)
                ImmersiveScrollReader(viewModel: viewModel)
                    .frame(width: geo.size.width, height: geo.size.height)
            }
        }
        .ignoresSafeArea()
    }
}
