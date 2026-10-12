//! Everything that can go wrong in the voice flow, as one small type, so the card can show
//! the same badge, sentence and single action for each problem (spec section 7). No sound.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Problem {
    /// No input device at all.
    NoMic,
    /// Windows refuses Phibe access to the microphone.
    MicBlocked,
    /// The microphone disappeared while recording.
    MicLost,
    /// The backend does not answer.
    PhibeNotRunning,
    /// The backend runs but has no speech engine.
    NoEngine,
    /// The speech model is not there (or could not be loaded).
    ModelMissing,
    /// A bump of the key, not speech.
    TooShort,
    /// The engine heard nothing it could turn into words.
    NotUnderstood,
    Other(String),
}

/// The one thing the user can do about a problem.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    OpenMicSettings,
    OpenPhibe,
}

impl Problem {
    /// Which badge the avatar wears.
    pub fn badge(&self) -> &'static str {
        match self {
            Problem::NoMic | Problem::MicBlocked | Problem::MicLost => "micoff",
            Problem::PhibeNotRunning | Problem::NoEngine => "plug",
            Problem::ModelMissing => "download",
            Problem::TooShort | Problem::NotUnderstood | Problem::Other(_) => "bang",
        }
    }

    pub fn title(&self) -> &'static str {
        match self {
            Problem::NoMic => "No microphone",
            Problem::MicBlocked => "Microphone blocked",
            Problem::MicLost => "Microphone lost",
            Problem::PhibeNotRunning => "Phibe is not running",
            Problem::NoEngine => "No speech engine",
            Problem::ModelMissing => "Voice model needed",
            Problem::TooShort | Problem::NotUnderstood => "Could not understand",
            Problem::Other(_) => "Voice problem",
        }
    }

    pub fn message(&self) -> String {
        match self {
            Problem::NoMic => "Connect a microphone and try again.".into(),
            Problem::MicBlocked => "Windows is blocking Phibe's access.".into(),
            Problem::MicLost => "The microphone was disconnected.".into(),
            Problem::PhibeNotRunning => "Start it from the tray, then try again.".into(),
            Problem::NoEngine => "Set up a speech engine in Phibe's settings.".into(),
            Problem::ModelMissing => "One download, stays on this PC.".into(),
            Problem::TooShort => "That was too short. Nothing was sent.".into(),
            Problem::NotUnderstood => "Nothing was sent. Try again.".into(),
            Problem::Other(detail) => detail.clone(),
        }
    }

    pub fn action(&self) -> Option<Action> {
        match self {
            Problem::NoMic | Problem::MicBlocked => Some(Action::OpenMicSettings),
            Problem::PhibeNotRunning | Problem::NoEngine | Problem::ModelMissing => Some(Action::OpenPhibe),
            _ => None,
        }
    }

    pub fn action_label(&self) -> Option<&'static str> {
        match self.action()? {
            Action::OpenMicSettings => Some("Open settings"),
            Action::OpenPhibe => Some("Open Phibe"),
        }
    }

    /// How a failing HTTP answer from the speech engine maps to a problem.
    pub fn from_http(status: u16, detail: &str) -> Problem {
        let lower = detail.to_lowercase();
        if status == 501 {
            Problem::NoEngine
        } else if lower.contains("model") || lower.contains("download") || lower.contains("huggingface") {
            Problem::ModelMissing
        } else if detail.is_empty() {
            Problem::Other(format!("The speech engine failed ({status})."))
        } else {
            Problem::Other(format!("The speech engine failed: {detail}"))
        }
    }

    /// How an error from the audio layer maps to a problem.
    pub fn from_audio(error: &str) -> Problem {
        let lower = error.to_lowercase();
        if lower.contains("no input device") || lower.contains("no microphone") {
            Problem::NoMic
        } else if lower.contains("access") || lower.contains("denied") || lower.contains("permission") {
            Problem::MicBlocked
        } else if lower.contains("no longer available") || lower.contains("disconnected") {
            Problem::MicLost
        } else {
            Problem::Other(format!("Microphone problem: {error}"))
        }
    }
}

/// What the card receives for a problem.
#[derive(Serialize, Clone)]
pub struct ProblemPayload {
    pub badge: &'static str,
    pub title: &'static str,
    pub message: String,
    pub action: Option<Action>,
    pub action_label: Option<&'static str>,
}

impl From<&Problem> for ProblemPayload {
    fn from(problem: &Problem) -> Self {
        ProblemPayload {
            badge: problem.badge(),
            title: problem.title(),
            message: problem.message(),
            action: problem.action(),
            action_label: problem.action_label(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_problem_has_a_badge_a_title_and_a_sentence() {
        let all = [
            Problem::NoMic,
            Problem::MicBlocked,
            Problem::MicLost,
            Problem::PhibeNotRunning,
            Problem::NoEngine,
            Problem::ModelMissing,
            Problem::TooShort,
            Problem::NotUnderstood,
            Problem::Other("x".into()),
        ];
        for p in all {
            assert!(!p.badge().is_empty() && !p.title().is_empty() && !p.message().is_empty());
        }
    }

    #[test]
    fn actions_match_what_the_user_can_fix() {
        assert_eq!(Problem::MicBlocked.action(), Some(Action::OpenMicSettings));
        assert_eq!(Problem::PhibeNotRunning.action(), Some(Action::OpenPhibe));
        assert_eq!(Problem::ModelMissing.action(), Some(Action::OpenPhibe));
        assert_eq!(Problem::NotUnderstood.action(), None);
        assert_eq!(Problem::NotUnderstood.action_label(), None);
    }

    #[test]
    fn http_failures_are_told_apart() {
        assert_eq!(Problem::from_http(501, ""), Problem::NoEngine);
        assert_eq!(Problem::from_http(500, "Could not load model small"), Problem::ModelMissing);
        assert!(matches!(Problem::from_http(500, "boom"), Problem::Other(m) if m.contains("boom")));
        assert!(matches!(Problem::from_http(502, ""), Problem::Other(m) if m.contains("502")));
    }

    #[test]
    fn audio_errors_are_told_apart() {
        assert_eq!(Problem::from_audio("No microphone found"), Problem::NoMic);
        assert_eq!(Problem::from_audio("Access is denied"), Problem::MicBlocked);
        assert_eq!(Problem::from_audio("The device is no longer available"), Problem::MicLost);
        assert!(matches!(Problem::from_audio("weird"), Problem::Other(_)));
    }
}
