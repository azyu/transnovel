use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use crate::models::novel::TranslationProgress;
use crate::parsers::get_parser_for_url;
use crate::services::translator::TranslatorService;

static IS_PAUSED: AtomicBool = AtomicBool::new(false);
static SHOULD_STOP: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Serialize, Deserialize)]
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
    SHOULD_STOP.store(false, Ordering::SeqCst);
    IS_PAUSED.store(false, Ordering::SeqCst);
    
    let mut translator = TranslatorService::new().await?;
    let total_chapters = request.end_chapter - request.start_chapter + 1;

    for chapter_num in request.start_chapter..=request.end_chapter {
        if SHOULD_STOP.load(Ordering::SeqCst) {
            break;
        }
        
        while IS_PAUSED.load(Ordering::SeqCst) {
            if SHOULD_STOP.load(Ordering::SeqCst) {
                break;
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
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
        
        match translate_single_chapter(&mut translator, &chapter_url).await {
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

async fn translate_single_chapter(translator: &mut TranslatorService, url: &str) -> Result<Vec<String>, String> {
    let parser = get_parser_for_url(url).ok_or("지원하지 않는 사이트입니다.")?;
    let content = parser.get_chapter(url).await?;
    
    let paragraphs = extract_paragraphs(&content.content);
    
    if paragraphs.is_empty() {
        return Ok(vec![]);
    }
    
    translator.translate_paragraphs(&paragraphs, None).await
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
