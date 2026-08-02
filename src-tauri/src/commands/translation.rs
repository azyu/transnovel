use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::AppHandle;

use crate::commands::series::reset_translation_control_flags;
use crate::models::translation::TranslationResult;
use crate::services::chapter_persistence::{
    extract_chapter_paragraphs, get_persisted_chapter, PersistedChapter,
};
use crate::services::translator::{StreamingTranslationRequest, TranslatorService};

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateParagraphsStreamingRequest {
    pub site: String,
    pub novel_id: String,
    pub paragraphs: Vec<String>,
    pub has_subtitle: Option<bool>,
    pub note: Option<String>,
    pub original_indices: Option<Vec<usize>>,
    pub chapter_number: Option<u32>,
    pub content_hash: Option<String>,
}

fn canonical_translation_input(chapter: &PersistedChapter, has_subtitle: bool) -> Vec<String> {
    let mut paragraphs = vec![chapter.title.clone().unwrap_or_default()];
    if has_subtitle {
        paragraphs.push(chapter.subtitle.clone().unwrap_or_default());
    }
    paragraphs.extend(extract_chapter_paragraphs(&chapter.original_content));
    paragraphs
}

fn validate_indexed_paragraphs(
    paragraphs: &[String],
    original_indices: &[usize],
    canonical: &[String],
) -> Result<(), String> {
    if paragraphs.len() != original_indices.len() {
        return Err("재시도 문단과 원본 색인의 개수가 일치하지 않습니다.".to_string());
    }
    let mut seen = HashSet::with_capacity(original_indices.len());
    for (paragraph, &index) in paragraphs.iter().zip(original_indices) {
        if !seen.insert(index) {
            return Err("재시도 원본 색인에 중복이 있습니다.".to_string());
        }
        let Some(canonical_paragraph) = canonical.get(index) else {
            return Err("재시도 원본 색인이 현재 챕터 범위를 벗어났습니다.".to_string());
        };
        if paragraph != canonical_paragraph {
            return Err("재시도 원문이 현재 챕터 원문과 일치하지 않습니다.".to_string());
        }
    }
    Ok(())
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
    site: String,
    novel_id: String,
    text: String,
    note: Option<String>,
) -> Result<TranslateTextResult, String> {
    let mut translator = TranslatorService::new().await?;
    let translated = translator
        .translate_text(&site, &novel_id, &text, note.as_deref())
        .await?;
    Ok(TranslateTextResult {
        translated_text: translated,
    })
}

#[tauri::command]
pub async fn translate_paragraphs(
    site: String,
    novel_id: String,
    paragraphs: Vec<String>,
    has_subtitle: Option<bool>,
    note: Option<String>,
) -> Result<TranslateParagraphsResult, String> {
    let mut translator = TranslatorService::new().await?;
    let translated = translator
        .translate_paragraphs(
            &site,
            &novel_id,
            &paragraphs,
            has_subtitle.unwrap_or(true),
            note.as_deref(),
        )
        .await?;
    Ok(TranslateParagraphsResult { translated })
}

#[tauri::command]
pub async fn translate_paragraphs_streaming(
    app: AppHandle,
    request: TranslateParagraphsStreamingRequest,
) -> Result<TranslateParagraphsResult, String> {
    reset_translation_control_flags();
    let has_subtitle = request.has_subtitle.unwrap_or(true);
    let canonical_result_length = if let Some(chapter_number) = request.chapter_number {
        let expected_content_hash = request
            .content_hash
            .as_deref()
            .ok_or_else(|| "챕터 원문 버전이 필요합니다.".to_string())?;
        let chapter = get_persisted_chapter(&request.site, &request.novel_id, chapter_number)
            .await?
            .ok_or_else(|| "번역할 저장 챕터를 찾을 수 없습니다.".to_string())?;
        if chapter.content_hash != expected_content_hash {
            return Err("챕터 원문이 변경되어 번역을 시작하지 않았습니다.".to_string());
        }
        let canonical = canonical_translation_input(&chapter, has_subtitle);
        if let Some(indices) = request.original_indices.as_deref() {
            validate_indexed_paragraphs(&request.paragraphs, indices, &canonical)?;
        } else if request.paragraphs != canonical {
            return Err("번역 원문이 저장된 챕터 원문과 일치하지 않습니다.".to_string());
        }
        Some(canonical.len())
    } else {
        if request.content_hash.is_some() || request.original_indices.is_some() {
            return Err(
                "챕터 문맥 없는 번역에는 원문 버전이나 재시도 색인을 사용할 수 없습니다."
                    .to_string(),
            );
        }
        None
    };

    let mut translator = TranslatorService::new().await?;
    let translated = translator
        .translate_paragraphs_streaming(
            StreamingTranslationRequest {
                site: &request.site,
                novel_id: &request.novel_id,
                paragraphs: &request.paragraphs,
                has_subtitle,
                note: request.note.as_deref(),
                original_indices: request.original_indices,
                chapter_number: request.chapter_number,
                content_hash: request.content_hash.as_deref(),
                canonical_result_length,
            },
            &app,
        )
        .await?;
    Ok(TranslateParagraphsResult { translated })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn indexed_retry_rejects_mismatched_duplicate_and_out_of_range_indices() {
        let canonical = vec!["제목".to_string(), "첫".to_string(), "둘".to_string()];

        assert!(validate_indexed_paragraphs(&["첫".to_string()], &[1, 2], &canonical,).is_err());
        assert!(validate_indexed_paragraphs(
            &["첫".to_string(), "첫".to_string()],
            &[1, 1],
            &canonical,
        )
        .is_err());
        assert!(
            validate_indexed_paragraphs(&["첫".to_string()], &[usize::MAX], &canonical,).is_err()
        );
    }

    #[test]
    fn indexed_retry_rejects_text_that_does_not_match_the_canonical_revision() {
        let canonical = vec!["제목".to_string(), "첫".to_string(), "둘".to_string()];
        assert!(
            validate_indexed_paragraphs(&["변조된 원문".to_string()], &[1], &canonical,).is_err()
        );
        validate_indexed_paragraphs(&["둘".to_string()], &[2], &canonical)
            .expect("matching canonical paragraph");
    }
}
