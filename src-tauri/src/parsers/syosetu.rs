use async_trait::async_trait;
use regex::Regex;
use scraper::{Html, Selector};

use super::{fetch_html, NovelParser, ParsedUrl};
use crate::models::novel::{ChapterContent, ChapterInfo, SeriesInfo};

pub struct SyosetuParser {
    url_pattern: Regex,
}

impl SyosetuParser {
    pub fn new() -> Self {
        Self {
            url_pattern: Regex::new(r"https?://ncode\.syosetu\.com/([a-z0-9]+)/(\d+)?/?")
                .unwrap(),
        }
    }

    pub fn parse_url_static(url: &str) -> Option<ParsedUrl> {
        let pattern = Regex::new(r"https?://ncode\.syosetu\.com/([a-z0-9]+)/(\d+)?/?").unwrap();
        let caps = pattern.captures(url)?;

        Some(ParsedUrl {
            site: "syosetu".to_string(),
            novel_id: caps.get(1)?.as_str().to_string(),
            chapter: caps.get(2).and_then(|m| m.as_str().parse().ok()),
        })
    }

    fn parse_chapter_list(document: &Html) -> Vec<ChapterInfo> {
        // New selector: .p-eplist__subtitle (2024+ layout)
        let chapter_selector = Selector::parse(".p-eplist__subtitle").unwrap();

        document
            .select(&chapter_selector)
            .enumerate()
            .map(|(i, el)| {
                let href = el.value().attr("href").unwrap_or("");
                let title = el.text().collect::<String>().trim().to_string();

                ChapterInfo {
                    number: (i + 1) as u32,
                    url: if href.starts_with("http") {
                        href.to_string()
                    } else {
                        format!("https://ncode.syosetu.com{}", href)
                    },
                    title: Some(title),
                    status: "pending".to_string(),
                }
            })
            .collect()
    }
}

#[async_trait]
impl NovelParser for SyosetuParser {
    fn site_id(&self) -> &'static str {
        "syosetu"
    }

    fn matches_url(&self, url: &str) -> bool {
        self.url_pattern.is_match(url)
    }

    async fn get_chapter(&self, url: &str) -> Result<ChapterContent, String> {
        let html = fetch_html(url).await?;
        let document = Html::parse_document(&html);

        let title_selector = Selector::parse(".p-novel__title").unwrap();
        let title = document
            .select(&title_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string());

        let content_selector = Selector::parse(".p-novel__text").unwrap();
        let content = document
            .select(&content_selector)
            .next()
            .map(|el| el.inner_html())
            .ok_or("본문을 찾을 수 없습니다.")?;

        let prev_selector = Selector::parse(".c-pager__item--before").unwrap();
        let prev_url = document
            .select(&prev_selector)
            .next()
            .and_then(|el| el.value().attr("href"))
            .map(|s| {
                if s.starts_with("http") {
                    s.to_string()
                } else {
                    format!("https://ncode.syosetu.com{}", s)
                }
            });

        let next_selector = Selector::parse(".c-pager__item--next").unwrap();
        let next_url = document
            .select(&next_selector)
            .next()
            .and_then(|el| el.value().attr("href"))
            .map(|s| {
                if s.starts_with("http") {
                    s.to_string()
                } else {
                    format!("https://ncode.syosetu.com{}", s)
                }
            });

        Ok(ChapterContent {
            title,
            subtitle: None,
            content,
            author_note: None,
            prev_url,
            next_url,
        })
    }

    async fn get_series_info(&self, url: &str) -> Result<SeriesInfo, String> {
        let parsed = Self::parse_url_static(url).ok_or("URL 파싱 실패")?;
        let index_url = format!("https://ncode.syosetu.com/{}/", parsed.novel_id);

        let html = fetch_html(&index_url).await?;
        let document = Html::parse_document(&html);

        let title_selector = Selector::parse(".p-novel__title").unwrap();
        let title = document
            .select(&title_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_else(|| parsed.novel_id.clone());

        let author_selector = Selector::parse(".p-novel__author").unwrap();
        let author = document
            .select(&author_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string());

        let chapters = Self::parse_chapter_list(&document);

        Ok(SeriesInfo {
            site: "syosetu".to_string(),
            novel_id: parsed.novel_id,
            title,
            author,
            total_chapters: chapters.len() as u32,
            chapters,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_url_with_chapter() {
        let url = "https://ncode.syosetu.com/n4029bs/1/";
        let parsed = SyosetuParser::parse_url_static(url).unwrap();
        assert_eq!(parsed.site, "syosetu");
        assert_eq!(parsed.novel_id, "n4029bs");
        assert_eq!(parsed.chapter, Some(1));
    }

    #[test]
    fn test_parse_url_without_chapter() {
        let url = "https://ncode.syosetu.com/n4029bs/";
        let parsed = SyosetuParser::parse_url_static(url).unwrap();
        assert_eq!(parsed.site, "syosetu");
        assert_eq!(parsed.novel_id, "n4029bs");
        assert_eq!(parsed.chapter, None);
    }

    #[test]
    fn test_matches_url() {
        let parser = SyosetuParser::new();
        assert!(parser.matches_url("https://ncode.syosetu.com/n4029bs/1/"));
        assert!(parser.matches_url("https://ncode.syosetu.com/n4029bs/"));
        assert!(!parser.matches_url("https://syosetu.org/novel/123/1.html"));
        assert!(!parser.matches_url("https://kakuyomu.jp/works/123"));
    }

    #[tokio::test]
    #[ignore = "requires network - run with: cargo test -- --ignored"]
    async fn test_get_chapter_selectors() {
        let parser = SyosetuParser::new();
        let result = parser.get_chapter("https://ncode.syosetu.com/n4029bs/1/").await;
        
        assert!(result.is_ok(), "Failed to fetch chapter: {:?}", result.err());
        let content = result.unwrap();
        assert!(!content.content.is_empty(), "Content should not be empty");
        assert!(content.content.contains("<p"), "Content should contain <p> tags");
    }

    #[tokio::test]
    #[ignore = "requires network - run with: cargo test -- --ignored"]
    async fn test_get_series_info_selectors() {
        let parser = SyosetuParser::new();
        let result = parser.get_series_info("https://ncode.syosetu.com/n4029bs/").await;
        
        assert!(result.is_ok(), "Failed to fetch series info: {:?}", result.err());
        let info = result.unwrap();
        assert!(!info.title.is_empty(), "Title should not be empty");
        assert!(info.total_chapters > 0, "Should have at least one chapter");
        assert!(!info.chapters.is_empty(), "Chapters list should not be empty");
    }
}
