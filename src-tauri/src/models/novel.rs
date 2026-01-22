use serde::{Deserialize, Serialize};

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Novel {
    pub id: Option<i64>,
    pub site: String,
    pub novel_id: String,
    pub title: Option<String>,
    pub author: Option<String>,
    pub total_chapters: u32,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub id: Option<i64>,
    pub novel_id: i64,
    pub chapter_number: u32,
    pub chapter_url: String,
    pub title: Option<String>,
    pub subtitle: Option<String>,
    pub original_content: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterContent {
    pub title: Option<String>,
    pub subtitle: Option<String>,
    pub content: String,
    pub author_note: Option<String>,
    pub prev_url: Option<String>,
    pub next_url: Option<String>,
    pub novel_title: Option<String>,
    pub chapter_number: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterInfo {
    pub number: u32,
    pub url: String,
    pub title: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeriesInfo {
    pub site: String,
    pub novel_id: String,
    pub title: String,
    pub author: Option<String>,
    pub total_chapters: u32,
    pub chapters: Vec<ChapterInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationProgress {
    pub current_chapter: u32,
    pub total_chapters: u32,
    pub chapter_title: String,
    pub status: String,
    pub error_message: Option<String>,
}
