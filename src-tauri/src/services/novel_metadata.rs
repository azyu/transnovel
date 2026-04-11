use sqlx::{Pool, Sqlite};

use crate::db::get_pool;

pub async fn upsert_novel_metadata(
    site: &str,
    novel_id: &str,
    title: Option<&str>,
    author: Option<&str>,
    total_chapters: Option<u32>,
) -> Result<(), String> {
    let pool = get_pool()?;
    upsert_novel_metadata_with_pool(pool, site, novel_id, title, author, total_chapters).await
}

pub async fn upsert_novel_metadata_with_pool(
    pool: &Pool<Sqlite>,
    site: &str,
    novel_id: &str,
    title: Option<&str>,
    author: Option<&str>,
    total_chapters: Option<u32>,
) -> Result<(), String> {
    let normalized_title = title.map(str::trim).filter(|value| !value.is_empty());
    let normalized_author = author.map(str::trim).filter(|value| !value.is_empty());
    let normalized_total_chapters = i64::from(total_chapters.unwrap_or(0));

    sqlx::query(
        "INSERT INTO novels (site, novel_id, title, author, total_chapters, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(site, novel_id) DO UPDATE SET
           title = COALESCE(excluded.title, novels.title),
           author = COALESCE(excluded.author, novels.author),
           total_chapters = CASE
             WHEN excluded.total_chapters > 0 THEN excluded.total_chapters
             ELSE novels.total_chapters
           END,
           updated_at = CURRENT_TIMESTAMP",
    )
    .bind(site)
    .bind(novel_id)
    .bind(normalized_title)
    .bind(normalized_author)
    .bind(normalized_total_chapters)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::{sqlite::SqlitePoolOptions, Row};

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

    #[tokio::test]
    async fn upsert_novel_metadata_preserves_existing_title_when_new_title_is_empty() {
        let pool = setup_test_pool().await;

        upsert_novel_metadata_with_pool(
            &pool,
            "syosetu",
            "n1234",
            Some("원래 제목"),
            None,
            Some(12),
        )
        .await
        .expect("insert initial metadata");

        upsert_novel_metadata_with_pool(&pool, "syosetu", "n1234", Some("   "), None, None)
            .await
            .expect("update metadata");

        let row =
            sqlx::query("SELECT title, total_chapters FROM novels WHERE site = ? AND novel_id = ?")
                .bind("syosetu")
                .bind("n1234")
                .fetch_one(&pool)
                .await
                .expect("fetch novel metadata");

        assert_eq!(
            row.get::<Option<String>, _>("title").as_deref(),
            Some("원래 제목")
        );
        assert_eq!(row.get::<i64, _>("total_chapters"), 12);
    }
}
