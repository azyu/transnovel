use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::get_pool;
use crate::services::antigravity::DEFAULT_ANTIGRAVITY_URL;

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

#[derive(Debug, Serialize)]
pub struct AntigravityStatus {
    pub running: bool,
    pub authenticated: bool,
    pub url: String,
}

#[tauri::command]
pub async fn check_antigravity_status(url: Option<String>) -> Result<AntigravityStatus, String> {
    let base_url = url.filter(|u| !u.is_empty()).unwrap_or_else(|| DEFAULT_ANTIGRAVITY_URL.to_string());
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    
    let models_url = format!("{}/v1/models", base_url);
    let response = client.get(&models_url).send().await;
    
    match response {
        Ok(r) if r.status().is_success() => {
            Ok(AntigravityStatus {
                running: true,
                authenticated: true,
                url: base_url,
            })
        }
        Ok(r) if r.status().as_u16() == 401 || r.status().as_u16() == 403 => {
            Ok(AntigravityStatus {
                running: true,
                authenticated: false,
                url: base_url,
            })
        }
        _ => {
            Ok(AntigravityStatus {
                running: false,
                authenticated: false,
                url: base_url,
            })
        }
    }
}

#[tauri::command]
pub async fn open_antigravity_auth(url: Option<String>) -> Result<(), String> {
    let base_url = url.filter(|u| !u.is_empty()).unwrap_or_else(|| DEFAULT_ANTIGRAVITY_URL.to_string());
    let auth_url = format!("{}/auth", base_url);
    open::that(&auth_url).map_err(|e| format!("브라우저 열기 실패: {}", e))?;
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct GeminiModel {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub input_token_limit: u32,
    pub output_token_limit: u32,
}

#[derive(Debug, Deserialize)]
struct GeminiModelsResponse {
    models: Option<Vec<GeminiModelInfo>>,
}

#[derive(Debug, Deserialize)]
struct GeminiModelInfo {
    name: String,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    description: Option<String>,
    #[serde(rename = "supportedGenerationMethods")]
    supported_generation_methods: Option<Vec<String>>,
    #[serde(rename = "inputTokenLimit")]
    input_token_limit: Option<u32>,
    #[serde(rename = "outputTokenLimit")]
    output_token_limit: Option<u32>,
}

#[tauri::command]
pub async fn fetch_gemini_models(api_key: String) -> Result<Vec<GeminiModel>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models?key={}",
        api_key
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("API 요청 실패: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API 오류: {}", error_text));
    }

    let models_response: GeminiModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("응답 파싱 실패: {}", e))?;

    let models = models_response
        .models
        .unwrap_or_default()
        .into_iter()
        .filter(|m| {
            m.supported_generation_methods
                .as_ref()
                .map(|methods| methods.contains(&"generateContent".to_string()))
                .unwrap_or(false)
        })
        .filter(|m| {
            let name = m.name.to_lowercase();
            name.contains("gemini") && !name.contains("aqa") && !name.contains("embedding")
        })
        .map(|m| {
            let model_id = m.name.replace("models/", "");
            GeminiModel {
                name: model_id.clone(),
                display_name: m.display_name.unwrap_or(model_id),
                description: m.description.unwrap_or_default(),
                input_token_limit: m.input_token_limit.unwrap_or(0),
                output_token_limit: m.output_token_limit.unwrap_or(0),
            }
        })
        .collect();

    Ok(models)
}

#[derive(Debug, Serialize)]
pub struct AntigravityModel {
    pub id: String,
    pub name: String,
    pub provider: String,
}

#[derive(Debug, Deserialize)]
struct AntigravityModelsResponse {
    data: Option<Vec<AntigravityModelInfo>>,
}

#[derive(Debug, Deserialize)]
struct AntigravityModelInfo {
    id: String,
    #[allow(dead_code)]
    object: Option<String>,
    owned_by: Option<String>,
}

#[tauri::command]
pub async fn fetch_antigravity_models(url: Option<String>) -> Result<Vec<AntigravityModel>, String> {
    let base_url = url.filter(|u| !u.is_empty()).unwrap_or_else(|| DEFAULT_ANTIGRAVITY_URL.to_string());
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/v1/models", base_url);

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("프록시 연결 실패: {}", e))?;

    if !response.status().is_success() {
        return Err("프록시 인증이 필요하거나 연결할 수 없습니다.".to_string());
    }

    let models_response: AntigravityModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("응답 파싱 실패: {}", e))?;

    let models = models_response
        .data
        .unwrap_or_default()
        .into_iter()
        .map(|m| {
            let provider = m.owned_by.clone().unwrap_or_else(|| {
                if m.id.contains("claude") { "anthropic".to_string() }
                else if m.id.contains("gemini") { "google".to_string() }
                else if m.id.contains("gpt") { "openai".to_string() }
                else { "unknown".to_string() }
            });
            let name = format_model_name(&m.id);
            AntigravityModel {
                id: m.id,
                name,
                provider,
            }
        })
        .collect();

    Ok(models)
}

fn format_model_name(id: &str) -> String {
    let name = id
        .replace("-", " ")
        .replace("_", " ");
    
    let words: Vec<String> = name
        .split_whitespace()
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().chain(chars).collect(),
            }
        })
        .collect();
    
    words.join(" ")
}

#[derive(Debug, Serialize)]
pub struct CacheStats {
    pub count: i64,
}

#[tauri::command]
pub async fn get_cache_stats() -> Result<CacheStats, String> {
    let pool = get_pool()?;
    
    let row = sqlx::query("SELECT COUNT(*) as count FROM translation_cache")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(CacheStats {
        count: row.get::<i64, _>("count"),
    })
}

#[tauri::command]
pub async fn clear_cache() -> Result<i64, String> {
    let pool = get_pool()?;
    
    let result = sqlx::query("DELETE FROM translation_cache")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(result.rows_affected() as i64)
}

#[tauri::command]
pub async fn reset_all() -> Result<(), String> {
    let pool = get_pool()?;
    
    sqlx::query("DELETE FROM translation_cache")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    
    sqlx::query("DELETE FROM settings")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    
    sqlx::query("DELETE FROM api_keys")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}
