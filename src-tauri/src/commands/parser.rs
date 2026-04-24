use serde::{Deserialize, Serialize};

use crate::models::novel::{ChapterContent, ChapterInfo, SeriesInfo};
use crate::parsers::{get_parser_for_url, ParsedUrl};
use crate::services::novel_metadata::upsert_novel_metadata;

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
    pub novel_title: Option<String>,
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
    let series_info = parser.get_series_info(&url).await?;

    if let Err(error) = upsert_novel_metadata(
        &series_info.site,
        &series_info.novel_id,
        Some(&series_info.title),
        series_info.author.as_deref(),
        Some(series_info.total_chapters),
    )
    .await
    {
        log::warn!(
            "Failed to persist series metadata for {}: {}",
            series_info.novel_id,
            error
        );
    }

    Ok(series_info)
}

#[tauri::command]
pub async fn parse_chapter(url: String) -> Result<ParseChapterResult, String> {
    let parsed = ParsedUrl::from_url(&url).ok_or("지원하지 않는 URL 형식입니다.")?;
    let parser = get_parser_for_url(&url).ok_or("지원하지 않는 사이트입니다.")?;
    let (actual_url, chapter_number) = if has_explicit_chapter_url(&parsed, &url) {
        let series_info = if parsed.chapter.is_none() && parsed.site == "kakuyomu" {
            parser.get_series_info(&url).await.ok()
        } else {
            None
        };
        let chapter = resolve_explicit_chapter_number(&parsed, &url, series_info.as_ref());
        (url.clone(), chapter)
    } else {
        let series_info = parser.get_series_info(&url).await.ok();

        if let Some(info) = series_info {
            if !info.chapters.is_empty() {
                let first_chapter_url = &info.chapters[0].url;
                (first_chapter_url.clone(), 1u32)
            } else {
                (url.clone(), 1u32)
            }
        } else {
            (url.clone(), 1u32)
        }
    };

    let actual_parsed = ParsedUrl::from_url(&actual_url).unwrap_or(parsed);
    let content = parser.get_chapter(&actual_url).await?;

    if let Err(error) = upsert_novel_metadata(
        &actual_parsed.site,
        &actual_parsed.novel_id,
        content.novel_title.as_deref(),
        None,
        None,
    )
    .await
    {
        log::warn!(
            "Failed to persist chapter metadata for {}: {}",
            actual_parsed.novel_id,
            error
        );
    }

    let paragraphs = extract_paragraphs(&content.content);

    Ok(ParseChapterResult {
        site: actual_parsed.site,
        novel_id: actual_parsed.novel_id,
        chapter_number: content.chapter_number.unwrap_or(chapter_number),
        title: content.title.unwrap_or_default(),
        subtitle: content.subtitle.unwrap_or_default(),
        paragraphs,
        prev_url: content.prev_url,
        next_url: content.next_url,
        novel_title: content.novel_title,
    })
}

#[tauri::command]
pub async fn get_chapter_list(url: String) -> Result<ChapterListResult, String> {
    let parser = get_parser_for_url(&url).ok_or("지원하지 않는 사이트입니다.")?;
    let series_info = parser.get_series_info(&url).await?;

    if let Err(error) = upsert_novel_metadata(
        &series_info.site,
        &series_info.novel_id,
        Some(&series_info.title),
        series_info.author.as_deref(),
        Some(series_info.total_chapters),
    )
    .await
    {
        log::warn!(
            "Failed to persist chapter list metadata for {}: {}",
            series_info.novel_id,
            error
        );
    }

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
        .collect()
}

fn has_explicit_chapter_url(parsed: &ParsedUrl, url: &str) -> bool {
    parsed.chapter.is_some() || (parsed.site == "kakuyomu" && url.contains("/episodes/"))
}

fn resolve_explicit_chapter_number(
    parsed: &ParsedUrl,
    url: &str,
    series_info: Option<&SeriesInfo>,
) -> u32 {
    parsed.chapter.unwrap_or_else(|| {
        series_info
            .and_then(|info| info.chapters.iter().find(|chapter| chapter.url == url))
            .map(|chapter| chapter.number)
            .unwrap_or(1)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kakuyomu_episode_url_is_treated_as_explicit_chapter_even_without_u32_chapter_number() {
        let parsed = ParsedUrl {
            site: "kakuyomu".to_string(),
            novel_id: "822139846175419285".to_string(),
            chapter: None,
        };

        assert!(
            has_explicit_chapter_url(
                &parsed,
                "https://kakuyomu.jp/works/822139846175419285/episodes/822139846176062656",
            ),
            "Kakuyomu episode URLs use long episode IDs, so chapter routing cannot depend on u32 parsing",
        );
    }

    #[test]
    fn series_url_without_chapter_number_is_not_treated_as_explicit_chapter() {
        let parsed = ParsedUrl {
            site: "syosetu".to_string(),
            novel_id: "n1234ab".to_string(),
            chapter: None,
        };

        assert!(!has_explicit_chapter_url(
            &parsed,
            "https://ncode.syosetu.com/n1234ab/"
        ));
    }

    #[test]
    fn kakuyomu_episode_url_without_u32_chapter_uses_series_order_as_fallback() {
        let parsed = ParsedUrl {
            site: "kakuyomu".to_string(),
            novel_id: "822139846571948770".to_string(),
            chapter: None,
        };
        let series_info = SeriesInfo {
            site: "kakuyomu".to_string(),
            novel_id: "822139846571948770".to_string(),
            title: "테스트 작품".to_string(),
            author: None,
            total_chapters: 3,
            chapters: vec![
                ChapterInfo {
                    number: 1,
                    url: "https://kakuyomu.jp/works/822139846571948770/episodes/100".to_string(),
                    title: Some("첫 화".to_string()),
                    status: "pending".to_string(),
                },
                ChapterInfo {
                    number: 2,
                    url: "https://kakuyomu.jp/works/822139846571948770/episodes/101".to_string(),
                    title: Some("둘째 화".to_string()),
                    status: "pending".to_string(),
                },
                ChapterInfo {
                    number: 3,
                    url: "https://kakuyomu.jp/works/822139846571948770/episodes/99999999999999999999"
                        .to_string(),
                    title: Some("셋째 화".to_string()),
                    status: "pending".to_string(),
                },
            ],
        };

        assert_eq!(
            resolve_explicit_chapter_number(
                &parsed,
                "https://kakuyomu.jp/works/822139846571948770/episodes/99999999999999999999",
                Some(&series_info),
            ),
            3
        );
    }

    #[test]
    fn extract_paragraphs_preserves_empty_source_paragraphs() {
        let paragraphs = extract_paragraphs(
            r#"<p>一段落目。</p>
<p><br></p>
<p>二段落目。</p>"#,
        );

        assert_eq!(
            paragraphs,
            vec![
                "一段落目。".to_string(),
                String::new(),
                "二段落目。".to_string(),
            ]
        );
    }
}
