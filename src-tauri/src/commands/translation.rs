use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::models::translation::TranslationResult;
use crate::services::translator::TranslatorService;

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslateChapterRequest {
    pub novel_id: String,
    pub chapter_number: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslateTextResult {
    pub translated_text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslateParagraphsResult {
    pub translated: Vec<String>,
}

#[tauri::command]
pub async fn translate_chapter(
    request: TranslateChapterRequest,
) -> Result<TranslationResult, String> {
    let mut translator = TranslatorService::new().await?;
    translator
        .translate_chapter(&request.novel_id, request.chapter_number)
        .await
}

#[tauri::command]
pub async fn translate_text(
    text: String,
    note: Option<String>,
) -> Result<TranslateTextResult, String> {
    let mut translator = TranslatorService::new().await?;
    let translated = translator.translate_text(&text, note.as_deref()).await?;
    Ok(TranslateTextResult { translated_text: translated })
}

#[tauri::command]
pub async fn translate_paragraphs(
    paragraphs: Vec<String>,
    note: Option<String>,
) -> Result<TranslateParagraphsResult, String> {
    let mut translator = TranslatorService::new().await?;
    let translated = translator.translate_paragraphs(&paragraphs, note.as_deref()).await?;
    Ok(TranslateParagraphsResult { translated })
}

#[tauri::command]
pub async fn translate_paragraphs_streaming(
    app: AppHandle,
    paragraphs: Vec<String>,
    note: Option<String>,
) -> Result<TranslateParagraphsResult, String> {
    let mut translator = TranslatorService::new().await?;
    let translated = translator
        .translate_paragraphs_streaming(&paragraphs, note.as_deref(), &app)
        .await?;
    Ok(TranslateParagraphsResult { translated })
}
