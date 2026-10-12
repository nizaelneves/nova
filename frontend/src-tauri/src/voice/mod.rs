//! Phibe global voice (M1 capture and card, M2 transcribe and deliver, M3 silence and problems).
//!
//! A global shortcut toggles a recording from any app. A small always-on-top card
//! (its own window, created hidden at startup so showing it is instant) shows the
//! state and the voice bars. The card never takes focus from the app you were using.
//!
//! Layout: `machine` decides, `audio` measures, `mic` captures, `stt` transcribes,
//! `problem` names what can go wrong, this module wires them to Tauri (shortcut, window,
//! events). One coordinator thread owns the state machine and the microphone; it sleeps
//! until something happens, so an idle Phibe costs about nothing.

mod audio;
mod machine;
mod mic;
pub mod model;
mod problem;
mod settings;
mod stt;

use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::image::Image;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

use machine::{Effect, Input, Machine, Phase};
use mic::Mic;
use problem::{Problem, ProblemPayload};

pub const CARD_LABEL: &str = "voice";
const CARD_WIDTH: f64 = 360.0;
const CARD_HEIGHT: f64 = 190.0;
/// The floating button's own window: the button (64) with room around it for the rings.
const FAB_WINDOW: f64 = 110.0;
const FAB_SIZE: f64 = 64.0;
/// Distance from the screen edge to the button, in logical px (the rings reach about 20 px).
const FAB_EDGE_MARGIN: f64 = 28.0;
/// Distance from the bottom of the screen, in logical px (clears the taskbar).
const CARD_BOTTOM_MARGIN: f64 = 72.0;
const TICK: Duration = Duration::from_millis(33);
/// How long the card keeps showing what was heard before it goes away.
const HEARD_SHOWN: Duration = Duration::from_millis(900);
/// A problem stays up long enough to read and to click its action.
const PROBLEM_SHOWN: Duration = Duration::from_millis(6000);
/// Longest recording; it is sent when reached.
const LIMIT_MS: u64 = 30_000;

enum Command {
    Shortcut,
    Esc,
    /// The recording was understood: this is the text (`draft`: leave it in the message box).
    Heard { text: String, draft: bool },
    /// Transcription failed.
    Failed(Problem),
}

static SENDER: OnceLock<Mutex<Sender<Command>>> = OnceLock::new();

/// The floating button: is it on, is it on the right edge, and where (fraction of the height).
/// Set by the main window. On: outside Phibe only the button shows. Off: only the card.
static FLOAT: Mutex<(bool, bool, f64)> = Mutex::new((true, true, 0.82));

/// Width of Phibe's side menu (logical px), so the card outside the app lines up with the one inside.
static SIDEBAR: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(72);

fn float_config() -> (bool, bool, f64) {
    FLOAT.lock().map(|f| *f).unwrap_or((true, true, 0.82))
}

#[derive(Serialize, Clone)]
struct StatePayload {
    phase: &'static str,
    ready: bool,
    shortcut: String,
    /// What Phibe understood, shown on the card while it goes to the chat.
    heard: Option<String>,
    /// Seconds the countdown starts from (the card counts down by itself).
    countdown_secs: Option<u32>,
    /// Something was said before the silence: it will be kept as a draft.
    speech_seen: bool,
    problem: Option<ProblemPayload>,
    floating: bool,
    float_right: bool,
}

/// Sent to every window: the main window turns it into a chat message (or a draft).
#[derive(Serialize, Clone)]
struct ResultPayload {
    id: u64,
    text: String,
    /// "send" posts it to the chat right away; "draft" leaves it in the composer.
    mode: &'static str,
}

#[derive(Serialize, Clone)]
struct LevelPayload {
    level: f32,
}

fn send(command: Command) {
    if let Some(lock) = SENDER.get() {
        if let Ok(tx) = lock.lock() {
            let _ = tx.send(command);
        }
    }
}

/// Starts the voice feature: hidden card window, global shortcut, coordinator thread.
pub fn init(app: &AppHandle) -> Result<(), String> {
    let card = build_card_window(app)?;
    make_non_activating(&card);

    let (tx, rx) = mpsc::channel::<Command>();
    SENDER.set(Mutex::new(tx)).map_err(|_| "voice already initialised".to_string())?;

    let wanted = settings::get().shortcut;
    if register_shortcut(app, &wanted).is_err() && wanted != settings::DEFAULT_SHORTCUT {
        // A saved shortcut that no longer works (another app took it): fall back to the default.
        register_shortcut(app, settings::DEFAULT_SHORTCUT)?;
    }

    let handle = app.clone();
    std::thread::Builder::new()
        .name("phibe-voice".into())
        .spawn(move || Coordinator::new(handle, rx).run())
        .map_err(|e| format!("Could not start the voice thread: {e}"))?;
    Ok(())
}

/// Registers the voice shortcut; the old one must be unregistered first when changing.
fn register_shortcut(app: &AppHandle, label: &str) -> Result<(), String> {
    let shortcut: Shortcut = label.parse().map_err(|e| format!("\"{label}\" is not a valid shortcut: {e}"))?;
    app.global_shortcut()
        .on_shortcut(shortcut, |_app, _sc, event| {
            if event.state == ShortcutState::Pressed {
                send(Command::Shortcut);
            }
        })
        .map_err(|e| format!("Could not register {label}: {e} (another app may be using it)"))
}

fn build_card_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    WebviewWindowBuilder::new(app, CARD_LABEL, WebviewUrl::App("voice.html".into()))
        .title("Phibe voice")
        .inner_size(CARD_WIDTH, CARD_HEIGHT)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false)
        .build()
        .map_err(|e| format!("Could not create the voice card: {e}"))
}

// ---------------------------------------------------------------- Windows window styles

/// `WS_EX_NOACTIVATE` keeps clicks and `show` from stealing focus; `WS_EX_TOOLWINDOW`
/// keeps the card out of Alt-Tab.
#[cfg(windows)]
fn make_non_activating(window: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };
    let Ok(hwnd) = window.hwnd() else { return };
    let hwnd = HWND(hwnd.0);
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE.0 as isize | WS_EX_TOOLWINDOW.0 as isize);
    }
}

#[cfg(not(windows))]
fn make_non_activating(_window: &WebviewWindow) {}

/// Shows the window without activating it (a plain `show()` can pull focus).
#[cfg(windows)]
fn show_without_focus(window: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};
    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            let _ = ShowWindow(HWND(hwnd.0), SW_SHOWNOACTIVATE);
        }
    } else {
        let _ = window.show();
    }
}

#[cfg(not(windows))]
fn show_without_focus(window: &WebviewWindow) {
    let _ = window.show();
}

/// Hides the window the same way it was shown. The window toolkit remembers whether it
/// thinks the window is visible; since we showed it with a raw Win32 call, a plain
/// `hide()` can be skipped as "already hidden" and leave the card on screen.
#[cfg(windows)]
fn hide_window(window: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE};
    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            let _ = ShowWindow(HWND(hwnd.0), SW_HIDE);
        }
    }
    let _ = window.hide();
}

#[cfg(not(windows))]
fn hide_window(window: &WebviewWindow) {
    let _ = window.hide();
}

// ---------------------------------------------------------------- Coordinator

struct Coordinator {
    app: AppHandle,
    rx: Receiver<Command>,
    machine: Machine,
    mic: Option<Mic>,
    started: Instant,
    send_done_at: Option<Instant>,
    hide_at: Option<Instant>,
    countdown_ends: Option<Instant>,
    announced_ready: bool,
    heard: Option<String>,
    problem: Option<Problem>,
    next_id: u64,
}

impl Coordinator {
    fn new(app: AppHandle, rx: Receiver<Command>) -> Self {
        Self {
            app,
            rx,
            machine: Machine::new(),
            mic: None,
            started: Instant::now(),
            send_done_at: None,
            hide_at: None,
            countdown_ends: None,
            announced_ready: false,
            heard: None,
            problem: None,
            next_id: 1,
        }
    }

    fn now_ms(&self) -> u64 {
        self.started.elapsed().as_millis() as u64
    }

    /// Anything to watch with a timer? When not, the thread blocks and uses no CPU.
    fn busy(&self) -> bool {
        self.machine.phase() != Phase::Idle || self.hide_at.is_some()
    }

    fn run(mut self) {
        loop {
            let received = if self.busy() {
                match self.rx.recv_timeout(TICK) {
                    Ok(command) => Some(command),
                    Err(RecvTimeoutError::Timeout) => None,
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            } else {
                match self.rx.recv() {
                    Ok(command) => Some(command),
                    Err(_) => break,
                }
            };
            if let Some(command) = received {
                match command {
                    Command::Shortcut => self.feed(Input::Shortcut { at_ms: self.now_ms() }),
                    Command::Esc => self.feed(Input::Esc),
                    Command::Heard { text, draft } => self.deliver(text, draft),
                    Command::Failed(problem) => self.feed(Input::SendFailed(problem)),
                }
            }
            self.tick();
        }
    }

    fn feed(&mut self, input: Input) {
        let mut queue = vec![input];
        while let Some(next) = queue.pop() {
            for effect in self.machine.handle(next) {
                if let Some(follow_up) = self.apply(effect) {
                    queue.push(follow_up);
                }
            }
        }
    }

    /// Carries out one effect; may return a follow-up input (e.g. the mic failed to open).
    fn apply(&mut self, effect: Effect) -> Option<Input> {
        match effect {
            Effect::ShowCard => {
                self.hide_at = None;
                self.countdown_ends = None;
                self.announced_ready = false;
                self.heard = None;
                self.problem = None;
                // Inside Phibe the card shows in the app itself (card only); the floating window
                // with the avatar is for when the user is in another app.
                let in_app = self.app.get_webview_window("main").is_some_and(|w| w.is_focused().unwrap_or(false));
                if !in_app {
                    self.place_and_show();
                }
                // Load the speech model while the user talks, so it is ready when they finish.
                stt::warm_up();
            }
            Effect::HideCard => {
                self.hide_at = None;
                self.send_done_at = None;
                self.countdown_ends = None;
                if let Some(window) = self.card() {
                    hide_window(&window);
                }
                // Clear the card's content so the next show never flashes the old state.
                self.problem = None;
                self.emit_state();
            }
            Effect::OpenMic => match Mic::open(settings::get().mic.as_deref()) {
                Ok(mic) => self.mic = Some(mic),
                Err(problem) => return Some(Input::MicFailed(problem)),
            },
            Effect::CloseMic => {
                self.mic = None;
            }
            Effect::Collect { draft } => {
                let samples = self.mic.take().map(|mic| mic.shared().take_samples()).unwrap_or_default();
                self.start_transcription(samples, draft);
            }
            Effect::RegisterEsc => {
                let esc = Shortcut::new(None, Code::Escape);
                let _ = self.app.global_shortcut().on_shortcut(esc, |_app, _sc, event| {
                    if event.state == ShortcutState::Pressed {
                        send(Command::Esc);
                    }
                });
            }
            Effect::UnregisterEsc => {
                let _ = self.app.global_shortcut().unregister(Shortcut::new(None, Code::Escape));
            }
            Effect::Announce => {
                // The countdown clock starts when the phase does and stops when it ends.
                if self.machine.phase() == Phase::Countdown {
                    let wait = Duration::from_secs(settings::get().countdown_secs as u64);
                    self.countdown_ends.get_or_insert_with(|| Instant::now() + wait);
                } else {
                    self.countdown_ends = None;
                }
                self.emit_state();
            }
            Effect::Fail(problem) => {
                self.hide_at = Some(Instant::now() + PROBLEM_SHOWN);
                self.problem = Some(problem);
                self.emit_state();
            }
        }
        None
    }

    fn tick(&mut self) {
        let now = Instant::now();
        let phase = self.machine.phase();
        if matches!(phase, Phase::Listening | Phase::Countdown) {
            let silence_ms = settings::get().silence_secs as u64 * 1000;
            let mut next = None;
            if let Some(mic) = &self.mic {
                let shared = mic.shared();
                if let Some(problem) = shared.take_problem() {
                    next = Some(Input::MicFailed(problem));
                } else {
                    if shared.is_ready() && !self.announced_ready {
                        self.announced_ready = true;
                        next = Some(Input::MicReady);
                    } else if shared.elapsed_ms() >= LIMIT_MS {
                        next = Some(Input::LimitReached);
                    } else if phase == Phase::Listening && shared.quiet_ms() >= silence_ms {
                        next = Some(Input::Quiet { speech_seen: shared.speech_seen() });
                    } else if phase == Phase::Countdown {
                        // Any speech resets the quiet clock below the limit that started the countdown.
                        if shared.quiet_ms() < silence_ms {
                            next = Some(Input::Voice);
                        } else if self.countdown_ends.is_some_and(|at| now >= at) {
                            next = Some(Input::CountdownDone);
                        }
                    }
                    let _ = self.app.emit("voice:level", LevelPayload { level: shared.level() });
                }
            }
            if let Some(input) = next {
                self.feed(input);
            }
        }
        if let Some(at) = self.send_done_at {
            if now >= at {
                self.send_done_at = None;
                self.feed(Input::SendDone);
            }
        }
        if let Some(at) = self.hide_at {
            if now >= at {
                self.hide_at = None;
                if let Some(window) = self.card() {
                    hide_window(&window);
                }
                self.problem = None;
                self.emit_state();
            }
        }
    }

    /// Hands the recording to the speech engine in the background; the answer comes back
    /// as a `Heard` or `Failed` command.
    fn start_transcription(&mut self, samples: Vec<f32>, draft: bool) {
        let prompt = settings::get().prompt();
        tauri::async_runtime::spawn(async move {
            match stt::transcribe(&samples, prompt.as_deref()).await {
                Ok(text) => send(Command::Heard { text, draft }),
                Err(problem) => send(Command::Failed(problem)),
            }
        });
    }

    /// The text is ready: tell the chat, show it on the card for a moment, then hide.
    fn deliver(&mut self, text: String, draft: bool) {
        let id = self.next_id;
        self.next_id += 1;
        let mode = if draft { "draft" } else { "send" };
        let _ = self.app.emit("voice:result", ResultPayload { id, text: text.clone(), mode });
        if draft {
            // Nothing opens by itself: if Phibe is out of sight, the tray icon says a draft waits.
            let looking = self.app.get_webview_window("main").is_some_and(|w| w.is_focused().unwrap_or(false));
            if !looking {
                set_tray_badge(&self.app, true);
            }
        }
        if self.machine.phase() == Phase::Sending {
            self.heard = Some(text);
            self.emit_state();
            self.send_done_at = Some(Instant::now() + HEARD_SHOWN);
        }
    }

    fn emit_state(&self) {
        let phase = if self.problem.is_some() {
            "error"
        } else {
            match self.machine.phase() {
                Phase::Idle => "idle",
                Phase::Listening => "listening",
                Phase::Countdown => "countdown",
                Phase::Sending => "sending",
            }
        };
        let _ = self.app.emit(
            "voice:state",
            StatePayload {
                phase,
                ready: self.machine.ready(),
                shortcut: settings::get().shortcut,
                heard: self.heard.clone(),
                countdown_secs: (self.machine.phase() == Phase::Countdown).then_some(settings::get().countdown_secs),
                speech_seen: self.machine.speech_seen(),
                problem: self.problem.as_ref().map(ProblemPayload::from),
                floating: float_config().0,
                float_right: float_config().1,
            },
        );
    }

    fn card(&self) -> Option<WebviewWindow> {
        self.app.get_webview_window(CARD_LABEL)
    }

    /// Where the card goes: the same spot as the card inside Phibe, in the middle of the content
    /// area (right of the side menu) and 30% of the height up from the bottom. With Phibe's window
    /// in view it follows that window; with Phibe in the tray it uses the screen as if Phibe filled it.
    #[allow(clippy::too_many_arguments)]
    fn card_spot(&self, sx: i32, sy: i32, sw: i32, sh: i32, screen_scale: f64, width: i32, height: i32) -> (i32, i32) {
        let main = self
            .app
            .get_webview_window("main")
            .filter(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false));
        let (left, top, area_w, area_h, scale) = match main.as_ref().and_then(|w| Some((w.inner_position().ok()?, w.inner_size().ok()?, w.scale_factor().ok()?))) {
            Some((pos, size, scale)) => (pos.x, pos.y, size.width as i32, size.height as i32, scale),
            None => (sx, sy, sw, sh, screen_scale),
        };
        let menu = (SIDEBAR.load(std::sync::atomic::Ordering::Relaxed) as f64 * scale).round() as i32;
        let centre = left + menu + (area_w - menu) / 2;
        let lift = ((7.0 * 16.0 * scale) as i32).max((area_h as f64 * 0.30) as i32);
        (centre - width / 2, top + area_h - lift - height)
    }

    /// Where the window goes, on the screen the mouse is on. With the floating button on it is
    /// a small window at the button's edge; otherwise the card, bottom-centre above the taskbar.
    fn place_and_show(&self) {
        let Some(window) = self.card() else { return };
        let (floating, right, y) = float_config();
        let (w, h) = if floating { (FAB_WINDOW, FAB_WINDOW) } else { (CARD_WIDTH, CARD_HEIGHT) };
        let _ = window.set_size(tauri::LogicalSize::new(w, h));
        let monitor = self
            .app
            .cursor_position()
            .ok()
            .and_then(|p| self.app.monitor_from_point(p.x, p.y).ok().flatten())
            .or_else(|| self.app.primary_monitor().ok().flatten());
        if let Some(monitor) = monitor {
            let scale = monitor.scale_factor();
            let size = monitor.size();
            let origin = monitor.position();
            let width = (w * scale).round() as i32;
            let height = (h * scale).round() as i32;
            let (x, top) = if floating {
                let pad = ((FAB_WINDOW - FAB_SIZE) / 2.0 * scale).round() as i32;
                let margin = (FAB_EDGE_MARGIN * scale).round() as i32;
                let x = if right { origin.x + size.width as i32 - margin + pad - width } else { origin.x + margin - pad };
                let centre = origin.y + (size.height as f64 * y) as i32;
                let top = (centre - height / 2).clamp(origin.y, origin.y + size.height as i32 - height);
                (x, top)
            } else {
                self.card_spot(origin.x, origin.y, size.width as i32, size.height as i32, scale, width, height)
            };
            let _ = window.set_position(PhysicalPosition::new(x, top));
        }
        let _ = window.set_always_on_top(true);
        show_without_focus(&window);
    }
}

// ---------------------------------------------------------------- Tray badge for drafts

/// A small amber dot on the tray icon says "a voice draft is waiting"; it goes away as soon
/// as the main window is looked at.
pub fn set_tray_badge(app: &AppHandle, on: bool) {
    let Some(tray) = app.tray_by_id("main") else { return };
    let Some(base) = app.default_window_icon() else { return };
    if on {
        let _ = tray.set_icon(Some(with_dot(base)));
        let _ = tray.set_tooltip(Some("Phibe: a voice draft is waiting"));
    } else {
        let _ = tray.set_icon(Some(base.clone()));
        let _ = tray.set_tooltip(Some("Phibe"));
    }
}

fn with_dot(base: &Image<'_>) -> Image<'static> {
    let (w, h) = (base.width(), base.height());
    let mut rgba = base.rgba().to_vec();
    let radius = (w.min(h) as f32 * 0.24).max(3.0);
    let (cx, cy) = (w as f32 - radius - 1.0, h as f32 - radius - 1.0);
    for y in 0..h {
        for x in 0..w {
            let distance = ((x as f32 - cx).powi(2) + (y as f32 - cy).powi(2)).sqrt();
            let pixel = if distance <= radius {
                [245, 158, 11, 255]
            } else if distance <= radius + 1.5 {
                [7, 11, 16, 255]
            } else {
                continue;
            };
            let i = ((y * w + x) * 4) as usize;
            rgba[i..i + 4].copy_from_slice(&pixel);
        }
    }
    Image::new_owned(rgba, w, h)
}

// ---------------------------------------------------------------- Commands for the web side

/// Same as pressing the shortcut: lets the app (and tests) start or send a recording.
#[tauri::command]
pub fn voice_toggle() {
    send(Command::Shortcut);
}

/// The one button a problem offers on the card.
#[tauri::command]
pub fn voice_action(app: AppHandle, action: String) {
    match action.as_str() {
        "open_mic_settings" => open_mic_settings(),
        "open_phibe" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }
        _ => {}
    }
}

#[cfg(windows)]
fn open_mic_settings() {
    use std::os::windows::process::CommandExt;
    // CREATE_NO_WINDOW: no console flash while Windows opens its privacy page.
    let _ = std::process::Command::new("cmd")
        .args(["/C", "start", "", "ms-settings:privacy-microphone"])
        .creation_flags(0x0800_0000)
        .spawn();
}

#[cfg(not(windows))]
fn open_mic_settings() {}

/// The main window reports whether the floating button is on.
#[tauri::command]
pub fn voice_set_floating(on: bool, right: bool, y: f64) {
    if let Ok(mut f) = FLOAT.lock() {
        *f = (on, right, y.clamp(0.0, 1.0));
    }
}

/// The main window reports the width of its side menu (collapsed or expanded).
#[tauri::command]
pub fn voice_set_sidebar(width: f64) {
    SIDEBAR.store(width.clamp(0.0, 400.0) as u32, std::sync::atomic::Ordering::Relaxed);
}

/// What Settings → Speech shows.
#[tauri::command]
pub fn voice_settings_get() -> settings::VoiceSettings {
    settings::get()
}

/// Saves the settings; a changed shortcut is registered first, so a refused one changes nothing.
#[tauri::command]
pub fn voice_settings_set(app: AppHandle, next: settings::VoiceSettings) -> Result<settings::VoiceSettings, String> {
    let current = settings::get();
    let next = next.cleaned();
    if next.shortcut != current.shortcut {
        if let Ok(old) = current.shortcut.parse::<Shortcut>() {
            let _ = app.global_shortcut().unregister(old);
        }
        if let Err(e) = register_shortcut(&app, &next.shortcut) {
            let _ = register_shortcut(&app, &current.shortcut);
            return Err(e);
        }
    }
    settings::set(next)
}

/// The input devices Settings can offer.
#[tauri::command]
pub fn voice_list_mics() -> Vec<String> {
    mic::input_names()
}
