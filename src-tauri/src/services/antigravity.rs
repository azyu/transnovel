use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::cache::cache_translation;

pub const ANTIGRAVITY_BASE: &str = "http://localhost:8045";

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
    delta_type: Option<String>,
    text: Option<String>,
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
}

impl AntigravityClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            model: "claude-sonnet-4-5-thinking".to_string(),
        }
    }

    pub fn with_model(mut self, model: &str) -> Self {
        self.model = model.to_string();
        self
    }

    pub async fn check_health(&self) -> bool {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(3))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        
        client
            .get(format!("{}/v1/models", ANTIGRAVITY_BASE))
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
        let url = format!("{}/v1/messages", ANTIGRAVITY_BASE);

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

        let antigravity_response: AntigravityResponse = response
            .json()
            .await
            .map_err(|e| format!("응답 파싱 실패: {}", e))?;

        if let Some(error) = antigravity_response.error {
            return Err(format!("Antigravity 오류: {}", error.message));
        }

        let text = antigravity_response
            .content
            .and_then(|blocks| {
                blocks
                    .into_iter()
                    .find(|b| b.content_type == "text")
                    .and_then(|b| b.text)
            })
            .ok_or("응답에서 텍스트를 찾을 수 없습니다.")?;

        parse_translated_paragraphs(&text, paragraphs.len())
    }

    pub async fn translate_streaming<R: tauri::Runtime>(
        &self,
        paragraphs: &[String],
        original_texts: &[String],
        system_prompt: &str,
        app_handle: &AppHandle<R>,
    ) -> Result<Vec<String>, String> {
        let url = format!("{}/v1/messages", ANTIGRAVITY_BASE);

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

                if line.starts_with("event:") {
                    continue;
                }

                if let Some(data) = line.strip_prefix("data: ") {
                    if let Ok(event) = serde_json::from_str::<StreamEvent>(data) {
                        if event.event_type == "content_block_delta" {
                            if let Some(delta) = event.delta {
                                if let Some(text) = delta.text {
                                    full_text.push_str(&text);

                                    let chunks = extract_completed_paragraphs(&full_text);
                                    for chunk in chunks {
                                        if !emitted_ids.contains(&chunk.paragraph_id) {
                                            emitted_ids.insert(chunk.paragraph_id.clone());
                                            
                                            if let Some(idx) = decode_paragraph_id(&chunk.paragraph_id) {
                                                if idx < original_texts.len() {
                                                    let _ = cache_translation(&original_texts[idx], &chunk.text).await;
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

        let _ = app_handle.emit("translation-complete", true);
        parse_translated_paragraphs(&full_text, paragraphs.len())
    }
}

fn extract_completed_paragraphs(text: &str) -> Vec<TranslationChunk> {
    let re = regex::Regex::new(r#"<p id="([A-Za-z]+)">([^<]*)</p>"#).unwrap();
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
    let re = regex::Regex::new(r#"<p id="([A-Za-z]+)">([^<]*)</p>"#).unwrap();

    let mut results: Vec<(usize, String)> = Vec::new();

    for cap in re.captures_iter(text) {
        if let (Some(id_match), Some(content_match)) = (cap.get(1), cap.get(2)) {
            let id = id_match.as_str();
            let content = content_match.as_str().to_string();

            if let Some(index) = decode_paragraph_id(id) {
                results.push((index, content));
            }
        }
    }

    results.sort_by_key(|(idx, _)| *idx);

    if results.is_empty() {
        return Ok(vec![text.to_string()]);
    }

    Ok(results.into_iter().map(|(_, content)| content).collect())
}

fn decode_paragraph_id(id: &str) -> Option<usize> {
    let chars: Vec<char> = id.chars().collect();

    if chars.is_empty() || chars.len() > 6 {
        return None;
    }

    let mut result = 0usize;

    let first = chars[0];
    if first.is_ascii_uppercase() {
        result = (first as usize) - 65;
    } else if first.is_ascii_lowercase() {
        result = (first as usize) - 71;
    } else {
        return None;
    }

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
