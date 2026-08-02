use serde::{Deserialize, Serialize};

use crate::models::novel::{ChapterContent, ChapterInfo, SeriesInfo};
use crate::parsers::{get_parser_for_url, ParsedUrl};
use crate::services::chapter_persistence::{
    extract_chapter_paragraphs as extract_paragraphs, upsert_chapter, ChapterUpsert,
};
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
    pub content_hash: String,
    pub prev_url: Option<String>,
    pub next_url: Option<String>,
    pub novel_title: Option<String>,
}

struct PersistedParsedChapter {
    parsed: ParsedUrl,
    content: ChapterContent,
    chapter_number: u32,
    content_hash: String,
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
    Ok(fetch_and_persist_chapter(&url).await?.content)
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

async fn fetch_and_persist_chapter(url: &str) -> Result<PersistedParsedChapter, String> {
    let parsed = ParsedUrl::from_url(url).ok_or("지원하지 않는 URL 형식입니다.")?;
    let parser = get_parser_for_url(url).ok_or("지원하지 않는 사이트입니다.")?;
    let (actual_url, chapter_number) = if has_explicit_chapter_url(&parsed, url) {
        let series_info = if parsed.site == "kakuyomu" {
            Some(parser.get_series_info(url).await?)
        } else {
            None
        };
        let chapter = resolve_explicit_chapter_number(&parsed, url, series_info.as_ref())?;
        (url.to_string(), chapter)
    } else {
        let series_info = parser.get_series_info(url).await.ok();

        if let Some(info) = series_info {
            if !info.chapters.is_empty() {
                let first_chapter_url = &info.chapters[0].url;
                (first_chapter_url.clone(), 1u32)
            } else {
                (url.to_string(), 1u32)
            }
        } else {
            (url.to_string(), 1u32)
        }
    };

    let actual_parsed = ParsedUrl::from_url(&actual_url).unwrap_or(parsed);
    let mut content = parser.get_chapter(&actual_url).await?;
    let resolved_chapter_number = if actual_parsed.site == "kakuyomu" {
        chapter_number
    } else {
        content.chapter_number.unwrap_or(chapter_number)
    };
    content.chapter_number = Some(resolved_chapter_number);
    upsert_novel_metadata(
        &actual_parsed.site,
        &actual_parsed.novel_id,
        content.novel_title.as_deref(),
        None,
        None,
    )
    .await?;
    let persisted = upsert_chapter(ChapterUpsert {
        site: &actual_parsed.site,
        novel_id: &actual_parsed.novel_id,
        chapter_number: resolved_chapter_number,
        chapter_url: &actual_url,
        title: content.title.as_deref(),
        subtitle: content.subtitle.as_deref(),
        original_content: &content.content,
    })
    .await?;

    Ok(PersistedParsedChapter {
        parsed: actual_parsed,
        content,
        chapter_number: resolved_chapter_number,
        content_hash: persisted.content_hash,
    })
}

#[tauri::command]
pub async fn parse_chapter(url: String) -> Result<ParseChapterResult, String> {
    let PersistedParsedChapter {
        parsed,
        content,
        chapter_number,
        content_hash,
    } = fetch_and_persist_chapter(&url).await?;
    let paragraphs = extract_paragraphs(&content.content);

    Ok(ParseChapterResult {
        site: parsed.site,
        novel_id: parsed.novel_id,
        chapter_number,
        title: content.title.unwrap_or_default(),
        subtitle: content.subtitle.unwrap_or_default(),
        paragraphs,
        content_hash,
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

fn has_explicit_chapter_url(parsed: &ParsedUrl, url: &str) -> bool {
    parsed.chapter.is_some() || (parsed.site == "kakuyomu" && url.contains("/episodes/"))
}
fn kakuyomu_episode_id(url: &str) -> Option<&str> {
    let path = url
        .split('#')
        .next()
        .unwrap_or(url)
        .split('?')
        .next()
        .unwrap_or(url)
        .trim_end_matches('/');
    let (prefix, episode_id) = path.rsplit_once("/episodes/")?;
    (!prefix.is_empty() && !episode_id.is_empty() && !episode_id.contains('/'))
        .then_some(episode_id)
}

fn resolve_explicit_chapter_number(
    parsed: &ParsedUrl,
    url: &str,
    series_info: Option<&SeriesInfo>,
) -> Result<u32, String> {
    if parsed.site == "kakuyomu" {
        let episode_id = kakuyomu_episode_id(url)
            .ok_or_else(|| "Kakuyomu 에피소드 URL이 올바르지 않습니다.".to_string())?;
        let mut matches = series_info
            .into_iter()
            .flat_map(|info| info.chapters.iter())
            .filter(|chapter| kakuyomu_episode_id(&chapter.url) == Some(episode_id));
        let chapter = matches
            .next()
            .ok_or_else(|| "목차에서 Kakuyomu 에피소드 순서를 확인할 수 없습니다.".to_string())?;
        if matches.next().is_some() {
            return Err("Kakuyomu 목차에 중복된 에피소드 URL이 있습니다.".to_string());
        }
        return Ok(chapter.number);
    }

    if let Some(chapter_number) = parsed.chapter {
        return Ok(chapter_number);
    }

    series_info
        .and_then(|info| info.chapters.iter().find(|chapter| chapter.url == url))
        .map(|chapter| chapter.number)
        .ok_or_else(|| {
            "목차에서 챕터 순서를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.".to_string()
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
    fn kakuyomu_small_episode_id_uses_series_order_instead_of_id() {
        let parsed = ParsedUrl {
            site: "kakuyomu".to_string(),
            novel_id: "822139846571948770".to_string(),
            chapter: Some(101),
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
                    url:
                        "https://kakuyomu.jp/works/822139846571948770/episodes/99999999999999999999"
                            .to_string(),
                    title: Some("셋째 화".to_string()),
                    status: "pending".to_string(),
                },
            ],
        };

        assert_eq!(
            resolve_explicit_chapter_number(
                &parsed,
                "https://kakuyomu.jp/works/822139846571948770/episodes/101/?utm_source=test#section",
                Some(&series_info),
            )
            .expect("series order"),
            2
        );
    }

    #[test]
    fn kakuyomu_episode_without_series_order_is_rejected() {
        let parsed = ParsedUrl {
            site: "kakuyomu".to_string(),
            novel_id: "822139846571948770".to_string(),
            chapter: None,
        };

        assert!(resolve_explicit_chapter_number(
            &parsed,
            "https://kakuyomu.jp/works/822139846571948770/episodes/99999999999999999999",
            None,
        )
        .is_err());
    }
    #[test]
    fn extract_paragraphs_groups_lines_separated_by_empty_source_paragraphs() {
        let paragraphs = extract_paragraphs(
            r#"<p>一段落目。</p>
<p>一段落目の続き。</p>
<p><br></p>
<p>二段落目。</p>
<p></p>
<p>三段落目。</p>
<p>三段落目の続き。</p>"#,
        );

        assert_eq!(
            paragraphs,
            vec![
                "一段落目。\n一段落目の続き。".to_string(),
                "二段落目。".to_string(),
                "三段落目。\n三段落目の続き。".to_string(),
            ]
        );
    }

    #[test]
    fn extract_paragraphs_keeps_each_p_when_there_are_no_empty_separators() {
        let paragraphs = extract_paragraphs(
            r#"<p>一段落目。</p>
<p>二段落目。</p>"#,
        );

        assert_eq!(
            paragraphs,
            vec!["一段落目。".to_string(), "二段落目。".to_string()]
        );
    }
}
