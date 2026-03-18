---
name: novel-parser-guide
description: >
  Guide for implementing NovelParser trait and adding new site parsers to the AI Novel Translator.
  Use when adding a new novel site parser, modifying existing parsers, or debugging HTML scraping.
  Triggers: new parser, new site, scraping, HTML parsing, scraper crate, novel site, chapter parsing.
---

# Novel Parser Guide

## NovelParser Trait

```rust
// parsers/mod.rs
#[async_trait]
pub trait NovelParser: Send + Sync {
    fn matches_url(&self, url: &str) -> bool;
    async fn get_chapter(&self, url: &str) -> Result<ChapterContent, String>;
    async fn get_series_info(&self, url: &str) -> Result<SeriesInfo, String>;
}
```

## Data Models

```rust
// models/novel.rs
pub struct ChapterContent {
    pub title: Option<String>,      // Chapter title
    pub subtitle: Option<String>,   // Chapter subtitle (Kakuyomu uses this)
    pub content: String,            // HTML body (inner_html of content div)
    pub author_note: Option<String>,
    pub prev_url: Option<String>,   // Full URL to previous chapter
    pub next_url: Option<String>,   // Full URL to next chapter
    pub novel_title: Option<String>,// Series title (extracted from breadcrumb/header)
    pub chapter_number: Option<u32>,// Numeric chapter number
}

pub struct SeriesInfo {
    pub site: String,         // "syosetu", "hameln", "kakuyomu", "nocturne"
    pub novel_id: String,     // Site-specific ID
    pub title: String,
    pub author: Option<String>,
    pub total_chapters: u32,
    pub chapters: Vec<ChapterInfo>,
}

pub struct ChapterInfo {
    pub number: u32,          // 1-indexed
    pub url: String,          // Full URL
    pub title: Option<String>,
    pub status: String,       // Always "pending" initially
}
```

## Implementation Template

### 1. Parser Struct

```rust
// parsers/newsite.rs
use async_trait::async_trait;
use regex::Regex;
use scraper::{Html, Selector};

use super::{fetch_html, NovelParser, ParsedUrl};
use crate::models::novel::{ChapterContent, ChapterInfo, SeriesInfo};

pub struct NewSiteParser {
    url_pattern: Regex,
}

impl NewSiteParser {
    pub fn new() -> Self {
        Self {
            url_pattern: Regex::new(r"https?://example\.com/novels/(\w+)(?:/(\d+))?/?").unwrap(),
        }
    }

    // Static URL parser — called from ParsedUrl::from_url() router
    pub fn parse_url_static(url: &str) -> Option<ParsedUrl> {
        let pattern = Regex::new(r"https?://example\.com/novels/(\w+)(?:/(\d+))?/?").unwrap();
        let caps = pattern.captures(url)?;
        Some(ParsedUrl {
            site: "newsite".to_string(),
            novel_id: caps.get(1)?.as_str().to_string(),
            chapter: caps.get(2).and_then(|m| m.as_str().parse().ok()),
        })
    }
}
```

### 2. Trait Implementation

```rust
#[async_trait]
impl NovelParser for NewSiteParser {
    fn matches_url(&self, url: &str) -> bool {
        self.url_pattern.is_match(url)
    }

    async fn get_chapter(&self, url: &str) -> Result<ChapterContent, String> {
        let html = fetch_html(url).await?;
        let document = Html::parse_document(&html);

        // Extract content using CSS selectors
        let content_selector = Selector::parse(".chapter-body").unwrap();
        let content = document
            .select(&content_selector)
            .next()
            .map(|el| el.inner_html())  // Keep HTML structure (<p> tags)
            .ok_or("본문을 찾을 수 없습니다.")?;

        // Extract navigation
        let prev_url = extract_nav_url(&document, ".prev-link", "https://example.com");
        let next_url = extract_nav_url(&document, ".next-link", "https://example.com");

        Ok(ChapterContent {
            title: extract_text(&document, ".chapter-title"),
            subtitle: None,
            content,
            author_note: None,
            prev_url,
            next_url,
            novel_title: extract_text(&document, ".series-title"),
            chapter_number: extract_chapter_number(&document),
        })
    }

    async fn get_series_info(&self, url: &str) -> Result<SeriesInfo, String> {
        let parsed = Self::parse_url_static(url).ok_or("URL 파싱 실패")?;
        let index_url = format!("https://example.com/novels/{}/", parsed.novel_id);
        let html = fetch_html(&index_url).await?;
        let document = Html::parse_document(&html);

        // Extract chapter list
        let chapter_selector = Selector::parse(".toc-entry a").unwrap();
        let chapters: Vec<ChapterInfo> = document
            .select(&chapter_selector)
            .enumerate()
            .filter_map(|(i, el)| {
                let href = el.value().attr("href")?;
                Some(ChapterInfo {
                    number: (i + 1) as u32,
                    url: format!("https://example.com{}", href),
                    title: Some(el.text().collect::<String>().trim().to_string()),
                    status: "pending".to_string(),
                })
            })
            .collect();

        Ok(SeriesInfo {
            site: "newsite".to_string(),
            novel_id: parsed.novel_id,
            title: extract_text(&document, ".novel-title").unwrap_or_default(),
            author: extract_text(&document, ".author-name"),
            total_chapters: chapters.len() as u32,
            chapters,
        })
    }
}
```

### 3. Register in mod.rs

Three places to update in `parsers/mod.rs`:

```rust
// 1. Module declaration
pub mod newsite;

// 2. ParsedUrl::from_url() — add before None
if let Some(parsed) = newsite::NewSiteParser::parse_url_static(url) {
    return Some(parsed);
}

// 3. get_parser_for_url() — add before None
let newsite = newsite::NewSiteParser::new();
if newsite.matches_url(url) {
    return Some(Box::new(newsite));
}
```

### 4. Batch Translation Support

Update `build_chapter_url` in `commands/series.rs`:

```rust
fn build_chapter_url(base_url: &str, site: &str, novel_id: &str, chapter: u32) -> String {
    match site {
        "newsite" => format!("https://example.com/novels/{}/{}/", novel_id, chapter),
        // ... existing sites
    }
}
```

If the site uses non-sequential chapter URLs (like Kakuyomu), block batch:

```rust
if request.site == "newsite" {
    return Err("NewSite는 현재 배치 번역을 지원하지 않습니다.".to_string());
}
```

## Special Cases

### Cookie/Auth Headers

For 18+ or login-required sites, add to `fetch_html()` in `mod.rs`:

```rust
if url.contains("novel18.syosetu.com") {
    headers.insert(
        reqwest::header::COOKIE,
        reqwest::header::HeaderValue::from_static("over18=yes"),
    );
}
```

### JS-Rendered Content (Kakuyomu Pattern)

When content is in embedded JSON instead of DOM:

```rust
// Parse embedded JSON from <script> tags instead of HTML selectors
let script_selector = Selector::parse("script#__NEXT_DATA__").unwrap();
let json_text = document.select(&script_selector).next()
    .map(|el| el.text().collect::<String>())
    .ok_or("Embedded data not found")?;
let data: serde_json::Value = serde_json::from_str(&json_text)?;
```

### URL Normalization

Always produce full URLs for `prev_url`, `next_url`, and `chapters[].url`:

```rust
let url = if href.starts_with("http") {
    href.to_string()
} else {
    format!("https://example.com{}", href)
};
```

## Testing

```rust
#[cfg(test)]
mod tests {
    use super::*;

    // Unit tests (always run)
    #[test]
    fn test_parse_url_with_chapter() {
        let parsed = NewSiteParser::parse_url_static("https://example.com/novels/abc123/42/").unwrap();
        assert_eq!(parsed.site, "newsite");
        assert_eq!(parsed.novel_id, "abc123");
        assert_eq!(parsed.chapter, Some(42));
    }

    #[test]
    fn test_matches_url() {
        let parser = NewSiteParser::new();
        assert!(parser.matches_url("https://example.com/novels/abc123/1/"));
        assert!(!parser.matches_url("https://other-site.com/novel/123"));
    }

    // Network tests (ignored by default)
    #[tokio::test]
    #[ignore = "requires network - run with: cargo test -- --ignored"]
    async fn test_get_chapter_selectors() {
        let parser = NewSiteParser::new();
        let result = parser.get_chapter("https://example.com/novels/abc123/1/").await;
        assert!(result.is_ok());
        let content = result.unwrap();
        assert!(!content.content.is_empty());
        assert!(content.content.contains("<p"));
    }
}
```

## Checklist

- [ ] `parse_url_static()` correctly extracts site, novel_id, chapter
- [ ] `matches_url()` accepts valid URLs, rejects other sites
- [ ] `get_chapter()` returns HTML content with `<p>` tags preserved
- [ ] `get_series_info()` returns full chapter list with absolute URLs
- [ ] Navigation URLs (`prev_url`, `next_url`) are absolute
- [ ] Registered in all 3 places in `mod.rs`
- [ ] `build_chapter_url()` updated in `commands/series.rs`
- [ ] Unit tests for URL parsing and matching
- [ ] Network integration test with `#[ignore]`
- [ ] Error messages in Korean for user-facing errors
