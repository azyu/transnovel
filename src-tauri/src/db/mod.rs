pub mod schema;

use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Pool, Row, Sqlite,
};
use std::str::FromStr;
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

static DB_POOL: OnceLock<Pool<Sqlite>> = OnceLock::new();

pub async fn init_db(app: &AppHandle) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;

    let db_path = app_dir.join("novels.db");
    let db_url = format!("sqlite:{}", db_path.display());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(sqlite_connect_options(&db_url)?)
        .await
        .map_err(|e| e.to_string())?;

    initialize_database(&pool).await?;

    DB_POOL.set(pool).map_err(|_| "DB already initialized")?;

    Ok(())
}

pub(crate) fn sqlite_connect_options(database_url: &str) -> Result<SqliteConnectOptions, String> {
    SqliteConnectOptions::from_str(database_url)
        .map(|options| {
            options
                .create_if_missing(true)
                .foreign_keys(true)
                .busy_timeout(std::time::Duration::from_secs(5))
        })
        .map_err(|error| error.to_string())
}

async fn initialize_database(pool: &Pool<Sqlite>) -> Result<(), String> {
    sqlx::query(include_str!("migrations/001_initial.sql"))
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(include_str!("migrations/002_api_logs.sql"))
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(include_str!(
        "migrations/004_novel_character_dictionary.sql"
    ))
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(include_str!("migrations/005_watchlist.sql"))
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    let has_provider: Vec<(String,)> =
        sqlx::query_as("SELECT name FROM pragma_table_info('api_logs') WHERE name = 'provider'")
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;

    if has_provider.is_empty() {
        sqlx::query(include_str!("migrations/003_api_logs_provider.sql"))
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    run_migrations(pool).await?;

    Ok(())
}

async fn execute_migration_transaction(
    pool: &Pool<Sqlite>,
    sql: &'static str,
    check_query: &'static str,
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

    // Tables created before migration 010 still carry `hit_count DEFAULT 1`; that
    // default marks a cache that may hold raw streaming rows and write-inflated hits.
    const CANONICAL_CACHE_CHECK: &str =
        "SELECT COUNT(*) FROM pragma_table_info('translation_cache')
         WHERE name = 'hit_count' AND dflt_value = '0'";
    let canonical_cache: i64 = sqlx::query_scalar(CANONICAL_CACHE_CHECK)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    if canonical_cache == 0 {
        execute_migration_transaction(
            pool,
            include_str!("migrations/010_canonical_translation_cache.sql"),
            CANONICAL_CACHE_CHECK,
            1,
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

    const WATCHLIST_ORDER_CHECK: &str =
        "SELECT COUNT(*) FROM pragma_table_info('watchlist_items') WHERE name = 'sort_order'";
    let has_watchlist_order: i64 = sqlx::query_scalar(WATCHLIST_ORDER_CHECK)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    if has_watchlist_order == 0 {
        execute_migration_transaction(
            pool,
            include_str!("migrations/011_watchlist_order.sql"),
            WATCHLIST_ORDER_CHECK,
            1,
        )
        .await?;
    }

    // Must run after 006: 006 recreates `watchlist_episodes` and would drop these columns.
    const WATCHLIST_EPISODE_DATES_CHECK: &str =
        "SELECT COUNT(*) FROM pragma_table_info('watchlist_episodes')
         WHERE name IN ('published_at', 'revised_at')";
    let watchlist_episode_dates: i64 = sqlx::query_scalar(WATCHLIST_EPISODE_DATES_CHECK)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    if watchlist_episode_dates < 2 {
        execute_migration_transaction(
            pool,
            include_str!("migrations/012_watchlist_episode_dates.sql"),
            WATCHLIST_EPISODE_DATES_CHECK,
            2,
        )
        .await?;
    }

    let has_chapter_content_hash: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM pragma_table_info('chapters') WHERE name = 'content_hash'",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    if has_chapter_content_hash.is_empty() {
        execute_migration_transaction(
            pool,
            include_str!("migrations/009_chapter_content_hash.sql"),
            "SELECT COUNT(*) FROM pragma_table_info('chapters')
             WHERE name = 'content_hash'",
            1,
        )
        .await?;
    }

    Ok(())
}

pub fn get_pool() -> Result<&'static Pool<Sqlite>, String> {
    DB_POOL
        .get()
        .ok_or_else(|| "DB not initialized".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::{sqlite::SqlitePoolOptions, Row};

    #[tokio::test]
    async fn watchlist_order_migration_preserves_legacy_display_order_idempotently() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("create sqlite memory pool");
        sqlx::raw_sql(include_str!("migrations/001_initial.sql"))
            .execute(&pool)
            .await
            .expect("initial schema");
        sqlx::raw_sql(include_str!("migrations/005_watchlist.sql"))
            .execute(&pool)
            .await
            .expect("legacy watchlist schema");
        // Legacy display order was `updated_at DESC, id DESC`: expected b, c, a.
        // `a` gets the highest id, so ordering by id alone would put it first.
        for (novel_id, updated_at) in [
            ("a", "2026-01-01 00:00:00"),
            ("b", "2026-03-01 00:00:00"),
            ("c", "2026-03-01 00:00:00"),
        ] {
            sqlx::query(
                "INSERT INTO watchlist_items (site, work_url, novel_id, title, updated_at)
                 VALUES ('syosetu', 'https://example.invalid/', ?, ?, ?)",
            )
            .bind(novel_id)
            .bind(novel_id)
            .bind(updated_at)
            .execute(&pool)
            .await
            .expect("insert legacy watchlist item");
        }
        sqlx::query("UPDATE watchlist_items SET id = id + 20 WHERE novel_id = 'a'")
            .execute(&pool)
            .await
            .expect("give a the highest id");
        sqlx::query("UPDATE watchlist_items SET id = id + 10 WHERE novel_id = 'b'")
            .execute(&pool)
            .await
            .expect("give b a higher id than c");

        run_migrations(&pool).await.expect("run migrations");
        let migrated: Vec<(String, i64)> =
            sqlx::query_as("SELECT novel_id, sort_order FROM watchlist_items ORDER BY novel_id")
                .fetch_all(&pool)
                .await
                .expect("read migrated ranks");
        assert_eq!(
            migrated,
            [
                ("a".to_string(), 2),
                ("b".to_string(), 0),
                ("c".to_string(), 1)
            ]
        );

        sqlx::query("UPDATE watchlist_items SET sort_order = 7 WHERE novel_id = 'a'")
            .execute(&pool)
            .await
            .expect("simulate a later reorder");
        run_migrations(&pool).await.expect("repeat migrations");

        let ordered: Vec<(String, i64)> = sqlx::query_as(
            "SELECT novel_id, sort_order FROM watchlist_items ORDER BY sort_order ASC, id DESC",
        )
        .fetch_all(&pool)
        .await
        .expect("read ordered watchlist");
        assert_eq!(
            ordered,
            [
                ("b".to_string(), 0),
                ("c".to_string(), 1),
                ("a".to_string(), 7)
            ]
        );
    }

    #[tokio::test]
    async fn configured_pool_rejects_orphan_chapter_relationships() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(sqlite_connect_options("sqlite::memory:").expect("SQLite options"))
            .await
            .expect("create foreign-key-enabled pool");
        initialize_database(&pool).await.expect("initialize schema");

        let error = sqlx::query(
            "INSERT INTO chapters
                (novel_id, chapter_number, chapter_url, original_content)
             VALUES (?, ?, ?, ?)",
        )
        .bind(999_i64)
        .bind(1_i64)
        .bind("https://example.invalid/orphan")
        .bind("<p>orphan</p>")
        .execute(&pool)
        .await
        .expect_err("foreign key must reject orphan chapter");

        assert!(error.to_string().contains("FOREIGN KEY constraint failed"));

        let translation_error = sqlx::query(
            "INSERT INTO translations
                (chapter_id, paragraph_index, original_text, translated_text)
             VALUES (?, ?, ?, ?)",
        )
        .bind(999_i64)
        .bind(0_i64)
        .bind("orphan")
        .bind("고아")
        .execute(&pool)
        .await
        .expect_err("foreign key must reject orphan translation");
        assert!(translation_error
            .to_string()
            .contains("FOREIGN KEY constraint failed"));
    }

    #[tokio::test]
    async fn repeated_initializer_preserves_novel_chapter_and_translation_rows() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time after Unix epoch")
            .as_nanos();
        let database_path = std::env::temp_dir().join(format!(
            "transnovel-chapter-persistence-{}-{unique}.db",
            std::process::id()
        ));
        let database_url = format!("sqlite:{}", database_path.display());
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect_with(sqlite_connect_options(&database_url).expect("SQLite options"))
            .await
            .expect("create file-backed pool");
        initialize_database(&pool)
            .await
            .expect("run first initialization");

        let novel_id = sqlx::query("INSERT INTO novels (site, novel_id, title) VALUES (?, ?, ?)")
            .bind("syosetu")
            .bind("sentinel")
            .bind("보존 작품")
            .execute(&pool)
            .await
            .expect("insert sentinel novel")
            .last_insert_rowid();
        let chapter_id = sqlx::query(
            "INSERT INTO chapters
                (novel_id, chapter_number, chapter_url, original_content)
             VALUES (?, ?, ?, ?)",
        )
        .bind(novel_id)
        .bind(4_i64)
        .bind("https://example.invalid/4")
        .bind("<p>보존 본문</p>")
        .execute(&pool)
        .await
        .expect("insert sentinel chapter")
        .last_insert_rowid();
        let translation_id = sqlx::query(
            "INSERT INTO translations
                (chapter_id, paragraph_index, original_text, translated_text, model_used)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(chapter_id)
        .bind(0_i64)
        .bind("보존 본문")
        .bind("preserved body")
        .bind("sentinel-model")
        .execute(&pool)
        .await
        .expect("insert sentinel translation")
        .last_insert_rowid();

        initialize_database(&pool)
            .await
            .expect("run repeated initialization");

        let row = sqlx::query(
            "SELECT novels.id AS novel_id, chapters.id AS chapter_id,
                    translations.id AS translation_id, translations.translated_text
             FROM novels
             INNER JOIN chapters ON chapters.novel_id = novels.id
             INNER JOIN translations ON translations.chapter_id = chapters.id
             WHERE novels.site = ? AND novels.novel_id = ?",
        )
        .bind("syosetu")
        .bind("sentinel")
        .fetch_one(&pool)
        .await
        .expect("read preserved relationship");
        assert_eq!(row.get::<i64, _>("novel_id"), novel_id);
        assert_eq!(row.get::<i64, _>("chapter_id"), chapter_id);
        assert_eq!(row.get::<i64, _>("translation_id"), translation_id);
        assert_eq!(row.get::<String, _>("translated_text"), "preserved body");

        pool.close().await;
        std::fs::remove_file(&database_path).expect("remove temporary database");
    }

    #[tokio::test]
    async fn initializer_adds_episode_dates_after_legacy_watchlist_site_rebuild() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("create sqlite memory pool");
        // Pre-006 shape: episode tables have no `site`. Index names match 005 so its
        // `CREATE INDEX IF NOT EXISTS` statements are no-ops, as on a real legacy DB.
        sqlx::raw_sql(
            "CREATE TABLE watchlist_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                site TEXT NOT NULL,
                work_url TEXT NOT NULL,
                novel_id TEXT NOT NULL,
                title TEXT NOT NULL,
                author TEXT,
                last_known_chapter INTEGER NOT NULL DEFAULT 0,
                last_checked_at DATETIME,
                last_check_status TEXT NOT NULL DEFAULT 'idle',
                last_check_error TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(site, novel_id)
            );
            CREATE TABLE watchlist_episodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                novel_id TEXT NOT NULL,
                chapter_number INTEGER NOT NULL,
                chapter_url TEXT NOT NULL,
                title TEXT,
                is_new BOOLEAN NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(novel_id, chapter_number)
            );
            CREATE TABLE viewed_episodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                novel_id TEXT NOT NULL,
                chapter_number INTEGER NOT NULL,
                viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(novel_id, chapter_number)
            );
            CREATE INDEX idx_watchlist_episodes_novel ON watchlist_episodes(novel_id);
            CREATE INDEX idx_viewed_episodes_novel ON viewed_episodes(novel_id);
            INSERT INTO watchlist_items (site, work_url, novel_id, title)
                VALUES ('nocturne', 'https://novel18.syosetu.com/n3000aa/', 'n3000aa', 'legacy');
            INSERT INTO watchlist_episodes (novel_id, chapter_number, chapter_url, title)
                VALUES ('n3000aa', 1, 'https://novel18.syosetu.com/n3000aa/1/', '1화');",
        )
        .execute(&pool)
        .await
        .expect("create legacy watchlist schema");

        initialize_database(&pool)
            .await
            .expect("migrate legacy watchlist schema");
        // Checked before the repeat run: a second run would re-add columns that a
        // misordered 006 rebuild dropped, and hide the bug for the first app launch.
        let date_columns: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pragma_table_info('watchlist_episodes')
             WHERE name IN ('published_at', 'revised_at')",
        )
        .fetch_one(&pool)
        .await
        .expect("count date columns");
        assert_eq!(date_columns, 2);

        initialize_database(&pool)
            .await
            .expect("repeat legacy watchlist migration");

        let row = sqlx::query(
            "SELECT site, title, published_at, revised_at FROM watchlist_episodes
             WHERE novel_id = 'n3000aa' AND chapter_number = 1",
        )
        .fetch_one(&pool)
        .await
        .expect("legacy episode survives with date columns");
        assert_eq!(row.get::<String, _>("site"), "nocturne");
        assert_eq!(row.get::<String, _>("title"), "1화");
        assert_eq!(row.get::<Option<String>, _>("published_at"), None);
        assert_eq!(row.get::<Option<String>, _>("revised_at"), None);
    }

    #[tokio::test]
    async fn initializer_adds_chapter_content_hash_to_legacy_schema_idempotently() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("create sqlite memory pool");
        sqlx::query(
            "CREATE TABLE chapters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                novel_id INTEGER NOT NULL,
                chapter_number INTEGER NOT NULL,
                chapter_url TEXT NOT NULL,
                title TEXT,
                subtitle TEXT,
                original_content TEXT,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(novel_id, chapter_number)
            )",
        )
        .execute(&pool)
        .await
        .expect("create legacy chapters table");

        initialize_database(&pool)
            .await
            .expect("migrate legacy database");
        initialize_database(&pool)
            .await
            .expect("repeat legacy migration");

        let column_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pragma_table_info('chapters')
             WHERE name = 'content_hash'",
        )
        .fetch_one(&pool)
        .await
        .expect("read chapter columns");
        assert_eq!(column_count, 1);
    }

    #[tokio::test]
    async fn chapter_content_hash_migration_serializes_concurrent_initializers() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time after Unix epoch")
            .as_nanos();
        let database_path = std::env::temp_dir().join(format!(
            "transnovel-content-hash-migration-{}-{unique}.db",
            std::process::id()
        ));
        let database_url = format!("sqlite:{}", database_path.display());
        let first_pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(sqlite_connect_options(&database_url).expect("SQLite options"))
            .await
            .expect("create first pool");
        let second_pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(sqlite_connect_options(&database_url).expect("SQLite options"))
            .await
            .expect("create second pool");
        sqlx::query(
            "CREATE TABLE chapters (
                id INTEGER PRIMARY KEY,
                original_content TEXT
            )",
        )
        .execute(&first_pool)
        .await
        .expect("create legacy chapters");

        let first_migration = execute_migration_transaction(
            &first_pool,
            include_str!("migrations/009_chapter_content_hash.sql"),
            "SELECT COUNT(*) FROM pragma_table_info('chapters')
             WHERE name = 'content_hash'",
            1,
        );
        let second_migration = execute_migration_transaction(
            &second_pool,
            include_str!("migrations/009_chapter_content_hash.sql"),
            "SELECT COUNT(*) FROM pragma_table_info('chapters')
             WHERE name = 'content_hash'",
            1,
        );
        let (first_result, second_result) = tokio::join!(first_migration, second_migration);
        first_result.expect("first migration");
        second_result.expect("second migration");

        let column_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pragma_table_info('chapters')
             WHERE name = 'content_hash'",
        )
        .fetch_one(&first_pool)
        .await
        .expect("read chapter columns");
        assert_eq!(column_count, 1);

        first_pool.close().await;
        second_pool.close().await;
        std::fs::remove_file(database_path).expect("remove temporary database");
    }
    fn legacy_hit_count_cache_sql() -> String {
        include_str!("migrations/010_canonical_translation_cache.sql")
            .replace("hit_count INTEGER DEFAULT 0", "hit_count INTEGER DEFAULT 1")
    }

    async fn insert_cache_row(pool: &Pool<Sqlite>, hash: &str) {
        sqlx::query(
            "INSERT INTO translation_cache
                (text_hash, site, novel_id, context_fingerprint, normalized_source,
                 original_text, translated_text)
             VALUES (?, 'syosetu', 'novel', 'context', 'source', 'source', 'translation')",
        )
        .bind(hash)
        .execute(pool)
        .await
        .expect("insert cache row");
    }

    async fn count(pool: &Pool<Sqlite>, sql: &'static str) -> i64 {
        sqlx::query_scalar(sql)
            .fetch_one(pool)
            .await
            .expect("count rows")
    }

    #[tokio::test]
    async fn canonical_cache_migration_clears_post_007_cache_once() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("create sqlite memory pool");
        initialize_database(&pool).await.expect("initialize schema");
        sqlx::raw_sql(sqlx::AssertSqlSafe(legacy_hit_count_cache_sql()))
            .execute(&pool)
            .await
            .expect("recreate v0.1.5-v0.1.7 cache schema");
        insert_cache_row(&pool, "legacy-hash").await;
        sqlx::query("INSERT INTO settings (key, value) VALUES ('sentinel', 'kept')")
            .execute(&pool)
            .await
            .expect("insert setting");
        sqlx::query("INSERT INTO novels (site, novel_id, title) VALUES ('syosetu', 'n', 't')")
            .execute(&pool)
            .await
            .expect("insert novel");
        sqlx::query(
            "INSERT INTO completed_chapters (site, novel_id, chapter_number, paragraph_count)
             VALUES ('syosetu', 'n', 1, 3)",
        )
        .execute(&pool)
        .await
        .expect("insert completion");
        sqlx::query(
            "INSERT INTO chapters (novel_id, chapter_number, chapter_url, original_content)
             SELECT id, 1, 'https://example.invalid/1', '<p>src</p>' FROM novels",
        )
        .execute(&pool)
        .await
        .expect("insert chapter");
        sqlx::query(
            "INSERT INTO translations (chapter_id, paragraph_index, original_text, translated_text)
             SELECT id, 0, 'src', 'kept' FROM chapters",
        )
        .execute(&pool)
        .await
        .expect("insert translation");

        initialize_database(&pool)
            .await
            .expect("upgrade legacy cache");

        assert_eq!(
            count(&pool, "SELECT COUNT(*) FROM translation_cache").await,
            0
        );
        assert_eq!(
            count(
                &pool,
                "SELECT COUNT(*) FROM pragma_table_info('translation_cache')
                 WHERE name = 'hit_count' AND dflt_value = '0'"
            )
            .await,
            1
        );
        assert_eq!(
            count(
                &pool,
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index'
                 AND tbl_name = 'translation_cache'
                 AND name IN ('idx_cache_identity', 'idx_cache_hash', 'idx_cache_novel_id')"
            )
            .await,
            3
        );
        assert_eq!(
            count(
                &pool,
                "SELECT COUNT(*) FROM settings WHERE key = 'sentinel'"
            )
            .await,
            1
        );
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM novels").await, 1);
        assert_eq!(count(&pool, "SELECT COUNT(*) FROM chapters").await, 1);
        assert_eq!(
            count(
                &pool,
                "SELECT COUNT(*) FROM translations WHERE translated_text = 'kept'"
            )
            .await,
            1
        );
        assert_eq!(
            count(&pool, "SELECT COUNT(*) FROM completed_chapters").await,
            1
        );

        insert_cache_row(&pool, "canonical-hash").await;
        initialize_database(&pool)
            .await
            .expect("repeat initialization");
        run_migrations(&pool).await.expect("repeat migrations");

        assert_eq!(
            sqlx::query_as::<_, (String, i64)>(
                "SELECT text_hash, hit_count FROM translation_cache"
            )
            .fetch_all(&pool)
            .await
            .expect("read canonical cache"),
            vec![("canonical-hash".to_string(), 0)]
        );
    }

    #[tokio::test]
    async fn canonical_cache_migration_serializes_concurrent_initializers() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time after Unix epoch")
            .as_nanos();
        let database_path = std::env::temp_dir().join(format!(
            "transnovel-canonical-cache-migration-{}-{unique}.db",
            std::process::id()
        ));
        let database_url = format!("sqlite:{}", database_path.display());
        let connect = || async {
            SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(sqlite_connect_options(&database_url).expect("SQLite options"))
                .await
                .expect("create pool")
        };
        let first_pool = connect().await;
        let second_pool = connect().await;
        initialize_database(&first_pool)
            .await
            .expect("initialize schema");
        sqlx::raw_sql(sqlx::AssertSqlSafe(legacy_hit_count_cache_sql()))
            .execute(&first_pool)
            .await
            .expect("recreate v0.1.5-v0.1.7 cache schema");
        insert_cache_row(&first_pool, "legacy-hash").await;

        let (first_result, second_result) = tokio::join!(
            initialize_database(&first_pool),
            initialize_database(&second_pool)
        );
        first_result.expect("first initializer");
        second_result.expect("second initializer");

        assert_eq!(
            count(&first_pool, "SELECT COUNT(*) FROM translation_cache").await,
            0
        );
        assert_eq!(
            count(
                &first_pool,
                "SELECT COUNT(*) FROM pragma_table_info('translation_cache')
                 WHERE name = 'hit_count' AND dflt_value = '0'"
            )
            .await,
            1
        );

        first_pool.close().await;
        second_pool.close().await;
        std::fs::remove_file(database_path).expect("remove temporary database");
    }

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

        let cache_count: i64 = sqlx::query("SELECT COUNT(*) AS count FROM translation_cache")
            .fetch_one(&pool)
            .await
            .expect("count invalidated cache")
            .get("count");
        let completion_count: i64 = sqlx::query("SELECT COUNT(*) AS count FROM completed_chapters")
            .fetch_one(&pool)
            .await
            .expect("count invalidated completions")
            .get("count");
        assert_eq!(cache_count, 0);
        assert_eq!(completion_count, 0);

        sqlx::query(
            "INSERT INTO translation_cache
                (text_hash, site, novel_id, context_fingerprint, normalized_source,
                 original_text, translated_text)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind("identified-hash")
        .bind("syosetu")
        .bind("identified-novel")
        .bind("identified-context")
        .bind("identified-source")
        .bind("source")
        .bind("translation")
        .execute(&pool)
        .await
        .expect("insert identified cache");
        sqlx::query(
            "INSERT INTO completed_chapters
                (site, novel_id, chapter_number, paragraph_count)
             VALUES (?, ?, ?, ?)",
        )
        .bind("syosetu")
        .bind("identified-novel")
        .bind(7_i64)
        .bind(11_i64)
        .execute(&pool)
        .await
        .expect("insert identified completion");

        run_migrations(&pool)
            .await
            .expect("run idempotent migration");

        let cache_count: i64 = sqlx::query("SELECT COUNT(*) AS count FROM translation_cache")
            .fetch_one(&pool)
            .await
            .expect("count preserved cache")
            .get("count");
        let completion_count: i64 = sqlx::query("SELECT COUNT(*) AS count FROM completed_chapters")
            .fetch_one(&pool)
            .await
            .expect("count preserved completions")
            .get("count");
        assert_eq!(cache_count, 1);
        assert_eq!(completion_count, 1);

        let cache_row = sqlx::query(
            "SELECT site, novel_id, context_fingerprint, normalized_source,
                    original_text, translated_text
             FROM translation_cache",
        )
        .fetch_one(&pool)
        .await
        .expect("read preserved cache");
        assert_eq!(cache_row.get::<String, _>("site"), "syosetu");
        assert_eq!(cache_row.get::<String, _>("novel_id"), "identified-novel");
        assert_eq!(
            cache_row.get::<String, _>("context_fingerprint"),
            "identified-context"
        );
        assert_eq!(
            cache_row.get::<String, _>("normalized_source"),
            "identified-source"
        );
        assert_eq!(cache_row.get::<String, _>("original_text"), "source");
        assert_eq!(cache_row.get::<String, _>("translated_text"), "translation");

        let completion_row = sqlx::query(
            "SELECT site, novel_id, chapter_number, paragraph_count
             FROM completed_chapters",
        )
        .fetch_one(&pool)
        .await
        .expect("read preserved completion");
        assert_eq!(completion_row.get::<String, _>("site"), "syosetu");
        assert_eq!(
            completion_row.get::<String, _>("novel_id"),
            "identified-novel"
        );
        assert_eq!(completion_row.get::<i64, _>("chapter_number"), 7);
        assert_eq!(completion_row.get::<i64, _>("paragraph_count"), 11);

        let completion_indexes: Vec<String> = sqlx::query_scalar(
            "SELECT name
             FROM sqlite_master
             WHERE type = 'index'
               AND tbl_name = 'completed_chapters'
               AND name IN ('idx_completed_chapters_novel', 'idx_completed_chapters_work')
             ORDER BY name",
        )
        .fetch_all(&pool)
        .await
        .expect("read completion indexes");
        assert_eq!(
            completion_indexes,
            vec![
                "idx_completed_chapters_novel".to_string(),
                "idx_completed_chapters_work".to_string(),
            ]
        );

        assert_eq!(
            sqlx::query("SELECT COUNT(*) FROM pragma_table_info('translation_cache') WHERE name IN ('site', 'context_fingerprint', 'normalized_source')")
                .fetch_one(&pool)
                .await
                .expect("check cache columns")
                .get::<i64, _>(0),
            3
        );
        assert_eq!(
            sqlx::query(
                "SELECT COUNT(*) FROM pragma_table_info('completed_chapters') WHERE name = 'site'"
            )
            .fetch_one(&pool)
            .await
            .expect("check completion site column")
            .get::<i64, _>(0),
            1
        );
    }
}
