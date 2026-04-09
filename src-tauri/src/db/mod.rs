pub mod schema;

use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
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

async fn run_migrations(pool: &Pool<Sqlite>) -> Result<(), String> {
    // SQLite lacks ALTER TABLE ... ADD COLUMN IF NOT EXISTS
    let has_novel_id: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM pragma_table_info('translation_cache') WHERE name = 'novel_id'"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    if has_novel_id.is_empty() {
        sqlx::query("ALTER TABLE translation_cache ADD COLUMN novel_id TEXT")
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_cache_novel_id ON translation_cache(novel_id)")
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    let watchlist_episode_has_site: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM pragma_table_info('watchlist_episodes') WHERE name = 'site'",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    if watchlist_episode_has_site.is_empty() {
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
