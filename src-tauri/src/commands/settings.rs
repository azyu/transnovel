use serde::{Deserialize, Serialize};
use sqlx::{Pool, Row, Sqlite};
use std::time::Duration;

use crate::db::get_pool;
use crate::services::codex::{CodexClient, CODEX_MODELS_CLIENT_VERSION};
use crate::services::llm_config;
use crate::services::openai_oauth;

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestReleaseInfo {
    pub version: String,
    pub tag_name: String,
    pub name: String,
    pub html_url: String,
}

#[derive(Debug, Deserialize)]
struct GitHubLatestReleaseResponse {
    tag_name: String,
    html_url: String,
    name: Option<String>,
}

fn normalize_release_version(tag: &str) -> Result<String, String> {
    let version = tag
        .strip_prefix('v')
        .ok_or_else(|| "릴리즈 버전 형식이 올바르지 않습니다.".to_string())?;

    let segments: Vec<&str> = version.split('.').collect();
    if segments.len() != 3
        || segments
            .iter()
            .any(|segment| segment.parse::<u64>().is_err())
    {
        return Err("릴리즈 버전 형식이 올바르지 않습니다.".to_string());
    }

    Ok(version.to_string())
}

#[tauri::command]
pub async fn get_settings() -> Result<Vec<Setting>, String> {
    let pool = get_pool()?;

    let rows = sqlx::query("SELECT key, value FROM settings")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut settings: Vec<Setting> = rows
        .iter()
        .map(|row| Setting {
            key: row.get("key"),
            value: row.get("value"),
        })
        .collect();

    if settings.is_empty() {
        settings = get_default_settings();
    }

    llm_config::load_effective_settings(settings)
}

fn get_default_settings() -> Vec<Setting> {
    vec![
        Setting {
            key: "model".into(),
            value: "gemini-2.0-flash".into(),
        },
        Setting {
            key: "temperature".into(),
            value: "1.0".into(),
        },
        Setting {
            key: "top_p".into(),
            value: "0.95".into(),
        },
    ]
}

#[tauri::command]
pub async fn set_setting(key: String, value: String) -> Result<(), String> {
    let pool = get_pool()?;

    sqlx::query(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
    )
    .bind(&key)
    .bind(&value)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

// --- OpenAI OAuth Commands ---

#[derive(Debug, Serialize)]
pub struct OpenAIOAuthStatus {
    pub authenticated: bool,
    pub email: Option<String>,
}

#[tauri::command]
pub async fn start_openai_oauth(provider_id: String) -> Result<OpenAIOAuthStatus, String> {
    let tokens = openai_oauth::start_oauth_flow().await?;
    let email = tokens.email.clone();
    openai_oauth::store_tokens(&provider_id, &tokens).await?;

    Ok(OpenAIOAuthStatus {
        authenticated: true,
        email,
    })
}

#[tauri::command]
pub async fn check_openai_oauth_status(provider_id: String) -> Result<OpenAIOAuthStatus, String> {
    get_settings().await?;

    // Try to get a valid token (auto-refreshes if expired)
    match openai_oauth::ensure_valid_token(&provider_id).await {
        Ok(access_token) => {
            let email = openai_oauth::get_or_fetch_email(&provider_id, &access_token).await?;
            Ok(OpenAIOAuthStatus {
                authenticated: true,
                email,
            })
        }
        Err(_) => Ok(OpenAIOAuthStatus {
            authenticated: false,
            email: None,
        }),
    }
}

#[tauri::command]
pub async fn refresh_openai_token(provider_id: String) -> Result<(), String> {
    openai_oauth::ensure_valid_token(&provider_id).await?;
    Ok(())
}

#[tauri::command]
pub async fn fetch_openai_oauth_models(
    provider_id: String,
) -> Result<Vec<OpenRouterModel>, String> {
    let access_token = openai_oauth::ensure_valid_token(&provider_id).await?;
    let client = CodexClient::new(access_token, None);
    let models = client.list_models(CODEX_MODELS_CLIENT_VERSION).await?;

    Ok(models
        .into_iter()
        .map(|model| {
            let context_length = model
                .resolved_context_window()
                .and_then(|length| u32::try_from(length).ok())
                .unwrap_or(0);

            OpenRouterModel {
                id: model.slug,
                name: model.display_name,
                context_length,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn get_api_keys() -> Result<Vec<ApiKey>, String> {
    let pool = get_pool()?;

    let rows = sqlx::query(
        "SELECT id, key_type, api_key, is_active, daily_usage FROM api_keys WHERE is_active = 1",
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
        "INSERT INTO api_keys (key_type, api_key, is_active, daily_usage) VALUES (?, ?, 1, 0)",
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

#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| format!("브라우저 열기 실패: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn fetch_latest_release_info() -> Result<LatestReleaseInfo, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("업데이트 확인 준비 실패: {}", e))?;

    let response = client
        .get("https://api.github.com/repos/azyu/transnovel/releases/latest")
        .header(reqwest::header::USER_AGENT, "TransNovel")
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("업데이트 확인 실패: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "업데이트 정보를 불러오지 못했습니다. 상태 코드: {}",
            response.status()
        ));
    }

    let release: GitHubLatestReleaseResponse = response
        .json()
        .await
        .map_err(|e| format!("릴리즈 정보 해석 실패: {}", e))?;

    let version = normalize_release_version(&release.tag_name)?;

    Ok(LatestReleaseInfo {
        version,
        tag_name: release.tag_name.clone(),
        name: release.name.unwrap_or_else(|| release.tag_name.clone()),
        html_url: release.html_url,
    })
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

fn format_model_name(id: &str) -> String {
    let name = id.replace("-", " ").replace("_", " ");

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
pub struct OpenRouterModel {
    pub id: String,
    pub name: String,
    pub context_length: u32,
}

#[derive(Debug, Deserialize)]
struct OpenRouterModelsResponse {
    data: Option<Vec<OpenRouterModelInfo>>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterModelInfo {
    id: String,
    name: Option<String>,
    context_length: Option<u32>,
}

fn build_openai_compatible_models_url(base_url: &str) -> String {
    format!(
        "{}{}",
        base_url.trim_end_matches("/v1").trim_end_matches('/'),
        "/v1/models"
    )
}

#[derive(Debug, Deserialize)]
struct OpenAICompatibleModelsResponse {
    data: Option<Vec<OpenAICompatibleModelInfo>>,
}

#[derive(Debug, Deserialize)]
struct OpenAICompatibleModelInfo {
    id: String,
}

fn map_openai_compatible_models(response: OpenAICompatibleModelsResponse) -> Vec<OpenRouterModel> {
    response
        .data
        .unwrap_or_default()
        .into_iter()
        .map(|m| OpenRouterModel {
            id: m.id.clone(),
            name: format_model_name(&m.id),
            context_length: 0,
        })
        .collect()
}

#[tauri::command]
pub async fn fetch_openrouter_models(api_key: String) -> Result<Vec<OpenRouterModel>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get("https://openrouter.ai/api/v1/models")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("API 요청 실패: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API 오류: {}", error_text));
    }

    let models_response: OpenRouterModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("응답 파싱 실패: {}", e))?;

    let mut models: Vec<OpenRouterModel> = models_response
        .data
        .unwrap_or_default()
        .into_iter()
        .filter(|m| {
            let id = m.id.to_lowercase();
            (id.contains("claude")
                || id.contains("gpt")
                || id.contains("gemini")
                || id.contains("llama")
                || id.contains("deepseek")
                || id.contains("mistral")
                || id.contains("qwen"))
                && !id.contains("free")
                && !id.contains(":extended")
        })
        .map(|m| OpenRouterModel {
            id: m.id.clone(),
            name: m.name.unwrap_or_else(|| format_model_name(&m.id)),
            context_length: m.context_length.unwrap_or(0),
        })
        .collect();

    models.sort_by(|a, b| {
        let score_a = get_openrouter_model_score(&a.id);
        let score_b = get_openrouter_model_score(&b.id);
        score_b.cmp(&score_a)
    });

    Ok(models)
}

#[tauri::command]
pub async fn fetch_openai_compatible_models(
    api_key: String,
    base_url: String,
) -> Result<Vec<OpenRouterModel>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(build_openai_compatible_models_url(&base_url))
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("API 요청 실패: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API 오류: {}", error_text));
    }

    let models_response: OpenAICompatibleModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("응답 파싱 실패: {}", e))?;

    Ok(map_openai_compatible_models(models_response))
}

fn get_openrouter_model_score(id: &str) -> i32 {
    let mut score = 0;
    if id.contains("claude") {
        score += 100;
    }
    if id.contains("sonnet-4") {
        score += 50;
    }
    if id.contains("gpt-4o") {
        score += 80;
    }
    if id.contains("gemini-2") {
        score += 70;
    }
    if id.contains("deepseek") {
        score += 60;
    }
    if id.contains("llama") {
        score += 40;
    }
    score
}

#[derive(Debug, Serialize)]
pub struct CacheStats {
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct NovelCacheStats {
    pub novel_id: String,
    pub title: Option<String>,
    pub site: Option<String>,
    pub count: i64,
    pub total_hits: i64,
}

#[derive(Debug, Serialize)]
pub struct CacheStatsDetailed {
    pub total_count: i64,
    pub total_hits: i64,
    pub by_novel: Vec<NovelCacheStats>,
}

type NovelCacheStatsRow = (Option<String>, i64, i64, Option<String>, Option<String>);

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
pub async fn get_cache_stats_detailed() -> Result<CacheStatsDetailed, String> {
    let pool = get_pool()?;
    get_cache_stats_detailed_with_pool(pool).await
}

async fn get_cache_stats_detailed_with_pool(
    pool: &Pool<Sqlite>,
) -> Result<CacheStatsDetailed, String> {
    let total: (i64, i64) =
        sqlx::query_as("SELECT COUNT(*), COALESCE(SUM(hit_count), 0) FROM translation_cache")
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;

    let by_novel: Vec<NovelCacheStatsRow> = sqlx::query_as(
        "SELECT
            translation_cache.novel_id,
            COUNT(*),
            COALESCE(SUM(translation_cache.hit_count), 0),
            (
                SELECT title
                FROM novels
                WHERE novels.novel_id = translation_cache.novel_id
                  AND (
                      SELECT COUNT(DISTINCT site)
                      FROM novels AS novel_sites
                      WHERE novel_sites.novel_id = translation_cache.novel_id
                  ) = 1
                  AND title IS NOT NULL
                  AND title != ''
                ORDER BY updated_at DESC, id DESC
                LIMIT 1
            ) AS title,
            (
                SELECT site
                FROM novels
                WHERE novels.novel_id = translation_cache.novel_id
                  AND (
                      SELECT COUNT(DISTINCT site)
                      FROM novels AS novel_sites
                      WHERE novel_sites.novel_id = translation_cache.novel_id
                  ) = 1
                  AND site IS NOT NULL
                  AND site != ''
                ORDER BY updated_at DESC, id DESC
                LIMIT 1
            ) AS site
         FROM translation_cache
         GROUP BY translation_cache.novel_id
         ORDER BY COUNT(*) DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(CacheStatsDetailed {
        total_count: total.0,
        total_hits: total.1,
        by_novel: by_novel
            .into_iter()
            .map(|(novel_id, count, hits, title, site)| NovelCacheStats {
                novel_id: novel_id.unwrap_or_else(|| "(unknown)".to_string()),
                title,
                site,
                count,
                total_hits: hits,
            })
            .collect(),
    })
}

#[tauri::command]
pub async fn clear_cache() -> Result<i64, String> {
    let pool = get_pool()?;

    let result = sqlx::query("DELETE FROM translation_cache")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM completed_chapters")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.rows_affected() as i64)
}

#[tauri::command]
pub async fn clear_cache_by_novel(novel_id: String) -> Result<i64, String> {
    clear_cache_by_novel_internal(&novel_id).await
}

async fn clear_translation_cache_by_novel_with_pool(
    pool: &Pool<Sqlite>,
    novel_id: &str,
) -> Result<i64, String> {
    let result = sqlx::query("DELETE FROM translation_cache WHERE novel_id = ?")
        .bind(novel_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.rows_affected() as i64)
}

async fn clear_cache_by_novel_with_pool(
    pool: &Pool<Sqlite>,
    novel_id: &str,
) -> Result<i64, String> {
    let deleted_rows = clear_translation_cache_by_novel_with_pool(pool, novel_id).await?;

    sqlx::query("DELETE FROM completed_chapters WHERE novel_id = ?")
        .bind(novel_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(deleted_rows)
}

pub(crate) async fn clear_cache_by_novel_internal(novel_id: &str) -> Result<i64, String> {
    let pool = get_pool()?;
    clear_cache_by_novel_with_pool(pool, novel_id).await
}

pub(crate) async fn clear_translation_cache_by_novel_internal(
    novel_id: &str,
) -> Result<i64, String> {
    let pool = get_pool()?;
    clear_translation_cache_by_novel_with_pool(pool, novel_id).await
}

async fn reset_all_with_pool(pool: &Pool<Sqlite>) -> Result<(), String> {
    sqlx::query("DELETE FROM translation_cache")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM completed_chapters")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM novel_character_dictionary")
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

#[tauri::command]
pub async fn reset_all() -> Result<(), String> {
    let pool = get_pool()?;
    reset_all_with_pool(pool).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};

    async fn setup_test_pool() -> Pool<Sqlite> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("create sqlite memory pool");

        sqlx::query(include_str!("../db/migrations/001_initial.sql"))
            .execute(&pool)
            .await
            .expect("apply initial migration");

        pool
    }

    async fn count_rows(pool: &Pool<Sqlite>, table: &str, novel_id: &str) -> i64 {
        let query = format!("SELECT COUNT(*) as count FROM {table} WHERE novel_id = ?");
        let row = sqlx::query(&query)
            .bind(novel_id)
            .fetch_one(pool)
            .await
            .expect("count rows");

        row.get("count")
    }

    async fn count_all_rows(pool: &Pool<Sqlite>, table: &str) -> i64 {
        let query = format!("SELECT COUNT(*) as count FROM {table}");
        let row = sqlx::query(&query)
            .fetch_one(pool)
            .await
            .expect("count all rows");

        row.get("count")
    }

    #[tokio::test]
    async fn clear_translation_cache_by_novel_keeps_completed_chapters() {
        let pool = setup_test_pool().await;
        let novel_id = "novel-1";

        sqlx::query(
            "INSERT INTO translation_cache (text_hash, novel_id, original_text, translated_text) VALUES (?, ?, ?, ?)",
        )
        .bind("hash-1")
        .bind(novel_id)
        .bind("원문")
        .bind("번역")
        .execute(&pool)
        .await
        .expect("insert translation cache");

        sqlx::query(
            "INSERT INTO completed_chapters (novel_id, chapter_number, paragraph_count) VALUES (?, ?, ?)",
        )
        .bind(novel_id)
        .bind(1_i64)
        .bind(10_i64)
        .execute(&pool)
        .await
        .expect("insert completed chapter");

        clear_translation_cache_by_novel_with_pool(&pool, novel_id)
            .await
            .expect("clear translation cache");

        assert_eq!(count_rows(&pool, "translation_cache", novel_id).await, 0);
        assert_eq!(count_rows(&pool, "completed_chapters", novel_id).await, 1);
    }

    #[tokio::test]
    async fn clear_cache_by_novel_with_pool_removes_completed_chapters() {
        let pool = setup_test_pool().await;
        let novel_id = "novel-1";

        sqlx::query(
            "INSERT INTO translation_cache (text_hash, novel_id, original_text, translated_text) VALUES (?, ?, ?, ?)",
        )
        .bind("hash-1")
        .bind(novel_id)
        .bind("원문")
        .bind("번역")
        .execute(&pool)
        .await
        .expect("insert translation cache");

        sqlx::query(
            "INSERT INTO completed_chapters (novel_id, chapter_number, paragraph_count) VALUES (?, ?, ?)",
        )
        .bind(novel_id)
        .bind(1_i64)
        .bind(10_i64)
        .execute(&pool)
        .await
        .expect("insert completed chapter");

        clear_cache_by_novel_with_pool(&pool, novel_id)
            .await
            .expect("clear cache and completed chapters");

        assert_eq!(count_rows(&pool, "translation_cache", novel_id).await, 0);
        assert_eq!(count_rows(&pool, "completed_chapters", novel_id).await, 0);
    }

    #[tokio::test]
    async fn reset_all_with_pool_clears_character_dictionaries() {
        let pool = setup_test_pool().await;

        sqlx::query(include_str!(
            "../db/migrations/004_novel_character_dictionary.sql"
        ))
        .execute(&pool)
        .await
        .expect("apply dictionary migration");

        sqlx::query(
            "INSERT INTO translation_cache (text_hash, novel_id, original_text, translated_text) VALUES (?, ?, ?, ?)",
        )
        .bind("hash-1")
        .bind("novel-1")
        .bind("원문")
        .bind("번역")
        .execute(&pool)
        .await
        .expect("insert translation cache");

        sqlx::query(
            "INSERT INTO completed_chapters (novel_id, chapter_number, paragraph_count) VALUES (?, ?, ?)",
        )
        .bind("novel-1")
        .bind(1_i64)
        .bind(10_i64)
        .execute(&pool)
        .await
        .expect("insert completed chapter");

        sqlx::query("INSERT INTO settings (key, value) VALUES (?, ?)")
            .bind("model")
            .bind("gemini-2.0-flash")
            .execute(&pool)
            .await
            .expect("insert setting");

        sqlx::query(
            "INSERT INTO api_keys (key_type, api_key, is_active, daily_usage) VALUES (?, ?, 1, 0)",
        )
        .bind("gemini")
        .bind("secret")
        .execute(&pool)
        .await
        .expect("insert api key");

        sqlx::query(
            "INSERT INTO novel_character_dictionary (site, novel_id, entries_json) VALUES (?, ?, ?)",
        )
        .bind("syosetu")
        .bind("novel-1")
        .bind("[{\"source_text\":\"周\",\"reading\":\"あまね\",\"target_name\":\"아마네\"}]")
        .execute(&pool)
        .await
        .expect("insert character dictionary");

        reset_all_with_pool(&pool).await.expect("reset all data");

        assert_eq!(count_all_rows(&pool, "translation_cache").await, 0);
        assert_eq!(count_all_rows(&pool, "completed_chapters").await, 0);
        assert_eq!(count_all_rows(&pool, "settings").await, 0);
        assert_eq!(count_all_rows(&pool, "api_keys").await, 0);
        assert_eq!(count_all_rows(&pool, "novel_character_dictionary").await, 0);
    }

    #[tokio::test]
    async fn get_cache_stats_detailed_with_pool_includes_latest_novel_metadata() {
        let pool = setup_test_pool().await;

        sqlx::query(
            "INSERT INTO translation_cache (text_hash, novel_id, original_text, translated_text, hit_count)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind("hash-1")
        .bind("n6233ly")
        .bind("원문 1")
        .bind("번역 1")
        .bind(10_i64)
        .execute(&pool)
        .await
        .expect("insert first cache row");

        sqlx::query(
            "INSERT INTO translation_cache (text_hash, novel_id, original_text, translated_text, hit_count)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind("hash-2")
        .bind("n6233ly")
        .bind("원문 2")
        .bind("번역 2")
        .bind(5_i64)
        .execute(&pool)
        .await
        .expect("insert second cache row");

        sqlx::query(
            "INSERT INTO novels (site, novel_id, title, total_chapters) VALUES (?, ?, ?, ?)",
        )
        .bind("syosetu")
        .bind("n6233ly")
        .bind("작품 제목")
        .bind(232_i64)
        .execute(&pool)
        .await
        .expect("insert novel metadata");

        let stats = get_cache_stats_detailed_with_pool(&pool)
            .await
            .expect("get cache stats");

        assert_eq!(stats.total_count, 2);
        assert_eq!(stats.total_hits, 15);
        assert_eq!(stats.by_novel.len(), 1);
        assert_eq!(stats.by_novel[0].novel_id, "n6233ly");
        assert_eq!(stats.by_novel[0].title.as_deref(), Some("작품 제목"));
        assert_eq!(stats.by_novel[0].site.as_deref(), Some("syosetu"));
        assert_eq!(stats.by_novel[0].count, 2);
        assert_eq!(stats.by_novel[0].total_hits, 15);
    }

    #[tokio::test]
    async fn get_cache_stats_detailed_with_pool_omits_ambiguous_metadata_for_shared_novel_ids() {
        let pool = setup_test_pool().await;

        sqlx::query(
            "INSERT INTO translation_cache (text_hash, novel_id, original_text, translated_text, hit_count)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind("hash-1")
        .bind("n6233ly")
        .bind("원문 1")
        .bind("번역 1")
        .bind(3_i64)
        .execute(&pool)
        .await
        .expect("insert cache row");

        sqlx::query(
            "INSERT INTO novels (site, novel_id, title, total_chapters) VALUES (?, ?, ?, ?)",
        )
        .bind("syosetu")
        .bind("n6233ly")
        .bind("시리즈 A")
        .bind(10_i64)
        .execute(&pool)
        .await
        .expect("insert syosetu metadata");

        sqlx::query(
            "INSERT INTO novels (site, novel_id, title, total_chapters) VALUES (?, ?, ?, ?)",
        )
        .bind("nocturne")
        .bind("n6233ly")
        .bind("시리즈 B")
        .bind(10_i64)
        .execute(&pool)
        .await
        .expect("insert nocturne metadata");

        let stats = get_cache_stats_detailed_with_pool(&pool)
            .await
            .expect("get cache stats");

        assert_eq!(stats.total_count, 1);
        assert_eq!(stats.total_hits, 3);
        assert_eq!(stats.by_novel.len(), 1);
        assert_eq!(stats.by_novel[0].novel_id, "n6233ly");
        assert_eq!(stats.by_novel[0].title, None);
        assert_eq!(stats.by_novel[0].site, None);
        assert_eq!(stats.by_novel[0].count, 1);
        assert_eq!(stats.by_novel[0].total_hits, 3);
    }

    #[test]
    fn normalize_release_version_strips_leading_v() {
        assert_eq!(
            normalize_release_version("v0.1.2").expect("normalize version"),
            "0.1.2"
        );
    }

    #[test]
    fn normalize_release_version_rejects_malformed_tag() {
        let error = normalize_release_version("release-0.1.2").expect_err("invalid tag");
        assert!(error.contains("버전"));
    }

    #[test]
    fn builds_openai_compatible_models_url_from_root_or_v1_base() {
        assert_eq!(
            build_openai_compatible_models_url("https://example.com"),
            "https://example.com/v1/models"
        );
        assert_eq!(
            build_openai_compatible_models_url("https://example.com/"),
            "https://example.com/v1/models"
        );
        assert_eq!(
            build_openai_compatible_models_url("https://example.com/v1"),
            "https://example.com/v1/models"
        );
    }

    #[test]
    fn parses_openai_compatible_models_from_data_response() {
        let response: OpenAICompatibleModelsResponse = serde_json::from_str(
            r#"{
                "data": [
                    {"id": "gpt-5.2", "owned_by": "openai"},
                    {"id": "local-model", "object": "model"}
                ]
            }"#,
        )
        .expect("parse models response");

        let models = map_openai_compatible_models(response);

        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "gpt-5.2");
        assert_eq!(models[0].name, "Gpt 5.2");
        assert_eq!(models[0].context_length, 0);
        assert_eq!(models[1].id, "local-model");
        assert_eq!(models[1].name, "Local Model");
    }
}
