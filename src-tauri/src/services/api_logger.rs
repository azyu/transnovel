#![allow(clippy::type_complexity)]

use crate::db::get_pool;
use crate::models::api_log::{ApiLogEntry, ApiLogSummary};
use sqlx::{Pool, QueryBuilder, Sqlite};

pub async fn save_api_log(entry: &ApiLogEntry) -> Result<(), String> {
    save_api_log_with_pool(get_pool()?, entry).await
}

async fn save_api_log_with_pool(pool: &Pool<Sqlite>, entry: &ApiLogEntry) -> Result<(), String> {
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
    get_api_logs_with_pool(get_pool()?, filter, limit, offset).await
}

async fn get_api_logs_with_pool(
    pool: &Pool<Sqlite>,
    filter: &str,
    limit: usize,
    offset: usize,
) -> Result<Vec<ApiLogSummary>, String> {
    let where_clause = match filter {
        "error" => "WHERE status >= 400",
        "success" => "WHERE status < 400",
        _ => "",
    };

    let mut query = QueryBuilder::<Sqlite>::new(
        "SELECT id, timestamp, method, path, status, duration_ms,
                model, provider, protocol, input_tokens, output_tokens, error
         FROM api_logs ",
    );
    query
        .push(where_clause)
        .push(" ORDER BY timestamp DESC LIMIT ")
        .push_bind(limit as i64)
        .push(" OFFSET ")
        .push_bind(offset as i64);

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
    )> = query
        .build_query_as()
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
    get_api_logs_count_with_pool(get_pool()?, filter).await
}

async fn get_api_logs_count_with_pool(pool: &Pool<Sqlite>, filter: &str) -> Result<u64, String> {
    let query = match filter {
        "error" => "SELECT COUNT(*) FROM api_logs WHERE status >= 400",
        "success" => "SELECT COUNT(*) FROM api_logs WHERE status < 400",
        _ => "SELECT COUNT(*) FROM api_logs",
    };

    let (count,): (i64,) = sqlx::query_as(query)
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

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn setup_test_pool() -> Pool<Sqlite> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("create sqlite memory pool");
        for migration in [
            include_str!("../db/migrations/002_api_logs.sql"),
            include_str!("../db/migrations/003_api_logs_provider.sql"),
        ] {
            sqlx::raw_sql(migration)
                .execute(&pool)
                .await
                .expect("apply api_logs migration");
        }
        pool
    }

    fn entry(id: &str, timestamp: i64, status: u16) -> ApiLogEntry {
        ApiLogEntry {
            id: id.to_string(),
            timestamp,
            method: "POST".to_string(),
            path: "/v1/chat".to_string(),
            status,
            duration_ms: 10,
            model: Some("model".to_string()),
            provider: "provider".to_string(),
            protocol: "openai".to_string(),
            input_tokens: Some(1),
            output_tokens: None,
            request_body: None,
            response_body: None,
            error: None,
        }
    }

    /// Distinct timestamps so ORDER BY timestamp DESC is deterministic.
    async fn seeded_pool() -> Pool<Sqlite> {
        let pool = setup_test_pool().await;
        for log in [
            entry("ok-200", 1_000, 200),
            entry("err-500", 2_000, 500),
            entry("ok-399", 3_000, 399),
            entry("err-400", 4_000, 400),
            entry("ok-204", 5_000, 204),
        ] {
            save_api_log_with_pool(&pool, &log).await.expect("save log");
        }
        pool
    }

    async fn ids(pool: &Pool<Sqlite>, filter: &str, limit: usize, offset: usize) -> Vec<String> {
        get_api_logs_with_pool(pool, filter, limit, offset)
            .await
            .expect("list logs")
            .into_iter()
            .map(|log| log.id)
            .collect()
    }

    #[tokio::test]
    async fn filters_split_at_status_400_and_match_their_counts() {
        let pool = seeded_pool().await;

        for (filter, expected) in [
            (
                "all",
                vec!["ok-204", "err-400", "ok-399", "err-500", "ok-200"],
            ),
            ("error", vec!["err-400", "err-500"]),
            ("success", vec!["ok-204", "ok-399", "ok-200"]),
            // Unknown filters fall back to every row.
            (
                "bogus",
                vec!["ok-204", "err-400", "ok-399", "err-500", "ok-200"],
            ),
        ] {
            assert_eq!(
                ids(&pool, filter, 100, 0).await,
                expected,
                "filter {filter}"
            );
            assert_eq!(
                get_api_logs_count_with_pool(&pool, filter)
                    .await
                    .expect("count logs"),
                expected.len() as u64,
                "count for filter {filter}"
            );
        }
    }

    #[tokio::test]
    async fn paginates_with_limit_and_offset_in_descending_timestamp_order() {
        let pool = seeded_pool().await;

        assert!(ids(&pool, "all", 0, 0).await.is_empty());
        assert_eq!(ids(&pool, "all", 2, 0).await, vec!["ok-204", "err-400"]);
        assert_eq!(ids(&pool, "all", 2, 2).await, vec!["ok-399", "err-500"]);
        assert_eq!(ids(&pool, "all", 2, 4).await, vec!["ok-200"]);
        assert!(ids(&pool, "all", 2, 5).await.is_empty());
        assert_eq!(ids(&pool, "success", 1, 1).await, vec!["ok-399"]);
    }

    #[tokio::test]
    async fn round_trips_summary_fields() {
        let pool = seeded_pool().await;

        let logs = get_api_logs_with_pool(&pool, "error", 1, 0)
            .await
            .expect("list logs");
        let log = &logs[0];
        assert_eq!(
            (log.id.as_str(), log.timestamp, log.status, log.duration_ms),
            ("err-400", 4_000, 400, 10)
        );
        assert_eq!(log.model.as_deref(), Some("model"));
        assert_eq!(log.provider, "provider");
        assert_eq!((log.input_tokens, log.output_tokens), (Some(1), None));
    }
}
