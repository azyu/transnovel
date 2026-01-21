use async_trait::async_trait;
use regex::Regex;
use scraper::{Html, Selector};

use super::{fetch_html, NovelParser, ParsedUrl};
use crate::models::novel::{ChapterContent, ChapterInfo, SeriesInfo};

pub struct KakuyomuParser {
    url_pattern: Regex,
}

impl KakuyomuParser {
    pub fn new() -> Self {
        Self {
            url_pattern: Regex::new(
                r"https?://kakuyomu\.jp/works/(\d+)(?:/episodes/(\d+))?/?",
            )
            .unwrap(),
        }
    }

    pub fn parse_url_static(url: &str) -> Option<ParsedUrl> {
        let pattern =
            Regex::new(r"https?://kakuyomu\.jp/works/(\d+)(?:/episodes/(\d+))?/?").unwrap();
        let caps = pattern.captures(url)?;

        Some(ParsedUrl {
            site: "kakuyomu".to_string(),
            novel_id: caps.get(1)?.as_str().to_string(),
            chapter: caps.get(2).and_then(|m| m.as_str().parse().ok()),
        })
    }
}

#[async_trait]
impl NovelParser for KakuyomuParser {
    fn matches_url(&self, url: &str) -> bool {
        self.url_pattern.is_match(url)
    }

    async fn get_chapter(&self, url: &str) -> Result<ChapterContent, String> {
        let html = fetch_html(url).await?;
        let document = Html::parse_document(&html);

        let content_selector = Selector::parse(".widget-episodeBody").unwrap();
        let content = document
            .select(&content_selector)
            .next()
            .map(|el| el.inner_html())
            .ok_or("본문을 찾을 수 없습니다.")?;

        let title_selector = Selector::parse(".widget-episodeTitle").unwrap();
        let subtitle = document
            .select(&title_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string());

        let prev_selector = Selector::parse("#contentMain-readPreviousEpisode").unwrap();
        let prev_url = document
            .select(&prev_selector)
            .next()
            .and_then(|el| el.value().attr("href"))
            .map(|href| {
                let clean_href = href.split('#').next().unwrap_or(href);
                format!("https://kakuyomu.jp{}", clean_href)
            });

        let next_selector = Selector::parse("#contentMain-readNextEpisode").unwrap();
        let next_url = document
            .select(&next_selector)
            .next()
            .and_then(|el| el.value().attr("href"))
            .map(|href| format!("https://kakuyomu.jp{}", href));

        Ok(ChapterContent {
            title: None,
            subtitle,
            content,
            author_note: None,
            prev_url,
            next_url,
        })
    }

    async fn get_series_info(&self, url: &str) -> Result<SeriesInfo, String> {
        let parsed = Self::parse_url_static(url).ok_or("URL 파싱 실패")?;
        let index_url = format!("https://kakuyomu.jp/works/{}", parsed.novel_id);

        let html = fetch_html(&index_url).await?;
        let document = Html::parse_document(&html);

        let title_selector = Selector::parse("#workTitle a").unwrap();
        let title = document
            .select(&title_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_else(|| parsed.novel_id.clone());

        let author_selector = Selector::parse("#workAuthor a").unwrap();
        let author = document
            .select(&author_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string());

        let chapter_selector = Selector::parse(".widget-toc-episode a").unwrap();
        let chapters: Vec<ChapterInfo> = document
            .select(&chapter_selector)
            .enumerate()
            .filter_map(|(i, el)| {
                let href = el.value().attr("href")?;
                let chapter_title = el.text().collect::<String>().trim().to_string();

                Some(ChapterInfo {
                    number: (i + 1) as u32,
                    url: format!("https://kakuyomu.jp{}", href),
                    title: Some(chapter_title),
                    status: "pending".to_string(),
                })
            })
            .collect();

        Ok(SeriesInfo {
            site: "kakuyomu".to_string(),
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
    fn test_parse_url_with_episode() {
        let url = "https://kakuyomu.jp/works/16816452220096911498/episodes/123456789";
        let parsed = KakuyomuParser::parse_url_static(url).unwrap();
        assert_eq!(parsed.site, "kakuyomu");
        assert_eq!(parsed.novel_id, "16816452220096911498");
        assert_eq!(parsed.chapter, Some(123456789));
    }

    #[test]
    fn test_parse_url_series_only() {
        let url = "https://kakuyomu.jp/works/16816452220096911498";
        let parsed = KakuyomuParser::parse_url_static(url).unwrap();
        assert_eq!(parsed.site, "kakuyomu");
        assert_eq!(parsed.novel_id, "16816452220096911498");
        assert_eq!(parsed.chapter, None);
    }

    #[test]
    fn test_parse_url_with_trailing_slash() {
        let url = "https://kakuyomu.jp/works/16816452220096911498/";
        let parsed = KakuyomuParser::parse_url_static(url).unwrap();
        assert_eq!(parsed.novel_id, "16816452220096911498");
        assert_eq!(parsed.chapter, None);
    }

    #[test]
    fn test_matches_url_valid() {
        let parser = KakuyomuParser::new();
        assert!(parser.matches_url("https://kakuyomu.jp/works/1234567890"));
        assert!(parser.matches_url("https://kakuyomu.jp/works/1234567890/episodes/987654321"));
        assert!(parser.matches_url("http://kakuyomu.jp/works/1234567890"));
    }

    #[test]
    fn test_matches_url_invalid() {
        let parser = KakuyomuParser::new();
        assert!(!parser.matches_url("https://ncode.syosetu.com/n4029bs/1/"));
        assert!(!parser.matches_url("https://syosetu.org/novel/12345/1.html"));
        assert!(!parser.matches_url("https://kakuyomu.jp/users/12345"));
    }

    #[test]
    fn test_parse_url_short_id() {
        let url = "https://kakuyomu.jp/works/123/episodes/456";
        let parsed = KakuyomuParser::parse_url_static(url).unwrap();
        assert_eq!(parsed.novel_id, "123");
        assert_eq!(parsed.chapter, Some(456));
    }

    #[test]
    fn test_parse_url_large_episode_id_overflow_returns_none() {
        let url = "https://kakuyomu.jp/works/123/episodes/99999999999999999999";
        let parsed = KakuyomuParser::parse_url_static(url).unwrap();
        assert_eq!(parsed.novel_id, "123");
        assert_eq!(parsed.chapter, None);
    }
}
