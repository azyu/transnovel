pub mod hameln;
pub mod kakuyomu;
pub mod nocturne;
pub mod syosetu;

use async_trait::async_trait;

use crate::models::novel::{ChapterContent, SeriesInfo};

#[async_trait]
pub trait NovelParser: Send + Sync {
    fn matches_url(&self, url: &str) -> bool;
    async fn get_chapter(&self, url: &str) -> Result<ChapterContent, String>;
    async fn get_series_info(&self, url: &str) -> Result<SeriesInfo, String>;
}

#[derive(Debug, Clone)]
pub struct ParsedUrl {
    pub site: String,
    pub novel_id: String,
    pub chapter: Option<u32>,
}

impl ParsedUrl {
    pub fn from_url(url: &str) -> Option<Self> {
        if let Some(parsed) = syosetu::SyosetuParser::parse_url_static(url) {
            return Some(parsed);
        }
        if let Some(parsed) = hameln::HamelnParser::parse_url_static(url) {
            return Some(parsed);
        }
        if let Some(parsed) = kakuyomu::KakuyomuParser::parse_url_static(url) {
            return Some(parsed);
        }
        if let Some(parsed) = nocturne::NocturneParser::parse_url_static(url) {
            return Some(parsed);
        }
        None
    }
}

pub fn get_parser_for_url(url: &str) -> Option<Box<dyn NovelParser>> {
    let syosetu = syosetu::SyosetuParser::new();
    if syosetu.matches_url(url) {
        return Some(Box::new(syosetu));
    }

    let hameln = hameln::HamelnParser::new();
    if hameln.matches_url(url) {
        return Some(Box::new(hameln));
    }

    let kakuyomu = kakuyomu::KakuyomuParser::new();
    if kakuyomu.matches_url(url) {
        return Some(Box::new(kakuyomu));
    }

    let nocturne = nocturne::NocturneParser::new();
    if nocturne.matches_url(url) {
        return Some(Box::new(nocturne));
    }

    None
}

pub fn normalize_author_name(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let normalized = trimmed
        .strip_prefix("作者：")
        .or_else(|| trimmed.strip_prefix("作者:"))
        .map(str::trim)
        .unwrap_or(trimmed);

    if normalized.is_empty() {
        None
    } else {
        Some(normalized.to_string())
    }
}

pub async fn fetch_html(url: &str) -> Result<String, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    
    if url.contains("novel18.syosetu.com") {
        headers.insert(
            reqwest::header::COOKIE,
            reqwest::header::HeaderValue::from_static("over18=yes"),
        );
    }
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("페이지 로드 실패: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP 오류: {}", response.status()));
    }

    response
        .text()
        .await
        .map_err(|e| format!("텍스트 변환 실패: {}", e))
}

#[cfg(test)]
mod tests {
    use super::normalize_author_name;

    #[test]
    fn strips_syosetu_author_prefix() {
        assert_eq!(
            normalize_author_name("作者：川坂藍斗"),
            Some("川坂藍斗".to_string())
        );
    }

    #[test]
    fn keeps_plain_author_name_without_prefix() {
        assert_eq!(
            normalize_author_name("川坂藍斗"),
            Some("川坂藍斗".to_string())
        );
    }
}
