use serde::Serialize;
use std::collections::HashSet;

#[derive(Clone, Serialize)]
pub struct TranslationChunk {
    pub paragraph_id: String,
    pub text: String,
    pub is_complete: bool,
}

/// Encode paragraph index to semantic ID:
/// - Index 0 → "title"
/// - Index 1 → "subtitle" (only if has_subtitle is true)
/// - Remaining → "p-1", "p-2", ... (1-indexed paragraph numbers)
///
/// When has_subtitle is false:
/// - Index 0 → "title"
/// - Index 1+ → "p-1", "p-2", ...
pub fn encode_paragraph_id(n: usize, has_subtitle: bool) -> String {
    match n {
        0 => "title".to_string(),
        1 if has_subtitle => "subtitle".to_string(),
        _ => {
            let paragraph_num = if has_subtitle { n - 1 } else { n };
            format!("p-{}", paragraph_num)
        }
    }
}

/// Decode semantic ID back to paragraph index:
/// - "title" → 0
/// - "subtitle" → 1 (only when has_subtitle is true)
/// - "p-N" (N >= 1) → N (when has_subtitle is false) or N + 1 (when has_subtitle is true)
pub fn decode_paragraph_id(id: &str, has_subtitle: bool) -> Option<usize> {
    match id {
        "title" => Some(0),
        "subtitle" if has_subtitle => Some(1),
        "subtitle" => None,
        _ if id.starts_with("p-") => {
            let paragraph_num = id[2..].parse::<usize>().ok()?;
            if paragraph_num == 0 {
                return None;
            }
            if has_subtitle {
                paragraph_num.checked_add(1)
            } else {
                Some(paragraph_num)
            }
        }
        _ => None,
    }
}

pub fn extract_completed_paragraphs(text: &str) -> Vec<TranslationChunk> {
    let open_re = regex::Regex::new(r#"<p id="(title|subtitle|p-\d+)">"#).unwrap();
    let mut chunks = Vec::new();

    let matches: Vec<_> = open_re.find_iter(text).collect();
    for (i, m) in matches.iter().enumerate() {
        let cap = open_re.captures(&text[m.start()..]).unwrap();
        let id = cap.get(1).unwrap().as_str();
        let content_start = m.end();
        let remaining = &text[content_start..];

        if let Some(next_match) = matches.get(i + 1) {
            // Next <p tag exists → this paragraph is complete
            let span = next_match.start() - content_start;
            let content_end =
                content_start + find_paragraph_end(&remaining[..span]).unwrap_or(span);
            let content = text[content_start..content_end].trim().to_string();
            chunks.push(TranslationChunk {
                paragraph_id: id.to_string(),
                text: content,
                is_complete: true,
            });
        } else if let Some(end) = find_paragraph_end(remaining) {
            // Last paragraph — only complete once terminated; otherwise still streaming
            chunks.push(TranslationChunk {
                paragraph_id: id.to_string(),
                text: remaining[..end].trim().to_string(),
                is_complete: true,
            });
        }
    }

    chunks
}

/// Offset of the earliest paragraph terminator (`</p>` or `</main>`), shared by streaming
/// extraction and final parsing so both cut a paragraph at the same place.
fn find_paragraph_end(s: &str) -> Option<usize> {
    [s.find("</p>"), s.find("</main>")]
        .into_iter()
        .flatten()
        .min()
}

/// Accepts a streamed chunk only if it is non-empty, its decoded index was requested,
/// and no non-empty chunk for that index has been emitted yet, returning it with the
/// canonical ID (`p-01` → `p-1`) so UI, cache, and final parse agree.
pub fn accept_streamed_chunk(
    mut chunk: TranslationChunk,
    original_indices: &[usize],
    has_subtitle: bool,
    emitted_indices: &mut HashSet<usize>,
) -> Option<TranslationChunk> {
    if chunk.text.trim().is_empty() {
        return None;
    }
    let index = decode_paragraph_id(&chunk.paragraph_id, has_subtitle)?;
    if !original_indices.contains(&index) || !emitted_indices.insert(index) {
        return None;
    }
    chunk.paragraph_id = encode_paragraph_id(index, has_subtitle);
    Some(chunk)
}

#[cfg(test)]
pub fn parse_translated_paragraphs(
    text: &str,
    expected_count: usize,
    has_subtitle: bool,
) -> Result<Vec<String>, String> {
    let sequential_indices: Vec<usize> = (0..expected_count).collect();
    parse_translated_paragraphs_by_indices(text, &sequential_indices, has_subtitle)
}

pub fn parse_translated_paragraphs_by_indices(
    text: &str,
    original_indices: &[usize],
    has_subtitle: bool,
) -> Result<Vec<String>, String> {
    // Match opening tag and capture content until closing </p> or start of next <p (for malformed HTML)
    let open_re = regex::Regex::new(r#"<p id="(title|subtitle|p-\d+)">"#).unwrap();

    let mut results: Vec<String> = vec![String::new(); original_indices.len()];
    let mut found_count = 0;
    // First non-empty occurrence wins, matching streaming emission and cache
    // (`accept_streamed_chunk`). `matched` tracks whether any requested tag was seen
    // so an empty-only paragraph still succeeds at parse time and is reported as failed
    // downstream rather than failing the whole chunk.
    let mut matched = vec![false; original_indices.len()];

    let matches: Vec<_> = open_re.find_iter(text).collect();
    for (i, m) in matches.iter().enumerate() {
        let cap = open_re.captures(&text[m.start()..]).unwrap();
        let id = cap.get(1).unwrap().as_str();
        let content_start = m.end();

        // Find content end: either </p>, next <p, or </main>
        let remaining = &text[content_start..];
        let content_end = content_start
            + match matches.get(i + 1) {
                Some(next_match) => {
                    let span = next_match.start() - content_start;
                    find_paragraph_end(&remaining[..span]).unwrap_or(span)
                }
                None => find_paragraph_end(remaining).unwrap_or(remaining.len()),
            };

        let content = text[content_start..content_end].trim().to_string();

        if let Some(decoded_index) = decode_paragraph_id(id, has_subtitle) {
            if let Some(pos) = original_indices.iter().position(|&x| x == decoded_index) {
                if !matched[pos] {
                    matched[pos] = true;
                    found_count += 1;
                }
                if results[pos].is_empty() && !content.is_empty() {
                    results[pos] = content;
                }
            }
        }
    }

    if found_count == 0 {
        let preview: String = text.chars().take(200).collect();
        return Err(format!(
            "응답에서 유효한 번역 태그를 찾을 수 없습니다. 응답 미리보기: {}...",
            preview
        ));
    }

    if found_count < original_indices.len() {
        eprintln!(
            "[Translation] 일부 문단 누락: {}/{} 파싱됨",
            found_count,
            original_indices.len()
        );
        for (pos, (idx, result)) in original_indices.iter().zip(results.iter()).enumerate() {
            if result.is_empty() {
                eprintln!(
                    "[Translation] 누락된 문단: pos={}, original_idx={}",
                    pos, idx
                );
            }
        }
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_decode_paragraph_id() {
        assert_eq!(encode_paragraph_id(0, true), "title");
        assert_eq!(encode_paragraph_id(1, true), "subtitle");
        assert_eq!(encode_paragraph_id(2, true), "p-1");
        assert_eq!(encode_paragraph_id(3, true), "p-2");
        assert_eq!(encode_paragraph_id(10, true), "p-9");
        assert_eq!(encode_paragraph_id(102, true), "p-101");

        assert_eq!(encode_paragraph_id(0, false), "title");
        assert_eq!(encode_paragraph_id(1, false), "p-1");
        assert_eq!(encode_paragraph_id(2, false), "p-2");
        assert_eq!(encode_paragraph_id(3, false), "p-3");
        assert_eq!(encode_paragraph_id(10, false), "p-10");

        for i in 0..200 {
            let encoded_with = encode_paragraph_id(i, true);
            let decoded_with = decode_paragraph_id(&encoded_with, true);
            assert_eq!(
                decoded_with,
                Some(i),
                "Failed for index {} with subtitle: encoded as '{}'",
                i,
                encoded_with
            );

            let encoded_without = encode_paragraph_id(i, false);
            let decoded_without = decode_paragraph_id(&encoded_without, false);
            assert_eq!(
                decoded_without,
                Some(i),
                "Failed for index {} without subtitle: encoded as '{}'",
                i,
                encoded_without
            );
        }
    }

    #[test]
    fn test_parse_normal_paragraphs() {
        let text = r#"<p id="title">제목입니다.</p>
<p id="subtitle">부제목입니다.</p>
<p id="p-1">첫 번째 문단입니다.</p>"#;

        let result = parse_translated_paragraphs(text, 3, true).unwrap();
        assert_eq!(result.len(), 3);
        assert_eq!(result[0], "제목입니다.");
        assert_eq!(result[1], "부제목입니다.");
        assert_eq!(result[2], "첫 번째 문단입니다.");
    }

    #[test]
    fn test_parse_paragraphs_with_less_than_symbol() {
        let text = r#"<p id="title">a < b 인 경우</p>
<p id="subtitle">x > y 이면서 y < z</p>
<p id="p-1">정상 문단</p>"#;

        let result = parse_translated_paragraphs(text, 3, true).unwrap();

        assert_eq!(result.len(), 3);
        assert_eq!(result[0], "a < b 인 경우");
        assert_eq!(result[1], "x > y 이면서 y < z");
        assert_eq!(result[2], "정상 문단");
    }

    #[test]
    fn test_extract_completed_paragraphs_streaming() {
        let partial1 = r#"<p id="title">완료된 문단</p>
<p id="subtitle">아직 진행"#;

        let chunks1 = extract_completed_paragraphs(partial1);
        assert_eq!(chunks1.len(), 1);
        assert_eq!(chunks1[0].paragraph_id, "title");

        let partial2 = r#"<p id="title">완료된 문단</p>
<p id="subtitle">아직 진행 중</p>"#;

        let chunks2 = extract_completed_paragraphs(partial2);
        assert_eq!(chunks2.len(), 2);
    }

    #[test]
    fn test_parse_with_skipped_paragraphs() {
        let text = r#"<p id="title">첫 번째</p>
<p id="p-1">세 번째</p>
<p id="p-2">네 번째</p>"#;

        let result = parse_translated_paragraphs(text, 4, true).unwrap();

        assert_eq!(result.len(), 4);
        assert_eq!(result[0], "첫 번째");
        assert_eq!(result[1], "");
        assert_eq!(result[2], "세 번째");
        assert_eq!(result[3], "네 번째");
    }

    #[test]
    fn duplicate_paragraph_ids_keep_first_occurrence_like_streaming() {
        let text = r#"<p id="title">제목</p><p id="p-1">OLD</p><p id="p-1">NEW</p></main>"#;

        let streamed: Vec<_> = extract_completed_paragraphs(text)
            .into_iter()
            .filter(|chunk| chunk.paragraph_id == "p-1")
            .collect();
        assert_eq!(streamed[0].text, "OLD");

        let result = parse_translated_paragraphs_by_indices(text, &[0, 1], false).unwrap();
        assert_eq!(result, vec!["제목".to_string(), "OLD".to_string()]);
    }

    #[test]
    fn duplicate_paragraph_id_with_empty_first_occurrence_keeps_first_non_empty() {
        let text = r#"<p id="p-1"></p><p id="p-1">번역문</p><p id="p-1">후속</p></main>"#;
        let mut emitted = HashSet::new();

        let streamed: Vec<_> = extract_completed_paragraphs(text)
            .into_iter()
            .filter_map(|chunk| accept_streamed_chunk(chunk, &[0, 1], false, &mut emitted))
            .map(|chunk| (chunk.paragraph_id, chunk.text))
            .collect();
        assert_eq!(streamed, vec![("p-1".to_string(), "번역문".to_string())]);

        let result = parse_translated_paragraphs_by_indices(text, &[0, 1], false).unwrap();
        assert_eq!(result, vec![String::new(), "번역문".to_string()]);
    }

    #[test]
    fn empty_only_paragraph_still_returns_empty_slot_for_failure_reporting() {
        let text = r#"<p id="p-1"></p></main>"#;
        let mut emitted = HashSet::new();

        let streamed: Vec<_> = extract_completed_paragraphs(text)
            .into_iter()
            .filter_map(|chunk| accept_streamed_chunk(chunk, &[1], false, &mut emitted))
            .collect();
        assert!(streamed.is_empty());

        let result = parse_translated_paragraphs_by_indices(text, &[1], false).unwrap();
        assert_eq!(result, vec![String::new()]);
    }

    #[test]
    fn out_of_scope_multibyte_response_returns_err_without_panicking() {
        let body = "가".repeat(80);
        let text = format!(r#"<p id="p-1">{body}</p></main>"#);

        let error = parse_translated_paragraphs_by_indices(&text, &[3, 7], false)
            .expect_err("unrequested paragraph must return Err instead of panicking");
        assert!(error.contains("응답에서 유효한 번역 태그를 찾을 수 없습니다"));
    }

    #[test]
    fn zero_paragraph_id_is_rejected_and_does_not_shadow_title_or_subtitle() {
        assert_eq!(decode_paragraph_id("p-0", false), None);
        assert_eq!(decode_paragraph_id("p-0", true), None);
        assert_eq!(decode_paragraph_id("p-00", false), None);
        assert_eq!(decode_paragraph_id("p-00", true), None);

        // Without subtitle: p-0 must not shadow title (index 0).
        let no_sub_text = r#"<p id="p-0">잘못된 문단</p><p id="title">정상 제목</p></main>"#;
        let mut emitted_no_sub = HashSet::new();
        let streamed_no_sub: Vec<_> = extract_completed_paragraphs(no_sub_text)
            .into_iter()
            .filter_map(|chunk| accept_streamed_chunk(chunk, &[0], false, &mut emitted_no_sub))
            .map(|chunk| (chunk.paragraph_id, chunk.text))
            .collect();
        assert_eq!(
            streamed_no_sub,
            vec![("title".to_string(), "정상 제목".to_string())]
        );
        assert_eq!(
            parse_translated_paragraphs_by_indices(no_sub_text, &[0], false).unwrap(),
            vec!["정상 제목".to_string()]
        );

        // With subtitle: p-0 must not shadow subtitle (index 1).
        let with_sub_text = r#"<p id="p-0">잘못된 문단</p><p id="subtitle">정상 부제목</p></main>"#;
        let mut emitted_with_sub = HashSet::new();
        let streamed_with_sub: Vec<_> = extract_completed_paragraphs(with_sub_text)
            .into_iter()
            .filter_map(|chunk| accept_streamed_chunk(chunk, &[1], true, &mut emitted_with_sub))
            .map(|chunk| (chunk.paragraph_id, chunk.text))
            .collect();
        assert_eq!(
            streamed_with_sub,
            vec![("subtitle".to_string(), "정상 부제목".to_string())]
        );
        assert_eq!(
            parse_translated_paragraphs_by_indices(with_sub_text, &[1], true).unwrap(),
            vec!["정상 부제목".to_string()]
        );
    }

    #[test]
    fn test_parse_by_indices_non_sequential() {
        let text = r#"<p id="p-4">다섯 번째</p>
<p id="p-6">일곱 번째</p>
<p id="p-8">아홉 번째</p>"#;

        let original_indices = vec![5, 6, 7, 8, 9];
        let result = parse_translated_paragraphs_by_indices(text, &original_indices, true).unwrap();

        assert_eq!(result.len(), 5);
        assert_eq!(result[0], "다섯 번째");
        assert_eq!(result[1], "");
        assert_eq!(result[2], "일곱 번째");
        assert_eq!(result[3], "");
        assert_eq!(result[4], "아홉 번째");
    }

    #[test]
    fn test_encode_without_subtitle_scenario() {
        // given: syosetu chapter without subtitle (title + paragraphs only)
        // when: encoding with has_subtitle = false
        // then: index 0 = title, index 1+ = p-1, p-2, ...

        assert_eq!(encode_paragraph_id(0, false), "title");
        assert_eq!(encode_paragraph_id(1, false), "p-1");
        assert_eq!(encode_paragraph_id(2, false), "p-2");
        assert_eq!(encode_paragraph_id(3, false), "p-3");

        // given: same syosetu chapter (2 items: title + 1 paragraph)
        // when: backend sends [title, para1] with has_subtitle = false
        // then: IDs should be ["title", "p-1"]
        let items = ["タイトル", "最初の段落"];
        let ids: Vec<String> = items
            .iter()
            .enumerate()
            .map(|(i, _)| encode_paragraph_id(i, false))
            .collect();
        assert_eq!(ids, vec!["title", "p-1"]);
    }

    #[test]
    fn test_encode_with_subtitle_scenario() {
        // given: hameln chapter with subtitle (title + subtitle + paragraphs)
        // when: encoding with has_subtitle = true
        // then: index 0 = title, index 1 = subtitle, index 2+ = p-1, p-2, ...

        assert_eq!(encode_paragraph_id(0, true), "title");
        assert_eq!(encode_paragraph_id(1, true), "subtitle");
        assert_eq!(encode_paragraph_id(2, true), "p-1");
        assert_eq!(encode_paragraph_id(3, true), "p-2");

        // given: hameln chapter (3 items: title + subtitle + 1 paragraph)
        // when: backend sends [title, subtitle, para1] with has_subtitle = true
        // then: IDs should be ["title", "subtitle", "p-1"]
        let items = ["タイトル", "サブタイトル", "最初の段落"];
        let ids: Vec<String> = items
            .iter()
            .enumerate()
            .map(|(i, _)| encode_paragraph_id(i, true))
            .collect();
        assert_eq!(ids, vec!["title", "subtitle", "p-1"]);
    }

    #[test]
    fn test_parse_malformed_html_missing_closing_p_tag() {
        // given: AI model outputs malformed HTML where </p> is missing
        // and the paragraph ends with </main> instead
        let text = r#"<p id="title">제목</p>
<p id="subtitle">부제목</p>
<p id="p-1">마지막 문단</main> </main>"#;

        // when: parsing the malformed output
        let result = parse_translated_paragraphs(text, 3, true).unwrap();

        // then: all paragraphs should still be extracted
        assert_eq!(result.len(), 3);
        assert_eq!(result[0], "제목");
        assert_eq!(result[1], "부제목");
        assert_eq!(result[2], "마지막 문단");
    }

    #[test]
    fn test_parse_malformed_html_missing_closing_p_before_next() {
        // given: AI model forgot to close a <p> tag before starting the next one
        let text = r#"<p id="title">제목</p>
<p id="subtitle">부제목<p id="p-1">세 번째 문단</p>"#;

        // when: parsing the malformed output
        let result = parse_translated_paragraphs(text, 3, true).unwrap();

        // then: all paragraphs should still be extracted
        assert_eq!(result.len(), 3);
        assert_eq!(result[0], "제목");
        assert_eq!(result[1], "부제목");
        assert_eq!(result[2], "세 번째 문단");
    }

    #[test]
    fn test_extract_completed_paragraphs_no_closing_tags() {
        // given: model outputs without </p> tags (Codex/GPT-5.2 pattern)
        let text = r#"<p id="title">제목
<p id="subtitle">부제목
<p id="p-1">첫 번째 문단
<p id="p-2">두 번째 문단</main>"#;

        let chunks = extract_completed_paragraphs(text);
        // All 4 paragraphs should be extracted
        assert_eq!(chunks.len(), 4);
        assert_eq!(chunks[0].paragraph_id, "title");
        assert_eq!(chunks[0].text, "제목");
        assert_eq!(chunks[1].paragraph_id, "subtitle");
        assert_eq!(chunks[1].text, "부제목");
        assert_eq!(chunks[2].paragraph_id, "p-1");
        assert_eq!(chunks[2].text, "첫 번째 문단");
        assert_eq!(chunks[3].paragraph_id, "p-2");
        assert_eq!(chunks[3].text, "두 번째 문단");
    }

    #[test]
    fn test_extract_completed_paragraphs_no_closing_tags_streaming() {
        // given: streaming partial — last paragraph has no terminator yet
        let text = r#"<p id="title">제목
<p id="subtitle">부제목
<p id="p-1">아직 진행 중"#;

        let chunks = extract_completed_paragraphs(text);
        // Only first 2 should be extracted; p-1 is still streaming (no next <p or </main>)
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].paragraph_id, "title");
        assert_eq!(chunks[0].text, "제목");
        assert_eq!(chunks[1].paragraph_id, "subtitle");
        assert_eq!(chunks[1].text, "부제목");
    }

    #[test]
    fn test_extract_completed_paragraphs_mixed_tags() {
        // given: mix of </p> and no </p> — some paragraphs have closing tags, some don't
        let text = r#"<p id="title">제목</p>
<p id="subtitle">부제목
<p id="p-1">첫 번째</p>
<p id="p-2">두 번째</main>"#;

        let chunks = extract_completed_paragraphs(text);
        assert_eq!(chunks.len(), 4);
        assert_eq!(chunks[0].text, "제목");
        assert_eq!(chunks[1].text, "부제목");
        assert_eq!(chunks[2].text, "첫 번째");
        assert_eq!(chunks[3].text, "두 번째");
    }

    #[test]
    fn main_terminator_closes_paragraph_before_next_tag_like_streaming() {
        let frame_1 = r#"<p id="title">T</p><p id="p-1">OLD</main>"#;
        let frame_2 = format!(r#"{frame_1}<p id="p-1">NEW</p>"#);

        assert_eq!(extract_completed_paragraphs(frame_1)[1].text, "OLD");
        assert_eq!(extract_completed_paragraphs(&frame_2)[1].text, "OLD");
        let result = parse_translated_paragraphs_by_indices(&frame_2, &[0, 1], false).unwrap();
        assert_eq!(result, vec!["T".to_string(), "OLD".to_string()]);
    }

    #[test]
    fn accept_streamed_chunk_dedups_by_index_and_drops_unrequested_ids() {
        let text = r#"<p id="p-1">OLD</p><p id="p-01">NEW</p><p id="p-9">OUT</p><p id="subtitle">S</p></main>"#;
        let mut emitted = HashSet::new();

        let accepted: Vec<_> = extract_completed_paragraphs(text)
            .into_iter()
            .filter_map(|chunk| accept_streamed_chunk(chunk, &[0, 1], false, &mut emitted))
            .map(|chunk| (chunk.paragraph_id, chunk.text))
            .collect();

        assert_eq!(accepted, vec![("p-1".to_string(), "OLD".to_string())]);
    }

    #[test]
    fn accept_streamed_chunk_canonicalizes_padded_ids() {
        let mut emitted = HashSet::new();
        let chunk = TranslationChunk {
            paragraph_id: "p-01".to_string(),
            text: "NEW".to_string(),
            is_complete: true,
        };

        let accepted = accept_streamed_chunk(chunk, &[2], true, &mut emitted).unwrap();
        assert_eq!(accepted.paragraph_id, "p-1");
    }

    #[test]
    fn non_contiguous_indices_parse_same_as_streaming() {
        // Retry of p-7 alone (no subtitle) plus a partial-cache gap at p-3.
        let text = r#"<p id="p-3">셋</p><p id="p-7">일곱</p></main>"#;
        let indices = [3, 7];
        let mut emitted = HashSet::new();

        let streamed: Vec<String> = extract_completed_paragraphs(text)
            .into_iter()
            .filter_map(|chunk| accept_streamed_chunk(chunk, &indices, false, &mut emitted))
            .map(|chunk| chunk.text)
            .collect();
        let parsed = parse_translated_paragraphs_by_indices(text, &indices, false).unwrap();

        assert_eq!(parsed, vec!["셋".to_string(), "일곱".to_string()]);
        assert_eq!(parsed, streamed);
    }
}
