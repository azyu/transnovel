use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

use crate::db::get_pool;
use crate::models::novel::TranslationProgress;
use crate::parsers::get_parser_for_url;
use crate::services::chapter_persistence::{
    extract_chapter_paragraphs as extract_paragraphs, persist_translations, upsert_chapter,
    ChapterUpsert, TranslationCompletion, TranslationPersistenceContext, TranslationWrite,
    TranslationWriteMode,
};
use crate::services::novel_metadata::upsert_novel_metadata;
use crate::services::translator::TranslatorService;

static IS_PAUSED: AtomicBool = AtomicBool::new(false);
static SHOULD_STOP: AtomicBool = AtomicBool::new(false);

pub(crate) fn reset_translation_control_flags() {
    SHOULD_STOP.store(false, Ordering::SeqCst);
    IS_PAUSED.store(false, Ordering::SeqCst);
}

pub(crate) fn should_stop_translation() -> bool {
    SHOULD_STOP.load(Ordering::SeqCst)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchTranslateRequest {
    pub novel_id: String,
    pub site: String,
    pub start_chapter: u32,
    pub end_chapter: u32,
    pub base_url: String,
}

#[tauri::command]
pub async fn start_batch_translation(
    app: AppHandle,
    request: BatchTranslateRequest,
) -> Result<(), String> {
    if request.end_chapter < request.start_chapter {
        return Err("종료 챕터는 시작 챕터보다 크거나 같아야 합니다.".to_string());
    }

    if request.site == "kakuyomu" {
        return Err(
            "Kakuyomu는 현재 배치 번역을 지원하지 않습니다. 개별 챕터 번역을 이용해주세요."
                .to_string(),
        );
    }

    reset_translation_control_flags();

    let completed: HashSet<u32> = get_completed_chapters_internal(&request.site, &request.novel_id)
        .await?
        .into_iter()
        .map(|n| n as u32)
        .collect();

    let mut translator = TranslatorService::new().await?;
    let chapters_to_translate: Vec<u32> = (request.start_chapter..=request.end_chapter)
        .filter(|n| !completed.contains(n))
        .collect();
    let total_chapters = chapters_to_translate.len() as u32;

    if total_chapters == 0 {
        app.emit(
            "batch-translation-complete",
            serde_json::json!({
                "novel_id": request.novel_id,
                "success": true,
                "failed_count": 0,
                "stopped": false,
            }),
        )
        .map_err(|e: tauri::Error| e.to_string())?;
        return Ok(());
    }

    let mut failed_count = 0_u32;
    let mut stopped = false;

    for chapter_num in chapters_to_translate {
        if SHOULD_STOP.load(Ordering::SeqCst) {
            stopped = true;
            break;
        }

        while IS_PAUSED.load(Ordering::SeqCst) {
            if SHOULD_STOP.load(Ordering::SeqCst) {
                stopped = true;
                break;
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }

        if stopped || SHOULD_STOP.load(Ordering::SeqCst) {
            stopped = true;
            break;
        }

        app.emit(
            "translation-progress",
            TranslationProgress {
                current_chapter: chapter_num,
                total_chapters,
                chapter_title: format!("제{}화", chapter_num),
                status: "translating".to_string(),
                error_message: None,
            },
        )
        .map_err(|e: tauri::Error| e.to_string())?;

        let chapter_url = build_chapter_url(
            &request.base_url,
            &request.site,
            &request.novel_id,
            chapter_num,
        );

        let chapter_result = translate_single_chapter(
            &mut translator,
            &request.novel_id,
            chapter_num,
            &chapter_url,
        )
        .await;
        if SHOULD_STOP.load(Ordering::SeqCst) {
            stopped = true;
            break;
        }

        match chapter_result {
            Ok(_) => {
                app.emit(
                    "chapter-completed",
                    serde_json::json!({
                        "chapter": chapter_num,
                        "novel_id": request.novel_id
                    }),
                )
                .map_err(|e: tauri::Error| e.to_string())?;
            }
            Err(error) => {
                failed_count += 1;
                app.emit(
                    "translation-error",
                    serde_json::json!({
                        "error_type": "batch_chapter_error",
                        "title": "챕터 번역 실패",
                        "message": error,
                        "chapter": chapter_num,
                    }),
                )
                .map_err(|e: tauri::Error| e.to_string())?;
            }
        }
    }

    app.emit(
        "batch-translation-complete",
        serde_json::json!({
            "novel_id": request.novel_id,
            "success": failed_count == 0 && !stopped,
            "failed_count": failed_count,
            "stopped": stopped,
        }),
    )
    .map_err(|e: tauri::Error| e.to_string())?;

    Ok(())
}

async fn translate_single_chapter(
    translator: &mut TranslatorService,
    novel_id: &str,
    chapter_number: u32,
    url: &str,
) -> Result<Vec<String>, String> {
    let parser = get_parser_for_url(url).ok_or("지원하지 않는 사이트입니다.")?;
    let content = parser.get_chapter(url).await?;
    let parsed = crate::parsers::ParsedUrl::from_url(url).ok_or("지원하지 않는 URL 형식입니다.")?;
    let resolved_chapter_number = content.chapter_number.unwrap_or(chapter_number);
    upsert_novel_metadata(
        &parsed.site,
        novel_id,
        content.novel_title.as_deref(),
        None,
        None,
    )
    .await?;
    let persisted_chapter = upsert_chapter(ChapterUpsert {
        site: &parsed.site,
        novel_id,
        chapter_number: resolved_chapter_number,
        chapter_url: url,
        title: content.title.as_deref(),
        subtitle: content.subtitle.as_deref(),
        original_content: &content.content,
    })
    .await?;

    if should_stop_translation() {
        return Ok(Vec::new());
    }

    let paragraphs = extract_paragraphs(&content.content);
    if paragraphs.is_empty() {
        persist_translations(
            TranslationPersistenceContext {
                site: &parsed.site,
                novel_id,
                chapter_number: resolved_chapter_number,
                expected_content_hash: &persisted_chapter.content_hash,
                model_used: translator.model_name(),
                completion: TranslationCompletion::MarkIfComplete,
            },
            TranslationWriteMode::Full { body_length: 0 },
            &[],
        )
        .await?;
        return Ok(vec![]);
    }

    let translated = translator
        .translate_paragraphs(&parsed.site, novel_id, &paragraphs, true, None)
        .await?;
    ensure_complete_batch_translation(&paragraphs, &translated)?;
    if should_stop_translation() {
        return Ok(Vec::new());
    }
    let writes = paragraphs
        .iter()
        .zip(&translated)
        .enumerate()
        .map(|(paragraph_index, (original_text, translated_text))| {
            TranslationWrite::success(paragraph_index, original_text, translated_text)
        })
        .collect::<Vec<_>>();
    persist_translations(
        TranslationPersistenceContext {
            site: &parsed.site,
            novel_id,
            chapter_number: resolved_chapter_number,
            expected_content_hash: &persisted_chapter.content_hash,
            model_used: translator.model_name(),
            completion: TranslationCompletion::MarkIfComplete,
        },
        TranslationWriteMode::Full {
            body_length: paragraphs.len(),
        },
        &writes,
    )
    .await?;

    Ok(translated)
}

fn ensure_complete_batch_translation(
    originals: &[String],
    translated: &[String],
) -> Result<(), String> {
    if originals.len() != translated.len() {
        return Err(format!(
            "번역 결과가 완전하지 않습니다: 요청 {}개, 응답 {}개",
            originals.len(),
            translated.len()
        ));
    }
    if let Some(index) = translated
        .iter()
        .position(|translation| translation.trim().is_empty())
    {
        return Err(format!(
            "번역 결과가 완전하지 않습니다: {}번째 문단이 비어 있습니다.",
            index + 1
        ));
    }
    Ok(())
}

fn build_chapter_url(base_url: &str, site: &str, novel_id: &str, chapter: u32) -> String {
    match site {
        "syosetu" => format!("https://ncode.syosetu.com/{}/{}/", novel_id, chapter),
        "hameln" => format!("https://syosetu.org/novel/{}/{}.html", novel_id, chapter),
        "kakuyomu" => base_url.to_string(),
        "nocturne" => format!("https://novel18.syosetu.com/{}/{}/", novel_id, chapter),
        _ => base_url.to_string(),
    }
}

#[tauri::command]
pub async fn pause_translation() -> Result<(), String> {
    IS_PAUSED.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn resume_translation() -> Result<(), String> {
    IS_PAUSED.store(false, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn stop_translation() -> Result<(), String> {
    SHOULD_STOP.store(true, Ordering::SeqCst);
    IS_PAUSED.store(false, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn get_translation_progress(_novel_id: String) -> Result<TranslationProgress, String> {
    Ok(TranslationProgress {
        current_chapter: 0,
        total_chapters: 0,
        chapter_title: String::new(),
        status: if IS_PAUSED.load(Ordering::SeqCst) {
            "paused"
        } else {
            "idle"
        }
        .to_string(),
        error_message: None,
    })
}

#[tauri::command]
pub async fn get_completed_chapters(site: String, novel_id: String) -> Result<Vec<i32>, String> {
    get_completed_chapters_internal(&site, &novel_id).await
}

async fn get_completed_chapters_internal(site: &str, novel_id: &str) -> Result<Vec<i32>, String> {
    let pool = get_pool()?;
    get_completed_chapters_with_pool(pool, site, novel_id).await
}

async fn get_completed_chapters_with_pool(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    site: &str,
    novel_id: &str,
) -> Result<Vec<i32>, String> {
    let rows = sqlx::query(
        "SELECT chapter_number
         FROM completed_chapters
         WHERE site = ? AND novel_id = ?
         ORDER BY chapter_number",
    )
    .bind(site)
    .bind(novel_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|row| row.get::<i32, _>("chapter_number"))
        .collect())
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

    #[tokio::test]
    async fn completed_chapters_are_isolated_by_site() {
        let pool = setup_test_pool().await;
        sqlx::query(
            "INSERT INTO completed_chapters
                (site, novel_id, chapter_number, paragraph_count)
             VALUES (?, ?, ?, ?)",
        )
        .bind("syosetu")
        .bind("shared-id")
        .bind(1_i64)
        .bind(10_i64)
        .execute(&pool)
        .await
        .expect("insert syosetu completion");

        sqlx::query(
            "INSERT INTO completed_chapters
                (site, novel_id, chapter_number, paragraph_count)
             VALUES (?, ?, ?, ?)",
        )
        .bind("nocturne")
        .bind("shared-id")
        .bind(2_i64)
        .bind(12_i64)
        .execute(&pool)
        .await
        .expect("insert nocturne completion");

        assert_eq!(
            get_completed_chapters_with_pool(&pool, "syosetu", "shared-id")
                .await
                .expect("read syosetu completions"),
            vec![1]
        );
        assert_eq!(
            get_completed_chapters_with_pool(&pool, "nocturne", "shared-id")
                .await
                .expect("read nocturne completions"),
            vec![2]
        );
    }

    #[test]
    fn incomplete_batch_translation_is_rejected() {
        assert!(ensure_complete_batch_translation(
            &["첫 문단".to_string(), "둘째 문단".to_string()],
            &["첫 번역".to_string()],
        )
        .is_err());
        assert!(ensure_complete_batch_translation(
            &["첫 문단".to_string(), "둘째 문단".to_string()],
            &["첫 번역".to_string(), String::new()],
        )
        .is_err());
    }

    #[test]
    fn complete_batch_translation_is_accepted() {
        ensure_complete_batch_translation(
            &["첫 문단".to_string(), "둘째 문단".to_string()],
            &["첫 번역".to_string(), "둘째 번역".to_string()],
        )
        .expect("all paragraphs translated");
    }

    #[test]
    fn batch_uses_the_same_empty_paragraph_grouping_as_interactive_parsing() {
        assert_eq!(
            extract_paragraphs(
                r#"<p>一段落目。</p>
<p>一段落目の続き。</p>
<p><br></p>
<p>二段落目。</p>"#,
            ),
            vec![
                "一段落目。\n一段落目の続き。".to_string(),
                "二段落目。".to_string(),
            ]
        );
    }
}
