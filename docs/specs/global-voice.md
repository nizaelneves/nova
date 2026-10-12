# Spec: Phibe global voice ("talk to Phibe from anywhere")

Status: **draft for review** (no code written yet). Born from a grilling session on 2026-10-04, modelled on [Handy](https://github.com/cjpais/handy); technical notes in `docs/research/handy-learnings.md`. Visuals: `docs/design/voice/voice-indicator.svg` (option A is the one we build) and `docs/design/voice/voice-badges.svg`.

## 1. Goal

From any app on Windows, press one shortcut, say something, press it again, and the message reaches Phibe's chat, quietly, without bringing Phibe's window to the front. Light, fast, discreet and private (everything local by default).

**Not in v1:** dictating text into other apps (Handy's main job), wake word ("Wake Up Phibe"), Phibe's spoken reply/voice, cloud speech-to-text, macOS/Linux, sending screen context, reviewing the transcript before sending, option B of the indicator (kept for later).

## 2. The experience

1. The user is in any app (e.g. Chrome) and presses the **shortcut**.
2. The **VoiceVisualizer card** appears (version A: a small card with the voice bars, a timer and the key hint; the avatar button wears the listening ring). It says "Listening". The mic opens only now.
3. The user speaks. They press the shortcut again to **send** (or `Esc` to cancel).
4. The card shows "Sending" with the heard text, then goes away. The message appears in the chat's **last active conversation**, and Phibe answers there, in the background. Nothing opens.
5. A `✓` badge appears on the avatar when there is something to look at. Click it (or open Phibe) to read the conversation.

### 2.1 When the user says nothing, or stops talking

| Situation | What happens |
|---|---|
| Nothing said for **7 s** after opening | A **5 s countdown** shows ("Closing in 5…"); speaking again cancels it. At 0 it closes and **discards** (no message). Total 12 s. |
| Something was said, then 7 s of silence | Same countdown. At 0 it does **not send**: the text becomes a **draft** in the composer of the last conversation, and a badge says a draft is waiting. Nothing opens by itself; the user clicks to see it and decides. |
| User presses the shortcut again | Sends **immediately** (never a draft). |
| `Esc` while listening or counting down | Cancels and discards. |
| Safety limit: 30 s of continuous speech | Stops and sends. |
| Taps shorter than 0.4 s | Ignored. |

### 2.2 Where the user sees the result

| Where the user is | Signal |
|---|---|
| Phibe window in front | Notification inside the app; draft sits in the composer |
| Floating button visible | Badge on the button; click opens the chat |
| Only the tray icon | Badge on the tray icon |
| Floating button hidden and the user presses the shortcut | A **smaller card** (Handy-style) appears just for listening/sending, then fades |

Closing the Phibe window never quits: it hides, and the user chooses in Settings whether Phibe stays in the **tray** or as the **floating button**. Quit lives in the tray menu.

## 3. Shortcut

- Toggle behaviour: first press starts, second press sends.
- **Default: `Ctrl+Alt+P`** (P for Phibe); alternative offered: double-tap `Ctrl`; others (`Ctrl+Shift+Space`, `Ctrl+Alt+0`, a function key, a mouse side button) can be recorded in Settings. Candidates were checked for conflicts: `Ctrl+X` (Cut) and `Ctrl+0` (browser zoom reset) are **not** allowed as global shortcuts.
- Settings has a **key recorder** and a **conflict check**: if Windows or another app already owns the combination, the user is told and picks another.
- `Ctrl+Alt` equals `AltGr` on Brazilian (ABNT2) keyboards: test the chosen default on the user's keyboard in M1.
- `Esc` is registered only while listening, so it never steals `Esc` from other apps.

## 4. States

```
Idle --shortcut--> Listening --shortcut--> Sending(send) --done--> Idle
                      |  ^                                    (errors -> badge, then Idle)
        7 s of silence|  |speech again
                      v  |
                   Countdown(5 s) --0 s, nothing said--> Idle (discard)
                      |            --0 s, speech said--> Sending(draft) --done--> Idle
Listening/Countdown --Esc--> Idle        Listening --30 s--> Sending(send)
```

- A new shortcut press during `Sending` starts a new `Listening` in parallel (recordings are independent).
- Pressing the shortcut while Phibe is speaking stops her voice first.
- The state machine is pure and unit-tested (design taken from Handy's `TranscriptionCoordinator`: debounce 30 ms, remember presses while busy, never lose parity).

### 4.1 Detecting speech and silence
Energy-based detector with an **adaptive noise floor** (same principle as the clap detector): speech = level above the floor by a margin for at least 150 ms; "speech seen" needs about 400 ms of voiced audio in total (so a cough or keyboard is not a message); silence timer counts from the last voiced frame. A real VAD model (Silero, as Handy uses) is a later upgrade if noisy rooms cause errors.

## 5. Architecture

| Piece | Where | Does |
|---|---|---|
| Global shortcut + state machine | Rust (`frontend/src-tauri`, new `voice/` module) | Registers the shortcut, runs the states and timers, owns `Esc` |
| Microphone capture | Rust (`cpal`) | Opens only while listening; 16 kHz mono; computes 16 level buckets (FFT) at ~30 Hz; speech/silence detection |
| Indicator window | Tauri window (the avatar's floating window; a small card window when the button is hidden) | Draws version A; receives `voice:state` and `voice:level` events |
| Transcription | Python backend, existing `POST /v1/speech/transcribe` (faster-whisper) | `small` multilingual, auto language (pt/en), model **warmed at key-down**, unloaded after idle; accepts custom words as a prompt |
| Delivery to chat | Main web view (hidden, alive) | Receives `voice:result {text, mode: send \| draft}`; `send` runs the normal chat send on the last conversation; `draft` stores a draft in that conversation's composer |
| Settings | Rust-owned `voice.json` (Tauri store); UI edits through commands | Shortcut, microphone, timings, custom words, on-close behaviour, GPU pack |
| History | Backend (`~/.phibe/voice/`, index + audio) | Recordings and transcripts, retention job on start and daily |

Why this split: the page cannot hear a global shortcut while hidden, and mic capture is more reliable natively; the transcription engine and the brain (Ollama for the LLM, Whisper for speech) already live in Python. Chat history lives in the main web view, so that window must stay alive (hidden), which is why closing hides.

Mascot-agnostic: the indicator draws a ring/badge around **whatever avatar is selected** (`mascot` setting); nothing hard-codes the snail.

## 6. Settings (all UI text in English)

**Settings → Speech**
- Voice shortcut (recorder + conflict check; presets above)
- Microphone (default: Windows default)
- Silence timing: wait 7 s, countdown 5 s
- **Custom words**: one per line (client names, brands); sent to Whisper as a hint; later linked to Memorize
- Voice model: status (`small`, 486 MB), re-download
- "Faster voice with an NVIDIA GPU": optional download of the CUDA libraries (about 0.7 to 1 GB)
- When I close the window: keep Phibe in the **tray** / keep the **floating button**
- Start Phibe with Windows (off by default)

**Data Sources → new tab "Your Data"** (the page gets tabs: Sources, Your Data)
- **Voice history**: list (date, text, play audio, delete), retention **15 / 30 / 90 days / Never** (default 30), "Delete all voice data". Audio is stored compressed (target about 0.2 MB per minute, format decided in M4 after measuring); the transcript is also a normal chat message. The tab is built to receive other personal data later (attachments, memories).

## 7. Errors and badges (no sound)

Shown as a badge on the avatar plus a tooltip with one action (see `voice-badges.svg`): No microphone ("Open settings"), Phibe is not running ("Open Phibe"), Voice model needed ("Download", 486 MB), Could not understand ("Try again"), generic problem. Nothing fails silently; an empty or hallucinated transcript is discarded and reported, never sent.

## 8. First run and packaging

- A clear **welcome step**: microphone permission, shortcut choice with test, and the **voice model download** (486 MB, progress, can be skipped; nothing downloads in the background).
- The model is **not** bundled in the installer (it would add 486 MB to the installer and to every update).
- On the developer's machine `faster-whisper small` is already in the Hugging Face cache.

## 9. Performance budget

| Measure | Target | Measured / note |
|---|---|---|
| Shortcut to card visible | under 200 ms (shows an "arming" state until the first mic samples arrive) | to measure in M1 |
| Transcribing a phrase on CPU (`small`, int8) | at most about 0.6 x the phrase length | **3.25 s for a 6.5 s phrase (0.5 x) on the dev PC** |
| With the GPU pack | under 1 s for a typical phrase | CUDA devices: 1 found; libraries missing (`cublas64_12.dll`) until the pack is installed |
| Model cold load | hidden by loading at key-down | 1.4 s on the dev PC |
| Idle cost (shortcut registered, nothing recording) | about 0 % CPU, under 50 MB extra | to measure in M1 |

Later improvement: transcribe finished sentences while the user is still speaking, so only the last one waits.

## 10. Milestones (each testable; the next starts only after approval; commits only when the user asks)

- **M1: Capture and card.** Rust module, global shortcut with conflict check, state machine with tests, mic capture, level events, card A (and the small card) driven by real levels, no transcription. *Accept:* shortcut opens and closes the card from other apps; levels move with the voice; idle CPU about 0; `Ctrl+Alt+P` tested on the user's ABNT2 keyboard.
- **M2: Transcribe and deliver.** Send the audio to the backend, warm the model on key-down, deliver `send` and `draft` to the last conversation through the hidden main window, close-to-hide behaviour. *Accept:* from Chrome, speak, press again, and the message appears in the chat with an answer, nothing opened.
- **M3: Silence, countdown, badges, errors.** 7 s + 5 s behaviour, discard vs draft, `Esc`, the 30 s limit, all badges and tooltips. *Accept:* each row of section 2.1 and section 7 behaves as written.
- **M4: Settings and Your Data.** Shortcut recorder, microphone, timings, custom words, on-close choice, voice history with retention and "Delete all". *Accept:* retention deletes on schedule; deleting removes audio and text.
- **M5: First run and polish.** Welcome step with model download, optional GPU pack, tray and start-with-Windows, installer. *Accept:* a clean machine reaches a first successful message without leaving the welcome step.

## 10.1 M1 status (built 2026-10-04, awaiting the user's check)

Built: Rust `voice/` module (`machine`, `audio`, `mic`, `mod`), the hidden `voice` card window (own Vite entry `voice.html`), the card UI, `Ctrl+Alt+P` toggle, `Esc` only while listening. **19 Rust tests + 6 front-end tests pass.**
Checked by script on the dev PC: the card never takes focus from the app in front (Notepad stayed foreground), shows on the monitor under the cursor, hides on `Esc` and on the second press; `Esc` is claimed only while listening (probe: not free while listening, free again after); idle CPU of the desktop process 0.02 %, 42 MB; the microphone delivers 16 kHz samples (1.49 s captured as 23,840 samples, room noise -63 dBFS).
Deviations from this spec: (1) the card gets one smoothed voice **level** (fed to the existing `barHeights`) instead of 16 FFT buckets, simpler and the same look; (2) while the second press currently ends in a 0.9 s **fake** "Sending" (M2 replaces it); (3) the bar animation could not be confirmed by sound played through the speakers (the microphone did not pick it up), so the user's own voice is the real test.
Found and fixed on the way: hiding a window that was shown with a raw Win32 call did nothing (now hidden the same way); `vite` crashed watching `src-tauri/target` while `tauri dev` compiled (now ignored); the old macOS-only Cmd+Shift+Space shortcut was registering on Windows (now macOS only).
Still to check by the user: bars move with their voice; `Ctrl+Alt+P` on their ABNT2 keyboard (AltGr), and that it does not clash with another app.

## 10.2 M2 status (built 2026-10-05)

Built: second press now records, sends a 16 kHz WAV to the backend (`POST /v1/speech/transcribe`), warms the speech model at key-down (health check), shows what was heard on the card for ~0.9 s, and delivers it to the **chat in the main window** (`voice:result` event, `useVoiceDelivery` + `InputArea`: sends in the active conversation, answers by voice only under the existing "voice replies" rule). Closing the main window now **hides** it (tray keeps Phibe alive). Draft mode is already wired (`mode: "draft"`), used from M3.
Checked end to end on the dev PC with a debug-only hook (`PHIBE_VOICE_TEST_WAV` feeds a WAV instead of the microphone): `Ctrl+Alt+P`, `Ctrl+Alt+P` -> transcript "Lembre-me de ligar para o cliente às três da tarde e enviar o relatório mensal até sexta-feira." appeared as a user message in the chat of the **minimized** window, and the model started answering; closing the window hid it and the process stayed alive. 28 Rust tests, 206 front-end tests and 83 speech tests pass.
Backend changes: `[speech] language` now takes `pt`, `en` or `pt,en` (detect only between those; a short clip was mistaken for English and decoding got 4 to 5 times slower), `[speech] model = "small"` in the user's `~/.phibe/config.toml` (device cpu, int8 already there).
Measured (CPU, `small`, int8, other processes running): 7.8 s Portuguese phrase in 4.8 to 7.2 s; 5.5 s English phrase in 5.1 s; first request after a restart about 10 s (model load, which the key-down warm-up hides). That is **0.6 to 0.9 x** the phrase length, above the 0.6 x target: the GPU pack (M5) is what brings it under 1 s.
Not verified: a real human voice through the real microphone (the test voices were Microsoft Maria and Zira), the chat answer arriving by voice, and the card's "heard" line (it shows for under a second).
Known gaps for later milestones: the delivery only works while the main window exists (hidden or minimized is fine); if the user is looking at another page in a visible window, a notice offers "Open chat" and the message is sent when they do; the model is never unloaded; no setting yet for the voice language (fixed by the backend config).

## 10.3 M3 status (built and checked 2026-10-05)

Built: silence detector (energy based, noise floor adapts to the room; speech needs about 400 ms of voiced sound), **7 s of quiet -> 5 s countdown -> closes**; nothing said = discarded, something said = **draft** (never sent for the user); a second press in the countdown sends now (or closes if nothing was said); speaking again cancels the countdown; `Esc` cancels; **30 s limit sends**. Problems are one type (`Problem`) with a badge, a sentence and at most one action (no microphone / microphone blocked / microphone lost / Phibe not running / no speech engine / voice model needed / could not understand), shown on the card and on the avatar's badge with no sound; actions "Open settings" (Windows microphone privacy page) and "Open Phibe". Drafts wait in the chat's message box; the tray icon gets an amber dot until Phibe is looked at; the floating button's badge system has a new "draft" kind.
Tests: 47 Rust (state machine with every short input sequence, detector, problems, transcription parsing), 216 front-end.
Debug aid: with `PHIBE_VOICE_TEST_WAV` the "microphone" is a recorded file followed by a quiet room, played at real-time pace through the same detector, so the silence rules can be tested without speaking.
Checked on the dev PC in the running desktop app: with the real microphone in a quiet room, the card showed "Closing in 4... / You have not said anything." with the number on the avatar's badge and closed by itself about 12 s after the press, sending nothing; with the WAV stand-in (speech, then a quiet room) the countdown said "What you said will wait as a draft." and the text then appeared **unsent in the chat's message box**; with the backend stopped, the card showed "Phibe is not running" with the plug badge and the "Open Phibe" button, and hid itself after 6 s.
Not verified yet: the user's real voice and room, the tray dot for a draft (code only), the Windows microphone-blocked and unplugged cases, clicking "Open settings".

## 11. Risks and things to remember

- **Windows Defender** can flag unsigned apps (Handy's own Windows installer is not signed either); a code-signing certificate is needed to distribute.
- Wayland and macOS are out of scope for v1 (a global shortcut and pasting differ per OS).
- Moving between monitors with different scales needs care for the indicator's position.
- Windows shows its microphone-in-use icon whenever the mic is open; opening it only while listening keeps that icon honest.
- `Ctrl+Alt` doubles as `AltGr` on some keyboards.
- Handy is MIT: we reuse the design, not its code. If code is ever copied, add its notice to `NOTICE`.

## 12. Open items (decide later, not blocking v1)

Phibe's spoken reply and voice (Kokoro was rejected, paid voices cost credits); the wake word "Wake Up Phibe"; option B of the indicator; other mascots (the avatar is already a setting); streaming transcription while speaking; unifying the in-app microphone button with this pipeline; linking custom words to Memorize.

## 13. Decision log (short)

| Topic | Decision |
|---|---|
| Purpose | Talk to Phibe only (no dictation) |
| Activation | Toggle: press to start, press to send |
| Mic | Only while listening |
| Transcription | Local Whisper `small`, pt + en, in the Python backend; Rust does shortcut + mic |
| Shortcut | `Ctrl+Alt+P` default, configurable (Ctrl+X and Ctrl+0 not allowed) |
| Silence | 7 s + 5 s countdown; nothing said = discard; something said = draft; 2nd press = send now |
| Indicator | Option A (card + ring); small card when the button is hidden |
| Delivery | Last conversation, in the background; chat opens only on click |
| Errors | Avatar badges with a tooltip, no sound |
| Close window | Hides; tray or floating button, user's choice |
| History | Your Data tab; 15/30/90/Never, default 30 |
| Model | Download on first run with a welcome step; GPU pack optional |
| Platform | Windows only |

## 10.4 M4 status (built 2026-10-05)

- **Settings → General → Global Voice** (desktop app only): shortcut recorder (needs a modifier; a refused shortcut keeps the old one), microphone list (falls back to the default if unplugged), silence wait (3 to 20 s), countdown (3 to 10 s), custom words (sent to Whisper as `initial_prompt`). Stored in `~/.phibe/voice.json`, read live.
- **Settings → Data Source → Your Data**: voice history (text, date, play, delete), retention 15 / 30 / 90 days / forever, "Delete all voice data". Audio is Ogg/Opus, about 2.3 KB per second (about 0.14 MB a minute, under the 0.2 target). The retention purge runs on every add and every listing, not on a daily timer.
- **Not done:** on-close choice (tray vs floating button) moved to M5, it needs a floating window. Not tried in the real desktop app: shortcut recorder, mic list, saving history from a real recording.

## 10.5 M5 status (built 2026-10-05, no welcome step by the user's choice)

- **Voice model:** `GET /v1/speech/model` (installed, progress) and `POST /v1/speech/model/download` (background, progress read from the cache folder size). Settings → General → Speech has a "Voice model" row with a Download button. Nothing downloads on its own.
- **Tray:** new items "Talk to Phibe", "Voice model: ..." (click to download, shows the percentage) and "Start with Windows" (off by default, tick shows what Windows reports). One notice at start if the model is missing. Started by Windows with `--hidden`, Phibe stays in the tray.
- **Installer:** NSIS, per user (no admin), `Phibe_1.0.1_x64-setup.exe` in `frontend/src-tauri/target/release/bundle/nsis/`. Built, not installed or run. Unsigned: Windows SmartScreen and Defender will warn until it is code signed. The Python backend is not inside it.
- **Not done:** the NVIDIA GPU pack, the welcome step (dropped), the on-close tray/floating choice.
