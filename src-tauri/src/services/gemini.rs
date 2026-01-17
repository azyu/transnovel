use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::cache::cache_translation;

const GEMINI_API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";

#[derive(Debug, Serialize)]
struct GeminiRequest {
    contents: Vec<Content>,
    #[serde(rename = "generationConfig")]
    generation_config: GenerationConfig,
    #[serde(rename = "safetySettings")]
    safety_settings: Vec<SafetySetting>,
}

#[derive(Debug, Serialize)]
struct Content {
    role: String,
    parts: Vec<Part>,
}

#[derive(Debug, Serialize)]
struct Part {
    text: String,
}

#[derive(Debug, Serialize)]
struct GenerationConfig {
    temperature: f32,
    #[serde(rename = "topP")]
    top_p: f32,
    #[serde(rename = "maxOutputTokens")]
    max_output_tokens: u32,
}

#[derive(Debug, Serialize)]
struct SafetySetting {
    category: String,
    threshold: String,
}

#[derive(Debug, Deserialize)]
struct GeminiResponse {
    candidates: Option<Vec<Candidate>>,
    error: Option<GeminiError>,
}

#[derive(Debug, Deserialize)]
struct Candidate {
    content: Option<CandidateContent>,
    #[serde(rename = "finishReason")]
    _finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CandidateContent {
    parts: Vec<ResponsePart>,
}

#[derive(Debug, Deserialize)]
struct ResponsePart {
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GeminiError {
    message: String,
    _status: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct TranslationChunk {
    pub paragraph_id: String,
    pub text: String,
    pub is_complete: bool,
}

pub struct GeminiClient {
    client: Client,
    api_keys: Vec<String>,
    current_key_index: usize,
    pub model: String,
}

impl GeminiClient {
    pub fn new(api_keys: Vec<String>, model: Option<String>) -> Self {
        Self {
            client: Client::new(),
            api_keys,
            current_key_index: 0,
            model: model.unwrap_or_else(|| "gemini-2.5-flash-preview-05-20".to_string()),
        }
    }

    fn get_next_api_key(&mut self) -> Result<&str, String> {
        if self.api_keys.is_empty() {
            return Err("API 키가 설정되지 않았습니다.".to_string());
        }

        let key = &self.api_keys[self.current_key_index];
        self.current_key_index = (self.current_key_index + 1) % self.api_keys.len();
        Ok(key)
    }

    fn build_safety_settings() -> Vec<SafetySetting> {
        vec![
            "HARM_CATEGORY_HARASSMENT",
            "HARM_CATEGORY_HATE_SPEECH",
            "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            "HARM_CATEGORY_DANGEROUS_CONTENT",
            "HARM_CATEGORY_CIVIC_INTEGRITY",
        ]
        .into_iter()
        .map(|category| SafetySetting {
            category: category.to_string(),
            threshold: "OFF".to_string(),
        })
        .collect()
    }

    fn build_request(&self, prompt: &str) -> GeminiRequest {
        GeminiRequest {
            contents: vec![Content {
                role: "user".to_string(),
                parts: vec![Part { text: prompt.to_string() }],
            }],
            generation_config: GenerationConfig {
                temperature: 1.0,
                top_p: 0.8,
                max_output_tokens: 65536,
            },
            safety_settings: Self::build_safety_settings(),
        }
    }

    pub async fn translate(
        &mut self,
        paragraphs: &[String],
        system_prompt: &str,
    ) -> Result<Vec<String>, String> {
        let api_key = self.get_next_api_key()?.to_string();

        let url = format!(
            "{}/models/{}:generateContent?key={}",
            GEMINI_API_BASE, self.model, api_key
        );

        let numbered_text = paragraphs
            .iter()
            .enumerate()
            .map(|(i, p)| format!("<p id=\"{}\">{}</p>", encode_paragraph_id(i), p))
            .collect::<Vec<_>>()
            .join("\n");

        let full_prompt = format!("{}\n\n{}", system_prompt, numbered_text);
        let request = self.build_request(&full_prompt);

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("API 요청 실패: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("API 오류 ({}): {}", status, error_text));
        }

        let gemini_response: GeminiResponse = response
            .json()
            .await
            .map_err(|e| format!("응답 파싱 실패: {}", e))?;

        if let Some(error) = gemini_response.error {
            return Err(format!("Gemini 오류: {}", error.message));
        }

        let text = gemini_response
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.content)
            .and_then(|c| c.parts.into_iter().next())
            .and_then(|p| p.text)
            .ok_or("응답에서 텍스트를 찾을 수 없습니다.")?;

        parse_translated_paragraphs(&text, paragraphs.len())
    }

    pub async fn translate_streaming<R: tauri::Runtime>(
        &mut self,
        novel_id: &str,
        paragraphs: &[String],
        original_indices: &[usize],
        system_prompt: &str,
        app_handle: &AppHandle<R>,
    ) -> Result<Vec<String>, String> {
        let api_key = self.get_next_api_key()?.to_string();

        let url = format!(
            "{}/models/{}:streamGenerateContent?alt=sse&key={}",
            GEMINI_API_BASE, self.model, api_key
        );

        let numbered_text = paragraphs
            .iter()
            .zip(original_indices.iter())
            .map(|(p, &idx)| format!("<p id=\"{}\">{}</p>", encode_paragraph_id(idx), p))
            .collect::<Vec<_>>()
            .join("\n");

        let full_prompt = format!("{}\n\n{}", system_prompt, numbered_text);
        let request = self.build_request(&full_prompt);

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("API 요청 실패: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("API 오류 ({}): {}", status, error_text));
        }

        let mut full_text = String::new();
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut emitted_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("스트림 읽기 실패: {}", e))?;
            let chunk_str = String::from_utf8_lossy(&chunk);
            buffer.push_str(&chunk_str);

            while let Some(pos) = buffer.find("\n\n") {
                let line = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                if let Some(data) = line.strip_prefix("data: ") {
                    if let Ok(response) = serde_json::from_str::<GeminiResponse>(data) {
                        if let Some(text) = response
                            .candidates
                            .and_then(|c| c.into_iter().next())
                            .and_then(|c| c.content)
                            .and_then(|c| c.parts.into_iter().next())
                            .and_then(|p| p.text)
                        {
                            full_text.push_str(&text);
                            
                            let chunks = extract_completed_paragraphs(&full_text);
                            for chunk in chunks {
                                if !emitted_ids.contains(&chunk.paragraph_id) {
                                    emitted_ids.insert(chunk.paragraph_id.clone());
                                    
                                    if let Some(orig_idx) = decode_paragraph_id(&chunk.paragraph_id) {
                                        if let Some(pos) = original_indices.iter().position(|&x| x == orig_idx) {
                                            if pos < paragraphs.len() {
                                                let _ = cache_translation(novel_id, &paragraphs[pos], &chunk.text).await;
                                            }
                                        }
                                    }
                                    
                                    let _ = app_handle.emit("translation-chunk", chunk);
                                }
                            }
                        }
                    }
                }
            }
        }

        parse_translated_paragraphs_by_indices(&full_text, original_indices)
    }
}

fn extract_completed_paragraphs(text: &str) -> Vec<TranslationChunk> {
    let re = regex::Regex::new(r#"(?s)<p id="([A-Za-z]+)">(.*?)</p>"#).unwrap();
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

pub fn encode_paragraph_id(n: usize) -> String {
    if n >= 2756 {
        let adjusted = n - 2756;
        format!(
            "{}{}",
            encode_paragraph_id(adjusted / 2704),
            encode_paragraph_id(adjusted % 2704 + 52)
        )
    } else if n < 26 {
        char::from_u32((n + 65) as u32).unwrap().to_string()
    } else if n < 52 {
        char::from_u32((n + 71) as u32).unwrap().to_string()
    } else {
        let adjusted = n - 52;
        let first = adjusted / 52;
        let second = adjusted % 52;
        format!(
            "{}{}",
            char::from_u32((first + if first < 26 { 65 } else { 71 }) as u32).unwrap(),
            char::from_u32((second + if second < 26 { 65 } else { 71 }) as u32).unwrap()
        )
    }
}

pub fn parse_translated_paragraphs(text: &str, expected_count: usize) -> Result<Vec<String>, String> {
    let sequential_indices: Vec<usize> = (0..expected_count).collect();
    parse_translated_paragraphs_by_indices(text, &sequential_indices)
}

pub fn parse_translated_paragraphs_by_indices(text: &str, original_indices: &[usize]) -> Result<Vec<String>, String> {
    let re = regex::Regex::new(r#"(?s)<p id="([A-Za-z]+)">(.*?)</p>"#).unwrap();

    let mut results: Vec<String> = vec![String::new(); original_indices.len()];
    let mut found_count = 0;

    for cap in re.captures_iter(text) {
        if let (Some(id_match), Some(content_match)) = (cap.get(1), cap.get(2)) {
            let id = id_match.as_str();
            let content = content_match.as_str().to_string();

            if let Some(decoded_index) = decode_paragraph_id(id) {
                if let Some(pos) = original_indices.iter().position(|&x| x == decoded_index) {
                    results[pos] = content;
                    found_count += 1;
                }
            }
        }
    }

    if found_count == 0 {
        return Ok(vec![text.to_string()]);
    }

    Ok(results)
}

fn decode_paragraph_id(id: &str) -> Option<usize> {
    let chars: Vec<char> = id.chars().collect();

    if chars.is_empty() || chars.len() > 6 {
        return None;
    }

    let decode_char = |c: char| -> Option<usize> {
        if c.is_ascii_uppercase() {
            Some((c as usize) - 65)
        } else if c.is_ascii_lowercase() {
            Some((c as usize) - 71)
        } else {
            None
        }
    };

    match chars.len() {
        1 => decode_char(chars[0]),
        2 => {
            let first = decode_char(chars[0])?;
            let second = decode_char(chars[1])?;
            Some(52 + first * 52 + second)
        }
        _ => {
            let prefix_len = chars.len() - 2;
            let prefix: String = chars[..prefix_len].iter().collect();
            let suffix_first = decode_char(chars[prefix_len])?;
            let suffix_second = decode_char(chars[prefix_len + 1])?;
            let prefix_value = decode_paragraph_id(&prefix)?;
            Some(2756 + prefix_value * 2704 + suffix_first * 52 + suffix_second)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_decode_paragraph_id() {
        // Single uppercase letters (0-25)
        assert_eq!(encode_paragraph_id(0), "A");
        assert_eq!(encode_paragraph_id(25), "Z");
        
        // Single lowercase letters (26-51)
        assert_eq!(encode_paragraph_id(26), "a");
        assert_eq!(encode_paragraph_id(51), "z");
        
        // Two-letter IDs (52+)
        assert_eq!(encode_paragraph_id(52), "AA");
        assert_eq!(encode_paragraph_id(53), "AB");
        
        // Verify round-trip
        for i in 0..200 {
            let encoded = encode_paragraph_id(i);
            let decoded = decode_paragraph_id(&encoded);
            assert_eq!(decoded, Some(i), "Failed for index {}: encoded as '{}'", i, encoded);
        }
    }

    #[test]
    fn test_parse_normal_paragraphs() {
        let text = r#"<p id="A">첫 번째 문단입니다.</p>
<p id="B">두 번째 문단입니다.</p>
<p id="C">세 번째 문단입니다.</p>"#;
        
        let result = parse_translated_paragraphs(text, 3).unwrap();
        assert_eq!(result.len(), 3);
        assert_eq!(result[0], "첫 번째 문단입니다.");
        assert_eq!(result[1], "두 번째 문단입니다.");
        assert_eq!(result[2], "세 번째 문단입니다.");
    }

    #[test]
    fn test_parse_paragraphs_with_less_than_symbol() {
        // This test demonstrates the bug: content with '<' character fails to parse
        let text = r#"<p id="A">a < b 인 경우</p>
<p id="B">x > y 이면서 y < z</p>
<p id="C">정상 문단</p>"#;
        
        let result = parse_translated_paragraphs(text, 3).unwrap();
        
        // BUG: Current regex [^<]* cannot match content containing '<'
        // After fix, these assertions should pass:
        assert_eq!(result.len(), 3, "Should parse all 3 paragraphs");
        assert_eq!(result[0], "a < b 인 경우", "First paragraph with '<' should be parsed");
        assert_eq!(result[1], "x > y 이면서 y < z", "Second paragraph with '<' should be parsed");
        assert_eq!(result[2], "정상 문단", "Normal paragraph should be parsed");
    }

    #[test]
    fn test_parse_paragraphs_with_math_expressions() {
        let text = r#"<p id="A">조건: 0 < x < 10</p>
<p id="B">결과: y >= 5</p>"#;
        
        let result = parse_translated_paragraphs(text, 2).unwrap();
        
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], "조건: 0 < x < 10");
        assert_eq!(result[1], "결과: y >= 5");
    }

    #[test]
    fn test_extract_completed_paragraphs_with_less_than() {
        let text = r#"<p id="A">HP < 50이면 위험</p>
<p id="B">MP가 충분하다</p>"#;
        
        let chunks = extract_completed_paragraphs(text);
        
        assert_eq!(chunks.len(), 2, "Should extract 2 paragraphs");
        assert_eq!(chunks[0].paragraph_id, "A");
        assert_eq!(chunks[0].text, "HP < 50이면 위험");
        assert_eq!(chunks[1].paragraph_id, "B");
        assert_eq!(chunks[1].text, "MP가 충분하다");
    }

    #[test]
    fn test_extract_completed_paragraphs_streaming_simulation() {
        // Simulate streaming: text arrives incrementally
        let partial1 = r#"<p id="A">완료된 문단</p>
<p id="B">아직 진행"#;
        
        let chunks1 = extract_completed_paragraphs(partial1);
        assert_eq!(chunks1.len(), 1, "Only completed paragraph should be extracted");
        assert_eq!(chunks1[0].paragraph_id, "A");
        
        // More text arrives
        let partial2 = r#"<p id="A">완료된 문단</p>
<p id="B">아직 진행 중</p>"#;
        
        let chunks2 = extract_completed_paragraphs(partial2);
        assert_eq!(chunks2.len(), 2, "Both paragraphs now complete");
    }

    #[test]
    fn test_parse_with_special_characters() {
        let text = r#"<p id="A">"인용문" 테스트</p>
<p id="B">괄호(테스트)와 [대괄호]</p>
<p id="C">특수문자: !@#$%^&*()</p>"#;
        
        let result = parse_translated_paragraphs(text, 3).unwrap();
        
        assert_eq!(result.len(), 3);
        assert_eq!(result[0], "\"인용문\" 테스트");
        assert_eq!(result[1], "괄호(테스트)와 [대괄호]");
        assert_eq!(result[2], "특수문자: !@#$%^&*()");
    }

    #[test]
    fn test_parse_empty_response_fallback() {
        // When no valid paragraphs found, return original text
        let text = "번역된 텍스트만 있고 태그가 없는 경우";
        
        let result = parse_translated_paragraphs(text, 1).unwrap();
        
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], text);
    }

    #[test]
    fn test_parse_out_of_order_paragraphs() {
        let text = r#"<p id="C">세 번째</p>
<p id="A">첫 번째</p>
<p id="B">두 번째</p>"#;
        
        let result = parse_translated_paragraphs(text, 3).unwrap();
        
        assert_eq!(result[0], "첫 번째");
        assert_eq!(result[1], "두 번째");
        assert_eq!(result[2], "세 번째");
    }

    #[test]
    fn test_parse_with_skipped_paragraphs() {
        // LLM skips paragraph B (index 1)
        let text = r#"<p id="A">첫 번째</p>
<p id="C">세 번째</p>
<p id="D">네 번째</p>"#;
        
        let result = parse_translated_paragraphs(text, 4).unwrap();
        
        // Should return 4 items with empty string for skipped paragraph
        assert_eq!(result.len(), 4, "Should return expected_count items");
        assert_eq!(result[0], "첫 번째");
        assert_eq!(result[1], "", "Skipped paragraph should be empty");
        assert_eq!(result[2], "세 번째");
        assert_eq!(result[3], "네 번째");
    }

    #[test]
    fn test_parse_with_multiple_skipped_paragraphs() {
        let text = r#"<p id="A">첫 번째</p>
<p id="C">세 번째</p>
<p id="E">다섯 번째</p>"#;
        
        let result = parse_translated_paragraphs(text, 5).unwrap();
        
        assert_eq!(result.len(), 5);
        assert_eq!(result[0], "첫 번째");
        assert_eq!(result[1], "");
        assert_eq!(result[2], "세 번째");
        assert_eq!(result[3], "");
        assert_eq!(result[4], "다섯 번째");
    }

    #[test]
    fn test_parse_by_indices_non_sequential() {
        // Streaming case: original_indices might be [5, 6, 7, 8, 9]
        // IDs will be F, G, H, I, J
        let text = r#"<p id="F">다섯 번째</p>
<p id="H">일곱 번째</p>
<p id="J">아홉 번째</p>"#;
        
        let original_indices = vec![5, 6, 7, 8, 9];
        let result = parse_translated_paragraphs_by_indices(text, &original_indices).unwrap();
        
        assert_eq!(result.len(), 5);
        assert_eq!(result[0], "다섯 번째");
        assert_eq!(result[1], "");
        assert_eq!(result[2], "일곱 번째");
        assert_eq!(result[3], "");
        assert_eq!(result[4], "아홉 번째");
    }
}
