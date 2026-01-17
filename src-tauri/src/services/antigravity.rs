use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::cache::cache_translation;

pub const DEFAULT_ANTIGRAVITY_URL: &str = "http://127.0.0.1:8045";

#[derive(Debug, Serialize)]
struct AntigravityRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

#[derive(Debug, Serialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct AntigravityResponse {
    content: Option<Vec<ContentBlock>>,
    error: Option<AntigravityError>,
    usage: Option<UsageInfo>,
}

#[derive(Debug, Deserialize)]
struct UsageInfo {
    input_tokens: Option<u32>,
    #[allow(dead_code)]
    output_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ContentBlock {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AntigravityError {
    message: String,
}

#[derive(Debug, Deserialize)]
struct StreamEvent {
    #[serde(rename = "type")]
    event_type: String,
    delta: Option<StreamDelta>,
}

#[derive(Debug, Deserialize)]
struct StreamDelta {
    #[serde(rename = "type")]
    #[allow(dead_code)]
    delta_type: Option<String>,
    text: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    thinking: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct TranslationChunk {
    pub paragraph_id: String,
    pub text: String,
    pub is_complete: bool,
}

pub struct AntigravityClient {
    client: Client,
    model: String,
    base_url: String,
}

impl AntigravityClient {
    pub fn new(base_url: Option<String>, model: Option<String>) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(600))
            .build()
            .unwrap_or_else(|_| Client::new());
        
        Self {
            client,
            model: model.unwrap_or_else(|| "claude-sonnet-4-5-20250514".to_string()),
            base_url: base_url.unwrap_or_else(|| DEFAULT_ANTIGRAVITY_URL.to_string()),
        }
    }

    pub async fn check_health(&self) -> bool {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(3))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        
        client
            .get(format!("{}/v1/models", self.base_url))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    pub async fn translate(
        &self,
        paragraphs: &[String],
        system_prompt: &str,
    ) -> Result<Vec<String>, String> {
        let url = format!("{}/v1/messages", self.base_url);

        let numbered_text = paragraphs
            .iter()
            .enumerate()
            .map(|(i, p)| format!("<p id=\"{}\">{}</p>", encode_paragraph_id(i), p))
            .collect::<Vec<_>>()
            .join("\n");

        let full_prompt = format!("{}\n\n{}", system_prompt, numbered_text);

        let request = AntigravityRequest {
            model: self.model.clone(),
            max_tokens: 65536,
            messages: vec![Message {
                role: "user".to_string(),
                content: full_prompt,
            }],
            stream: None,
        };

        let response = self
            .client
            .post(&url)
            .header("Authorization", "Bearer test")
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("API 요청 실패: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("API 오류 ({}): {}", status, error_text));
        }

        let response_text = response
            .text()
            .await
            .map_err(|e| format!("응답 읽기 실패: {}", e))?;

        let antigravity_response: AntigravityResponse = serde_json::from_str(&response_text)
            .map_err(|e| format!("응답 파싱 실패: {}", e))?;

        if let Some(error) = antigravity_response.error {
            return Err(format!("Antigravity 오류: {}", error.message));
        }

        let content_blocks = antigravity_response.content.unwrap_or_default();
        
        if content_blocks.is_empty() {
            eprintln!("[Antigravity] Empty response: {}", response_text);
            
            let is_likely_filtered = antigravity_response
                .usage
                .map(|u| u.input_tokens == Some(0))
                .unwrap_or(false);
            
            return if is_likely_filtered {
                Err("API가 빈 응답을 반환했습니다. (input_tokens: 0 - 콘텐츠 필터링 가능성)".to_string())
            } else {
                Err("API가 빈 응답을 반환했습니다. 프록시 인증 상태나 모델 설정을 확인하세요.".to_string())
            };
        }

        let text = content_blocks
            .into_iter()
            .find(|b| b.content_type == "text")
            .and_then(|b| b.text)
            .ok_or("응답에 텍스트 블록이 없습니다.")?;

        parse_translated_paragraphs(&text, paragraphs.len())
    }

    pub async fn translate_streaming<R: tauri::Runtime>(
        &self,
        novel_id: &str,
        paragraphs: &[String],
        original_indices: &[usize],
        system_prompt: &str,
        app_handle: &AppHandle<R>,
    ) -> Result<Vec<String>, String> {
        let url = format!("{}/v1/messages", self.base_url);

        let numbered_text = paragraphs
            .iter()
            .zip(original_indices.iter())
            .map(|(p, &idx)| format!("<p id=\"{}\">{}</p>", encode_paragraph_id(idx), p))
            .collect::<Vec<_>>()
            .join("\n");

        let full_prompt = format!("{}\n\n{}", system_prompt, numbered_text);

        let request = AntigravityRequest {
            model: self.model.clone(),
            max_tokens: 65536,
            messages: vec![Message {
                role: "user".to_string(),
                content: full_prompt,
            }],
            stream: Some(true),
        };

        let response = self
            .client
            .post(&url)
            .header("Authorization", "Bearer test")
            .header("Content-Type", "application/json")
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

            while let Some(pos) = buffer.find("\n") {
                let line = buffer[..pos].to_string();
                buffer = buffer[pos + 1..].to_string();

                if line.is_empty() || line.starts_with("event:") || line.starts_with(":") {
                    continue;
                }

                if let Some(data) = line.strip_prefix("data: ") {
                    if data.trim() == "[DONE]" {
                        continue;
                    }

                    if let Ok(event) = serde_json::from_str::<StreamEvent>(data) {
                        if event.event_type == "content_block_delta" {
                            if let Some(delta) = event.delta {
                                if let Some(text) = delta.text {
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
            }
        }

        if full_text.is_empty() {
            eprintln!("[Antigravity] Streaming returned empty response");
            return Err("API가 빈 응답을 반환했습니다. 프록시 인증 상태나 모델 설정을 확인하세요.".to_string());
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

fn encode_paragraph_id(n: usize) -> String {
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

fn parse_translated_paragraphs(text: &str, expected_count: usize) -> Result<Vec<String>, String> {
    let sequential_indices: Vec<usize> = (0..expected_count).collect();
    parse_translated_paragraphs_by_indices(text, &sequential_indices)
}

fn parse_translated_paragraphs_by_indices(text: &str, original_indices: &[usize]) -> Result<Vec<String>, String> {
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

    let first = chars[0];
    let mut result = if first.is_ascii_uppercase() {
        (first as usize) - 65
    } else if first.is_ascii_lowercase() {
        (first as usize) - 71
    } else {
        return None;
    };

    for &c in &chars[1..] {
        result = result.checked_mul(52)?.checked_add(1)?;
        if c.is_ascii_uppercase() {
            result = result.checked_add((c as usize) - 65)?;
        } else if c.is_ascii_lowercase() {
            result = result.checked_add((c as usize) - 71)?;
        } else {
            return None;
        }
    }

    Some(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_with_skipped_paragraphs() {
        let text = r#"<p id="A">첫 번째</p>
<p id="C">세 번째</p>
<p id="D">네 번째</p>"#;
        
        let result = parse_translated_paragraphs(text, 4).unwrap();
        
        assert_eq!(result.len(), 4);
        assert_eq!(result[0], "첫 번째");
        assert_eq!(result[1], "");
        assert_eq!(result[2], "세 번째");
        assert_eq!(result[3], "네 번째");
    }

    #[test]
    fn test_parse_by_indices_non_sequential() {
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

    #[test]
    fn test_parse_empty_response_fallback() {
        let text = "번역된 텍스트만 있고 태그가 없는 경우";
        
        let result = parse_translated_paragraphs(text, 1).unwrap();
        
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], text);
    }

    #[test]
    fn test_empty_content_blocks_error() {
        let response = AntigravityResponse {
            content: Some(vec![]),
            error: None,
            usage: None,
        };
        
        let content_blocks = response.content.unwrap_or_default();
        assert!(content_blocks.is_empty());
    }

    #[test]
    fn test_content_block_without_text() {
        let response = AntigravityResponse {
            content: Some(vec![
                ContentBlock {
                    content_type: "thinking".to_string(),
                    text: None,
                }
            ]),
            error: None,
            usage: None,
        };
        
        let content_blocks = response.content.unwrap_or_default();
        let text_block = content_blocks
            .into_iter()
            .find(|b| b.content_type == "text")
            .and_then(|b| b.text);
        
        assert!(text_block.is_none());
    }
}
