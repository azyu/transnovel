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
    novel_id: String,
    text: String,
    note: Option<String>,
) -> Result<TranslateTextResult, String> {
    let mut translator = TranslatorService::new().await?;
    let translated = translator.translate_text(&novel_id, &text, note.as_deref()).await?;
    Ok(TranslateTextResult { translated_text: translated })
}

#[tauri::command]
pub async fn translate_paragraphs(
    novel_id: String,
    paragraphs: Vec<String>,
    has_subtitle: Option<bool>,
    note: Option<String>,
) -> Result<TranslateParagraphsResult, String> {
    let mut translator = TranslatorService::new().await?;
    let translated = translator.translate_paragraphs(&novel_id, &paragraphs, has_subtitle.unwrap_or(true), note.as_deref()).await?;
    Ok(TranslateParagraphsResult { translated })
}

#[tauri::command]
pub async fn translate_paragraphs_streaming(
    app: AppHandle,
    novel_id: String,
    paragraphs: Vec<String>,
    has_subtitle: Option<bool>,
    note: Option<String>,
    original_indices: Option<Vec<usize>>,
) -> Result<TranslateParagraphsResult, String> {
    let mut translator = TranslatorService::new().await?;
    let translated = translator
        .translate_paragraphs_streaming(&novel_id, &paragraphs, has_subtitle.unwrap_or(true), note.as_deref(), original_indices, &app)
        .await?;
    Ok(TranslateParagraphsResult { translated })
}
