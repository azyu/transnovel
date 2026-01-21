use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::cache::cache_translation;
use super::paragraph::{
    encode_paragraph_id, decode_paragraph_id, extract_completed_paragraphs,
    parse_translated_paragraphs, parse_translated_paragraphs_by_indices,
};

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
    usage: Option<UsageInfo>,
    message: Option<StreamMessage>,
}

#[derive(Debug, Deserialize)]
struct StreamMessage {
    usage: Option<UsageInfo>,
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
        original_indices: &[usize],
        has_subtitle: bool,
        system_prompt: &str,
    ) -> Result<Vec<String>, String> {
        let url = format!("{}/v1/messages", self.base_url);

        let numbered_text = paragraphs
            .iter()
            .zip(original_indices.iter())
            .map(|(p, &idx)| format!("<p id=\"{}\">{}</p>", encode_paragraph_id(idx, has_subtitle), p))
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
                Err(format!("API가 빈 응답을 반환했습니다. (input_tokens: 0 - 콘텐츠 필터링 가능성)\nResponse: {}", response_text))
            } else {
                Err(format!("API가 빈 응답을 반환했습니다. 프록시 인증 상태나 모델 설정을 확인하세요.\nResponse: {}", response_text))
            };
        }

        let text = content_blocks
            .into_iter()
            .find(|b| b.content_type == "text")
            .and_then(|b| b.text)
            .ok_or("응답에 텍스트 블록이 없습니다.")?;

        parse_translated_paragraphs(&text, paragraphs.len(), has_subtitle)
    }

    pub async fn translate_streaming<R: tauri::Runtime>(
        &self,
        novel_id: &str,
        paragraphs: &[String],
        original_indices: &[usize],
        has_subtitle: bool,
        system_prompt: &str,
        app_handle: &AppHandle<R>,
    ) -> Result<Vec<String>, String> {
        let url = format!("{}/v1/messages", self.base_url);

        let numbered_text = paragraphs
            .iter()
            .zip(original_indices.iter())
            .map(|(p, &idx)| format!("<p id=\"{}\">{}</p>", encode_paragraph_id(idx, has_subtitle), p))
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

        let request_json = serde_json::to_string_pretty(&request).unwrap_or_default();
        let _ = app_handle.emit("debug-api", serde_json::json!({
            "type": "request",
            "provider": "antigravity",
            "model": &self.model,
            "body": request_json
        }));

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
            let _ = app_handle.emit("debug-api", serde_json::json!({
                "type": "response",
                "provider": "antigravity",
                "status": status.as_u16(),
                "body": &error_text
            }));
            return Err(format!("API 오류 ({}): {}", status, error_text));
        }

        let mut full_text = String::new();
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut emitted_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut final_usage: Option<(u32, u32)> = None;

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
                        if event.event_type == "message_start" {
                            if let Some(msg) = &event.message {
                                if let Some(usage) = &msg.usage {
                                    final_usage = Some((
                                        usage.input_tokens.unwrap_or(0),
                                        usage.output_tokens.unwrap_or(0),
                                    ));
                                }
                            }
                        } else if event.event_type == "message_delta" {
                            if let Some(usage) = &event.usage {
                                final_usage = Some((
                                    usage.input_tokens.unwrap_or(0),
                                    usage.output_tokens.unwrap_or(0),
                                ));
                            }
                        } else if event.event_type == "content_block_delta" {
                            if let Some(delta) = event.delta {
                                if let Some(text) = delta.text {
                                    full_text.push_str(&text);

                                    let chunks = extract_completed_paragraphs(&full_text);
                                    for chunk in chunks {
                                        if !emitted_ids.contains(&chunk.paragraph_id) {
                                            emitted_ids.insert(chunk.paragraph_id.clone());
                                            
                                            if let Some(orig_idx) = decode_paragraph_id(&chunk.paragraph_id, has_subtitle) {
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
            let usage_info = if let Some((input, output)) = final_usage {
                format!("Usage: {{\"input_tokens\": {}, \"output_tokens\": {}}}", input, output)
            } else {
                "Usage: not available".to_string()
            };
            
            eprintln!("[Antigravity] Streaming returned empty response. {}", usage_info);
            
            let content_filtered = final_usage.is_some_and(|(input, _)| input == 0);
            let filter_hint = if content_filtered {
                " (input_tokens=0 → 콘텐츠 필터링 가능성 높음)"
            } else {
                ""
            };
            
            return Err(format!(
                "API가 빈 응답을 반환했습니다.{}\n{}\nBuffer: {}",
                filter_hint, usage_info, buffer
            ));
        }
        
        let _ = app_handle.emit("debug-api", serde_json::json!({
            "type": "response",
            "provider": "antigravity",
            "status": 200,
            "body": &full_text
        }));

        parse_translated_paragraphs_by_indices(&full_text, original_indices, has_subtitle)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
