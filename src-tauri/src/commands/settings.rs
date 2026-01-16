use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiKey {
    pub id: i64,
    pub key_type: String,
    pub api_key: String,
    pub is_active: bool,
    pub daily_usage: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

#[tauri::command]
pub async fn get_settings(app: AppHandle) -> Result<Vec<Setting>, String> {
    Ok(vec![
        Setting {
            key: "temperature".to_string(),
            value: "1.0".to_string(),
        },
        Setting {
            key: "top_p".to_string(),
            value: "0.8".to_string(),
        },
        Setting {
            key: "model".to_string(),
            value: "gemini-2.5-flash-preview".to_string(),
        },
    ])
}

#[tauri::command]
pub async fn set_setting(app: AppHandle, key: String, value: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn get_api_keys(app: AppHandle) -> Result<Vec<ApiKey>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn add_api_key(
    app: AppHandle,
    key_type: String,
    api_key: String,
) -> Result<ApiKey, String> {
    Ok(ApiKey {
        id: 1,
        key_type,
        api_key,
        is_active: true,
        daily_usage: 0,
    })
}

#[tauri::command]
pub async fn remove_api_key(app: AppHandle, id: i64) -> Result<(), String> {
    Ok(())
}
