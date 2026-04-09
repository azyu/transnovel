use sqlx::{Pool, Row, Sqlite};

use crate::db::get_pool;
use crate::models::novel::{SeriesInfo, WatchlistEpisode, WatchlistItem, WatchlistViewedUpdate};
use crate::parsers::{get_parser_for_url, ParsedUrl};

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct RefreshWatchlistSummary {
    pub new_episode_count: u32,
}

pub fn is_watchlist_supported_site(site: &str) -> bool {
    matches!(site, "syosetu" | "nocturne")
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
            "현재는 Syosetu 또는 Novel18 작품 페이지 URL만 관심작품으로 등록할 수 있습니다."
                .to_string(),
        );
    }

    let parser = get_parser_for_url(url).ok_or("지원하지 않는 사이트입니다.")?;
    let series = parser.get_series_info(url).await?;
    if !is_watchlist_supported_site(&series.site) {
        return Err("현재는 Syosetu 또는 Novel18 작품만 관심작품으로 등록할 수 있습니다.".to_string());
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

pub async fn refresh_watchlist_items() -> Result<Vec<WatchlistItem>, String> {
    let pool = get_pool()?;

    let rows = sqlx::query(
        "SELECT site, work_url, novel_id FROM watchlist_items ORDER BY updated_at DESC, id DESC",
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

pub async fn get_watchlist_episodes(site: &str, novel_id: &str) -> Result<Vec<WatchlistEpisode>, String> {
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
            site, work_url, novel_id, title, author, last_known_chapter, last_checked_at, last_check_status, last_check_error, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'ok', NULL, CURRENT_TIMESTAMP)
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
             ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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

pub async fn list_watchlist_items_with_pool(
    pool: &Pool<Sqlite>,
) -> Result<Vec<WatchlistItem>, String> {
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
         ORDER BY items.updated_at DESC, items.id DESC",
    )
    .fetch_all(pool)
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
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(site, novel_id, chapter_number) DO UPDATE SET viewed_at = CURRENT_TIMESTAMP",
    )
    .bind(site)
    .bind(novel_id)
    .bind(i64::from(chapter_number))
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
        add_watchlist_item_from_series, find_watchlist_item, is_watchlist_supported_site,
        list_watchlist_episode_rows, list_watchlist_items_with_pool, mark_episode_viewed_with_pool,
        refresh_watchlist_item_from_series,
    };
    use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};

    use crate::models::novel::{ChapterInfo, SeriesInfo, WatchlistItem};

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

        pool
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
    fn watchlist_supports_syosetu_and_nocturne_only() {
        assert!(is_watchlist_supported_site("syosetu"));
        assert!(is_watchlist_supported_site("nocturne"));
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
