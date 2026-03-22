import AVFoundation
import Foundation

/// Fades out the current ambient clip, then fades in the next WAV from `audio/` (looping).
final class AudioTransitionController {
    private let fadeDuration: TimeInterval = 0.28
    private var current: AVAudioPlayer?
    private var lastStartedFileName: String?
    private var interruptionObserver: NSObjectProtocol?

    init() {
        configureSession()
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] note in
            self?.handleInterruption(note)
        }
    }

    deinit {
        if let interruptionObserver {
            NotificationCenter.default.removeObserver(interruptionObserver)
        }
        current?.stop()
    }

    private func configureSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            // Playback may still succeed.
        }
    }

    private func handleInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue)
        else { return }

        switch type {
        case .began:
            current?.pause()
        case .ended:
            if let optionsValue = info[AVAudioSessionInterruptionOptionKey] as? UInt {
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                if options.contains(.shouldResume) {
                    current?.play()
                }
            }
        @unknown default:
            break
        }
    }

    /// `fileName` includes extension (e.g. `4-176914-A-23.wav`). `nil` fades out only.
    func transitionToAudio(named fileName: String?, bundle: Bundle = .main) {
        if let fileName, fileName == lastStartedFileName, current?.isPlaying == true {
            return
        }
        lastStartedFileName = fileName

        let outgoing = current

        if let outgoing {
            outgoing.setVolume(0, fadeDuration: fadeDuration)
            DispatchQueue.main.asyncAfter(deadline: .now() + fadeDuration) { [weak self] in
                self?.finishTransition(stopping: outgoing, nextFileName: fileName, bundle: bundle)
            }
        } else {
            finishTransition(stopping: nil, nextFileName: fileName, bundle: bundle)
        }
    }

    private func finishTransition(stopping outgoing: AVAudioPlayer?, nextFileName: String?, bundle: Bundle) {
        outgoing?.stop()
        if current === outgoing {
            current = nil
        }

        guard let nextFileName else {
            lastStartedFileName = nil
            return
        }
        guard let url = urlForAudio(named: nextFileName, bundle: bundle) else { return }

        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.numberOfLoops = -1
            player.volume = 0
            player.prepareToPlay()
            player.play()
            player.setVolume(1, fadeDuration: fadeDuration)
            current = player
        } catch {
            // Missing or corrupt file — remain silent.
        }
    }

    private func urlForAudio(named fileName: String, bundle: Bundle) -> URL? {
        let name = (fileName as NSString).deletingPathExtension
        let ext = (fileName as NSString).pathExtension
        let extOrWav = ext.isEmpty ? "wav" : ext
        return bundle.url(forResource: name, withExtension: extOrWav, subdirectory: "audio")
            ?? bundle.url(forResource: name, withExtension: extOrWav)
    }
}
