# Handy: what we learned, and what it means for Phibe's global voice

Source studied: https://github.com/cjpais/Handy (Tauri 2 + Rust + React, MIT). Read from the `main` branch: README, AGENTS.md, and the Rust core (`shortcut/`, `transcription_coordinator.rs`, `actions.rs`, `managers/audio.rs`, `audio_toolkit/`, `overlay.rs`, `clipboard.rs`, `input.rs`, `settings.rs`) plus the recording-overlay front end.
Nothing was cloned or installed; files were only read as text.

## 1. What Handy is
A free, open-source, **offline** speech-to-text desktop app: press a global shortcut anywhere, speak, and the text is pasted into whatever app has focus. "One tool, one job." Windows, macOS, Linux. Models run locally (Whisper family through `transcribe-cpp`, ONNX models such as Parakeet/Moonshine/SenseVoice through `transcribe-rs`), silence is filtered with Silero VAD. Single-instance app that lives in the tray, starts hidden if asked.

## 2. The pipeline (the part to copy conceptually)
```
global shortcut -> TranscriptionCoordinator (state machine) -> TranscribeAction.start
   -> tray state "recording" + overlay + (optional) start chime
   -> AudioRecordingManager opens cpal mic stream -> VAD (Silero) -> 16 kHz samples (+ FFT levels for the overlay)
shortcut released / pressed again -> TranscribeAction.stop
   -> tray "transcribing", overlay spinner, stop chime, unmute system audio
   -> samples -> (live stream finalize OR batch transcribe) -> filler-word removal, custom words, optional LLM post-process
   -> save WAV + history entry -> paste into the focused app -> hide overlay, tray idle
```
Key choices: audio and transcription are async and cancellable (`cancel_generation` counter), WAV is saved in parallel with transcription so a failure can be retried from history, and every exit path hides the overlay and resets the tray (a `FinishGuard` drop guard).

## 3. Global shortcut handling (the hard part)
- Two interchangeable backends behind one handler: Tauri's `global-shortcut` plugin and **`handy-keys`** (own lib, finer control, key-down AND key-up events, captures keys in the UI when rebinding). If handy-keys fails to start it falls back to the Tauri plugin and persists the fallback.
- Hold-to-talk needs real **key-up** events, which the plain Tauri plugin handles worse; that is why the second backend exists.
- **Activation modes:** `Toggle` (press/press), `PushToTalk` (hold, release stops), `HoldOrToggle` (default: a long press is push-to-talk, a short tap latches recording on until the next press; threshold `hold_threshold_ms`).
- **TranscriptionCoordinator** is a single thread with a pure, testable state machine: `Stage = Idle | Recording | Processing`. It debounces (30 ms), defers key-up by a 50 ms grace so X11 auto-repeat does not stop recording, remembers a press that arrives while the previous transcription is still processing (so toggle parity never desyncs), and has a separate **Cancel** binding that is only registered while recording.
- External triggers (CLI flags `--toggle-transcription`, `--cancel`, signals) go through the same coordinator and are never debounced. Remote control uses `tauri-plugin-single-instance`: a second launch sends its args to the running instance and exits.
- Defaults: `ctrl+space` on Windows/Linux, `alt+space` on macOS. Mac `fn`/Globe only works on Apple keyboards. Needs Accessibility permission on macOS.

## 4. Audio capture
- `cpal` input stream (picks the best sample format, handles device unplug via `needs_reopen`), resampled to 16 kHz (`rubato`), optional channel selection.
- **Mic modes:** `AlwaysOn` (stream open all the time, instant start) vs `OnDemand` (open on press; latency). "Lazy stream close" keeps it open briefly after use. A readiness handshake waits for the first real samples before the "ready" cue and chime, so the user never talks into a stream that is not live yet.
- **Mute while recording** with exact restore of the previous system mute state.
- **VAD:** Silero (ONNX) or Earshot, wrapped in a `SmoothedVad` (pre-roll frames, onset frames, hangover) so word starts/ends are not clipped. Policies: Disabled / Offline / Streaming.
- **Visualizer:** `AudioVisualiser` runs an FFT (Hann window, log-spaced buckets, per-bucket noise floor, dB window about -68..-30 calibrated on real mic audio) and emits **16 level buckets**; the overlay shows 9 bars.

## 5. Transcription management
- Model is loaded lazily on first press (kicked off at key-down in parallel with VAD preload), unloaded after an idle timeout (or immediately), never mid-recording.
- Streaming models give live text (`committed` + `tentative`); otherwise batch.
- Post steps: filler-word removal, custom words (fuzzy correction with threshold), language detection, optional Chinese script conversion, optional LLM post-processing (OpenAI-compatible provider, prompts), history with the original WAV.

## 6. Output: pasting into any app
`paste_via_clipboard`: save clipboard, write text, send the paste keystroke with `enigo`, wait, restore clipboard. Methods: Ctrl+V, Ctrl+Shift+V, Shift+Insert, direct typing, external script, none. Linux: `wl-copy`/`wtype` on Wayland, `xdotool` on X11 (and GNOME/KDE special cases). Options: append trailing space, auto-submit key (Enter), clipboard handling, paste delays, "reliable paste". There is a "secure input" warning (password fields on macOS block key injection).

## 7. Overlay (the small recording indicator)
Second Tauri window, transparent, always on top, never focused, created at startup and shown/hidden (cheap). States: recording, streaming, transcribing, processing, plus an "arming" state until mic samples really flow. Styles: None / Minimal pill / Live (streaming text panel). Position top or bottom, on the monitor under the cursor. Windows: forced topmost via Win32, DPI/text-scale aware placement; macOS: `NSPanel`; Linux: **gtk-layer-shell** (limited Wayland support). Levels arrive as events (`mic-level` buckets); the front end smooths them.

## 8. Other product details worth knowing
Tray icon with 3-4 states (idle, recording, transcribing, idle-warning) in light/dark; autostart; start hidden; no-tray mode; debug mode (Ctrl+Shift+D); history of transcripts with audio playback; model downloader with progress; first-run onboarding (model + permissions); i18n for ~20 languages; self-updater; settings persisted with `tauri-plugin-store`; typed IPC with `tauri-specta`; feature freeze (new features go through Discussions).

## 9. What Phibe already has (so the spec starts from facts)
- **Backend STT:** `src/phibe/speech/` with faster-whisper (local), OpenAI Whisper, Deepgram, plus TTS (Kokoro, ElevenLabs, OpenAI, Cartesia). Route `POST /v1/speech/transcribe`, `/v1/speech/health`, `/v1/speech/voice-status`.
- **In-app mic:** `MicButton` + `useSpeech` hook (record in the web view, send to the backend), clap-to-activate detector, Speech settings (dictation, transcription engine, voice replies).
- **Level visualizer:** `VoiceVisualizer.tsx` (the "Speaking" bars) driven by `getVoiceLevel()` in `lib/voiceReply.ts` (AnalyserNode) and `lib/voiceBars.ts`.
- **Desktop shell:** `frontend/src-tauri` (Tauri 2, `tauri-plugin-global-shortcut` already allowed in capabilities), an `overlay.html`, tray, backend spawn/health logic. No global push-to-talk, no paste-into-other-app, no OS-level recording yet.
- Stack difference: Handy is all-Rust (STT in-process); Phibe's brain is a **Python backend** with a Tauri shell.

## 10. Ideas to carry into the Phibe spec (to be decided in the grilling)
1. Global push-to-talk / toggle / hold-or-toggle shortcut with the coordinator state machine (steal the design, not the code).
2. A small recording indicator (Phibe snail) instead of a pill, reusing the floating-button window; levels from the mic.
3. Two outputs for the same capture: **dictate** (paste text into the focused app, Handy-style) and **talk to Phibe** (send to the chat/agent, optionally spoken reply).
4. Local STT in Rust vs calling Phibe's Python faster-whisper (latency, packaging, model downloads).
5. Mic always-on vs on-demand, VAD, wake word later; privacy and the Windows mic indicator.
6. Paste mechanics per OS, secure-input limits, Wayland limits.
7. History with WAV retry; custom words tied to Phibe's memory ("Memorize"); post-processing through Phibe's own models.

## 11. Licence note
Handy is MIT: ideas and even code may be reused with the notice kept. Its name, logo and assets belong to the author. Prefer re-implementing the design; if any code is copied, add the MIT notice to `NOTICE`.
