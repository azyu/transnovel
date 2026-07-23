use std::time::Duration;

use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, Runtime};
use tauri_plugin_updater::UpdaterExt;

const UPDATE_CHECK_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInfo {
    pub current_version: String,
    pub version: String,
    pub body: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum AppUpdateEvent {
    Started {
        #[serde(rename = "contentLength")]
        content_length: Option<u64>,
    },
    Progress {
        #[serde(rename = "chunkLength")]
        chunk_length: usize,
    },
    Finished,
}

pub async fn check_for_update<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<AppUpdateInfo>, String> {
    let update = build_updater(app)?.check().await.map_err(check_error)?;

    Ok(update.map(|update| AppUpdateInfo {
        current_version: update.current_version,
        version: update.version,
        body: update.body,
    }))
}

pub async fn install_update<R: Runtime>(
    app: &AppHandle<R>,
    expected_version: &str,
    on_event: Channel<AppUpdateEvent>,
) -> Result<(), String> {
    let update = build_updater(app)?
        .check()
        .await
        .map_err(check_error)?
        .ok_or_else(|| "설치할 업데이트가 없습니다.".to_string())?;

    validate_expected_version(expected_version, &update.version)?;

    let progress_events = on_event.clone();
    let finished_events = on_event;
    let mut started = false;

    update
        .download_and_install(
            move |chunk_length, content_length| {
                if !started {
                    let _ = progress_events.send(AppUpdateEvent::Started { content_length });
                    started = true;
                }
                let _ = progress_events.send(AppUpdateEvent::Progress { chunk_length });
            },
            move || {
                let _ = finished_events.send(AppUpdateEvent::Finished);
            },
        )
        .await
        .map_err(|error| format!("업데이트 설치 실패: {error}"))?;

    app.restart();
}

fn build_updater<R: Runtime>(app: &AppHandle<R>) -> Result<tauri_plugin_updater::Updater, String> {
    app.updater_builder()
        .timeout(UPDATE_CHECK_TIMEOUT)
        .build()
        .map_err(|error| format!("업데이트 확인 준비 실패: {error}"))
}

fn check_error(error: tauri_plugin_updater::Error) -> String {
    format!("업데이트 확인 실패: {error}")
}

fn validate_expected_version(expected_version: &str, actual_version: &str) -> Result<(), String> {
    if expected_version == actual_version {
        return Ok(());
    }

    Err(format!(
        "업데이트 버전이 변경되었습니다. 다시 확인해 주세요. ({expected_version} → {actual_version})"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_an_update_version_that_changed_after_confirmation() {
        let error = validate_expected_version("0.1.4", "0.1.5").expect_err("version mismatch");

        assert!(error.contains("0.1.4"));
        assert!(error.contains("0.1.5"));
    }

    #[test]
    fn serializes_download_progress_for_the_frontend_channel() {
        let event = serde_json::to_value(AppUpdateEvent::Started {
            content_length: Some(128),
        })
        .expect("serialize updater event");

        assert_eq!(
            event,
            serde_json::json!({
                "event": "Started",
                "data": {
                    "contentLength": 128
                }
            })
        );
    }
}
