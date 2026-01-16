use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::models::novel::TranslationProgress;
use crate::services::translator::TranslatorService;

pub struct BatchTranslationState {
    pub is_running: Arc<Mutex<bool>>,
    pub is_paused: Arc<Mutex<bool>>,
    pub current_chapter: Arc<Mutex<u32>>,
}

impl Default for BatchTranslationState {
    fn default() -> Self {
        Self {
            is_running: Arc::new(Mutex::new(false)),
            is_paused: Arc::new(Mutex::new(false)),
            current_chapter: Arc::new(Mutex::new(0)),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchTranslateRequest {
    pub novel_id: String,
    pub site: String,
    pub start_chapter: u32,
    pub end_chapter: u32,
}

#[tauri::command]
pub async fn start_batch_translation(
    app: AppHandle,
    request: BatchTranslateRequest,
) -> Result<(), String> {
    let translator = TranslatorService::new(&app).await?;

    for chapter_num in request.start_chapter..=request.end_chapter {
        app.emit(
            "translation-progress",
            TranslationProgress {
                current_chapter: chapter_num,
                total_chapters: request.end_chapter - request.start_chapter + 1,
                chapter_title: format!("제{}화", chapter_num),
                status: "translating".to_string(),
                error_message: None,
            },
        )
        .map_err(|e: tauri::Error| e.to_string())?;

        match translator
            .translate_chapter(&request.novel_id, chapter_num)
            .await
        {
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
                        total_chapters: request.end_chapter - request.start_chapter + 1,
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

#[tauri::command]
pub async fn pause_translation() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn resume_translation() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn get_translation_progress(novel_id: String) -> Result<TranslationProgress, String> {
    Ok(TranslationProgress {
        current_chapter: 0,
        total_chapters: 0,
        chapter_title: String::new(),
        status: "idle".to_string(),
        error_message: None,
    })
}
