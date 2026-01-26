#![allow(clippy::type_complexity)]

use crate::db::get_pool;
use crate::models::api_log::{ApiLogEntry, ApiLogSummary};

pub async fn save_api_log(entry: &ApiLogEntry) -> Result<(), String> {
    let pool = get_pool()?;

    sqlx::query(
        r#"
        INSERT INTO api_logs (
            id, timestamp, method, path, status, duration_ms,
            model, provider, protocol, input_tokens, output_tokens,
            request_body, response_body, error
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        "#,
    )
    .bind(&entry.id)
    .bind(entry.timestamp)
    .bind(&entry.method)
    .bind(&entry.path)
    .bind(entry.status)
    .bind(entry.duration_ms as i64)
    .bind(&entry.model)
    .bind(&entry.provider)
    .bind(&entry.protocol)
    .bind(entry.input_tokens.map(|t| t as i64))
    .bind(entry.output_tokens.map(|t| t as i64))
    .bind(&entry.request_body)
    .bind(&entry.response_body)
    .bind(&entry.error)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to save API log: {}", e))?;

    Ok(())
}

pub async fn get_api_logs(
    filter: &str,
    limit: usize,
    offset: usize,
) -> Result<Vec<ApiLogSummary>, String> {
    let pool = get_pool()?;

    let where_clause = match filter {
        "error" => "WHERE status >= 400",
        "success" => "WHERE status < 400",
        _ => "",
    };

    let query = format!(
        r#"
        SELECT id, timestamp, method, path, status, duration_ms,
               model, provider, protocol, input_tokens, output_tokens, error
        FROM api_logs
        {}
        ORDER BY timestamp DESC
        LIMIT ?1 OFFSET ?2
        "#,
        where_clause
    );

    let rows: Vec<(
        String,
        i64,
        String,
        String,
        i64,
        i64,
        Option<String>,
        String,
        String,
        Option<i64>,
        Option<i64>,
        Option<String>,
    )> = sqlx::query_as(&query)
        .bind(limit as i64)
        .bind(offset as i64)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch API logs: {}", e))?;

    Ok(rows
        .into_iter()
        .map(|row| ApiLogSummary {
            id: row.0,
            timestamp: row.1,
            method: row.2,
            path: row.3,
            status: row.4 as u16,
            duration_ms: row.5 as u64,
            model: row.6,
            provider: row.7,
            protocol: row.8,
            input_tokens: row.9.map(|t| t as u32),
            output_tokens: row.10.map(|t| t as u32),
            error: row.11,
        })
        .collect())
}

pub async fn get_api_log_detail(id: &str) -> Result<ApiLogEntry, String> {
    let pool = get_pool()?;

    let row: (
        String,
        i64,
        String,
        String,
        i64,
        i64,
        Option<String>,
        String,
        String,
        Option<i64>,
        Option<i64>,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = sqlx::query_as(
        r#"
        SELECT id, timestamp, method, path, status, duration_ms,
               model, provider, protocol, input_tokens, output_tokens,
               request_body, response_body, error
        FROM api_logs
        WHERE id = ?1
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("API log not found: {}", e))?;

    Ok(ApiLogEntry {
        id: row.0,
        timestamp: row.1,
        method: row.2,
        path: row.3,
        status: row.4 as u16,
        duration_ms: row.5 as u64,
        model: row.6,
        provider: row.7,
        protocol: row.8,
        input_tokens: row.9.map(|t| t as u32),
        output_tokens: row.10.map(|t| t as u32),
        request_body: row.11,
        response_body: row.12,
        error: row.13,
    })
}

pub async fn get_api_logs_count(filter: &str) -> Result<u64, String> {
    let pool = get_pool()?;

    let where_clause = match filter {
        "error" => "WHERE status >= 400",
        "success" => "WHERE status < 400",
        _ => "",
    };

    let query = format!("SELECT COUNT(*) FROM api_logs {}", where_clause);

    let (count,): (i64,) = sqlx::query_as(&query)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to count API logs: {}", e))?;

    Ok(count as u64)
}

pub async fn clear_api_logs() -> Result<u64, String> {
    let pool = get_pool()?;

    let result = sqlx::query("DELETE FROM api_logs")
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to clear API logs: {}", e))?;

    Ok(result.rows_affected())
}

#[allow(dead_code)]
pub async fn cleanup_old_logs(days: u32) -> Result<u64, String> {
    let pool = get_pool()?;

    let cutoff = chrono::Utc::now().timestamp_millis() - (days as i64 * 24 * 60 * 60 * 1000);

    let result = sqlx::query("DELETE FROM api_logs WHERE timestamp < ?1")
        .bind(cutoff)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to cleanup old logs: {}", e))?;

    Ok(result.rows_affected())
}
