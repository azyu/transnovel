use async_trait::async_trait;
use regex::Regex;
use scraper::{Html, Selector};

use super::{fetch_html, NovelParser, ParsedUrl};
use crate::models::novel::{ChapterContent, ChapterInfo, SeriesInfo};

pub struct NocturneParser {
    url_pattern: Regex,
}

impl NocturneParser {
    pub fn new() -> Self {
        Self {
            url_pattern: Regex::new(r"https?://novel18\.syosetu\.com/([a-z0-9]+)/(\d+)?/?")
                .unwrap(),
        }
    }

    pub fn parse_url_static(url: &str) -> Option<ParsedUrl> {
        let pattern = Regex::new(r"https?://novel18\.syosetu\.com/([a-z0-9]+)/(\d+)?/?").unwrap();
        let caps = pattern.captures(url)?;

        Some(ParsedUrl {
            site: "nocturne".to_string(),
            novel_id: caps.get(1)?.as_str().to_string(),
            chapter: caps.get(2).and_then(|m| m.as_str().parse().ok()),
        })
    }
}

#[async_trait]
impl NovelParser for NocturneParser {
    fn site_id(&self) -> &'static str {
        "nocturne"
    }

    fn matches_url(&self, url: &str) -> bool {
        self.url_pattern.is_match(url)
    }

    async fn get_chapter(&self, url: &str) -> Result<ChapterContent, String> {
        let html = fetch_html(url).await?;
        let document = Html::parse_document(&html);

        let subtitle_selector = Selector::parse(".novel_subtitle").unwrap();
        let subtitle = document
            .select(&subtitle_selector)
            .next()
            .map(|el| el.inner_html());

        let content_selector = Selector::parse("#novel_honbun").unwrap();
        let content = document
            .select(&content_selector)
            .next()
            .map(|el| el.inner_html())
            .ok_or("본문을 찾을 수 없습니다.")?;

        let note_selector = Selector::parse("#novel_a").unwrap();
        let author_note = document
            .select(&note_selector)
            .next()
            .map(|el| el.inner_html());

        let prev_selector = Selector::parse(".novel_bn a[rel='prev']").unwrap();
        let prev_url = document
            .select(&prev_selector)
            .next()
            .and_then(|el| el.value().attr("href"))
            .map(|s| {
                if s.starts_with("http") {
                    s.to_string()
                } else {
                    format!("https://novel18.syosetu.com{}", s)
                }
            });

        let next_selector = Selector::parse(".novel_bn a[rel='next']").unwrap();
        let next_url = document
            .select(&next_selector)
            .next()
            .and_then(|el| el.value().attr("href"))
            .map(|s| {
                if s.starts_with("http") {
                    s.to_string()
                } else {
                    format!("https://novel18.syosetu.com{}", s)
                }
            });

        Ok(ChapterContent {
            title: None,
            subtitle,
            content,
            author_note,
            prev_url,
            next_url,
        })
    }

    async fn get_series_info(&self, url: &str) -> Result<SeriesInfo, String> {
        let parsed = Self::parse_url_static(url).ok_or("URL 파싱 실패")?;
        let index_url = format!("https://novel18.syosetu.com/{}/", parsed.novel_id);

        let html = fetch_html(&index_url).await?;
        let document = Html::parse_document(&html);

        let title_selector = Selector::parse(".novel_title").unwrap();
        let title = document
            .select(&title_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_else(|| parsed.novel_id.clone());

        let author_selector = Selector::parse(".novel_writername a").unwrap();
        let author = document
            .select(&author_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string());

        let chapter_selector = Selector::parse(".novel_sublist2 .subtitle a").unwrap();
        let chapters: Vec<ChapterInfo> = document
            .select(&chapter_selector)
            .enumerate()
            .map(|(i, el)| {
                let href = el.value().attr("href").unwrap_or("");
                let chapter_title = el.text().collect::<String>().trim().to_string();

                ChapterInfo {
                    number: (i + 1) as u32,
                    url: if href.starts_with("http") {
                        href.to_string()
                    } else {
                        format!("https://novel18.syosetu.com{}", href)
                    },
                    title: Some(chapter_title),
                    status: "pending".to_string(),
                }
            })
            .collect();

        Ok(SeriesInfo {
            site: "nocturne".to_string(),
            novel_id: parsed.novel_id,
            title,
            author,
            total_chapters: chapters.len() as u32,
            chapters,
        })
    }
}
