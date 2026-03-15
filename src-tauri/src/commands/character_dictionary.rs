use serde::{Deserialize, Serialize};

use crate::commands::settings::clear_cache_by_novel_internal;
use crate::services::character_dictionary::{
    get_novel_character_dictionary as get_novel_character_dictionary_entries,
    save_novel_character_dictionary as save_novel_character_dictionary_entries,
    CharacterDictionaryEntry,
};
use crate::services::translator::TranslatorService;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCharacterDictionaryResult {
    pub cleared_cache: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractCharacterDictionaryCandidatesRequest {
    pub site: String,
    pub novel_id: String,
    pub chapter_number: u32,
    pub title: String,
    pub subtitle: Option<String>,
    pub originals: Vec<String>,
    pub translateds: Vec<String>,
}

#[tauri::command]
pub async fn get_novel_character_dictionary(
    site: String,
    novel_id: String,
) -> Result<Vec<CharacterDictionaryEntry>, String> {
    get_novel_character_dictionary_entries(&site, &novel_id).await
}

#[tauri::command]
pub async fn save_novel_character_dictionary(
    site: String,
    novel_id: String,
    entries: Vec<CharacterDictionaryEntry>,
) -> Result<SaveCharacterDictionaryResult, String> {
    save_novel_character_dictionary_entries(&site, &novel_id, &entries).await?;
    clear_cache_by_novel_internal(&novel_id).await?;

    Ok(SaveCharacterDictionaryResult { cleared_cache: true })
}

#[tauri::command]
pub async fn extract_character_dictionary_candidates(
    request: ExtractCharacterDictionaryCandidatesRequest,
) -> Result<Vec<CharacterDictionaryEntry>, String> {
    let mut translator = TranslatorService::new().await?;
    translator
        .extract_character_dictionary_candidates(
            &request.site,
            &request.novel_id,
            request.chapter_number,
            &request.title,
            request.subtitle.as_deref(),
            &request.originals,
            &request.translateds,
        )
        .await
}
