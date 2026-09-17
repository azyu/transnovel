use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{sqlite::SqliteConnection, Connection, Pool, Row, Sqlite, Transaction};

use crate::db::get_pool;

#[derive(Debug, Clone, Copy)]
pub struct ChapterUpsert<'a> {
    pub site: &'a str,
    pub novel_id: &'a str,
    pub chapter_number: u32,
    pub chapter_url: &'a str,
    pub title: Option<&'a str>,
    pub subtitle: Option<&'a str>,
    pub original_content: &'a str,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PersistedTranslation {
    pub id: i64,
    pub paragraph_index: u32,
    pub original_text: String,
    pub translated_text: String,
    pub model_used: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PersistedChapter {
    pub id: i64,
    pub site: String,
    pub novel_id: String,
    pub chapter_number: u32,
    pub chapter_url: String,
    pub title: Option<String>,
    pub subtitle: Option<String>,
    pub original_content: String,
    pub content_hash: String,
    pub status: String,
    pub translations: Vec<PersistedTranslation>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranslationWrite {
    pub paragraph_index: usize,
    pub original_text: String,
    pub translated_text: Option<String>,
}

impl TranslationWrite {
    pub fn success(paragraph_index: usize, original_text: &str, translated_text: &str) -> Self {
        Self {
            paragraph_index,
            original_text: original_text.to_string(),
            translated_text: Some(translated_text.to_string()),
        }
    }

    pub fn failed(paragraph_index: usize, original_text: &str) -> Self {
        Self {
            paragraph_index,
            original_text: original_text.to_string(),
            translated_text: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TranslationWriteMode {
    Full { body_length: usize },
    Retry,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TranslationCompletion {
    Clear,
    MarkIfComplete,
}

#[derive(Debug, Clone, Copy)]
pub struct TranslationPersistenceContext<'a> {
    pub site: &'a str,
    pub novel_id: &'a str,
    pub chapter_number: u32,
    pub expected_content_hash: &'a str,
    pub model_used: &'a str,
    pub completion: TranslationCompletion,
}

pub fn chapter_content_hash(
    title: Option<&str>,
    subtitle: Option<&str>,
    original_content: &str,
) -> String {
    fn update_field(hasher: &mut Sha256, value: Option<&str>) {
        match value {
            Some(value) => {
                hasher.update([1]);
                hasher.update((value.len() as u64).to_be_bytes());
                hasher.update(value.as_bytes());
            }
            None => hasher.update([0]),
        }
    }

    let mut hasher = Sha256::new();
    update_field(&mut hasher, title);
    update_field(&mut hasher, subtitle);
    update_field(&mut hasher, Some(original_content));
    format!("{:x}", hasher.finalize())
}

pub fn extract_chapter_paragraphs(html: &str) -> Vec<String> {
    let document = Html::parse_fragment(html);
    let p_selector = Selector::parse("p").expect("static paragraph selector");
    let lines = document
        .select(&p_selector)
        .map(|element| {
            element
                .text()
                .collect::<Vec<_>>()
                .join("")
                .trim()
                .to_string()
        })
        .collect::<Vec<_>>();

    if !lines.iter().any(String::is_empty) {
        return lines;
    }

    let mut paragraphs = Vec::new();
    let mut current = Vec::new();
    for line in lines {
        if line.is_empty() {
            if !current.is_empty() {
                paragraphs.push(current.join("\n"));
                current.clear();
            }
        } else {
            current.push(line);
        }
    }
    if !current.is_empty() {
        paragraphs.push(current.join("\n"));
    }
    paragraphs
}
async fn begin_write_transaction(
    connection: &mut SqliteConnection,
) -> Result<Transaction<'_, Sqlite>, String> {
    connection
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| error.to_string())
}

pub async fn upsert_chapter(input: ChapterUpsert<'_>) -> Result<PersistedChapter, String> {
    upsert_chapter_with_pool(get_pool()?, input).await
}

pub async fn upsert_chapter_with_pool(
    pool: &Pool<Sqlite>,
    input: ChapterUpsert<'_>,
) -> Result<PersistedChapter, String> {
    let chapter_number = i64::from(input.chapter_number);
    let content_hash = chapter_content_hash(input.title, input.subtitle, input.original_content);
    let mut connection = pool.acquire().await.map_err(|error| error.to_string())?;
    let mut transaction = begin_write_transaction(&mut connection).await?;
    let existing = sqlx::query(
        "SELECT chapters.id, chapters.title, chapters.subtitle,
                chapters.original_content, chapters.content_hash, chapters.status
         FROM chapters
         INNER JOIN novels ON novels.id = chapters.novel_id
         WHERE novels.site = ? AND novels.novel_id = ? AND chapters.chapter_number = ?",
    )
    .bind(input.site)
    .bind(input.novel_id)
    .bind(chapter_number)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    let content_changed = existing.as_ref().is_some_and(|row| {
        let existing_hash = row
            .get::<Option<String>, _>("content_hash")
            .unwrap_or_else(|| {
                chapter_content_hash(
                    row.get::<Option<String>, _>("title").as_deref(),
                    row.get::<Option<String>, _>("subtitle").as_deref(),
                    row.get::<Option<String>, _>("original_content")
                        .as_deref()
                        .unwrap_or_default(),
                )
            });
        existing_hash != content_hash
    });

    let result = sqlx::query(
        "INSERT INTO chapters
            (novel_id, chapter_number, chapter_url, title, subtitle, original_content, content_hash)
         SELECT id, ?, ?, ?, ?, ?, ?
         FROM novels
         WHERE site = ? AND novel_id = ?
         ON CONFLICT(novel_id, chapter_number) DO UPDATE SET
           chapter_url = excluded.chapter_url,
           title = excluded.title,
           subtitle = excluded.subtitle,
           original_content = excluded.original_content,
           content_hash = excluded.content_hash",
    )
    .bind(chapter_number)
    .bind(input.chapter_url)
    .bind(input.title)
    .bind(input.subtitle)
    .bind(input.original_content)
    .bind(&content_hash)
    .bind(input.site)
    .bind(input.novel_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    if result.rows_affected() == 0 {
        return Err("작품 메타데이터가 없어 챕터를 저장할 수 없습니다.".to_string());
    }

    if content_changed {
        let chapter_id = existing
            .as_ref()
            .map(|row| row.get::<i64, _>("id"))
            .ok_or_else(|| "갱신할 챕터를 찾을 수 없습니다.".to_string())?;
        sqlx::query("DELETE FROM translations WHERE chapter_id = ?")
            .bind(chapter_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
        sqlx::query(
            "DELETE FROM completed_chapters
             WHERE site = ? AND novel_id = ? AND chapter_number = ?",
        )
        .bind(input.site)
        .bind(input.novel_id)
        .bind(chapter_number)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
    }

    let chapter_id = existing
        .as_ref()
        .map(|row| row.get::<i64, _>("id"))
        .unwrap_or_else(|| result.last_insert_rowid());
    let status = existing
        .as_ref()
        .map(|row| row.get::<String, _>("status"))
        .unwrap_or_else(|| "pending".to_string());
    let translations = sqlx::query(
        "SELECT id, paragraph_index, original_text, translated_text, model_used
         FROM translations
         WHERE chapter_id = ?
         ORDER BY paragraph_index",
    )
    .bind(chapter_id)
    .fetch_all(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .into_iter()
    .map(|translation| PersistedTranslation {
        id: translation.get("id"),
        paragraph_index: translation.get::<i64, _>("paragraph_index") as u32,
        original_text: translation.get("original_text"),
        translated_text: translation.get("translated_text"),
        model_used: translation.get("model_used"),
    })
    .collect();
    let persisted = PersistedChapter {
        id: chapter_id,
        site: input.site.to_string(),
        novel_id: input.novel_id.to_string(),
        chapter_number: input.chapter_number,
        chapter_url: input.chapter_url.to_string(),
        title: input.title.map(str::to_string),
        subtitle: input.subtitle.map(str::to_string),
        original_content: input.original_content.to_string(),
        content_hash,
        status,
        translations,
    };
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(persisted)
}

pub async fn get_persisted_chapter(
    site: &str,
    novel_id: &str,
    chapter_number: u32,
) -> Result<Option<PersistedChapter>, String> {
    get_persisted_chapter_with_pool(get_pool()?, site, novel_id, chapter_number).await
}

pub async fn get_persisted_chapter_with_pool(
    pool: &Pool<Sqlite>,
    site: &str,
    novel_id: &str,
    chapter_number: u32,
) -> Result<Option<PersistedChapter>, String> {
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let row = sqlx::query(
        "SELECT chapters.id, novels.site, novels.novel_id, chapters.chapter_number,
                chapters.chapter_url, chapters.title, chapters.subtitle,
                chapters.original_content, chapters.content_hash, chapters.status
         FROM chapters
         INNER JOIN novels ON novels.id = chapters.novel_id
         WHERE novels.site = ? AND novels.novel_id = ? AND chapters.chapter_number = ?",
    )
    .bind(site)
    .bind(novel_id)
    .bind(i64::from(chapter_number))
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;

    let Some(row) = row else {
        transaction
            .commit()
            .await
            .map_err(|error| error.to_string())?;
        return Ok(None);
    };
    let chapter_id = row.get::<i64, _>("id");
    let translations = sqlx::query(
        "SELECT id, paragraph_index, original_text, translated_text, model_used
         FROM translations
         WHERE chapter_id = ?
         ORDER BY paragraph_index",
    )
    .bind(chapter_id)
    .fetch_all(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .into_iter()
    .map(|translation| PersistedTranslation {
        id: translation.get("id"),
        paragraph_index: translation.get::<i64, _>("paragraph_index") as u32,
        original_text: translation.get("original_text"),
        translated_text: translation.get("translated_text"),
        model_used: translation.get("model_used"),
    })
    .collect();
    let title: Option<String> = row.get("title");
    let subtitle: Option<String> = row.get("subtitle");
    let original_content = row
        .get::<Option<String>, _>("original_content")
        .unwrap_or_default();
    let content_hash = row
        .get::<Option<String>, _>("content_hash")
        .unwrap_or_else(|| {
            chapter_content_hash(title.as_deref(), subtitle.as_deref(), &original_content)
        });
    let persisted = PersistedChapter {
        id: chapter_id,
        site: row.get("site"),
        novel_id: row.get("novel_id"),
        chapter_number: row.get::<i64, _>("chapter_number") as u32,
        chapter_url: row.get("chapter_url"),
        title,
        subtitle,
        original_content,
        content_hash,
        status: row.get("status"),
        translations,
    };
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(Some(persisted))
}

pub async fn persist_translations(
    context: TranslationPersistenceContext<'_>,
    mode: TranslationWriteMode,
    writes: &[TranslationWrite],
) -> Result<(), String> {
    persist_translations_with_pool(get_pool()?, context, mode, writes).await
}

pub async fn persist_translations_with_pool(
    pool: &Pool<Sqlite>,
    context: TranslationPersistenceContext<'_>,
    mode: TranslationWriteMode,
    writes: &[TranslationWrite],
) -> Result<(), String> {
    let mut connection = pool.acquire().await.map_err(|error| error.to_string())?;
    let mut transaction = begin_write_transaction(&mut connection).await?;
    let chapter = sqlx::query(
        "SELECT chapters.id, chapters.title, chapters.subtitle,
                chapters.content_hash, chapters.original_content
         FROM chapters
         INNER JOIN novels ON novels.id = chapters.novel_id
         WHERE novels.site = ? AND novels.novel_id = ? AND chapters.chapter_number = ?",
    )
    .bind(context.site)
    .bind(context.novel_id)
    .bind(i64::from(context.chapter_number))
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "저장할 챕터를 찾을 수 없습니다.".to_string())?;
    let chapter_id = chapter.get::<i64, _>("id");
    let original_content = chapter
        .get::<Option<String>, _>("original_content")
        .unwrap_or_default();
    let actual_content_hash = chapter
        .get::<Option<String>, _>("content_hash")
        .unwrap_or_else(|| {
            chapter_content_hash(
                chapter.get::<Option<String>, _>("title").as_deref(),
                chapter.get::<Option<String>, _>("subtitle").as_deref(),
                &original_content,
            )
        });
    if actual_content_hash != context.expected_content_hash {
        return Err("챕터 원문이 변경되어 번역 결과를 저장하지 않았습니다.".to_string());
    }
    let canonical_paragraphs = extract_chapter_paragraphs(&original_content);
    if let TranslationWriteMode::Full { body_length } = mode {
        if body_length != canonical_paragraphs.len() {
            return Err("저장할 본문 길이가 현재 챕터 원문과 일치하지 않습니다.".to_string());
        }
    }
    for write in writes {
        let Some(canonical_original) = canonical_paragraphs.get(write.paragraph_index) else {
            return Err("번역 문단 색인이 현재 챕터 원문 범위를 벗어났습니다.".to_string());
        };
        if canonical_original != &write.original_text {
            return Err("번역 문단 원문이 현재 챕터 원문과 일치하지 않습니다.".to_string());
        }
    }

    for write in writes {
        let paragraph_index = i64::try_from(write.paragraph_index)
            .map_err(|_| "paragraph index is too large".to_string())?;
        if let Some(translated_text) = write
            .translated_text
            .as_deref()
            .filter(|text| !text.is_empty())
        {
            sqlx::query(
                "INSERT INTO translations
                    (chapter_id, paragraph_index, original_text, translated_text, model_used)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(chapter_id, paragraph_index) DO UPDATE SET
                   original_text = excluded.original_text,
                   translated_text = excluded.translated_text,
                   model_used = excluded.model_used",
            )
            .bind(chapter_id)
            .bind(paragraph_index)
            .bind(&write.original_text)
            .bind(translated_text)
            .bind(context.model_used)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
        } else {
            sqlx::query(
                "DELETE FROM translations
                 WHERE chapter_id = ? AND paragraph_index = ? AND original_text <> ?",
            )
            .bind(chapter_id)
            .bind(paragraph_index)
            .bind(&write.original_text)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
        }
    }

    if let TranslationWriteMode::Full { body_length } = mode {
        let body_length =
            i64::try_from(body_length).map_err(|_| "body length is too large".to_string())?;
        sqlx::query(
            "DELETE FROM translations
             WHERE chapter_id = ? AND paragraph_index >= ?",
        )
        .bind(chapter_id)
        .bind(body_length)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
    }

    match context.completion {
        TranslationCompletion::Clear => {
            delete_completion_marker(&mut transaction, context).await?;
        }
        TranslationCompletion::MarkIfComplete => {
            let body_length = i64::try_from(canonical_paragraphs.len())
                .map_err(|_| "body length is too large".to_string())?;
            sqlx::query(
                "DELETE FROM translations
                 WHERE chapter_id = ? AND paragraph_index >= ?",
            )
            .bind(chapter_id)
            .bind(body_length)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
            let translated_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM translations
                 WHERE chapter_id = ? AND paragraph_index >= 0 AND paragraph_index < ?",
            )
            .bind(chapter_id)
            .bind(body_length)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
            if translated_count == body_length {
                sqlx::query(
                    "INSERT INTO completed_chapters
                        (site, novel_id, chapter_number, paragraph_count, completed_at)
                     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                     ON CONFLICT(site, novel_id, chapter_number) DO UPDATE SET
                       paragraph_count = excluded.paragraph_count,
                       completed_at = CURRENT_TIMESTAMP",
                )
                .bind(context.site)
                .bind(context.novel_id)
                .bind(i64::from(context.chapter_number))
                .bind(body_length)
                .execute(&mut *transaction)
                .await
                .map_err(|error| error.to_string())?;
            } else {
                delete_completion_marker(&mut transaction, context).await?;
            }
        }
    }

    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())
}

async fn delete_completion_marker(
    transaction: &mut sqlx::Transaction<'_, Sqlite>,
    context: TranslationPersistenceContext<'_>,
) -> Result<(), String> {
    sqlx::query(
        "DELETE FROM completed_chapters
         WHERE site = ? AND novel_id = ? AND chapter_number = ?",
    )
    .bind(context.site)
    .bind(context.novel_id)
    .bind(i64::from(context.chapter_number))
    .execute(&mut **transaction)
    .await
    .map_err(|error| error.to_string())?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};

    async fn setup_test_pool() -> Pool<Sqlite> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                crate::db::sqlite_connect_options("sqlite::memory:")
                    .expect("SQLite connect options"),
            )
            .await
            .expect("create SQLite test pool");
        sqlx::query(include_str!("../db/migrations/001_initial.sql"))
            .execute(&pool)
            .await
            .expect("apply initial schema");
        pool
    }

    async fn insert_novel(pool: &Pool<Sqlite>, site: &str, novel_id: &str) {
        sqlx::query("INSERT INTO novels (site, novel_id, title) VALUES (?, ?, ?)")
            .bind(site)
            .bind(novel_id)
            .bind("작품")
            .execute(pool)
            .await
            .expect("insert novel");
    }

    async fn insert_chapter(pool: &Pool<Sqlite>) -> PersistedChapter {
        insert_chapter_with_content(pool, "<p>본문</p>").await
    }

    async fn insert_chapter_with_content(
        pool: &Pool<Sqlite>,
        original_content: &str,
    ) -> PersistedChapter {
        insert_novel(pool, "syosetu", "n1234").await;
        upsert_chapter_with_pool(
            pool,
            ChapterUpsert {
                site: "syosetu",
                novel_id: "n1234",
                chapter_number: 1,
                chapter_url: "https://example.invalid/1",
                title: Some("제목"),
                subtitle: None,
                original_content,
            },
        )
        .await
        .expect("insert chapter")
    }

    fn translation_context<'a>(
        chapter: &'a PersistedChapter,
        model_used: &'a str,
    ) -> TranslationPersistenceContext<'a> {
        TranslationPersistenceContext {
            site: &chapter.site,
            novel_id: &chapter.novel_id,
            chapter_number: chapter.chapter_number,
            expected_content_hash: &chapter.content_hash,
            model_used,
            completion: TranslationCompletion::Clear,
        }
    }

    #[tokio::test]
    async fn insert_and_read_returns_raw_chapter_content() {
        let pool = setup_test_pool().await;
        insert_novel(&pool, "syosetu", "n1234").await;

        let inserted = upsert_chapter_with_pool(
            &pool,
            ChapterUpsert {
                site: "syosetu",
                novel_id: "n1234",
                chapter_number: 7,
                chapter_url: "https://ncode.syosetu.com/n1234/7/",
                title: Some("제7화"),
                subtitle: Some("출발"),
                original_content: "<p>첫 문장</p>\n<p>둘째 문장</p>",
            },
        )
        .await
        .expect("upsert chapter");

        let persisted = get_persisted_chapter_with_pool(&pool, "syosetu", "n1234", 7)
            .await
            .expect("read chapter")
            .expect("chapter exists");

        assert_eq!(persisted.id, inserted.id);
        assert_eq!(persisted.site, "syosetu");
        assert_eq!(persisted.novel_id, "n1234");
        assert_eq!(persisted.chapter_number, 7);
        assert_eq!(persisted.chapter_url, "https://ncode.syosetu.com/n1234/7/");
        assert_eq!(persisted.title.as_deref(), Some("제7화"));
        assert_eq!(persisted.subtitle.as_deref(), Some("출발"));
        assert_eq!(
            persisted.original_content,
            "<p>첫 문장</p>\n<p>둘째 문장</p>"
        );
        assert!(persisted.translations.is_empty());
    }

    #[tokio::test]
    async fn reparsing_updates_same_chapter_row_without_changing_id() {
        let pool = setup_test_pool().await;
        insert_novel(&pool, "syosetu", "n1234").await;
        let original = upsert_chapter_with_pool(
            &pool,
            ChapterUpsert {
                site: "syosetu",
                novel_id: "n1234",
                chapter_number: 3,
                chapter_url: "https://example.invalid/old",
                title: Some("옛 제목"),
                subtitle: None,
                original_content: "<p>옛 본문</p>",
            },
        )
        .await
        .expect("insert chapter");

        let updated = upsert_chapter_with_pool(
            &pool,
            ChapterUpsert {
                site: "syosetu",
                novel_id: "n1234",
                chapter_number: 3,
                chapter_url: "https://example.invalid/new",
                title: Some("새 제목"),
                subtitle: Some("새 부제"),
                original_content: "<p>새 본문</p>",
            },
        )
        .await
        .expect("update chapter");

        assert_eq!(updated.id, original.id);
        assert_eq!(updated.chapter_url, "https://example.invalid/new");
        assert_eq!(updated.title.as_deref(), Some("새 제목"));
        assert_eq!(updated.subtitle.as_deref(), Some("새 부제"));
        assert_eq!(updated.original_content, "<p>새 본문</p>");
    }

    #[tokio::test]
    async fn same_external_novel_id_is_isolated_by_site() {
        let pool = setup_test_pool().await;
        insert_novel(&pool, "syosetu", "shared-id").await;
        insert_novel(&pool, "nocturne", "shared-id").await;

        for (site, content) in [("syosetu", "일반 본문"), ("nocturne", "성인 본문")] {
            upsert_chapter_with_pool(
                &pool,
                ChapterUpsert {
                    site,
                    novel_id: "shared-id",
                    chapter_number: 1,
                    chapter_url: "https://example.invalid/1",
                    title: None,
                    subtitle: None,
                    original_content: content,
                },
            )
            .await
            .expect("upsert site-scoped chapter");
        }

        let syosetu = get_persisted_chapter_with_pool(&pool, "syosetu", "shared-id", 1)
            .await
            .expect("read Syosetu")
            .expect("Syosetu chapter exists");
        let nocturne = get_persisted_chapter_with_pool(&pool, "nocturne", "shared-id", 1)
            .await
            .expect("read Nocturne")
            .expect("Nocturne chapter exists");

        assert_ne!(syosetu.id, nocturne.id);
        assert_eq!(syosetu.original_content, "일반 본문");
        assert_eq!(nocturne.original_content, "성인 본문");
    }

    #[tokio::test]
    async fn translation_writes_are_returned_in_paragraph_order() {
        let pool = setup_test_pool().await;
        let chapter = insert_chapter_with_content(&pool, "<p>첫</p><p>둘</p><p>셋</p>").await;
        let writes = vec![
            TranslationWrite::success(2, "셋", "셋 번역"),
            TranslationWrite::success(0, "첫", "첫 번역"),
            TranslationWrite::success(1, "둘", "둘 번역"),
        ];

        persist_translations_with_pool(
            &pool,
            translation_context(&chapter, "test-model"),
            TranslationWriteMode::Full { body_length: 3 },
            &writes,
        )
        .await
        .expect("persist translations");

        let chapter = get_persisted_chapter_with_pool(&pool, "syosetu", "n1234", 1)
            .await
            .expect("read chapter")
            .expect("chapter exists");
        assert_eq!(
            chapter
                .translations
                .iter()
                .map(|row| (
                    row.paragraph_index,
                    row.original_text.as_str(),
                    row.translated_text.as_str()
                ))
                .collect::<Vec<_>>(),
            vec![
                (0, "첫", "첫 번역"),
                (1, "둘", "둘 번역"),
                (2, "셋", "셋 번역"),
            ]
        );
    }

    #[tokio::test]
    async fn full_failed_write_keeps_unchanged_successes() {
        let pool = setup_test_pool().await;
        let chapter = insert_chapter_with_content(&pool, "<p>같은 원문</p><p>옛 원문</p>").await;
        let initial = vec![
            TranslationWrite::success(0, "같은 원문", "기존 번역 0"),
            TranslationWrite::success(1, "옛 원문", "기존 번역 1"),
        ];
        persist_translations_with_pool(
            &pool,
            translation_context(&chapter, "old-model"),
            TranslationWriteMode::Full { body_length: 2 },
            &initial,
        )
        .await
        .expect("persist initial translations");
        let original_id = get_persisted_chapter_with_pool(&pool, "syosetu", "n1234", 1)
            .await
            .expect("read initial")
            .expect("chapter exists")
            .translations[0]
            .id;

        let updated = vec![
            TranslationWrite::failed(0, "같은 원문"),
            TranslationWrite::failed(1, "옛 원문"),
        ];
        persist_translations_with_pool(
            &pool,
            translation_context(&chapter, "new-model"),
            TranslationWriteMode::Full { body_length: 2 },
            &updated,
        )
        .await
        .expect("persist full update");

        let rows = get_persisted_chapter_with_pool(&pool, "syosetu", "n1234", 1)
            .await
            .expect("read updated")
            .expect("chapter exists")
            .translations;
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].id, original_id);
        assert_eq!(rows[0].translated_text, "기존 번역 0");
        assert_eq!(rows[1].translated_text, "기존 번역 1");
    }

    #[tokio::test]
    async fn retry_write_merges_only_supplied_indices_without_blanking_successes() {
        let pool = setup_test_pool().await;
        let chapter = insert_chapter_with_content(&pool, "<p>첫</p><p>둘</p><p>셋</p>").await;
        let initial = vec![
            TranslationWrite::success(0, "첫", "번역 0"),
            TranslationWrite::success(1, "둘", "번역 1"),
            TranslationWrite::success(2, "셋", "번역 2"),
        ];
        persist_translations_with_pool(
            &pool,
            translation_context(&chapter, "old-model"),
            TranslationWriteMode::Full { body_length: 3 },
            &initial,
        )
        .await
        .expect("persist initial translations");
        let original_ids = get_persisted_chapter_with_pool(&pool, "syosetu", "n1234", 1)
            .await
            .expect("read initial translations")
            .expect("chapter exists")
            .translations
            .into_iter()
            .map(|row| row.id)
            .collect::<Vec<_>>();

        let retry = vec![
            TranslationWrite::success(1, "둘", "재시도 번역 1"),
            TranslationWrite::failed(2, "셋"),
        ];
        persist_translations_with_pool(
            &pool,
            translation_context(&chapter, "retry-model"),
            TranslationWriteMode::Retry,
            &retry,
        )
        .await
        .expect("persist retry");

        let rows = get_persisted_chapter_with_pool(&pool, "syosetu", "n1234", 1)
            .await
            .expect("read merged")
            .expect("chapter exists")
            .translations;
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].translated_text, "번역 0");
        assert_eq!(rows[1].id, original_ids[1]);
        assert_eq!(rows[1].translated_text, "재시도 번역 1");
        assert_eq!(rows[1].model_used.as_deref(), Some("retry-model"));
        assert_eq!(rows[2].translated_text, "번역 2");
    }

    #[tokio::test]
    async fn completion_marker_follows_translation_outcome_atomically() {
        let pool = setup_test_pool().await;
        let chapter = insert_chapter_with_content(&pool, "<p>첫</p><p>둘</p>").await;
        let mut complete_context = translation_context(&chapter, "model");
        complete_context.completion = TranslationCompletion::MarkIfComplete;
        persist_translations_with_pool(
            &pool,
            complete_context,
            TranslationWriteMode::Full { body_length: 2 },
            &[
                TranslationWrite::success(0, "첫", "번역 0"),
                TranslationWrite::success(1, "둘", "번역 1"),
            ],
        )
        .await
        .expect("persist complete translation");

        let completed_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM completed_chapters
             WHERE site = ? AND novel_id = ? AND chapter_number = ?",
        )
        .bind("syosetu")
        .bind("n1234")
        .bind(1_i64)
        .fetch_one(&pool)
        .await
        .expect("read completion");
        assert_eq!(completed_count, 1);

        let mut partial_context = translation_context(&chapter, "retry-model");
        partial_context.completion = TranslationCompletion::Clear;
        persist_translations_with_pool(
            &pool,
            partial_context,
            TranslationWriteMode::Retry,
            &[TranslationWrite::failed(1, "둘")],
        )
        .await
        .expect("persist partial retry");

        let completed_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM completed_chapters
             WHERE site = ? AND novel_id = ? AND chapter_number = ?",
        )
        .bind("syosetu")
        .bind("n1234")
        .bind(1_i64)
        .fetch_one(&pool)
        .await
        .expect("read cleared completion");
        assert_eq!(completed_count, 0);
    }

    #[tokio::test]
    async fn invalid_late_write_rolls_back_earlier_updates_in_transaction() {
        let pool = setup_test_pool().await;
        let chapter = insert_chapter_with_content(&pool, "<p>첫</p>").await;
        persist_translations_with_pool(
            &pool,
            translation_context(&chapter, "old-model"),
            TranslationWriteMode::Full { body_length: 1 },
            &[TranslationWrite::success(0, "첫", "원래 번역")],
        )
        .await
        .expect("persist initial translation");

        let error = persist_translations_with_pool(
            &pool,
            translation_context(&chapter, "new-model"),
            TranslationWriteMode::Retry,
            &[
                TranslationWrite::success(0, "첫", "롤백될 번역"),
                TranslationWrite::success(usize::MAX, "잘못된 색인", "실패"),
            ],
        )
        .await
        .expect_err("oversized paragraph index must fail");
        assert!(error.contains("색인"));

        let rows = get_persisted_chapter_with_pool(&pool, "syosetu", "n1234", 1)
            .await
            .expect("read after rollback")
            .expect("chapter exists")
            .translations;
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].translated_text, "원래 번역");
        assert_eq!(rows[0].model_used.as_deref(), Some("old-model"));
    }

    #[tokio::test]
    async fn reparsing_changed_title_invalidates_existing_translations() {
        let pool = setup_test_pool().await;
        let chapter = insert_chapter(&pool).await;
        persist_translations_with_pool(
            &pool,
            translation_context(&chapter, "old-model"),
            TranslationWriteMode::Full { body_length: 1 },
            &[TranslationWrite::success(0, "본문", "기존 번역")],
        )
        .await
        .expect("persist original translation");
        sqlx::query(
            "INSERT INTO completed_chapters
                (site, novel_id, chapter_number, paragraph_count)
             VALUES (?, ?, ?, ?)",
        )
        .bind("syosetu")
        .bind("n1234")
        .bind(1_i64)
        .bind(1_i64)
        .execute(&pool)
        .await
        .expect("mark original chapter complete");

        let reparsed = upsert_chapter_with_pool(
            &pool,
            ChapterUpsert {
                site: "syosetu",
                novel_id: "n1234",
                chapter_number: 1,
                chapter_url: "https://example.invalid/1",
                title: Some("수정된 제목"),
                subtitle: None,
                original_content: "<p>본문</p>",
            },
        )
        .await
        .expect("reparse changed chapter");

        assert_eq!(reparsed.id, chapter.id);
        assert!(reparsed.translations.is_empty());
        let completion_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM completed_chapters
             WHERE site = ? AND novel_id = ? AND chapter_number = ?",
        )
        .bind("syosetu")
        .bind("n1234")
        .bind(1_i64)
        .fetch_one(&pool)
        .await
        .expect("read completion state");
        assert_eq!(completion_count, 0);
    }

    #[tokio::test]
    async fn stale_translation_revision_is_rejected_after_reparse() {
        let pool = setup_test_pool().await;
        let chapter = insert_chapter(&pool).await;
        upsert_chapter_with_pool(
            &pool,
            ChapterUpsert {
                site: "syosetu",
                novel_id: "n1234",
                chapter_number: 1,
                chapter_url: "https://example.invalid/1",
                title: Some("제목"),
                subtitle: None,
                original_content: "<p>새 본문</p>",
            },
        )
        .await
        .expect("reparse before stale translation finishes");

        let error = persist_translations_with_pool(
            &pool,
            translation_context(&chapter, "old-model"),
            TranslationWriteMode::Full { body_length: 1 },
            &[TranslationWrite::success(0, "본문", "늦게 도착한 번역")],
        )
        .await
        .expect_err("stale revision must not be persisted");

        assert!(error.contains("변경"));
        let current = get_persisted_chapter_with_pool(&pool, "syosetu", "n1234", 1)
            .await
            .expect("read current chapter")
            .expect("chapter exists");
        assert!(current.translations.is_empty());
    }

    #[tokio::test]
    async fn persistence_rejects_original_text_outside_the_canonical_revision() {
        let pool = setup_test_pool().await;
        let chapter = insert_chapter(&pool).await;

        let error = persist_translations_with_pool(
            &pool,
            translation_context(&chapter, "test-model"),
            TranslationWriteMode::Full { body_length: 1 },
            &[TranslationWrite::success(0, "변조된 본문", "번역")],
        )
        .await
        .expect_err("non-canonical original text must be rejected");

        assert!(error.contains("원문"));
    }

    #[tokio::test]
    async fn complete_persistence_marks_the_revision_in_the_same_transaction() {
        let pool = setup_test_pool().await;
        let chapter = insert_chapter(&pool).await;
        let context = TranslationPersistenceContext {
            site: &chapter.site,
            novel_id: &chapter.novel_id,
            chapter_number: chapter.chapter_number,
            expected_content_hash: &chapter.content_hash,
            model_used: "test-model",
            completion: TranslationCompletion::MarkIfComplete,
        };

        persist_translations_with_pool(
            &pool,
            context,
            TranslationWriteMode::Full { body_length: 1 },
            &[TranslationWrite::success(0, "본문", "번역")],
        )
        .await
        .expect("persist and complete");

        let completion_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM completed_chapters
             WHERE site = ? AND novel_id = ? AND chapter_number = ?",
        )
        .bind("syosetu")
        .bind("n1234")
        .bind(1_i64)
        .fetch_one(&pool)
        .await
        .expect("read completion");
        assert_eq!(completion_count, 1);
    }

    #[tokio::test]
    async fn write_transaction_reserves_sqlite_writer_before_reading() {
        let database_path = std::env::temp_dir().join(format!(
            "transnovel-persistence-race-{}.db",
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

        let mut persistence_connection = pool.acquire().await.expect("persistence connection");
        let mut persistence_transaction =
            begin_write_transaction(&mut persistence_connection)
                .await
                .expect("begin persistence transaction");
        sqlx::query("SELECT COUNT(*) FROM chapters")
            .fetch_one(&mut *persistence_transaction)
            .await
            .expect("read inside persistence transaction");

        let mut competing_connection = pool.acquire().await.expect("competing connection");
        sqlx::query("PRAGMA busy_timeout = 0")
            .execute(&mut *competing_connection)
            .await
            .expect("disable waiting for the competing writer");
        let competing_error = competing_connection
            .begin_with("BEGIN IMMEDIATE")
            .await
            .expect_err("persistence transaction must already reserve the SQLite writer");
        assert!(
            competing_error.to_string().contains("database is locked"),
            "unexpected competing writer error: {competing_error}"
        );

        persistence_transaction
            .rollback()
            .await
            .expect("rollback persistence transaction");
        let competing_transaction = competing_connection
            .begin_with("BEGIN IMMEDIATE")
            .await
            .expect("writer lock must be released after rollback");
        competing_transaction
            .rollback()
            .await
            .expect("rollback competing transaction");
        drop(persistence_connection);
        drop(competing_connection);
        pool.close().await;
        let _ = std::fs::remove_file(database_path);
    }
}
