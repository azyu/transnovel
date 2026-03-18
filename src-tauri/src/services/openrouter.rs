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

const OPENROUTER_API_BASE: &str = "https://openrouter.ai/api/v1";

#[derive(Debug, Serialize)]
struct OpenRouterRequest {
    model: String,
    messages: Vec<Message>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    stream: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct OpenRouterResponse {
    choices: Option<Vec<Choice>>,
    error: Option<OpenRouterError>,
    #[allow(dead_code)]
    usage: Option<UsageInfo>,
}

#[derive(Debug, Deserialize)]
struct UsageInfo {
    prompt_tokens: Option<u32>,
    completion_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: Option<MessageContent>,
    delta: Option<DeltaContent>,
}

#[derive(Debug, Deserialize)]
struct MessageContent {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DeltaContent {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterError {
    message: String,
}

#[derive(Debug, Deserialize)]
struct StreamEvent {
    choices: Option<Vec<Choice>>,
    usage: Option<UsageInfo>,
}

pub struct OpenRouterClient {
    client: Client,
    api_key: String,
    pub model: String,
    base_url: String,
}

impl OpenRouterClient {
    pub fn new(api_key: String, model: Option<String>) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: model.unwrap_or_else(|| "anthropic/claude-sonnet-4".to_string()),
            base_url: OPENROUTER_API_BASE.to_string(),
        }
    }

    pub fn new_with_base_url(api_key: String, model: Option<String>, base_url: Option<String>) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: model.unwrap_or_else(|| "claude-sonnet-4-20250514".to_string()),
            base_url: base_url.unwrap_or_else(|| OPENROUTER_API_BASE.to_string()),
        }
    }

    fn build_request(&self, prompt: &str, stream: bool) -> OpenRouterRequest {
        let max_tokens = Some(65536);
        
        OpenRouterRequest {
            model: self.model.clone(),
            messages: vec![Message {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
            max_tokens,
            temperature: Some(0.7),
            stream: Some(stream),
        }
    }

    pub async fn translate(
        &self,
        paragraphs: &[String],
        original_indices: &[usize],
        has_subtitle: bool,
        system_prompt: &str,
    ) -> Result<Vec<String>, String> {
        let path = "/v1/chat/completions";
        let url = format!(
            "{}{}",
            self.base_url
                .trim_end_matches("/v1")
                .trim_end_matches('/'),
            path
        );

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
        let request = self.build_request(&full_prompt, false);
        let request_json = serde_json::to_string(&request).unwrap_or_default();

        let mut log_entry =
            ApiLogEntry::new("POST", &url, "OpenRouter", "OpenAI", Some(self.model.clone()));
        log_entry.request_body = Some(request_json);

        let start = Instant::now();

        let response = match self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .header("HTTP-Referer", "https://transnovel.app")
            .header("X-Title", "TransNovel")
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

        let response_text = response.text().await.unwrap_or_default();
        log_entry.duration_ms = start.elapsed().as_millis() as u64;
        log_entry.response_body = Some(response_text.clone());

        if !status.is_success() {
            eprintln!("[OpenRouter] API error ({}): {}", status, response_text);
            log_entry.error = Some(format!("HTTP {}", status));
            let entry = log_entry;
            let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
            return Err(format!("API 오류 ({}): {}", status, response_text));
        }

        let openrouter_response: OpenRouterResponse = serde_json::from_str(&response_text)
            .map_err(|e| format!("응답 파싱 실패: {}", e))?;

        if let Some(ref usage) = openrouter_response.usage {
            log_entry.input_tokens = usage.prompt_tokens;
            log_entry.output_tokens = usage.completion_tokens;
        }

        if let Some(error) = openrouter_response.error {
            log_entry.error = Some(error.message.clone());
            let entry = log_entry;
            let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
            return Err(format!("OpenRouter 오류: {}", error.message));
        }

        let entry = log_entry;
        let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });

        let text = openrouter_response
            .choices
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.message)
            .and_then(|m| m.content)
            .ok_or("응답에서 텍스트를 찾을 수 없습니다.")?;

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
        let path = "/v1/chat/completions";
        let url = format!(
            "{}{}",
            self.base_url
                .trim_end_matches("/v1")
                .trim_end_matches('/'),
            path
        );

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
        let request = self.build_request(&full_prompt, true);

        let request_json = serde_json::to_string_pretty(&request).unwrap_or_default();
        let _ = app_handle.emit(
            "debug-api",
            serde_json::json!({
                "type": "request",
                "provider": "openrouter",
                "model": &self.model,
                "body": request_json
            }),
        );

        let mut log_entry =
            ApiLogEntry::new("POST", &url, "OpenRouter", "OpenAI", Some(self.model.clone()));
        log_entry.request_body = Some(request_json);

        let start = Instant::now();

        let response = match self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .header("HTTP-Referer", "https://transnovel.app")
            .header("X-Title", "TransNovel")
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
            let _ = app_handle.emit(
                "debug-api",
                serde_json::json!({
                    "type": "response",
                    "provider": "openrouter",
                    "status": status.as_u16(),
                    "body": &error_text
                }),
            );
            log_entry.duration_ms = start.elapsed().as_millis() as u64;
            log_entry.response_body = Some(error_text.clone());
            log_entry.error = Some(format!("HTTP {}", status));
            let entry = log_entry;
            let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
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

                if line.is_empty() || line.starts_with(':') {
                    continue;
                }

                if let Some(data) = line.strip_prefix("data: ") {
                    if data.trim() == "[DONE]" {
                        continue;
                    }

                    if let Ok(event) = serde_json::from_str::<StreamEvent>(data) {
                        if let Some(usage) = event.usage {
                            final_usage = Some(TokenUsage {
                                input_tokens: usage.prompt_tokens.unwrap_or(0),
                                output_tokens: usage.completion_tokens.unwrap_or(0),
                            });
                        }
                        if let Some(choices) = event.choices {
                            if let Some(choice) = choices.into_iter().next() {
                                if let Some(delta) = choice.delta {
                                    if let Some(content) = delta.content {
                                        full_text.push_str(&content);

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
        }

        log_entry.duration_ms = start.elapsed().as_millis() as u64;
        log_entry.response_body = Some(full_text.clone());
        if let Some(ref usage) = final_usage {
            log_entry.input_tokens = Some(usage.input_tokens);
            log_entry.output_tokens = Some(usage.output_tokens);
        }
        let entry = log_entry;
        let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });

        let _ = app_handle.emit(
            "debug-api",
            serde_json::json!({
                "type": "response",
                "provider": "openrouter",
                "status": 200,
                "body": &full_text
            }),
        );

        let result =
            parse_translated_paragraphs_by_indices(&full_text, original_indices, has_subtitle)?;
        Ok((result, final_usage))
    }
}
