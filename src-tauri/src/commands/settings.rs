use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::get_pool;

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
pub async fn get_settings() -> Result<Vec<Setting>, String> {
    let pool = get_pool()?;
    
    let rows = sqlx::query("SELECT key, value FROM settings")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    
    let settings: Vec<Setting> = rows
        .iter()
        .map(|row| Setting {
            key: row.get("key"),
            value: row.get("value"),
        })
        .collect();
    
    if settings.is_empty() {
        return Ok(get_default_settings());
    }
    
    Ok(settings)
}

fn get_default_settings() -> Vec<Setting> {
    vec![
        Setting { key: "model".into(), value: "gemini-2.0-flash".into() },
        Setting { key: "temperature".into(), value: "1.0".into() },
        Setting { key: "top_p".into(), value: "0.95".into() },
    ]
}

#[tauri::command]
pub async fn set_setting(key: String, value: String) -> Result<(), String> {
    let pool = get_pool()?;
    
    sqlx::query(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"
    )
    .bind(&key)
    .bind(&value)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn get_api_keys() -> Result<Vec<ApiKey>, String> {
    let pool = get_pool()?;
    
    let rows = sqlx::query(
        "SELECT id, key_type, api_key, is_active, daily_usage FROM api_keys WHERE is_active = 1"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(rows
        .iter()
        .map(|row| ApiKey {
            id: row.get("id"),
            key_type: row.get("key_type"),
            api_key: row.get("api_key"),
            is_active: row.get("is_active"),
            daily_usage: row.get("daily_usage"),
        })
        .collect())
}

#[tauri::command]
pub async fn add_api_key(key_type: String, api_key: String) -> Result<ApiKey, String> {
    let pool = get_pool()?;
    
    let result = sqlx::query(
        "INSERT INTO api_keys (key_type, api_key, is_active, daily_usage) VALUES (?, ?, 1, 0)"
    )
    .bind(&key_type)
    .bind(&api_key)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(ApiKey {
        id: result.last_insert_rowid(),
        key_type,
        api_key,
        is_active: true,
        daily_usage: 0,
    })
}

#[tauri::command]
pub async fn remove_api_key(id: i64) -> Result<(), String> {
    let pool = get_pool()?;
    
    sqlx::query("DELETE FROM api_keys WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

pub async fn get_active_api_key(key_type: &str) -> Result<Option<String>, String> {
    let pool = get_pool()?;
    
    let row = sqlx::query(
        "SELECT api_key FROM api_keys WHERE key_type = ? AND is_active = 1 ORDER BY daily_usage ASC LIMIT 1"
    )
    .bind(key_type)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(row.map(|r| r.get("api_key")))
}

pub async fn increment_api_usage(id: i64) -> Result<(), String> {
    let pool = get_pool()?;
    
    sqlx::query(
        "UPDATE api_keys SET daily_usage = daily_usage + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(())
}
