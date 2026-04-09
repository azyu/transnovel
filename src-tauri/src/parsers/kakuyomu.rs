use async_trait::async_trait;
use regex::Regex;
use scraper::{Html, Selector};
use serde_json::Value;

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

    fn extract_next_data_json(html: &str) -> Result<Value, String> {
        let pattern = Regex::new(
            r#"<script id="__NEXT_DATA__" type="application/json">(.*?)</script>"#,
        )
        .map_err(|e| e.to_string())?;

        let payload = pattern
            .captures(html)
            .and_then(|captures| captures.get(1))
            .map(|matched| matched.as_str())
            .ok_or("Kakuyomu 작품 정보를 찾을 수 없습니다.")?;

        serde_json::from_str(payload).map_err(|e| format!("Kakuyomu 작품 정보 파싱 실패: {e}"))
    }

    fn get_apollo_state(next_data: &Value) -> Result<&serde_json::Map<String, Value>, String> {
        next_data
            .get("props")
            .and_then(Value::as_object)
            .and_then(|props| props.get("pageProps"))
            .and_then(Value::as_object)
            .and_then(|page_props| page_props.get("__APOLLO_STATE__"))
            .and_then(Value::as_object)
            .ok_or("Kakuyomu 작품 데이터가 비어 있습니다.".to_string())
    }

    fn build_series_info_from_apollo_state(
        novel_id: &str,
        apollo_state: &serde_json::Map<String, Value>,
    ) -> Result<SeriesInfo, String> {
        let work_key = format!("Work:{novel_id}");
        let work = apollo_state
            .get(&work_key)
            .and_then(Value::as_object)
            .ok_or("Kakuyomu 작품 정보를 찾을 수 없습니다.".to_string())?;

        let title = work
            .get("title")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(novel_id)
            .to_string();

        let author = work
            .get("author")
            .and_then(Value::as_object)
            .and_then(|author_ref| author_ref.get("__ref"))
            .and_then(Value::as_str)
            .and_then(|ref_key| apollo_state.get(ref_key))
            .and_then(Value::as_object)
            .and_then(|author_object| {
                author_object
                    .get("activityName")
                    .and_then(Value::as_str)
                    .or_else(|| author_object.get("name").and_then(Value::as_str))
            })
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string);

        let mut chapters = Vec::new();
        let mut chapter_number = 1u32;

        if let Some(table_of_contents) = work.get("tableOfContentsV2").and_then(Value::as_array) {
            for chapter_entry in table_of_contents {
                let chapter_ref = chapter_entry
                    .as_object()
                    .and_then(|entry| entry.get("__ref"))
                    .and_then(Value::as_str);

                let episode_unions = chapter_ref
                    .and_then(|ref_key| apollo_state.get(ref_key))
                    .and_then(Value::as_object)
                    .and_then(|entry| entry.get("episodeUnions"))
                    .and_then(Value::as_array);

                if let Some(episode_unions) = episode_unions {
                    for episode_union in episode_unions {
                        let episode_ref = episode_union
                            .as_object()
                            .and_then(|entry| entry.get("__ref"))
                            .and_then(Value::as_str);
                        let Some(episode_ref) = episode_ref else {
                            continue;
                        };

                        let episode = apollo_state.get(episode_ref).and_then(Value::as_object);
                        let Some(episode) = episode else {
                            continue;
                        };

                        let episode_id = episode
                            .get("id")
                            .and_then(Value::as_str)
                            .filter(|value| !value.is_empty())
                            .unwrap_or_else(|| episode_ref.trim_start_matches("Episode:"));

                        let episode_title = episode
                            .get("title")
                            .and_then(Value::as_str)
                            .map(str::trim)
                            .filter(|value| !value.is_empty())
                            .map(ToString::to_string);

                        chapters.push(ChapterInfo {
                            number: chapter_number,
                            url: format!("https://kakuyomu.jp/works/{novel_id}/episodes/{episode_id}"),
                            title: episode_title,
                            status: "pending".to_string(),
                        });
                        chapter_number += 1;
                    }
                }
            }
        }

        Ok(SeriesInfo {
            site: "kakuyomu".to_string(),
            novel_id: novel_id.to_string(),
            title,
            author,
            total_chapters: chapters.len() as u32,
            chapters,
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

        let novel_title_selector = Selector::parse("#contentMain-header-workTitle").unwrap();
        let novel_title = document
            .select(&novel_title_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string());

        let chapter_number = subtitle.as_ref().and_then(|s| {
            let re = Regex::new(r"第(\d+)話").ok()?;
            re.captures(s)?.get(1)?.as_str().parse::<u32>().ok()
        });

        Ok(ChapterContent {
            title: None,
            subtitle,
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
        let index_url = format!("https://kakuyomu.jp/works/{}", parsed.novel_id);

        let html = fetch_html(&index_url).await?;
        let next_data = Self::extract_next_data_json(&html)?;
        let apollo_state = Self::get_apollo_state(&next_data)?;
        Self::build_series_info_from_apollo_state(&parsed.novel_id, apollo_state)
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

    #[test]
    fn extracts_next_data_payload() {
        let json = KakuyomuParser::extract_next_data_json(
            r#"<html><body><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"__APOLLO_STATE__":{"Work:123":{"title":"작품"}}}}}</script></body></html>"#,
        )
        .expect("next data json");

        assert_eq!(
            json["props"]["pageProps"]["__APOLLO_STATE__"]["Work:123"]["title"],
            "작품"
        );
    }

    #[test]
    fn builds_series_info_from_apollo_state() {
        let next_data = serde_json::json!({
            "props": {
                "pageProps": {
                    "__APOLLO_STATE__": {
                        "Work:822139846571948770": {
                            "title": "카쿠요무 작품",
                            "author": { "__ref": "UserAccount:1" },
                            "tableOfContentsV2": [
                                { "__ref": "TableOfContentsChapter:10" },
                                { "__ref": "TableOfContentsChapter:11" }
                            ]
                        },
                        "UserAccount:1": {
                            "activityName": "작가명"
                        },
                        "TableOfContentsChapter:10": {
                            "episodeUnions": [
                                { "__ref": "Episode:100" },
                                { "__ref": "Episode:101" }
                            ]
                        },
                        "TableOfContentsChapter:11": {
                            "episodeUnions": [
                                { "__ref": "Episode:102" }
                            ]
                        },
                        "Episode:100": {
                            "id": "100",
                            "title": "첫 화"
                        },
                        "Episode:101": {
                            "id": "101",
                            "title": "둘째 화"
                        },
                        "Episode:102": {
                            "id": "102",
                            "title": "셋째 화"
                        }
                    }
                }
            }
        });

        let apollo_state = KakuyomuParser::get_apollo_state(&next_data).expect("apollo state");
        let series = KakuyomuParser::build_series_info_from_apollo_state(
            "822139846571948770",
            apollo_state,
        )
        .expect("series info");

        assert_eq!(series.site, "kakuyomu");
        assert_eq!(series.title, "카쿠요무 작품");
        assert_eq!(series.author.as_deref(), Some("작가명"));
        assert_eq!(series.total_chapters, 3);
        assert_eq!(series.chapters[0].number, 1);
        assert_eq!(
            series.chapters[0].url,
            "https://kakuyomu.jp/works/822139846571948770/episodes/100"
        );
        assert_eq!(series.chapters[2].title.as_deref(), Some("셋째 화"));
    }
}
