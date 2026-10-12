//! Turning a recording into text: a WAV goes to Phibe's own backend
//! (`/v1/speech/transcribe`, local faster-whisper by default). The model loads lazily
//! on the first request, so [`warm_up`] pokes the backend the moment the user starts
//! listening and the model is ready by the time they finish speaking.

use std::time::Duration;

use super::audio::{wav_bytes, TARGET_RATE};
use super::problem::Problem;

/// Anything shorter than this was a bump of the key, not speech.
const MIN_SECONDS: f32 = 0.4;

pub fn base_url() -> String {
    crate::api_base()
}

/// Loads the speech model in the background (a health check makes the backend load it).
pub fn warm_up() {
    tauri::async_runtime::spawn(async {
        let client = reqwest::Client::new();
        let _ = client
            .get(format!("{}/v1/speech/health", base_url()))
            .timeout(Duration::from_secs(60))
            .send()
            .await;
    });
}

/// What the backend heard. `Err` says what went wrong, in a form the card can show.
pub async fn transcribe(samples: &[f32], prompt: Option<&str>) -> Result<String, Problem> {
    if (samples.len() as f32) < MIN_SECONDS * TARGET_RATE as f32 {
        return Err(Problem::TooShort);
    }
    let part = reqwest::multipart::Part::bytes(wav_bytes(samples))
        .file_name("voice.wav")
        .mime_str("audio/wav")
        .map_err(|e| Problem::Other(format!("Could not prepare the audio: {e}")))?;
    // `save` asks the backend to keep the recording in the voice history.
    let mut form = reqwest::multipart::Form::new().part("file", part).text("save", "1");
    if let Some(prompt) = prompt {
        form = form.text("prompt", prompt.to_string());
    }

    let response = reqwest::Client::new()
        .post(format!("{}/v1/speech/transcribe", base_url()))
        .multipart(form)
        .timeout(Duration::from_secs(120))
        .send()
        .await
        .map_err(|_| Problem::PhibeNotRunning)?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| Problem::Other(format!("Unreadable answer: {e}")))?;
    if !status.is_success() {
        return Err(failure(status.as_u16(), &body));
    }
    parse_text(&body)
}

/// Picks the transcript out of the backend's answer; blank means nothing was understood.
pub fn parse_text(body: &str) -> Result<String, Problem> {
    let text = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v.get("text").and_then(|t| t.as_str()).map(|t| t.trim().to_string()))
        .ok_or_else(|| Problem::Other("Unreadable answer from the speech engine".into()))?;
    if text.is_empty() {
        Err(Problem::NotUnderstood)
    } else {
        Ok(text)
    }
}

fn failure(status: u16, body: &str) -> Problem {
    let detail = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v.get("detail").and_then(|d| d.as_str()).map(str::to_string))
        .unwrap_or_default();
    Problem::from_http(status, &detail)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_text_field_and_trims_it() {
        assert_eq!(parse_text(r#"{"text":"  hello there ","language":"en"}"#).unwrap(), "hello there");
    }

    #[test]
    fn blank_text_means_nothing_was_understood() {
        assert_eq!(parse_text(r#"{"text":"   "}"#).unwrap_err(), Problem::NotUnderstood);
    }

    #[test]
    fn garbage_is_an_error_not_a_message() {
        assert!(parse_text("<html>").is_err());
        assert!(parse_text(r#"{"nope":1}"#).is_err());
    }

    #[test]
    fn failures_become_problems() {
        assert_eq!(failure(501, ""), Problem::NoEngine);
        assert_eq!(failure(500, r#"{"detail":"Could not load model small"}"#), Problem::ModelMissing);
        assert!(matches!(failure(502, ""), Problem::Other(m) if m.contains("502")));
    }

    #[tokio::test]
    async fn a_bump_of_the_key_is_not_sent_anywhere() {
        assert_eq!(transcribe(&vec![0.0; 100], None).await.unwrap_err(), Problem::TooShort);
    }
}
