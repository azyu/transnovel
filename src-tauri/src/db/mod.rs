pub mod schema;

use sqlx::{sqlite::SqlitePoolOptions, Pool, Row, Sqlite};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

static DB_POOL: OnceLock<Pool<Sqlite>> = OnceLock::new();

pub async fn init_db(app: &AppHandle) -> Result<(), String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    
    let db_path = app_dir.join("novels.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());
    
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(|e| e.to_string())?;
    
    sqlx::query(include_str!("migrations/001_initial.sql"))
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(include_str!("migrations/002_api_logs.sql"))
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(include_str!("migrations/004_novel_character_dictionary.sql"))
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(include_str!("migrations/005_watchlist.sql"))
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let has_provider: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM pragma_table_info('api_logs') WHERE name = 'provider'"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;
    
    if has_provider.is_empty() {
        sqlx::query(include_str!("migrations/003_api_logs_provider.sql"))
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    
    run_migrations(&pool).await?;
    
    DB_POOL.set(pool).map_err(|_| "DB already initialized")?;
    
    Ok(())
}

async fn execute_migration_transaction(
    pool: &Pool<Sqlite>,
    sql: &str,
    check_query: &str,
    expected_count: i64,
) -> Result<(), String> {
    let mut connection = pool.acquire().await.map_err(|e| e.to_string())?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await
        .map_err(|e| e.to_string())?;

    let count_result = sqlx::query(check_query)
        .fetch_one(&mut *connection)
        .await
        .map_err(|e| e.to_string());
    let count: i64 = match count_result {
        Ok(row) => row.get(0),
        Err(error) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            return Err(error);
        }
    };
    if count == expected_count {
        sqlx::query("COMMIT")
            .execute(&mut *connection)
            .await
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    if let Err(error) = sqlx::raw_sql(sql).execute(&mut *connection).await {
        let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
        return Err(error.to_string());
    }
    sqlx::query("COMMIT")
        .execute(&mut *connection)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
async fn run_migrations(pool: &Pool<Sqlite>) -> Result<(), String> {
    // SQLite lacks ALTER TABLE ... ADD COLUMN IF NOT EXISTS. Legacy cache rows
    // are discarded because their site/context identity is unknowable.
    let cache_columns: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM pragma_table_info('translation_cache')
         WHERE name IN ('site', 'novel_id', 'context_fingerprint', 'normalized_source')",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    if cache_columns.len() < 4 {
        execute_migration_transaction(
            pool,
            include_str!("migrations/007_cache_identity.sql"),
            "SELECT COUNT(*) FROM pragma_table_info('translation_cache')
             WHERE name IN ('site', 'novel_id', 'context_fingerprint', 'normalized_source')",
            4,
        )
        .await?;
    }

    let completed_site: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM pragma_table_info('completed_chapters') WHERE name = 'site'",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    if completed_site.is_empty() {
        execute_migration_transaction(
            pool,
            include_str!("migrations/008_completed_chapter_site.sql"),
            "SELECT COUNT(*) FROM pragma_table_info('completed_chapters')
             WHERE name = 'site'",
            1,
        )
        .await?;
    }
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_cache_identity
         ON translation_cache(site, novel_id, context_fingerprint)",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_completed_chapters_work
         ON completed_chapters(site, novel_id)",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let has_watchlist_episode_site: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM pragma_table_info('watchlist_episodes') WHERE name = 'site'",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    if has_watchlist_episode_site.is_empty() {
        sqlx::query(include_str!("migrations/006_watchlist_site_scope.sql"))
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn get_pool() -> Result<&'static Pool<Sqlite>, String> {
    DB_POOL.get().ok_or_else(|| "DB not initialized".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::{sqlite::SqlitePoolOptions, Row};

    #[tokio::test]
    async fn legacy_cache_and_completion_rows_are_invalidated_idempotently() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("create sqlite memory pool");
        sqlx::query(
            "CREATE TABLE translation_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text_hash TEXT NOT NULL UNIQUE,
                novel_id TEXT,
                original_text TEXT NOT NULL,
                translated_text TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .expect("create legacy cache");
        sqlx::query(
            "CREATE TABLE completed_chapters (
                novel_id TEXT NOT NULL,
                chapter_number INTEGER NOT NULL,
                paragraph_count INTEGER NOT NULL,
                completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (novel_id, chapter_number)
            )",
        )
        .execute(&pool)
        .await
        .expect("create legacy completions");
        sqlx::query(include_str!("migrations/005_watchlist.sql"))
            .execute(&pool)
            .await
            .expect("create current watchlist schema");
        sqlx::query("CREATE TABLE translation_cache_v2 (id INTEGER)")
            .execute(&pool)
            .await
            .expect("create interrupted cache table");
        sqlx::query("CREATE TABLE completed_chapters_v2 (id INTEGER)")
            .execute(&pool)
            .await
            .expect("create interrupted completion table");
        sqlx::query(include_str!("migrations/001_initial.sql"))
            .execute(&pool)
            .await
            .expect("run initial schema against legacy database");
        sqlx::query(
            "INSERT INTO translation_cache
                (text_hash, novel_id, original_text, translated_text)
             VALUES ('legacy-hash', 'shared-id', 'source', 'legacy')",
        )
        .execute(&pool)
        .await
        .expect("insert legacy cache");
        sqlx::query(
            "INSERT INTO completed_chapters (novel_id, chapter_number, paragraph_count)
             VALUES ('shared-id', 1, 10)",
        )
        .execute(&pool)
        .await
        .expect("insert legacy completion");

        run_migrations(&pool).await.expect("run first migration");
        run_migrations(&pool).await.expect("run idempotent migration");

        let cache_count: i64 = sqlx::query("SELECT COUNT(*) AS count FROM translation_cache")
            .fetch_one(&pool)
            .await
            .expect("count cache")
            .get("count");
        let completion_count: i64 =
            sqlx::query("SELECT COUNT(*) AS count FROM completed_chapters")
                .fetch_one(&pool)
                .await
                .expect("count completions")
                .get("count");
        assert_eq!(cache_count, 0);
        assert_eq!(completion_count, 0);
        assert_eq!(
            sqlx::query("SELECT COUNT(*) FROM pragma_table_info('translation_cache') WHERE name IN ('site', 'context_fingerprint', 'normalized_source')")
                .fetch_one(&pool)
                .await
                .expect("check cache columns")
                .get::<i64, _>(0),
            3
        );
        assert_eq!(
            sqlx::query("SELECT COUNT(*) FROM pragma_table_info('completed_chapters') WHERE name = 'site'")
                .fetch_one(&pool)
                .await
                .expect("check completion site column")
                .get::<i64, _>(0),
            1
        );
    }
}
