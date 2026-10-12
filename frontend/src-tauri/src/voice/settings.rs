//! The user's voice settings, kept in `~/.phibe/voice.json`. Read at startup, changed from
//! Settings → Speech through `voice_settings_set`, and read live by the coordinator.

use std::path::PathBuf;
use std::sync::{OnceLock, RwLock};

use serde::{Deserialize, Serialize};

pub const DEFAULT_SHORTCUT: &str = "Ctrl+Alt+P";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct VoiceSettings {
    pub shortcut: String,
    /// Seconds of quiet before the countdown starts.
    pub silence_secs: u32,
    /// Seconds of countdown before the card closes.
    pub countdown_secs: u32,
    /// Names and brands, one per entry; sent to the speech engine as a spelling hint.
    pub custom_words: Vec<String>,
    /// Name of the input device; `None` is the Windows default.
    pub mic: Option<String>,
}

impl Default for VoiceSettings {
    fn default() -> Self {
        Self { shortcut: DEFAULT_SHORTCUT.into(), silence_secs: 7, countdown_secs: 5, custom_words: vec![], mic: None }
    }
}

impl VoiceSettings {
    /// Keeps values in a sane range and drops blank words.
    pub fn cleaned(mut self) -> Self {
        self.silence_secs = self.silence_secs.clamp(3, 30);
        self.countdown_secs = self.countdown_secs.clamp(2, 15);
        self.custom_words = self.custom_words.iter().map(|w| w.trim().to_string()).filter(|w| !w.is_empty()).collect();
        self.mic = self.mic.filter(|m| !m.trim().is_empty());
        self
    }

    /// The hint Whisper gets: the words, separated so it treats them as vocabulary.
    pub fn prompt(&self) -> Option<String> {
        (!self.custom_words.is_empty()).then(|| self.custom_words.join(", "))
    }
}

fn path() -> PathBuf {
    PathBuf::from(crate::home_dir()).join(".phibe").join("voice.json")
}

fn cell() -> &'static RwLock<VoiceSettings> {
    static CELL: OnceLock<RwLock<VoiceSettings>> = OnceLock::new();
    CELL.get_or_init(|| {
        let loaded = std::fs::read_to_string(path())
            .ok()
            .and_then(|text| serde_json::from_str::<VoiceSettings>(&text).ok())
            .unwrap_or_default();
        RwLock::new(loaded.cleaned())
    })
}

pub fn get() -> VoiceSettings {
    cell().read().map(|s| s.clone()).unwrap_or_default()
}

/// Stores the settings (memory and disk) and returns what was kept.
pub fn set(next: VoiceSettings) -> Result<VoiceSettings, String> {
    let next = next.cleaned();
    let file = path();
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Could not save voice settings: {e}"))?;
    }
    let text = serde_json::to_string_pretty(&next).map_err(|e| e.to_string())?;
    std::fs::write(&file, text).map_err(|e| format!("Could not save voice settings: {e}"))?;
    if let Ok(mut slot) = cell().write() {
        *slot = next.clone();
    }
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn out_of_range_timings_are_pulled_back() {
        let s = VoiceSettings { silence_secs: 0, countdown_secs: 99, ..Default::default() }.cleaned();
        assert_eq!((s.silence_secs, s.countdown_secs), (3, 15));
    }

    #[test]
    fn blank_words_and_blank_mic_are_dropped() {
        let s = VoiceSettings { custom_words: vec![" Kyte ".into(), "  ".into()], mic: Some(" ".into()), ..Default::default() }.cleaned();
        assert_eq!(s.custom_words, vec!["Kyte"]);
        assert_eq!(s.mic, None);
    }

    #[test]
    fn the_hint_is_a_comma_list_or_nothing() {
        assert_eq!(VoiceSettings::default().prompt(), None);
        let s = VoiceSettings { custom_words: vec!["eKyte".into(), "Phibe".into()], ..Default::default() };
        assert_eq!(s.prompt().as_deref(), Some("eKyte, Phibe"));
    }

    #[test]
    fn a_partial_file_keeps_the_defaults() {
        let s: VoiceSettings = serde_json::from_str(r#"{"silence_secs":10}"#).unwrap();
        assert_eq!((s.silence_secs, s.countdown_secs, s.shortcut.as_str()), (10, 5, "Ctrl+Alt+P"));
    }

    #[test]
    fn the_default_shortcut_parses() {
        assert!(DEFAULT_SHORTCUT.parse::<tauri_plugin_global_shortcut::Shortcut>().is_ok());
    }
}
