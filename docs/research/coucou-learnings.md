# Coucou: what we learned, and how to build Phibe's floating emoji

Source studied: https://github.com/Louis-CFM/coucou (cloned at `C:\Projects\coucou`, release v0.1.4, Windows/Linux Tauri app in `windows/`, native Mac app in `NotchBuddy/`).
Purpose of this file: backup of the learning, so the Phibe "island" can be built later without re-reading the repo.

## 1. Licence (read before reusing anything)
- Code: MIT (we may learn from it and reuse ideas or code with the notice kept).
- **Character, name, icon and the 28 sounds are proprietary** (LICENSE-ASSETS.md, (c) Louis Raille). Phibe must use its own emoji, name and sounds. Do not copy Mochi, its drawing, its sounds or its outfits.
- Prefer re-implementing the techniques; do not paste its files.

## 2. What Coucou is
A small animated character (Mochi) that lives in a black "island" at the top centre of the screen (the Mac notch on MacBooks). It shows Claude Code sessions and service integrations, and lets the user approve permissions, answer questions, chat and drop files without leaving what they are doing. No telemetry; keys in the OS credential store; it never blocks Claude Code.

## 3. Architecture (Windows/Linux version)
```
windows/
  src/                TypeScript front end, no framework, Canvas 2D
    core/anim.ts      Ease functions, Spring (SwiftUI-like), Tracked (spring to grow, 340 ms curve to shrink)
    core/layout.ts    island sizes per mode/view, bot position per view (all constants live here)
    core/bridge.ts    thin wrapper over Tauri invoke/listen; every call is a no-op in a plain browser
    core/state.ts     app state (tasks, approvals, chat)
    core/sound.ts     WebAudio, preloaded buffers, default volume 0.12
    island/fsm.ts     open/close state machine (pure, no DOM)
    island/island.ts  DOM shell, sizing animation, mouse handling, requestAnimationFrame loop
    mochi/engine.ts   the character: tweens, eye shapes, states, emotes, particles, all in Canvas 2D
    mochi/minibots.ts same engine, small and tinted, as integration "pills"
    views/*.ts        one file per view (chat, upload, integrations, ...)
  src-tauri/          Rust backend
    island.rs         window geometry, click-through, 60 Hz cursor poll
    platform/*.rs     everything OS specific behind one set of function names
    hooks.rs          install/uninstall Claude Code hooks (diff + backup + explicit click)
    pipe.rs           named pipe server receiving hook events
    secrets.rs        Windows Credential Manager
    tray.rs, settings.rs, claude.rs (chat API), integrations.rs (pollers)
  hook/               coucou-hook.exe, tiny relay Claude Code runs on each event
```
Dev loop: `npm run dev` serves only the front end in a normal browser (enough for design work); `npm run tauri dev` runs the real window.

## 4. The window (the key trick)
`tauri.conf.json` window `island`: `decorations:false, transparent:true, shadow:false, alwaysOnTop:true, skipTaskbar:true, focus:false, resizable:false, closable:false, dragDropEnabled:true`.
- **Fixed big window, small drawing.** The window is 720x320 (largest view) anchored top-centre (`x = monitor.x + (monitor.w - w)/2, y = monitor.y`); the black island shape is drawn by the page inside it and animated with CSS/Canvas. Resizing the OS window per animation frame is avoided.
- **Collapsed = tiny wake strip.** When hidden, the window shrinks to 240x6 logical px so almost nothing intercepts the mouse; the wake strip detects the cursor entering the top edge.
- **Never steal focus.** Win32 `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW` set via `SetWindowLongPtrW` (no activation, hidden from Alt-Tab). A function `set_activating(true)` removes NOACTIVATE only while a text field in the island needs typing.
- **Click-through.** The transparent area must never block clicks. A Rust thread polls the global cursor (`GetCursorPos`) every ~16 ms, compares to the island rect (pushed by the front end via `set_island_rect`) plus a 14 px margin, and toggles `set_ignore_cursor_events` only when the answer changes. Doing this in Rust in the same tick avoids IPC round trips that lose clicks. The poll thread parks on a Condvar when the island is hidden, so hidden = ~0 % CPU.
- **Cursor to the page.** The poll also emits a `cursor` event (window-logical coords) so the character's eyes follow the mouse anywhere on screen. On Wayland there is no global cursor, so eyes only follow while over the island (`CURSOR_POLL` flag per platform).
- **Drag and drop on Windows.** While the left button is down over the panel the whole panel accepts the mouse (click-through hides the window from `WindowFromPoint`, so OLE would show "no drop"). WebView2 registers its own drop target on `Chrome_RenderWidgetHostHWND`; the app calls `RevokeDragDrop` on it so Tauri's target (feeding `onDragDropEvent`) works. Re-run when a press starts.
- **Monitors.** Placement uses primary monitor or the one under the cursor; the poll watches the display layout (position/size/scale) twice a second and emits `screen-changed` so the island is repositioned. Set size in physical pixels (logical x scale), and re-assert after moving across displays (rescale).
- **Linux:** `gtk-layer-shell` overlay where supported (KDE, Sway, Hyprland, COSMIC); on GNOME a normal window; click-through via the window input region; GTK needs `set_resizable(true)` before shrinking to the strip.
- Added CSP (`default-src 'self'` ...), `additionalBrowserArgs` to disable SmartScreen features and allow autoplay of audio without a gesture.

## 5. Behaviour model (fsm.ts + docs/SPEC.md)
States: `hidden`, `petit` (compact peek), `home` (expanded), `coucou` (launch greeting).
- hidden -> mouse enters top strip -> petit (peeks out, waves). Click -> home. Mouse leaves home -> back to petit after 15 s; petit -> hidden after 60 s idle.
- Non-alert work event: `reveal()` shows petit from hidden. Alert (permission, question, error): `forceHome()` opens straight to expanded and stays open (`pinned`) until answered. Escape / OK: `forcePetit()`.
- Auto-close countdown (Mac spec): 60 s without activity; last 10 s shows a thin shrinking bar. "User away" (no mouse for 3 min) hides it, alerts still open it. Multiple alerts are queued, one at a time.
- Timers live in the pure FSM class; it only reports transitions via `onTransition`, the island reacts. Easy to unit-test.

## 6. Motion
- `Spring` mirrors SwiftUI `.spring(response, dampingFraction)`: omega = 2*pi/response, zeta = damping, integrated in sub-steps (<= 1/240 s) so dropped frames never explode. Grow uses spring (response 0.5, damping 0.72, slight overshoot); shrink uses a timed cubic-bezier (0.45,0,0.2,1) for 340 ms with no overshoot (`Tracked`).
- Width, height, corner radius, character position and size animate together; view content fades out 160 ms (opacity, blur 8, scale .97) and in 300 ms after a 160 ms delay, so content never shows in a half-grown box.
- Island shape: black, top corners square (it melts into the screen edge), bottom corners rounded (14 px compact, 22-30 expanded), plus two concave 14 px "ears" at the top corners.
- Hidden on a PC: height animates to 0 and the island slides into the top edge (there is no notch).
- Render loop: `requestAnimationFrame`, a `dirty` flag, pause when `document.hidden` or when the island is hidden; canvas size in device pixels (devicePixelRatio, capped).

## 7. The character engine (mochi/engine.ts, spec section 7)
Everything is drawn in code, no images/Lottie/Rive.
- Body: superellipse (exponent 2.7), rx = 1.14 R, ry = 0.88 R; linear gradient + radial shading + radial highlight; state tint gradient from the bottom.
- Eyes are projected on a sphere (yaw, pitch, roll) with perspective foreshortening and clipped by the body silhouette: that single trick produces "roll" animations (eyes leave through the top and come back at the bottom). Eye shapes: pill, wide, dot, line, flat, happy (arc), closed, spiral, heart, star, tired, wink, cup.
- Tween system: each property (yaw, pitch, roll, tilt, open, sx, sy, oy, ox, tint, morph, hands, blush, es, badgeS) has a queue of keyframes `[target, durationMs, easing]` with `onComplete`. States and emotes are just scripted keyframe lists plus config.
- States (colour + tint + eye + badge + quirk): idle, working (blue, dots), thinking (violet, looks up-right), searching (indigo, eyes scan), approval (amber, "!", small hops), question (cyan, "?", head tilt), error (red, shake), finished (green, full roll + sparkles), ratelimit (orange, sweat), sleeping (grey, breathing + "z"), dizzy (pink, spiral eyes, double roll).
- Emotes (short overrides): love (hearts, after 1.9 s of still hover), surprised (when grabbed), proud (stars), wink, yawn (before sleeping), happy, annoyed (a click = "slap": squash 70/130/170 ms; 3 clicks in 1.7 s = dizzy for 3.3 s).
- Gaze follows cursor with lag: `tanh(dx/260)`, `tanh(dy/200)` + exponential smoothing; random blink every 2.2-5.4 s, double blink 22 % of the time.
- Particles (heart, star, spark, sweat, z) with simple physics; mouth "slot" spring used for the swallow animation; halo behind the character in the state colour.
- Blink on expand, hover = tiny scale-up and a sound; sounds are mapped state -> sound (`STATE_SOUND`) and emote -> sound.
- Mini versions of the same engine (solid body colour) act as integration pills.
- Seasonal wardrobe system (hats/glasses) with presence tween 0->1 in 350 ms and rigid roll when worn (not needed for Phibe v1).

## 8. Sound
WebAudio: one AudioContext, master GainNode, buffers decoded at startup from `/sounds/<name>.wav`, several can overlap, default volume 0.12 (slider 0-0.2), a missing file must never break the island, `resume()` on user input because WebView2 can suspend the context. 28 short WAVs (peek, open, close, hover, blip, slap, annoyed, dizzy, greet, work, finish, error, approval, question, approve, gulp, tick, send, love, pop, proud, wink, yawn, attach, think, search, rate, sleep). Phibe needs its own set.

## 9. Claude Code integration (for reference; optional for Phibe)
- Hooks: for these events Claude Code runs a command: SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest (timeout 120 s, waits for a human), Notification, Stop, StopFailure, SubagentStart, SubagentStop.
- The command is a tiny exe (`coucou-hook.exe`, copied to `%LOCALAPPDATA%\Coucou\bin`) that sends the event over a named pipe whose name includes the user's SID (and verifies the server process is the app) and exits within 300 ms if nobody answers. A session is never blocked.
- Install flow is the safety model: read `~/.claude/settings.json`, take a dated backup, merge without touching other hooks (entries identified by the marker `coucou-hook`), show the exact diff, write only after an explicit click, and only if the file still matches the previewed fingerprint. Uninstall removes only its own entries. On Windows hook commands run through Git Bash, so the command is a quoted exe path with forward slashes.
- Approvals (Allow/Deny/Always) only on explicit click; if unanswered Claude Code asks in the terminal as usual.

## 10. Other design rules worth copying
- Secrets only in the OS store; the UI can only ask "does a key exist?".
- No telemetry; network only to services the user configured.
- Platform code isolated in `platform/` with identical function names per OS.
- Log file in `%LOCALAPPDATA%`, local only.
- 0 % CPU hidden, < 3 % compact, < 100 MB RAM as acceptance criteria.
- A browser-only preview mode (`IS_TAURI` guard) so the visuals can be iterated without the shell.
- Tray icon with Open, Settings, Pause, Quit; no taskbar entry.

## 11. How to build the equivalent for Phibe (plan)
Phibe already has: Tauri 2 shell (`frontend/src-tauri`, `overlay.html`), a Canvas 2D Orb with voice level (`getVoiceLevel()`), a voice visualizer, Zustand store, backend SSE chat, approvals page, pings, tasks.

Proposed stages:
1. **Floating window (Rust):** add a second Tauri window `phibe-island` (transparent, no decorations, always on top, skip taskbar, no focus), top-centre, fixed ~720x320 with a 240x6 wake strip when collapsed. Port the pattern from `island.rs`: poll thread parked on a Condvar, global cursor read, click-through toggle from a pushed rect, `screen-changed` handling, `set_activating` for typing. Windows first (`windows` crate: GetCursorPos, GetAsyncKeyState, SetWindowLongPtrW); Linux/Mac later behind `platform/`.
2. **Front end entry:** a separate Vite entry (island.html) so it does not load the whole app; share `Orb`'s drawing code (extract to a module) and the `Spring/Tracked/Ease` helpers (write our own, same maths).
3. **FSM:** hidden / peek / expanded with timers as in `fsm.ts`; alerts pin it open.
4. **Phibe's own character:** keep our emoji face; add states mapped to Phibe events: idle, listening (mic/clap), thinking (streaming), speaking (voice level drives mouth/eyes), approval pending, ping/reminder, error, done. Reuse eye-shape + tween ideas, not Mochi's art. Eyes follow cursor via the Rust `cursor` event.
5. **Content views:** compact status line, quick chat input, approvals (Allow/Deny), Ping/Task reminders, drop a file to ingest (reuse `upload_router`). Start with 3 views: status, quick chat, approval.
6. **Sound:** WebAudio engine as above with our own generated sounds (no paid generators without asking).
7. **Settings:** toggle "Floating Phibe", screen choice (primary/cursor), auto-hide delays, sound volume, launch at login.
8. **Optional later:** Claude Code/Codex hook relay with the same diff + backup + explicit-click safety.

Risks: Windows Defender flagged Coucou's unsigned NSIS installer as a false positive (Wacatac.H!ml), so plan code signing for distribution; Wayland has no global cursor; always-on-top over fullscreen apps is limited on Windows; transparent windows + WebView2 need `additionalBrowserArgs` care; per-monitor DPI scaling bugs when moving between displays.

## 12. Local install status
- Cloned to `C:\Projects\coucou`. No Windows installer is published (withdrawn because of the Defender false positive), so running it means building from source: needs Rust (rustup), MSVC Build Tools (Visual Studio "Desktop development with C++"), Node 20+ (installed: v26), WebView2 (ships with Windows 11).
- Build: `cd C:\Projects\coucou\windows; npm install; npm run tauri dev` (or `npm run pack` for an installer in `windows/release/`). Sounds come from `NotchBuddy/Resources/sounds` via `SOUNDS_DIR` in `vite.config.ts`.
- Usage: move the mouse to the top-centre of the screen to make it peek, click to open, Esc closes, tray icon has Open / Settings / Pause / Quit; Settings -> Claude Code -> Install hooks (shows the diff first); Settings -> Claude takes an Anthropic API key (optional).

## 13. Decision update (2026-10-03): no persistent island
After testing Coucou, the user found a persistent top-of-screen window intrusive. Direction instead: a small draggable floating Phibe button (avatar instead of the chat icon) that can be sent to the system tray, opening a chat bubble with notifications/approvals; inside the app, the avatar moves per page. Always-low CPU. Avatar to change from emoji to nautilus, butterfly or octopus. Items 3-8 of section 11 are on hold.

Risks to remember:
- Windows Defender may flag unsigned apps: code signing needed to distribute.
- Linux Wayland: no global mouse position; apps cannot set absolute window positions (affects a draggable bubble).
- Moving between monitors with different scales needs extra care.
