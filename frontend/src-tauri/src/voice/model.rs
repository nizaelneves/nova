//! The voice model from the tray: shows whether it is on this computer, and downloads it when
//! the user clicks. Nothing downloads on its own; Phibe only says it is missing (one notice).

use std::time::Duration;

use serde::Deserialize;
use tauri::menu::MenuItem;
use tauri::{AppHandle, Wry};
use tauri_plugin_notification::NotificationExt;

#[derive(Deserialize, Default, Clone, Debug, PartialEq)]
pub struct ModelStatus {
    #[serde(default)]
    pub installed: bool,
    #[serde(default)]
    pub downloading: bool,
    #[serde(default)]
    pub size_mb: u32,
    #[serde(default)]
    pub progress: f32,
    #[serde(default)]
    pub error: Option<String>,
}

/// The tray item's text and whether it can be clicked.
pub fn label(status: Option<&ModelStatus>) -> (String, bool) {
    match status {
        None => ("Voice model: waiting for Phibe...".into(), false),
        Some(s) if s.installed => ("Voice model: ready".into(), false),
        Some(s) if s.downloading => (format!("Voice model: downloading {}%", (s.progress * 100.0).round() as u32), false),
        Some(s) if s.error.is_some() => ("Voice model: download failed, try again".into(), true),
        Some(s) => (format!("Download voice model ({} MB)", s.size_mb), true),
    }
}

async fn call(post: bool) -> Option<ModelStatus> {
    let client = reqwest::Client::new();
    let url = format!("{}/v1/speech/model{}", crate::api_base(), if post { "/download" } else { "" });
    let request = if post { client.post(url) } else { client.get(url) };
    request.timeout(Duration::from_secs(10)).send().await.ok()?.json::<ModelStatus>().await.ok()
}

fn show(item: &MenuItem<Wry>, status: Option<&ModelStatus>) {
    let (text, enabled) = label(status);
    let _ = item.set_text(text);
    let _ = item.set_enabled(enabled);
}

/// Checks the model a few times after start (Phibe's backend may still be starting), tells the
/// user once if it is missing, and keeps the tray text current.
pub fn watch(app: &AppHandle, item: MenuItem<Wry>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        for _ in 0..8 {
            tokio::time::sleep(Duration::from_secs(8)).await;
            let status = call(false).await;
            show(&item, status.as_ref());
            if let Some(s) = status {
                if !s.installed {
                    let _ = app
                        .notification()
                        .builder()
                        .title("Phibe cannot hear you yet")
                        .body(format!("Download the voice model ({} MB) from the Phibe icon in the tray.", s.size_mb))
                        .show();
                }
                break;
            }
        }
    });
}

/// The tray item was clicked: start the download and follow it until it ends.
pub fn download(item: MenuItem<Wry>) {
    tauri::async_runtime::spawn(async move {
        let mut status = call(true).await;
        loop {
            show(&item, status.as_ref());
            match &status {
                Some(s) if s.downloading => {}
                _ => break,
            }
            tokio::time::sleep(Duration::from_secs(3)).await;
            status = call(false).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status(installed: bool, downloading: bool, progress: f32, error: Option<&str>) -> ModelStatus {
        ModelStatus { installed, downloading, size_mb: 486, progress, error: error.map(str::to_string) }
    }

    #[test]
    fn ready_and_busy_states_cannot_be_clicked() {
        assert_eq!(label(Some(&status(true, false, 1.0, None))), ("Voice model: ready".into(), false));
        assert_eq!(label(Some(&status(false, true, 0.42, None))), ("Voice model: downloading 42%".into(), false));
        assert!(!label(None).1);
    }

    #[test]
    fn a_missing_model_offers_the_download_with_its_size() {
        assert_eq!(label(Some(&status(false, false, 0.0, None))), ("Download voice model (486 MB)".into(), true));
    }

    #[test]
    fn a_failed_download_can_be_tried_again() {
        assert!(label(Some(&status(false, false, 0.2, Some("no network")))).1);
    }
}
