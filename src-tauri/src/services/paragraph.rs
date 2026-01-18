use serde::Serialize;

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
/// - "p-N" → N (when has_subtitle is false) or N + 1 (when has_subtitle is true)
pub fn decode_paragraph_id(id: &str, has_subtitle: bool) -> Option<usize> {
    match id {
        "title" => Some(0),
        "subtitle" if has_subtitle => Some(1),
        "subtitle" => None,
        _ if id.starts_with("p-") => {
            let paragraph_num = id[2..].parse::<usize>().ok()?;
            if has_subtitle {
                Some(paragraph_num + 1)
            } else {
                Some(paragraph_num)
            }
        }
        _ => None,
    }
}

pub fn extract_completed_paragraphs(text: &str) -> Vec<TranslationChunk> {
    let re = regex::Regex::new(r#"(?s)<p id="(title|subtitle|p-\d+)">(.*?)</p>"#).unwrap();
    let mut chunks = Vec::new();

    for cap in re.captures_iter(text) {
        if let (Some(id_match), Some(content_match)) = (cap.get(1), cap.get(2)) {
            chunks.push(TranslationChunk {
                paragraph_id: id_match.as_str().to_string(),
                text: content_match.as_str().to_string(),
                is_complete: true,
            });
        }
    }

    chunks
}

pub fn parse_translated_paragraphs(text: &str, expected_count: usize, has_subtitle: bool) -> Result<Vec<String>, String> {
    let sequential_indices: Vec<usize> = (0..expected_count).collect();
    parse_translated_paragraphs_by_indices(text, &sequential_indices, has_subtitle)
}

pub fn parse_translated_paragraphs_by_indices(text: &str, original_indices: &[usize], has_subtitle: bool) -> Result<Vec<String>, String> {
    let re = regex::Regex::new(r#"(?s)<p id="(title|subtitle|p-\d+)">(.*?)</p>"#).unwrap();

    let mut results: Vec<String> = vec![String::new(); original_indices.len()];
    let mut found_count = 0;

    for cap in re.captures_iter(text) {
        if let (Some(id_match), Some(content_match)) = (cap.get(1), cap.get(2)) {
            let id = id_match.as_str();
            let content = content_match.as_str().to_string();

            if let Some(decoded_index) = decode_paragraph_id(id, has_subtitle) {
                if let Some(pos) = original_indices.iter().position(|&x| x == decoded_index) {
                    results[pos] = content;
                    found_count += 1;
                }
            }
        }
    }

    if found_count == 0 {
        let preview = if text.len() > 200 { &text[..200] } else { text };
        return Err(format!(
            "응답에서 유효한 번역 태그를 찾을 수 없습니다. 응답 미리보기: {}...",
            preview
        ));
    }

    if found_count < original_indices.len() {
        eprintln!(
            "[Translation] 일부 문단 누락: {}/{} 파싱됨",
            found_count, original_indices.len()
        );
        for (pos, (idx, result)) in original_indices.iter().zip(results.iter()).enumerate() {
            if result.is_empty() {
                eprintln!("[Translation] 누락된 문단: pos={}, original_idx={}", pos, idx);
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
            assert_eq!(decoded_with, Some(i), "Failed for index {} with subtitle: encoded as '{}'", i, encoded_with);
            
            let encoded_without = encode_paragraph_id(i, false);
            let decoded_without = decode_paragraph_id(&encoded_without, false);
            assert_eq!(decoded_without, Some(i), "Failed for index {} without subtitle: encoded as '{}'", i, encoded_without);
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
        let items = vec!["タイトル", "最初の段落"];
        let ids: Vec<String> = items.iter().enumerate()
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
        let items = vec!["タイトル", "サブタイトル", "最初の段落"];
        let ids: Vec<String> = items.iter().enumerate()
            .map(|(i, _)| encode_paragraph_id(i, true))
            .collect();
        assert_eq!(ids, vec!["title", "subtitle", "p-1"]);
    }
}
