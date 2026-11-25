use sqlx::{sqlite::SqliteConnection, Connection, Executor, Pool, Row, Sqlite, Transaction};

use crate::db::get_pool;
use crate::models::novel::{
    SeriesInfo, WatchlistEpisode, WatchlistItem, WatchlistMoveDirection, WatchlistViewedUpdate,
};
use crate::parsers::{get_parser_for_url, ParsedUrl};

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct RefreshWatchlistSummary {
    pub new_episode_count: u32,
}

pub fn is_watchlist_supported_site(site: &str) -> bool {
    matches!(site, "syosetu" | "nocturne" | "kakuyomu")
}

fn find_watchlist_item(
    items: Vec<WatchlistItem>,
    site: &str,
    novel_id: &str,
) -> Result<WatchlistItem, String> {
    items.into_iter()
        .find(|item| item.site == site && item.novel_id == novel_id)
        .ok_or_else(|| "관심작품 정보를 불러오지 못했습니다.".to_string())
}

pub async fn add_watchlist_item(url: &str) -> Result<WatchlistItem, String> {
    let parsed = ParsedUrl::from_url(url).ok_or("지원하지 않는 URL 형식입니다.")?;
    if !is_watchlist_supported_site(&parsed.site) || parsed.chapter.is_some() {
        return Err(
            "현재는 Syosetu, Novel18, Kakuyomu 작품 페이지 URL만 관심작품으로 등록할 수 있습니다."
                .to_string(),
        );
    }

    let parser = get_parser_for_url(url).ok_or("지원하지 않는 사이트입니다.")?;
    let series = parser.get_series_info(url).await?;
    if !is_watchlist_supported_site(&series.site) {
        return Err(
            "현재는 Syosetu, Novel18, Kakuyomu 작품만 관심작품으로 등록할 수 있습니다."
                .to_string(),
        );
    }

    let pool = get_pool()?;
    add_watchlist_item_from_series(pool, url, &series).await?;

    let items = list_watchlist_items_with_pool(pool).await?;
    find_watchlist_item(items, &series.site, &series.novel_id)
}

pub async fn list_watchlist_items() -> Result<Vec<WatchlistItem>, String> {
    let pool = get_pool()?;
    list_watchlist_items_with_pool(pool).await
}
async fn begin_watchlist_write_transaction(
    connection: &mut SqliteConnection,
) -> Result<Transaction<'_, Sqlite>, String> {
    connection
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| error.to_string())
}

pub async fn remove_watchlist_item(site: &str, novel_id: &str) -> Result<(), String> {
    let pool = get_pool()?;
    remove_watchlist_item_with_pool(pool, site, novel_id).await
}

pub async fn remove_watchlist_item_with_pool(
    pool: &Pool<Sqlite>,
    site: &str,
    novel_id: &str,
) -> Result<(), String> {
    let mut connection = pool.acquire().await.map_err(|error| error.to_string())?;
    let mut transaction = begin_watchlist_write_transaction(&mut connection).await?;

    let item_exists = sqlx::query("SELECT 1 FROM watchlist_items WHERE site = ? AND novel_id = ?")
        .bind(site)
        .bind(novel_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|e| e.to_string())?
    .is_some();

    if !item_exists {
        transaction.rollback().await.map_err(|e| e.to_string())?;
        return Err("삭제할 관심작품을 찾을 수 없습니다.".to_string());
    }

    sqlx::query("DELETE FROM watchlist_episodes WHERE site = ? AND novel_id = ?")
        .bind(site)
        .bind(novel_id)
        .execute(&mut *transaction)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM viewed_episodes WHERE site = ? AND novel_id = ?")
        .bind(site)
        .bind(novel_id)
        .execute(&mut *transaction)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM watchlist_items WHERE site = ? AND novel_id = ?")
        .bind(site)
        .bind(novel_id)
        .execute(&mut *transaction)
        .await
        .map_err(|e| e.to_string())?;

    transaction.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn move_watchlist_item(
    site: &str,
    novel_id: &str,
    direction: WatchlistMoveDirection,
) -> Result<Vec<WatchlistItem>, String> {
    let pool = get_pool()?;
    move_watchlist_item_with_pool(pool, site, novel_id, direction).await
}

/// Swaps the item with its neighbor in display order and renumbers every row
/// to a dense 0..n sequence. A move past either end leaves the order unchanged.
/// The returned list is read before the commit, so an error means the move
/// did not persist.
pub async fn move_watchlist_item_with_pool(
    pool: &Pool<Sqlite>,
    site: &str,
    novel_id: &str,
    direction: WatchlistMoveDirection,
) -> Result<Vec<WatchlistItem>, String> {
    let mut connection = pool.acquire().await.map_err(|error| error.to_string())?;
    let mut transaction = begin_watchlist_write_transaction(&mut connection).await?;

    let mut ids: Vec<i64> = Vec::new();
    let mut target_index = None;
    for row in sqlx::query(
        "SELECT id, site, novel_id FROM watchlist_items ORDER BY sort_order ASC, id DESC",
    )
    .fetch_all(&mut *transaction)
    .await
    .map_err(|e| e.to_string())?
    {
        if row.get::<String, _>("site") == site && row.get::<String, _>("novel_id") == novel_id {
            target_index = Some(ids.len());
        }
        ids.push(row.get("id"));
    }

    let Some(index) = target_index else {
        transaction.rollback().await.map_err(|e| e.to_string())?;
        return Err("이동할 관심작품을 찾을 수 없습니다.".to_string());
    };

    let neighbor = match direction {
        WatchlistMoveDirection::Up => index.checked_sub(1),
        WatchlistMoveDirection::Down => Some(index + 1).filter(|next| *next < ids.len()),
    };
    let Some(neighbor) = neighbor else {
        let items = list_watchlist_items_with_pool(&mut *transaction).await?;
        transaction.rollback().await.map_err(|e| e.to_string())?;
        return Ok(items);
    };
    ids.swap(index, neighbor);

    for (position, id) in ids.iter().enumerate() {
        sqlx::query("UPDATE watchlist_items SET sort_order = ? WHERE id = ?")
            .bind(position as i64)
            .bind(id)
            .execute(&mut *transaction)
            .await
            .map_err(|e| e.to_string())?;
    }

    let items = list_watchlist_items_with_pool(&mut *transaction).await?;
    transaction.commit().await.map_err(|e| e.to_string())?;
    Ok(items)
}

pub async fn refresh_watchlist_items() -> Result<Vec<WatchlistItem>, String> {
    let pool = get_pool()?;

    let rows = sqlx::query(
        "SELECT site, work_url, novel_id FROM watchlist_items ORDER BY sort_order ASC, id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    for row in rows {
        let site: String = row.get("site");
        let work_url: String = row.get("work_url");
        let novel_id: String = row.get("novel_id");

        match refresh_watchlist_item(&work_url).await {
            Ok(_) => {}
            Err(error) => {
                sqlx::query(
                    "UPDATE watchlist_items
                     SET last_checked_at = CURRENT_TIMESTAMP,
                         last_check_status = 'error',
                         last_check_error = ?,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE site = ? AND novel_id = ?",
                )
                .bind(&error)
                .bind(&site)
                .bind(&novel_id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
            }
        }
    }

    list_watchlist_items_with_pool(pool).await
}

pub async fn refresh_watchlist_item(work_url: &str) -> Result<RefreshWatchlistSummary, String> {
    let parser = get_parser_for_url(work_url).ok_or("지원하지 않는 사이트입니다.")?;
    let series = parser.get_series_info(work_url).await?;
    let pool = get_pool()?;
    refresh_watchlist_item_from_series(pool, &series.novel_id, &series).await
}

pub async fn get_watchlist_episodes(
    site: &str,
    novel_id: &str,
) -> Result<Vec<WatchlistEpisode>, String> {
    let pool = get_pool()?;
    list_watchlist_episode_rows(pool, site, novel_id).await
}

pub async fn mark_episode_viewed(
    site: &str,
    novel_id: &str,
    chapter_number: u32,
) -> Result<WatchlistViewedUpdate, String> {
    let pool = get_pool()?;
    mark_episode_viewed_with_pool(pool, site, novel_id, chapter_number).await
}

pub async fn add_watchlist_item_from_series(
    pool: &Pool<Sqlite>,
    work_url: &str,
    series: &SeriesInfo,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO watchlist_items (
            site, work_url, novel_id, title, author, last_known_chapter, last_checked_at, last_check_status, last_check_error, updated_at, sort_order
         ) VALUES (
            ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'ok', NULL, CURRENT_TIMESTAMP,
            (SELECT COALESCE(MIN(sort_order), 0) - 1 FROM watchlist_items)
         )
         ON CONFLICT(site, novel_id) DO UPDATE SET
            work_url = excluded.work_url,
            title = excluded.title,
            author = excluded.author,
            last_known_chapter = excluded.last_known_chapter,
            last_checked_at = CURRENT_TIMESTAMP,
            last_check_status = 'ok',
            last_check_error = NULL,
            updated_at = CURRENT_TIMESTAMP",
    )
    .bind(&series.site)
    .bind(work_url)
    .bind(&series.novel_id)
    .bind(&series.title)
    .bind(series.author.as_deref())
    .bind(i64::from(series.total_chapters))
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    for chapter in &series.chapters {
        sqlx::query(
            "INSERT INTO watchlist_episodes (
                site, novel_id, chapter_number, chapter_url, title, is_new, updated_at
             ) VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
             ON CONFLICT(site, novel_id, chapter_number) DO UPDATE SET
                chapter_url = excluded.chapter_url,
                title = excluded.title,
                is_new = watchlist_episodes.is_new,
                updated_at = CURRENT_TIMESTAMP",
        )
        .bind(&series.site)
        .bind(&series.novel_id)
        .bind(i64::from(chapter.number))
        .bind(&chapter.url)
        .bind(chapter.title.as_deref())
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub async fn refresh_watchlist_item_from_series(
    pool: &Pool<Sqlite>,
    novel_id: &str,
    series: &SeriesInfo,
) -> Result<RefreshWatchlistSummary, String> {
    let existing_rows = sqlx::query(
        "SELECT chapter_number FROM watchlist_episodes WHERE site = ? AND novel_id = ? ORDER BY chapter_number",
    )
    .bind(&series.site)
    .bind(novel_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let known_chapters = existing_rows
        .iter()
        .map(|row| row.get::<i64, _>("chapter_number") as u32)
        .collect::<std::collections::HashSet<_>>();

    let mut new_episode_count = 0u32;

    for chapter in &series.chapters {
        let is_new = !known_chapters.contains(&chapter.number);
        if is_new {
            new_episode_count += 1;
        }

        sqlx::query(
            "INSERT INTO watchlist_episodes (
                site, novel_id, chapter_number, chapter_url, title, is_new, updated_at
             )
             SELECT ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
             WHERE EXISTS (
                 SELECT 1 FROM watchlist_items WHERE site = ? AND novel_id = ?
             )
             ON CONFLICT(site, novel_id, chapter_number) DO UPDATE SET
                chapter_url = excluded.chapter_url,
                title = excluded.title,
                is_new = CASE
                    WHEN watchlist_episodes.is_new = 1 THEN 1
                    ELSE excluded.is_new
                END,
                updated_at = CURRENT_TIMESTAMP",
        )
        .bind(&series.site)
        .bind(novel_id)
        .bind(i64::from(chapter.number))
        .bind(&chapter.url)
        .bind(chapter.title.as_deref())
        .bind(is_new)
        .bind(&series.site)
        .bind(novel_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    sqlx::query(
        "UPDATE watchlist_items
         SET title = ?, author = ?, last_known_chapter = ?, last_checked_at = CURRENT_TIMESTAMP, last_check_status = 'ok', last_check_error = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE site = ? AND novel_id = ?",
    )
    .bind(&series.title)
    .bind(series.author.as_deref())
    .bind(i64::from(series.total_chapters))
    .bind(&series.site)
    .bind(novel_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(RefreshWatchlistSummary { new_episode_count })
}

pub async fn list_watchlist_episode_rows(
    pool: &Pool<Sqlite>,
    site: &str,
    novel_id: &str,
) -> Result<Vec<WatchlistEpisode>, String> {
    let rows = sqlx::query(
        "SELECT
            episodes.chapter_number,
            episodes.chapter_url,
            episodes.title,
            episodes.is_new,
            viewed.chapter_number IS NOT NULL AS is_viewed
         FROM watchlist_episodes AS episodes
         LEFT JOIN viewed_episodes AS viewed
           ON viewed.site = episodes.site
          AND viewed.novel_id = episodes.novel_id
          AND viewed.chapter_number = episodes.chapter_number
         WHERE episodes.site = ?
           AND episodes.novel_id = ?
         ORDER BY episodes.chapter_number",
    )
    .bind(site)
    .bind(novel_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| WatchlistEpisode {
            chapter_number: row.get::<i64, _>("chapter_number") as u32,
            chapter_url: row.get("chapter_url"),
            title: row.get("title"),
            is_new: row.get::<i64, _>("is_new") != 0,
            is_viewed: row.get::<i64, _>("is_viewed") != 0,
        })
        .collect())
}

pub async fn list_watchlist_items_with_pool<'e, E>(
    executor: E,
) -> Result<Vec<WatchlistItem>, String>
where
    E: Executor<'e, Database = Sqlite>,
{
    let rows = sqlx::query(
        "SELECT
            items.site,
            items.work_url,
            items.novel_id,
            items.title,
            items.author,
            items.last_known_chapter,
            items.last_checked_at,
            items.last_check_status,
            items.last_check_error,
            COUNT(CASE WHEN episodes.is_new = 1 THEN 1 END) AS new_episode_count
         FROM watchlist_items AS items
         LEFT JOIN watchlist_episodes AS episodes
           ON episodes.site = items.site
          AND episodes.novel_id = items.novel_id
         GROUP BY
            items.site,
            items.work_url,
            items.novel_id,
            items.title,
            items.author,
            items.last_known_chapter,
            items.last_checked_at,
            items.last_check_status,
            items.last_check_error
         ORDER BY items.sort_order ASC, items.id DESC",
    )
    .fetch_all(executor)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|row| WatchlistItem {
            site: row.get("site"),
            work_url: row.get("work_url"),
            novel_id: row.get("novel_id"),
            title: row.get("title"),
            author: row.get("author"),
            last_known_chapter: row.get::<i64, _>("last_known_chapter") as u32,
            last_checked_at: row.get("last_checked_at"),
            last_check_status: row.get("last_check_status"),
            last_check_error: row.get("last_check_error"),
            new_episode_count: row.get::<i64, _>("new_episode_count") as u32,
        })
        .collect())
}

pub async fn mark_episode_viewed_with_pool(
    pool: &Pool<Sqlite>,
    site: &str,
    novel_id: &str,
    chapter_number: u32,
) -> Result<WatchlistViewedUpdate, String> {
    let cleared_new_flag = sqlx::query(
        "SELECT is_new
         FROM watchlist_episodes
         WHERE site = ? AND novel_id = ? AND chapter_number = ?",
    )
    .bind(site)
    .bind(novel_id)
    .bind(i64::from(chapter_number))
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .map(|row| row.get::<i64, _>("is_new") != 0)
    .unwrap_or(false);

    sqlx::query(
        "INSERT INTO viewed_episodes (site, novel_id, chapter_number, viewed_at)
         SELECT ?, ?, ?, CURRENT_TIMESTAMP
         WHERE EXISTS (
             SELECT 1 FROM watchlist_items WHERE site = ? AND novel_id = ?
         )
         ON CONFLICT(site, novel_id, chapter_number) DO UPDATE SET viewed_at = CURRENT_TIMESTAMP",
    )
    .bind(site)
    .bind(novel_id)
    .bind(i64::from(chapter_number))
    .bind(site)
    .bind(novel_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE watchlist_episodes
         SET is_new = 0, updated_at = CURRENT_TIMESTAMP
         WHERE site = ? AND novel_id = ? AND chapter_number = ?",
    )
    .bind(site)
    .bind(novel_id)
    .bind(i64::from(chapter_number))
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let remaining_new_episode_count = sqlx::query(
        "SELECT COUNT(*) AS count
         FROM watchlist_episodes
         WHERE site = ? AND novel_id = ? AND is_new = 1",
    )
    .bind(site)
    .bind(novel_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?
    .get::<i64, _>("count") as u32;

    Ok(WatchlistViewedUpdate {
        site: site.to_string(),
        novel_id: novel_id.to_string(),
        chapter_number,
        cleared_new_flag,
        remaining_new_episode_count,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        add_watchlist_item_from_series, begin_watchlist_write_transaction, find_watchlist_item,
        is_watchlist_supported_site, list_watchlist_episode_rows, list_watchlist_items_with_pool,
        mark_episode_viewed_with_pool, move_watchlist_item_with_pool,
        refresh_watchlist_item_from_series, remove_watchlist_item_with_pool,
    };
    use sqlx::{sqlite::SqlitePoolOptions, Connection, Pool, Sqlite};

    use crate::models::novel::{ChapterInfo, SeriesInfo, WatchlistItem, WatchlistMoveDirection};

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

        sqlx::query(include_str!("../db/migrations/005_watchlist.sql"))
            .execute(&pool)
            .await
            .expect("apply watchlist migration");

        sqlx::raw_sql(include_str!("../db/migrations/011_watchlist_order.sql"))
            .execute(&pool)
            .await
            .expect("apply watchlist order migration");

        pool
    }

    fn single_chapter_series(site: &str, novel_id: &str) -> SeriesInfo {
        SeriesInfo {
            site: site.into(),
            novel_id: novel_id.into(),
            title: format!("{novel_id} 작품"),
            author: None,
            total_chapters: 1,
            chapters: vec![ChapterInfo {
                number: 1,
                url: format!("https://ncode.syosetu.com/{novel_id}/1/"),
                title: None,
                status: "pending".into(),
            }],
        }
    }

    async fn seed_in_order(pool: &Pool<Sqlite>, novel_ids: &[&str]) {
        // Each add lands on top, so seed in reverse to get `novel_ids` as display order.
        for novel_id in novel_ids.iter().rev() {
            add_watchlist_item_from_series(
                pool,
                &format!("https://ncode.syosetu.com/{novel_id}/"),
                &single_chapter_series("syosetu", novel_id),
            )
            .await
            .expect("seed watchlist item");
        }
    }

    async fn listed_ids(pool: &Pool<Sqlite>) -> Vec<String> {
        list_watchlist_items_with_pool(pool)
            .await
            .expect("list watchlist items")
            .into_iter()
            .map(|item| item.novel_id)
            .collect()
    }

    #[tokio::test]
    async fn newly_added_item_is_listed_first_and_readding_keeps_position() {
        let pool = setup_test_pool().await;
        seed_in_order(&pool, &["a", "b", "c"]).await;
        assert_eq!(listed_ids(&pool).await, ["a", "b", "c"]);

        add_watchlist_item_from_series(
            &pool,
            "https://ncode.syosetu.com/b/",
            &single_chapter_series("syosetu", "b"),
        )
        .await
        .expect("re-add existing item");
        assert_eq!(listed_ids(&pool).await, ["a", "b", "c"]);
    }

    #[tokio::test]
    async fn move_swaps_only_with_neighbor() {
        let pool = setup_test_pool().await;
        seed_in_order(&pool, &["a", "b", "c", "d"]).await;

        move_watchlist_item_with_pool(&pool, "syosetu", "c", WatchlistMoveDirection::Up)
            .await
            .expect("move c up");
        assert_eq!(listed_ids(&pool).await, ["a", "c", "b", "d"]);

        move_watchlist_item_with_pool(&pool, "syosetu", "a", WatchlistMoveDirection::Down)
            .await
            .expect("move a down");
        assert_eq!(listed_ids(&pool).await, ["c", "a", "b", "d"]);
    }

    #[tokio::test]
    async fn move_returns_order_read_in_the_same_transaction() {
        let pool = setup_test_pool().await;
        seed_in_order(&pool, &["a", "b", "c"]).await;

        let moved =
            move_watchlist_item_with_pool(&pool, "syosetu", "c", WatchlistMoveDirection::Up)
                .await
                .expect("move c up");
        let moved_ids: Vec<_> = moved.iter().map(|item| item.novel_id.as_str()).collect();
        assert_eq!(moved_ids, ["a", "c", "b"]);

        let unchanged =
            move_watchlist_item_with_pool(&pool, "syosetu", "a", WatchlistMoveDirection::Up)
                .await
                .expect("move first up");
        let unchanged_ids: Vec<_> = unchanged
            .iter()
            .map(|item| item.novel_id.as_str())
            .collect();
        assert_eq!(unchanged_ids, ["a", "c", "b"]);
    }

    #[tokio::test]
    async fn move_past_either_end_keeps_order() {
        let pool = setup_test_pool().await;
        seed_in_order(&pool, &["a", "b", "c"]).await;

        move_watchlist_item_with_pool(&pool, "syosetu", "a", WatchlistMoveDirection::Up)
            .await
            .expect("move first up");
        move_watchlist_item_with_pool(&pool, "syosetu", "c", WatchlistMoveDirection::Down)
            .await
            .expect("move last down");

        assert_eq!(listed_ids(&pool).await, ["a", "b", "c"]);
    }

    #[tokio::test]
    async fn move_rejects_unknown_item_and_matches_site() {
        let pool = setup_test_pool().await;
        seed_in_order(&pool, &["a", "b"]).await;

        assert!(
            move_watchlist_item_with_pool(&pool, "nocturne", "b", WatchlistMoveDirection::Up)
                .await
                .is_err()
        );
        assert_eq!(listed_ids(&pool).await, ["a", "b"]);
    }

    #[tokio::test]
    async fn moved_order_survives_refresh_and_removal() {
        let pool = setup_test_pool().await;
        seed_in_order(&pool, &["a", "b", "c"]).await;
        move_watchlist_item_with_pool(&pool, "syosetu", "c", WatchlistMoveDirection::Up)
            .await
            .expect("move c up");

        // Refresh rewrites updated_at; it must not reshuffle the persisted order.
        sqlx::query(
            "UPDATE watchlist_items SET updated_at = '2000-01-01 00:00:00' WHERE novel_id = 'a'",
        )
        .execute(&pool)
        .await
        .expect("age first item");
        for novel_id in ["c", "b"] {
            refresh_watchlist_item_from_series(
                &pool,
                novel_id,
                &single_chapter_series("syosetu", novel_id),
            )
            .await
            .expect("refresh item");
        }
        assert_eq!(listed_ids(&pool).await, ["a", "c", "b"]);

        remove_watchlist_item_with_pool(&pool, "syosetu", "c")
            .await
            .expect("remove middle item");
        assert_eq!(listed_ids(&pool).await, ["a", "b"]);
        move_watchlist_item_with_pool(&pool, "syosetu", "b", WatchlistMoveDirection::Up)
            .await
            .expect("move after removal");
        assert_eq!(listed_ids(&pool).await, ["b", "a"]);
    }

    #[tokio::test]
    async fn move_targets_the_site_scoped_item_when_novel_ids_collide() {
        let pool = setup_test_pool().await;
        seed_in_order(&pool, &["x", "shared"]).await;
        add_watchlist_item_from_series(
            &pool,
            "https://novel18.syosetu.com/shared/",
            &single_chapter_series("nocturne", "shared"),
        )
        .await
        .expect("seed nocturne item");
        // Display order: nocturne:shared, syosetu:x, syosetu:shared.

        move_watchlist_item_with_pool(&pool, "syosetu", "shared", WatchlistMoveDirection::Up)
            .await
            .expect("move syosetu item up");

        let keys: Vec<String> = list_watchlist_items_with_pool(&pool)
            .await
            .expect("list items")
            .into_iter()
            .map(|item| format!("{}:{}", item.site, item.novel_id))
            .collect();
        assert_eq!(keys, ["nocturne:shared", "syosetu:shared", "syosetu:x"]);

        move_watchlist_item_with_pool(&pool, "nocturne", "shared", WatchlistMoveDirection::Down)
            .await
            .expect("move nocturne item down");
        let keys: Vec<String> = list_watchlist_items_with_pool(&pool)
            .await
            .expect("list items")
            .into_iter()
            .map(|item| format!("{}:{}", item.site, item.novel_id))
            .collect();
        assert_eq!(keys, ["syosetu:shared", "nocturne:shared", "syosetu:x"]);
    }

    #[tokio::test]
    async fn move_and_remove_keep_translation_data() {
        let pool = setup_test_pool().await;
        seed_in_order(&pool, &["a", "b"]).await;
        for novel_id in ["a", "b"] {
            sqlx::query(
                "INSERT INTO translation_cache
                    (text_hash, site, novel_id, context_fingerprint, normalized_source, original_text, translated_text)
                 VALUES (?, 'syosetu', ?, 'ctx', 'src', 'src', '번역')",
            )
            .bind(format!("hash-{novel_id}"))
            .bind(novel_id)
            .execute(&pool)
            .await
            .expect("seed translation cache");
            sqlx::query(
                "INSERT INTO completed_chapters (site, novel_id, chapter_number, paragraph_count)
                 VALUES ('syosetu', ?, 1, 10)",
            )
            .bind(novel_id)
            .execute(&pool)
            .await
            .expect("seed completed chapter");
        }

        move_watchlist_item_with_pool(&pool, "syosetu", "b", WatchlistMoveDirection::Up)
            .await
            .expect("move b up");
        remove_watchlist_item_with_pool(&pool, "syosetu", "a")
            .await
            .expect("remove a");

        let cache: Vec<(String, String)> = sqlx::query_as(
            "SELECT novel_id, translated_text FROM translation_cache ORDER BY novel_id",
        )
        .fetch_all(&pool)
        .await
        .expect("read cache");
        assert_eq!(
            cache,
            [
                ("a".to_string(), "번역".to_string()),
                ("b".to_string(), "번역".to_string())
            ]
        );
        let completed: Vec<(String, i64)> = sqlx::query_as(
            "SELECT novel_id, paragraph_count FROM completed_chapters ORDER BY novel_id",
        )
        .fetch_all(&pool)
        .await
        .expect("read completed chapters");
        assert_eq!(completed, [("a".to_string(), 10), ("b".to_string(), 10)]);
    }

    #[tokio::test]
    async fn move_preserves_episode_and_viewed_state() {
        let pool = setup_test_pool().await;
        seed_in_order(&pool, &["a", "b"]).await;
        sqlx::query("UPDATE watchlist_episodes SET is_new = 1 WHERE novel_id = 'b'")
            .execute(&pool)
            .await
            .expect("mark new episode");
        mark_episode_viewed_with_pool(&pool, "syosetu", "a", 1)
            .await
            .expect("mark viewed");

        move_watchlist_item_with_pool(&pool, "syosetu", "b", WatchlistMoveDirection::Up)
            .await
            .expect("move b up");

        let items = list_watchlist_items_with_pool(&pool)
            .await
            .expect("list items");
        assert_eq!(items[0].novel_id, "b");
        assert_eq!(items[0].new_episode_count, 1);
        let viewed = list_watchlist_episode_rows(&pool, "syosetu", "a")
            .await
            .expect("list episodes");
        assert!(viewed[0].is_viewed);
    }

    #[tokio::test]
    async fn remove_watchlist_item_removes_only_target_watchlist_state() {
        let pool = setup_test_pool().await;
        let syosetu_series = SeriesInfo {
            site: "syosetu".into(),
            novel_id: "n1000aa".into(),
            title: "일반 작품".into(),
            author: Some("작가".into()),
            total_chapters: 1,
            chapters: vec![ChapterInfo {
                number: 1,
                url: "https://ncode.syosetu.com/n1000aa/1/".into(),
                title: Some("1화".into()),
                status: "pending".into(),
            }],
        };
        let nocturne_series = SeriesInfo {
            site: "nocturne".into(),
            novel_id: "n1000aa".into(),
            title: "R18 작품".into(),
            author: Some("작가".into()),
            total_chapters: 1,
            chapters: vec![ChapterInfo {
                number: 1,
                url: "https://novel18.syosetu.com/n1000aa/1/".into(),
                title: Some("1화".into()),
                status: "pending".into(),
            }],
        };

        add_watchlist_item_from_series(
            &pool,
            "https://ncode.syosetu.com/n1000aa/",
            &syosetu_series,
        )
        .await
        .expect("seed syosetu watchlist item");
        add_watchlist_item_from_series(
            &pool,
            "https://novel18.syosetu.com/n1000aa/",
            &nocturne_series,
        )
        .await
        .expect("seed nocturne watchlist item");

        for site in ["syosetu", "nocturne"] {
            sqlx::query(
                "INSERT INTO viewed_episodes (site, novel_id, chapter_number)
                 VALUES (?, ?, ?)",
            )
            .bind(site)
            .bind("n1000aa")
            .bind(1_i64)
            .execute(&pool)
            .await
            .expect("seed viewed episode");
        }

        remove_watchlist_item_with_pool(&pool, "syosetu", "n1000aa")
            .await
            .expect("remove syosetu watchlist item");

        mark_episode_viewed_with_pool(&pool, "syosetu", "n1000aa", 1)
            .await
            .expect("ignore viewed marker for removed item");

        let items = list_watchlist_items_with_pool(&pool)
            .await
            .expect("list remaining watchlist items");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].site, "nocturne");
        refresh_watchlist_item_from_series(&pool, "n1000aa", &syosetu_series)
            .await
            .expect("refresh removed watchlist item");
        assert!(list_watchlist_episode_rows(&pool, "syosetu", "n1000aa")
            .await
            .expect("list removed episodes")
            .is_empty());
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM viewed_episodes WHERE site = ? AND novel_id = ?",
            )
            .bind("syosetu")
            .bind("n1000aa")
            .fetch_one(&pool)
            .await
            .expect("count removed viewed episodes"),
            0
        );
        assert_eq!(
            list_watchlist_episode_rows(&pool, "nocturne", "n1000aa")
                .await
                .expect("list remaining episodes")
                .len(),
            1
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM viewed_episodes WHERE site = ? AND novel_id = ?",
            )
            .bind("nocturne")
            .bind("n1000aa")
            .fetch_one(&pool)
            .await
            .expect("count remaining viewed episodes"),
            1
        );
    }

    #[tokio::test]
    async fn remove_transaction_reserves_sqlite_writer_before_reading() {
        let database_path = std::env::temp_dir().join(format!(
            "transnovel-watchlist-race-{}.db",
            uuid::Uuid::new_v4()
        ));
        let database_url = format!("sqlite:{}", database_path.display());
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect_with(
                crate::db::sqlite_connect_options(&database_url)
                    .expect("SQLite connect options"),
            )
            .await
            .expect("create file-backed pool");
        sqlx::query(include_str!("../db/migrations/001_initial.sql"))
            .execute(&pool)
            .await
            .expect("apply initial schema");
        sqlx::query(include_str!("../db/migrations/005_watchlist.sql"))
            .execute(&pool)
            .await
            .expect("apply watchlist migration");
        sqlx::query(
            "INSERT INTO watchlist_items (site, work_url, novel_id, title)
             VALUES (?, ?, ?, ?)",
        )
        .bind("syosetu")
        .bind("https://ncode.syosetu.com/n1000aa/")
        .bind("n1000aa")
        .bind("작품")
        .execute(&pool)
        .await
        .expect("seed watchlist item");

        let mut removal_connection = pool.acquire().await.expect("removal connection");
        let mut removal_transaction = begin_watchlist_write_transaction(&mut removal_connection)
            .await
            .expect("begin removal transaction");
        sqlx::query("SELECT COUNT(*) FROM watchlist_items")
            .fetch_one(&mut *removal_transaction)
            .await
            .expect("read inside removal transaction");

        let mut competing_connection = pool.acquire().await.expect("competing connection");
        sqlx::query("PRAGMA busy_timeout = 0")
            .execute(&mut *competing_connection)
            .await
            .expect("disable waiting for competing writer");
        let competing_error = competing_connection
            .begin_with("BEGIN IMMEDIATE")
            .await
            .expect_err("removal transaction must reserve the SQLite writer");
        assert!(
            competing_error.to_string().contains("database is locked"),
            "unexpected competing writer error: {competing_error}"
        );

        removal_transaction
            .rollback()
            .await
            .expect("rollback removal transaction");
        let competing_transaction = competing_connection
            .begin_with("BEGIN IMMEDIATE")
            .await
            .expect("writer lock must be released after rollback");
        competing_transaction
            .rollback()
            .await
            .expect("rollback competing transaction");
        drop(removal_connection);
        drop(competing_connection);
        pool.close().await;
        let _ = std::fs::remove_file(database_path);
    }

    #[tokio::test]
    async fn add_watchlist_item_marks_existing_episodes_as_not_new() {
        let pool = setup_test_pool().await;

        let series = SeriesInfo {
            site: "syosetu".into(),
            novel_id: "n3645ly".into(),
            title: "작품".into(),
            author: Some("작가".into()),
            total_chapters: 2,
            chapters: vec![
                ChapterInfo {
                    number: 1,
                    url: "https://ncode.syosetu.com/n3645ly/1/".into(),
                    title: Some("1화".into()),
                    status: "pending".into(),
                },
                ChapterInfo {
                    number: 2,
                    url: "https://ncode.syosetu.com/n3645ly/2/".into(),
                    title: Some("2화".into()),
                    status: "pending".into(),
                },
            ],
        };

        add_watchlist_item_from_series(&pool, "https://ncode.syosetu.com/n3645ly/", &series)
            .await
            .expect("add watchlist item");

        let episodes = list_watchlist_episode_rows(&pool, "syosetu", "n3645ly")
            .await
            .expect("episode rows");
        assert!(episodes.iter().all(|episode| !episode.is_new));
    }

    #[test]
    fn watchlist_supports_syosetu_nocturne_and_kakuyomu() {
        assert!(is_watchlist_supported_site("syosetu"));
        assert!(is_watchlist_supported_site("nocturne"));
        assert!(is_watchlist_supported_site("kakuyomu"));
        assert!(!is_watchlist_supported_site("hameln"));
    }

    #[test]
    fn find_watchlist_item_matches_site_and_novel_id() {
        let item = find_watchlist_item(
            vec![
                WatchlistItem {
                    site: "syosetu".into(),
                    work_url: "https://ncode.syosetu.com/n1000aa/".into(),
                    novel_id: "n1000aa".into(),
                    title: "일반 작품".into(),
                    author: None,
                    last_known_chapter: 1,
                    last_checked_at: None,
                    last_check_status: "ok".into(),
                    last_check_error: None,
                    new_episode_count: 0,
                },
                WatchlistItem {
                    site: "nocturne".into(),
                    work_url: "https://novel18.syosetu.com/n1000aa/".into(),
                    novel_id: "n1000aa".into(),
                    title: "R18 작품".into(),
                    author: None,
                    last_known_chapter: 1,
                    last_checked_at: None,
                    last_check_status: "ok".into(),
                    last_check_error: None,
                    new_episode_count: 1,
                },
            ],
            "nocturne",
            "n1000aa",
        )
        .expect("matching watchlist item");

        assert_eq!(item.site, "nocturne");
        assert_eq!(item.title, "R18 작품");
    }

    #[tokio::test]
    async fn refresh_watchlist_item_marks_only_newly_added_episodes() {
        let pool = setup_test_pool().await;

        let series = SeriesInfo {
            site: "syosetu".into(),
            novel_id: "n3645ly".into(),
            title: "작품".into(),
            author: Some("작가".into()),
            total_chapters: 2,
            chapters: vec![
                ChapterInfo {
                    number: 1,
                    url: "https://ncode.syosetu.com/n3645ly/1/".into(),
                    title: Some("1화".into()),
                    status: "pending".into(),
                },
                ChapterInfo {
                    number: 2,
                    url: "https://ncode.syosetu.com/n3645ly/2/".into(),
                    title: Some("2화".into()),
                    status: "pending".into(),
                },
            ],
        };

        add_watchlist_item_from_series(&pool, "https://ncode.syosetu.com/n3645ly/", &series)
            .await
            .expect("seed watchlist item");

        let refreshed = SeriesInfo {
            site: "syosetu".into(),
            novel_id: "n3645ly".into(),
            title: "작품".into(),
            author: Some("작가".into()),
            total_chapters: 3,
            chapters: vec![
                ChapterInfo {
                    number: 1,
                    url: "https://ncode.syosetu.com/n3645ly/1/".into(),
                    title: Some("1화".into()),
                    status: "pending".into(),
                },
                ChapterInfo {
                    number: 2,
                    url: "https://ncode.syosetu.com/n3645ly/2/".into(),
                    title: Some("2화".into()),
                    status: "pending".into(),
                },
                ChapterInfo {
                    number: 3,
                    url: "https://ncode.syosetu.com/n3645ly/3/".into(),
                    title: Some("3화".into()),
                    status: "pending".into(),
                },
            ],
        };

        let summary = refresh_watchlist_item_from_series(&pool, "n3645ly", &refreshed)
            .await
            .expect("refresh watchlist item");

        assert_eq!(summary.new_episode_count, 1);
        let episodes = list_watchlist_episode_rows(&pool, "syosetu", "n3645ly")
            .await
            .expect("episode rows");
        assert_eq!(episodes.iter().filter(|episode| episode.is_new).count(), 1);
        assert_eq!(
            episodes.last().map(|episode| episode.chapter_number),
            Some(3)
        );
    }

    #[tokio::test]
    async fn readding_watchlist_item_preserves_existing_new_flags() {
        let pool = setup_test_pool().await;

        let series = SeriesInfo {
            site: "syosetu".into(),
            novel_id: "n3645ly".into(),
            title: "작품".into(),
            author: Some("작가".into()),
            total_chapters: 2,
            chapters: vec![
                ChapterInfo {
                    number: 1,
                    url: "https://ncode.syosetu.com/n3645ly/1/".into(),
                    title: Some("1화".into()),
                    status: "pending".into(),
                },
                ChapterInfo {
                    number: 2,
                    url: "https://ncode.syosetu.com/n3645ly/2/".into(),
                    title: Some("2화".into()),
                    status: "pending".into(),
                },
            ],
        };

        add_watchlist_item_from_series(&pool, "https://ncode.syosetu.com/n3645ly/", &series)
            .await
            .expect("seed watchlist item");

        sqlx::query(
            "UPDATE watchlist_episodes
             SET is_new = 1
             WHERE site = ? AND novel_id = ? AND chapter_number = ?",
        )
        .bind("syosetu")
        .bind("n3645ly")
        .bind(2_i64)
        .execute(&pool)
        .await
        .expect("mark chapter as new");

        add_watchlist_item_from_series(&pool, "https://ncode.syosetu.com/n3645ly/", &series)
            .await
            .expect("re-add watchlist item");

        let episodes = list_watchlist_episode_rows(&pool, "syosetu", "n3645ly")
            .await
            .expect("episode rows");
        let chapter_two = episodes
            .iter()
            .find(|episode| episode.chapter_number == 2)
            .expect("chapter 2");

        assert!(chapter_two.is_new);
    }

    #[tokio::test]
    async fn list_watchlist_items_includes_new_episode_count() {
        let pool = setup_test_pool().await;

        let series = SeriesInfo {
            site: "syosetu".into(),
            novel_id: "n3645ly".into(),
            title: "작품".into(),
            author: Some("작가".into()),
            total_chapters: 1,
            chapters: vec![ChapterInfo {
                number: 1,
                url: "https://ncode.syosetu.com/n3645ly/1/".into(),
                title: Some("1화".into()),
                status: "pending".into(),
            }],
        };

        add_watchlist_item_from_series(&pool, "https://ncode.syosetu.com/n3645ly/", &series)
            .await
            .expect("seed watchlist item");

        sqlx::query(
            "INSERT INTO watchlist_episodes (site, novel_id, chapter_number, chapter_url, title, is_new)
             VALUES (?, ?, ?, ?, ?, 1)
             ON CONFLICT(site, novel_id, chapter_number) DO UPDATE SET is_new = 1",
        )
        .bind("syosetu")
        .bind("n3645ly")
        .bind(2_i64)
        .bind("https://ncode.syosetu.com/n3645ly/2/")
        .bind("2화")
        .execute(&pool)
        .await
        .expect("insert new episode");

        let items = list_watchlist_items_with_pool(&pool)
            .await
            .expect("watchlist items");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].new_episode_count, 1);
    }

    #[tokio::test]
    async fn mark_episode_viewed_clears_new_flag_for_that_episode() {
        let pool = setup_test_pool().await;

        let series = SeriesInfo {
            site: "syosetu".into(),
            novel_id: "n3645ly".into(),
            title: "작품".into(),
            author: Some("작가".into()),
            total_chapters: 1,
            chapters: vec![ChapterInfo {
                number: 1,
                url: "https://ncode.syosetu.com/n3645ly/1/".into(),
                title: Some("1화".into()),
                status: "pending".into(),
            }],
        };

        add_watchlist_item_from_series(&pool, "https://ncode.syosetu.com/n3645ly/", &series)
            .await
            .expect("seed watchlist item");

        sqlx::query(
            "UPDATE watchlist_episodes
             SET is_new = 1
             WHERE site = ? AND novel_id = ? AND chapter_number = ?",
        )
        .bind("syosetu")
        .bind("n3645ly")
        .bind(1_i64)
        .execute(&pool)
        .await
        .expect("mark new");

        let update = mark_episode_viewed_with_pool(&pool, "syosetu", "n3645ly", 1)
            .await
            .expect("mark viewed");

        assert_eq!(update.site, "syosetu");
        assert_eq!(update.novel_id, "n3645ly");
        assert_eq!(update.chapter_number, 1);
        assert_eq!(update.remaining_new_episode_count, 0);
        assert!(update.cleared_new_flag);

        let episodes = list_watchlist_episode_rows(&pool, "syosetu", "n3645ly")
            .await
            .expect("episode rows");
        let episode = episodes
            .iter()
            .find(|episode| episode.chapter_number == 1)
            .expect("chapter 1");
        assert!(!episode.is_new);
        assert!(episode.is_viewed);
    }

    #[tokio::test]
    async fn watchlist_episode_state_is_scoped_by_site() {
        let pool = setup_test_pool().await;

        let syosetu_series = SeriesInfo {
            site: "syosetu".into(),
            novel_id: "n1000aa".into(),
            title: "일반 작품".into(),
            author: Some("작가".into()),
            total_chapters: 1,
            chapters: vec![ChapterInfo {
                number: 1,
                url: "https://ncode.syosetu.com/n1000aa/1/".into(),
                title: Some("1화".into()),
                status: "pending".into(),
            }],
        };
        let nocturne_series = SeriesInfo {
            site: "nocturne".into(),
            novel_id: "n1000aa".into(),
            title: "R18 작품".into(),
            author: Some("작가".into()),
            total_chapters: 1,
            chapters: vec![ChapterInfo {
                number: 1,
                url: "https://novel18.syosetu.com/n1000aa/1/".into(),
                title: Some("1화".into()),
                status: "pending".into(),
            }],
        };

        add_watchlist_item_from_series(&pool, "https://ncode.syosetu.com/n1000aa/", &syosetu_series)
            .await
            .expect("seed syosetu watchlist item");
        add_watchlist_item_from_series(&pool, "https://novel18.syosetu.com/n1000aa/", &nocturne_series)
            .await
            .expect("seed nocturne watchlist item");

        sqlx::query(
            "UPDATE watchlist_episodes
             SET is_new = 1
             WHERE site = ? AND novel_id = ? AND chapter_number = ?",
        )
        .bind("nocturne")
        .bind("n1000aa")
        .bind(1_i64)
        .execute(&pool)
        .await
        .expect("mark nocturne episode as new");

        let syosetu_episodes = list_watchlist_episode_rows(&pool, "syosetu", "n1000aa")
            .await
            .expect("syosetu episodes");
        let nocturne_episodes = list_watchlist_episode_rows(&pool, "nocturne", "n1000aa")
            .await
            .expect("nocturne episodes");

        assert!(!syosetu_episodes[0].is_new);
        assert!(nocturne_episodes[0].is_new);
    }
}
