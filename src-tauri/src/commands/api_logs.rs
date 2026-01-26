use crate::models::api_log::{ApiLogEntry, ApiLogSummary};
use crate::services::api_logger;

#[tauri::command]
pub async fn get_api_logs(
    filter: String,
    limit: usize,
    offset: usize,
) -> Result<Vec<ApiLogSummary>, String> {
    api_logger::get_api_logs(&filter, limit, offset).await
}

#[tauri::command]
pub async fn get_api_log_detail(id: String) -> Result<ApiLogEntry, String> {
    api_logger::get_api_log_detail(&id).await
}

#[tauri::command]
pub async fn get_api_logs_count(filter: String) -> Result<u64, String> {
    api_logger::get_api_logs_count(&filter).await
}

#[tauri::command]
pub async fn clear_api_logs() -> Result<u64, String> {
    api_logger::clear_api_logs().await
}
