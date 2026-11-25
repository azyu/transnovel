use async_trait::async_trait;
use regex::Regex;
use scraper::{Html, Selector};

use super::{fetch_html, normalize_author_name, parse_eplist_update, NovelParser, ParsedUrl};
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

    fn parse_chapter_list(document: &Html) -> Vec<ChapterInfo> {
        let chapter_selector = Selector::parse(".p-eplist__subtitle").unwrap();

        document
            .select(&chapter_selector)
            .enumerate()
            .map(|(i, el)| {
                let href = el.value().attr("href").unwrap_or("");
                let chapter_title = el.text().collect::<String>().trim().to_string();
                let (published_at, revised_at) = parse_eplist_update(el);

                ChapterInfo {
                    number: (i + 1) as u32,
                    url: if href.starts_with("http") {
                        href.to_string()
                    } else {
                        format!("https://novel18.syosetu.com{}", href)
                    },
                    title: Some(chapter_title),
                    status: "pending".to_string(),
                    published_at,
                    revised_at,
                }
            })
            .collect()
    }
}

#[async_trait]
impl NovelParser for NocturneParser {
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
        let content_parts: Vec<String> = document
            .select(&content_selector)
            .map(|el| el.inner_html())
            .collect();
        
        if content_parts.is_empty() {
            return Err("본문을 찾을 수 없습니다.".to_string());
        }
        
        let content = content_parts.join("\n");

        let prev_selector = Selector::parse(".c-pager__item--before").unwrap();
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

        let next_selector = Selector::parse(".c-pager__item--next").unwrap();
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

        let novel_title_selector = Selector::parse(".c-announce a[href^='/']").unwrap();
        let novel_title = document
            .select(&novel_title_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string());

        let chapter_number_selector = Selector::parse(".p-novel__number").unwrap();
        let chapter_number = document
            .select(&chapter_number_selector)
            .next()
            .and_then(|el| {
                let text = el.text().collect::<String>();
                text.split('/').next()?.trim().parse::<u32>().ok()
            });

        Ok(ChapterContent {
            title,
            subtitle: None,
            content,
            author_note: None,
            prev_url,
            next_url,
            novel_title,
            chapter_number,
        })
    }

    async fn get_series_info(&self, url: &str) -> Result<SeriesInfo, String> {
        let parsed = Self::parse_url_static(url).ok_or("URL 파싱 실패")?;
        let index_url = format!("https://novel18.syosetu.com/{}/", parsed.novel_id);

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
            .and_then(|el| normalize_author_name(&el.text().collect::<String>()));

        let chapters = Self::parse_chapter_list(&document);

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chapter_list_carries_source_dates_per_episode() {
        let document = Html::parse_document(
            r#"<div class="p-eplist__sublist">
              <a href="/n3000aa/1/" class="p-eplist__subtitle">第一話</a>
            </div>
            <div class="p-eplist__sublist">
              <a href="/n3000aa/2/" class="p-eplist__subtitle">第二話</a>
              <div class="p-eplist__update">
                2020/01/02 03:04
                <span title="2021/05/06 07:08 改稿">（改）</span>
              </div>
            </div>"#,
        );

        let chapters = NocturneParser::parse_chapter_list(&document);

        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].url, "https://novel18.syosetu.com/n3000aa/1/");
        assert_eq!(chapters[0].published_at, None);
        assert_eq!(chapters[0].revised_at, None);
        assert_eq!(chapters[1].published_at.as_deref(), Some("2020/01/02 03:04"));
        assert_eq!(chapters[1].revised_at.as_deref(), Some("2021/05/06 07:08"));
    }

    #[test]
    fn test_parse_url_with_chapter() {
        let url = "https://novel18.syosetu.com/n4029bs/1/";
        let parsed = NocturneParser::parse_url_static(url).unwrap();
        assert_eq!(parsed.site, "nocturne");
        assert_eq!(parsed.novel_id, "n4029bs");
        assert_eq!(parsed.chapter, Some(1));
    }

    #[test]
    fn test_parse_url_without_chapter() {
        let url = "https://novel18.syosetu.com/n4029bs/";
        let parsed = NocturneParser::parse_url_static(url).unwrap();
        assert_eq!(parsed.site, "nocturne");
        assert_eq!(parsed.novel_id, "n4029bs");
        assert_eq!(parsed.chapter, None);
    }

    #[test]
    fn test_parse_url_without_trailing_slash_returns_none() {
        let url = "https://novel18.syosetu.com/n4029bs";
        let parsed = NocturneParser::parse_url_static(url);
        assert!(parsed.is_none());
    }

    #[test]
    fn test_matches_url_valid() {
        let parser = NocturneParser::new();
        assert!(parser.matches_url("https://novel18.syosetu.com/n4029bs/1/"));
        assert!(parser.matches_url("https://novel18.syosetu.com/n4029bs/"));
        assert!(parser.matches_url("http://novel18.syosetu.com/abc123/99/"));
    }

    #[test]
    fn test_matches_url_without_slash_is_invalid() {
        let parser = NocturneParser::new();
        assert!(!parser.matches_url("https://novel18.syosetu.com/n4029bs"));
    }

    #[test]
    fn test_matches_url_other_sites_invalid() {
        let parser = NocturneParser::new();
        assert!(!parser.matches_url("https://ncode.syosetu.com/n4029bs/1/"));
        assert!(!parser.matches_url("https://syosetu.org/novel/123/1.html"));
        assert!(!parser.matches_url("https://kakuyomu.jp/works/123"));
    }

    #[test]
    fn test_parse_url_various_novel_ids() {
        let cases = vec![
            ("https://novel18.syosetu.com/abc123/", "abc123"),
            ("https://novel18.syosetu.com/n1234ab/", "n1234ab"),
            ("https://novel18.syosetu.com/xyz789/50/", "xyz789"),
        ];
        
        for (url, expected_id) in cases {
            let parsed = NocturneParser::parse_url_static(url).unwrap();
            assert_eq!(parsed.novel_id, expected_id);
        }
    }
}
