use crate::services::chapter_persistence::{
    get_persisted_chapter as read_persisted_chapter, PersistedChapter,
};

#[tauri::command]
pub async fn get_persisted_chapter(
    site: String,
    novel_id: String,
    chapter_number: u32,
) -> Result<Option<PersistedChapter>, String> {
    read_persisted_chapter(&site, &novel_id, chapter_number).await
}
