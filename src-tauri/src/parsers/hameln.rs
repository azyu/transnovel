use async_trait::async_trait;
use regex::Regex;
use scraper::{Html, Selector};

use super::{fetch_html, NovelParser, ParsedUrl};
use crate::models::novel::{ChapterContent, ChapterInfo, SeriesInfo};

pub struct HamelnParser {
    url_pattern: Regex,
}

impl HamelnParser {
    pub fn new() -> Self {
        Self {
            url_pattern: Regex::new(r"https?://syosetu\.org/novel/(\d+)/(\d+)?\.?html?/?")
                .unwrap(),
        }
    }

    pub fn parse_url_static(url: &str) -> Option<ParsedUrl> {
        let pattern = Regex::new(r"https?://syosetu\.org/novel/(\d+)/(\d+)?\.?html?/?").unwrap();
        let caps = pattern.captures(url)?;

        Some(ParsedUrl {
            site: "hameln".to_string(),
            novel_id: caps.get(1)?.as_str().to_string(),
            chapter: caps.get(2).and_then(|m| m.as_str().parse().ok()),
        })
    }
}

#[async_trait]
impl NovelParser for HamelnParser {
    fn matches_url(&self, url: &str) -> bool {
        self.url_pattern.is_match(url)
    }

    async fn get_chapter(&self, url: &str) -> Result<ChapterContent, String> {
        let html = fetch_html(url).await?;
        let document = Html::parse_document(&html);

        let content_selector = Selector::parse("#honbun").unwrap();
        let content = document
            .select(&content_selector)
            .next()
            .map(|el| el.inner_html())
            .ok_or("본문을 찾을 수 없습니다.")?;

        let subtitle_selector =
            Selector::parse("#maind>div:nth-child(1)>span[style='font-size:120%']").unwrap();
        let subtitle = document
            .select(&subtitle_selector)
            .next()
            .map(|el| el.inner_html());

        let prev_selector = Selector::parse(".novelnavi a:not(.next_page_link)").unwrap();
        let prev_url = document
            .select(&prev_selector)
            .next()
            .and_then(|el| el.value().attr("href"))
            .filter(|href| href.contains(".html"))
            .map(|s| {
                if s.starts_with("http") {
                    s.to_string()
                } else {
                    format!("https://syosetu.org{}", s)
                }
            });

        let next_selector = Selector::parse(".next_page_link").unwrap();
        let next_url = document
            .select(&next_selector)
            .next()
            .and_then(|el| el.value().attr("href"))
            .map(|s| {
                if s.starts_with("http") {
                    s.to_string()
                } else {
                    format!("https://syosetu.org{}", s)
                }
            });

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
        let index_url = format!("https://syosetu.org/novel/{}/", parsed.novel_id);

        let html = fetch_html(&index_url).await?;
        let document = Html::parse_document(&html);

        let title_selector = Selector::parse("a[href='./']").unwrap();
        let title = document
            .select(&title_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_else(|| parsed.novel_id.clone());

        let chapter_selector = Selector::parse(".ss a[href*='.html']").unwrap();
        let chapters: Vec<ChapterInfo> = document
            .select(&chapter_selector)
            .enumerate()
            .filter_map(|(i, el)| {
                let href = el.value().attr("href")?;
                let chapter_title = el.text().collect::<String>().trim().to_string();

                Some(ChapterInfo {
                    number: (i + 1) as u32,
                    url: format!("https://syosetu.org/novel/{}/{}", parsed.novel_id, href),
                    title: Some(chapter_title),
                    status: "pending".to_string(),
                })
            })
            .collect();

        Ok(SeriesInfo {
            site: "hameln".to_string(),
            novel_id: parsed.novel_id,
            title,
            author: None,
            total_chapters: chapters.len() as u32,
            chapters,
        })
    }
}
