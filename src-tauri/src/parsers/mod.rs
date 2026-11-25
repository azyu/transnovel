pub mod hameln;
pub mod kakuyomu;
pub mod nocturne;
pub mod syosetu;

use async_trait::async_trait;
use scraper::{ElementRef, Selector};

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

/// Reads the source posting and revision datetimes for one episode of a Syosetu-family
/// index page (`ncode.syosetu.com`, `novel18.syosetu.com`).
///
/// The `.p-eplist__update` element follows the episode's `.p-eplist__subtitle` anchor.
/// Its own text is the posting datetime. An optional `span[title]` carries the revision
/// datetime as `"YYYY/MM/DD HH:MM 改稿"`. A value that is not exactly
/// `YYYY/MM/DD HH:MM` becomes `None`, so markup drift never stores arbitrary text.
pub fn parse_eplist_update(subtitle: ElementRef) -> (Option<String>, Option<String>) {
    let Some(update) = subtitle
        .next_siblings()
        .filter_map(ElementRef::wrap)
        .take_while(|el| !el.value().classes().any(|class| class == "p-eplist__subtitle"))
        .find(|el| el.value().classes().any(|class| class == "p-eplist__update"))
    else {
        return (None, None);
    };

    let posted_text: String = update
        .children()
        .filter_map(|node| node.value().as_text().map(|text| text.to_string()))
        .collect();
    let published_at = normalize_eplist_datetime(&posted_text);

    let revision_selector = Selector::parse("span[title]").unwrap();
    let revised_at = update
        .select(&revision_selector)
        .next()
        .and_then(|span| span.value().attr("title"))
        .and_then(|title| normalize_eplist_datetime(title.trim().trim_end_matches("改稿")));

    (published_at, revised_at)
}

fn normalize_eplist_datetime(value: &str) -> Option<String> {
    let collapsed = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let is_minute_datetime = collapsed.len() == 16
        && collapsed.bytes().enumerate().all(|(i, byte)| match i {
            4 | 7 => byte == b'/',
            10 => byte == b' ',
            13 => byte == b':',
            _ => byte.is_ascii_digit(),
        });
    is_minute_datetime.then_some(collapsed)
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
    use super::{normalize_author_name, parse_eplist_update};
    use scraper::{Html, Selector};

    fn eplist_dates(html: &str) -> Vec<(Option<String>, Option<String>)> {
        let document = Html::parse_document(html);
        let selector = Selector::parse(".p-eplist__subtitle").unwrap();
        document.select(&selector).map(parse_eplist_update).collect()
    }

    #[test]
    fn eplist_update_reads_posted_and_optional_revised_datetime_per_episode() {
        let dates = eplist_dates(
            r#"<div class="p-eplist">
              <div class="p-eplist__sublist">
                <a href="/n0000aa/1/" class="p-eplist__subtitle">第一話</a>
                <div class="p-eplist__update">
                  2012/11/22 17:00
                  <span title="2013/11/27 13:06 改稿">（改）</span>
                </div>
              </div>
              <div class="p-eplist__sublist">
                <a href="/n0000aa/2/" class="p-eplist__subtitle">第二話</a>
                <div class="p-eplist__update">
                  2012/12/10 10:00
                </div>
              </div>
            </div>"#,
        );

        assert_eq!(
            dates,
            vec![
                (
                    Some("2012/11/22 17:00".to_string()),
                    Some("2013/11/27 13:06".to_string())
                ),
                (Some("2012/12/10 10:00".to_string()), None),
            ]
        );
    }

    #[test]
    fn eplist_update_does_not_borrow_the_next_episode_dates() {
        let dates = eplist_dates(
            r#"<div class="p-eplist">
              <a href="/n0000aa/1/" class="p-eplist__subtitle">第一話</a>
              <a href="/n0000aa/2/" class="p-eplist__subtitle">第二話</a>
              <div class="p-eplist__update">2012/12/10 10:00</div>
            </div>"#,
        );

        assert_eq!(
            dates,
            vec![(None, None), (Some("2012/12/10 10:00".to_string()), None)]
        );
    }

    #[test]
    fn eplist_update_rejects_text_that_is_not_a_minute_datetime() {
        let dates = eplist_dates(
            r#"<div class="p-eplist__sublist">
              <a href="/n0000aa/1/" class="p-eplist__subtitle">第一話</a>
              <div class="p-eplist__update">
                2012年11月22日
                <span title="改稿">（改）</span>
              </div>
            </div>"#,
        );

        assert_eq!(dates, vec![(None, None)]);
    }

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
