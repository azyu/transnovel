#![allow(clippy::let_underscore_future)]

use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

use super::api_logger;
use super::cache::cache_translation;
use super::paragraph::{
    decode_paragraph_id, encode_paragraph_id, extract_completed_paragraphs,
    parse_translated_paragraphs, parse_translated_paragraphs_by_indices,
};
use super::translator::TokenUsage;
use crate::models::api_log::ApiLogEntry;

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
        let path = "/v1/messages";
        let url = format!("{}{}", self.base_url, path);

        let numbered_text = paragraphs
            .iter()
            .zip(original_indices.iter())
            .map(|(p, &idx)| {
                format!(
                    "<p id=\"{}\">{}</p>",
                    encode_paragraph_id(idx, has_subtitle),
                    p
                )
            })
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

        let request_json = serde_json::to_string(&request).unwrap_or_default();
        let mut log_entry =
            ApiLogEntry::new("POST", &url, "Antigravity", "Anthropic", Some(self.model.clone()));
        log_entry.request_body = Some(request_json);

        let start = Instant::now();

        let response = match self
            .client
            .post(&url)
            .header("Authorization", "Bearer test")
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
        {
            Ok(resp) => resp,
            Err(e) => {
                log_entry.duration_ms = start.elapsed().as_millis() as u64;
                log_entry.error = Some(e.to_string());
                let entry = log_entry;
                let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
                return Err(format!("API 요청 실패: {}", e));
            }
        };

        let status = response.status();
        log_entry.status = status.as_u16();

        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            log_entry.duration_ms = start.elapsed().as_millis() as u64;
            log_entry.response_body = Some(error_text.clone());
            log_entry.error = Some(format!("HTTP {}", status));
            let entry = log_entry;
            let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
            return Err(format!("API 오류 ({}): {}", status, error_text));
        }

        let response_text = response
            .text()
            .await
            .map_err(|e| format!("응답 읽기 실패: {}", e))?;

        log_entry.duration_ms = start.elapsed().as_millis() as u64;
        log_entry.response_body = Some(response_text.clone());

        let antigravity_response: AntigravityResponse = serde_json::from_str(&response_text)
            .map_err(|e| format!("응답 파싱 실패: {}", e))?;

        if let Some(ref usage) = antigravity_response.usage {
            log_entry.input_tokens = usage.input_tokens;
            log_entry.output_tokens = usage.output_tokens;
        }

        if let Some(error) = antigravity_response.error {
            log_entry.error = Some(error.message.clone());
            let entry = log_entry;
            let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
            return Err(format!("Antigravity 오류: {}", error.message));
        }

        let content_blocks = antigravity_response.content.unwrap_or_default();
        let is_likely_filtered = log_entry.input_tokens == Some(0);

        if content_blocks.is_empty() {
            eprintln!("[Antigravity] Empty response: {}", response_text);

            let error_msg = if is_likely_filtered {
                format!("API가 빈 응답을 반환했습니다. (input_tokens: 0 - 콘텐츠 필터링 가능성)\nResponse: {}", response_text)
            } else {
                format!("API가 빈 응답을 반환했습니다. 프록시 인증 상태나 모델 설정을 확인하세요.\nResponse: {}", response_text)
            };

            log_entry.error = Some(error_msg.clone());
            let entry = log_entry;
            let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
            return Err(error_msg);
        }

        let entry = log_entry;
        let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });

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
    ) -> Result<(Vec<String>, Option<TokenUsage>), String> {
        let path = "/v1/messages";
        let url = format!("{}{}", self.base_url, path);

        let numbered_text = paragraphs
            .iter()
            .zip(original_indices.iter())
            .map(|(p, &idx)| {
                format!(
                    "<p id=\"{}\">{}</p>",
                    encode_paragraph_id(idx, has_subtitle),
                    p
                )
            })
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
        let _ = app_handle.emit(
            "debug-api",
            serde_json::json!({
                "type": "request",
                "provider": "antigravity",
                "model": &self.model,
                "body": request_json
            }),
        );

        let mut log_entry =
            ApiLogEntry::new("POST", &url, "Antigravity", "Anthropic", Some(self.model.clone()));
        log_entry.request_body = Some(request_json);

        let start = Instant::now();

        let response = match self
            .client
            .post(&url)
            .header("Authorization", "Bearer test")
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
        {
            Ok(resp) => resp,
            Err(e) => {
                log_entry.duration_ms = start.elapsed().as_millis() as u64;
                log_entry.error = Some(e.to_string());
                let entry = log_entry;
                drop(tokio::spawn(async move { api_logger::save_api_log(&entry).await }));
                return Err(format!("API 요청 실패: {}", e));
            }
        };

        let status = response.status();
        log_entry.status = status.as_u16();

        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            let _ = app_handle.emit(
                "debug-api",
                serde_json::json!({
                    "type": "response",
                    "provider": "antigravity",
                    "status": status.as_u16(),
                    "body": &error_text
                }),
            );
            log_entry.duration_ms = start.elapsed().as_millis() as u64;
            log_entry.response_body = Some(error_text.clone());
            log_entry.error = Some(format!("HTTP {}", status));
            let _ = tokio::spawn(async move { api_logger::save_api_log(&log_entry).await });
            return Err(format!("API 오류 ({}): {}", status, error_text));
        }

        let mut full_text = String::new();
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut emitted_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut final_usage: Option<TokenUsage> = None;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("스트림 읽기 실패: {}", e))?;
            let chunk_str = String::from_utf8_lossy(&chunk);
            buffer.push_str(&chunk_str);

            while let Some(pos) = buffer.find('\n') {
                let line = buffer[..pos].to_string();
                buffer = buffer[pos + 1..].to_string();

                if line.is_empty() || line.starts_with("event:") || line.starts_with(':') {
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
                                    final_usage = Some(TokenUsage {
                                        input_tokens: usage.input_tokens.unwrap_or(0),
                                        output_tokens: usage.output_tokens.unwrap_or(0),
                                    });
                                }
                            }
                        } else if event.event_type == "message_delta" {
                            if let Some(usage) = &event.usage {
                                final_usage = Some(TokenUsage {
                                    input_tokens: usage.input_tokens.unwrap_or(0),
                                    output_tokens: usage.output_tokens.unwrap_or(0),
                                });
                            }
                        } else if event.event_type == "content_block_delta" {
                            if let Some(delta) = event.delta {
                                if let Some(text) = delta.text {
                                    full_text.push_str(&text);

                                    let chunks = extract_completed_paragraphs(&full_text);
                                    for chunk in chunks {
                                        if !emitted_ids.contains(&chunk.paragraph_id) {
                                            emitted_ids.insert(chunk.paragraph_id.clone());

                                            if let Some(orig_idx) =
                                                decode_paragraph_id(&chunk.paragraph_id, has_subtitle)
                                            {
                                                if let Some(pos) =
                                                    original_indices.iter().position(|&x| x == orig_idx)
                                                {
                                                    if pos < paragraphs.len() {
                                                        let _ = cache_translation(
                                                            novel_id,
                                                            &paragraphs[pos],
                                                            &chunk.text,
                                                        )
                                                        .await;
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

        log_entry.duration_ms = start.elapsed().as_millis() as u64;
        log_entry.response_body = Some(full_text.clone());
        if let Some(ref usage) = final_usage {
            log_entry.input_tokens = Some(usage.input_tokens);
            log_entry.output_tokens = Some(usage.output_tokens);
        }

        if full_text.is_empty() {
            let usage_info = if let Some(ref usage) = final_usage {
                format!(
                    "Usage: {{\"input_tokens\": {}, \"output_tokens\": {}}}",
                    usage.input_tokens, usage.output_tokens
                )
            } else {
                "Usage: not available".to_string()
            };

            eprintln!(
                "[Antigravity] Streaming returned empty response. {}",
                usage_info
            );

            let content_filtered = final_usage.as_ref().is_some_and(|u| u.input_tokens == 0);
            let filter_hint = if content_filtered {
                " (input_tokens=0 → 콘텐츠 필터링 가능성 높음)"
            } else {
                ""
            };

            let error_msg = format!(
                "API가 빈 응답을 반환했습니다.{}\n{}\nBuffer: {}",
                filter_hint, usage_info, buffer
            );
            log_entry.error = Some(error_msg.clone());
            let _ = tokio::spawn(async move { api_logger::save_api_log(&log_entry).await });
            return Err(error_msg);
        }

        let _ = tokio::spawn(async move { api_logger::save_api_log(&log_entry).await });

        let _ = app_handle.emit(
            "debug-api",
            serde_json::json!({
                "type": "response",
                "provider": "antigravity",
                "status": 200,
                "body": &full_text
            }),
        );

        let result =
            parse_translated_paragraphs_by_indices(&full_text, original_indices, has_subtitle)?;
        Ok((result, final_usage))
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
