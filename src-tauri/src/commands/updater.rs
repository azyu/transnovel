use tauri::{ipc::Channel, AppHandle};

use crate::services::updater::{AppUpdateEvent, AppUpdateInfo};

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<AppUpdateInfo>, String> {
    crate::services::updater::check_for_update(&app).await
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    expected_version: String,
    on_event: Channel<AppUpdateEvent>,
) -> Result<(), String> {
    crate::services::updater::install_update(&app, &expected_version, on_event).await
}
