use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::models::translation::{TranslationRequest, TranslationResult};
use crate::services::translator::TranslatorService;

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslateChapterRequest {
    pub novel_id: String,
    pub chapter_number: u32,
    pub api_type: String,
}

#[tauri::command]
pub async fn translate_chapter(
    app: AppHandle,
    request: TranslateChapterRequest,
) -> Result<TranslationResult, String> {
    let translator = TranslatorService::new(&app).await?;
    translator
        .translate_chapter(&request.novel_id, request.chapter_number)
        .await
}

#[tauri::command]
pub async fn translate_text(
    app: AppHandle,
    text: String,
    note: Option<String>,
) -> Result<String, String> {
    let translator = TranslatorService::new(&app).await?;
    translator.translate_text(&text, note.as_deref()).await
}
