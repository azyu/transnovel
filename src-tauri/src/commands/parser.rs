use serde::{Deserialize, Serialize};

use crate::models::novel::{ChapterContent, ChapterInfo, SeriesInfo};
use crate::parsers::{get_parser_for_url, ParsedUrl};

#[derive(Debug, Serialize, Deserialize)]
pub struct ParseUrlResult {
    pub site: String,
    pub novel_id: String,
    pub chapter: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParseChapterResult {
    pub site: String,
    pub novel_id: String,
    pub chapter_number: u32,
    pub title: String,
    pub subtitle: String,
    pub paragraphs: Vec<String>,
    pub prev_url: Option<String>,
    pub next_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChapterListResult {
    pub chapters: Vec<ChapterInfo>,
}

#[tauri::command]
pub async fn parse_url(url: String) -> Result<ParseUrlResult, String> {
    let parsed = ParsedUrl::from_url(&url).ok_or("지원하지 않는 URL 형식입니다.")?;

    Ok(ParseUrlResult {
        site: parsed.site.to_string(),
        novel_id: parsed.novel_id,
        chapter: parsed.chapter,
    })
}

#[tauri::command]
pub async fn get_chapter_content(url: String) -> Result<ChapterContent, String> {
    let parser = get_parser_for_url(&url).ok_or("지원하지 않는 사이트입니다.")?;
    parser.get_chapter(&url).await
}

#[tauri::command]
pub async fn get_series_info(url: String) -> Result<SeriesInfo, String> {
    let parser = get_parser_for_url(&url).ok_or("지원하지 않는 사이트입니다.")?;
    parser.get_series_info(&url).await
}

#[tauri::command]
pub async fn parse_chapter(url: String) -> Result<ParseChapterResult, String> {
    let parsed = ParsedUrl::from_url(&url).ok_or("지원하지 않는 URL 형식입니다.")?;
    let parser = get_parser_for_url(&url).ok_or("지원하지 않는 사이트입니다.")?;
    
    let content = parser.get_chapter(&url).await?;
    
    let paragraphs = extract_paragraphs(&content.content);
    
    Ok(ParseChapterResult {
        site: parsed.site,
        novel_id: parsed.novel_id,
        chapter_number: parsed.chapter.unwrap_or(1),
        title: content.title.unwrap_or_default(),
        subtitle: content.subtitle.unwrap_or_default(),
        paragraphs,
        prev_url: content.prev_url,
        next_url: content.next_url,
    })
}

#[tauri::command]
pub async fn get_chapter_list(url: String) -> Result<ChapterListResult, String> {
    let parser = get_parser_for_url(&url).ok_or("지원하지 않는 사이트입니다.")?;
    let series_info = parser.get_series_info(&url).await?;
    
    Ok(ChapterListResult {
        chapters: series_info.chapters,
    })
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
