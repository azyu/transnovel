use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

use crate::db::get_pool;
use crate::models::novel::TranslationProgress;
use crate::parsers::get_parser_for_url;
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
        return Err("Kakuyomu는 현재 배치 번역을 지원하지 않습니다. 개별 챕터 번역을 이용해주세요.".to_string());
    }
    
    reset_translation_control_flags();
    
    let completed: HashSet<u32> = get_completed_chapters_internal(&request.novel_id)
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
        app.emit("batch-translation-complete", &request.novel_id)
            .map_err(|e: tauri::Error| e.to_string())?;
        return Ok(());
    }

    for chapter_num in chapters_to_translate {
        if SHOULD_STOP.load(Ordering::SeqCst) {
            break;
        }
        
        while IS_PAUSED.load(Ordering::SeqCst) {
            if SHOULD_STOP.load(Ordering::SeqCst) {
                break;
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }

        if SHOULD_STOP.load(Ordering::SeqCst) {
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

        let chapter_url = build_chapter_url(&request.base_url, &request.site, &request.novel_id, chapter_num);
        
        match translate_single_chapter(&mut translator, &request.novel_id, &chapter_url).await {
            Ok(translated) => {
                mark_chapter_complete(
                    request.novel_id.clone(),
                    chapter_num as i32,
                    translated.len() as i32,
                )
                .await?;

                app.emit(
                    "chapter-completed",
                    serde_json::json!({
                        "chapter": chapter_num,
                        "novel_id": request.novel_id
                    }),
                )
                .map_err(|e: tauri::Error| e.to_string())?;
            }
            Err(e) => {
                app.emit(
                    "translation-error",
                    TranslationProgress {
                        current_chapter: chapter_num,
                        total_chapters,
                        chapter_title: format!("제{}화", chapter_num),
                        status: "error".to_string(),
                        error_message: Some(e),
                    },
                )
                .map_err(|e: tauri::Error| e.to_string())?;
            }
        }
    }

    app.emit("batch-translation-complete", &request.novel_id)
        .map_err(|e: tauri::Error| e.to_string())?;

    Ok(())
}

async fn translate_single_chapter(translator: &mut TranslatorService, novel_id: &str, url: &str) -> Result<Vec<String>, String> {
    let parser = get_parser_for_url(url).ok_or("지원하지 않는 사이트입니다.")?;
    let content = parser.get_chapter(url).await?;
    
    let paragraphs = extract_paragraphs(&content.content);
    
    if paragraphs.is_empty() {
        return Ok(vec![]);
    }
    
    translator.translate_paragraphs(novel_id, &paragraphs, true, None).await
}

fn extract_paragraphs(html: &str) -> Vec<String> {
    use scraper::{Html, Selector};
    
    let document = Html::parse_fragment(html);
    let p_selector = Selector::parse("p").unwrap();
    
    document
        .select(&p_selector)
        .map(|el| el.text().collect::<Vec<_>>().join("").trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
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
        status: if IS_PAUSED.load(Ordering::SeqCst) { "paused" } else { "idle" }.to_string(),
        error_message: None,
    })
}

#[tauri::command]
pub async fn mark_chapter_complete(novel_id: String, chapter_number: i32, paragraph_count: i32) -> Result<(), String> {
    use crate::db::get_pool;
    
    let pool = get_pool()?;
    
    sqlx::query(
        "INSERT INTO completed_chapters (novel_id, chapter_number, paragraph_count, completed_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(novel_id, chapter_number) DO UPDATE SET
           paragraph_count = excluded.paragraph_count,
           completed_at = CURRENT_TIMESTAMP"
    )
    .bind(&novel_id)
    .bind(chapter_number)
    .bind(paragraph_count)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn get_completed_chapters(novel_id: String) -> Result<Vec<i32>, String> {
    get_completed_chapters_internal(&novel_id).await
}

async fn get_completed_chapters_internal(novel_id: &str) -> Result<Vec<i32>, String> {
    let pool = get_pool()?;
    
    let rows = sqlx::query(
        "SELECT chapter_number FROM completed_chapters WHERE novel_id = ? ORDER BY chapter_number"
    )
    .bind(novel_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(rows.iter().map(|r| r.get::<i32, _>("chapter_number")).collect())
}
