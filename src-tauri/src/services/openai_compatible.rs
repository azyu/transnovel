#![allow(clippy::let_underscore_future)]

use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

use super::api_logger;
use super::paragraph::{
    accept_streamed_chunk, encode_paragraph_id, extract_completed_paragraphs,
    parse_translated_paragraphs_by_indices,
};
use super::sse::{parse_sse_data_line, SseLineBuffer};
use super::translator::{StreamingCacheWriter, TokenUsage};
use crate::models::api_log::ApiLogEntry;

const OPENROUTER_API_BASE: &str = "https://openrouter.ai/api/v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProviderVariant {
    OpenRouter,
    OpenAICompatible,
}

fn build_chat_completions_url(base_url: &str) -> String {
    format!(
        "{}{}",
        base_url.trim_end_matches("/v1").trim_end_matches('/'),
        "/v1/chat/completions"
    )
}

fn should_send_openrouter_headers(variant: ProviderVariant) -> bool {
    matches!(variant, ProviderVariant::OpenRouter)
}

fn provider_brand_name(variant: ProviderVariant) -> &'static str {
    match variant {
        ProviderVariant::OpenRouter => "OpenRouter",
        ProviderVariant::OpenAICompatible => "OpenAI-Compatible",
    }
}

#[derive(Debug, Serialize)]
struct OpenRouterRequest {
    model: String,
    messages: Vec<Message>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    stream: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::{
        build_chat_completions_url, provider_brand_name, should_send_openrouter_headers,
        OpenAICompatibleClient, OpenAiCompatibleStreamParser, ProviderVariant,
    };

    #[test]
    fn builds_chat_completions_url_from_root_or_v1_base() {
        assert_eq!(
            build_chat_completions_url("https://example.com"),
            "https://example.com/v1/chat/completions"
        );
        assert_eq!(
            build_chat_completions_url("https://example.com/"),
            "https://example.com/v1/chat/completions"
        );
        assert_eq!(
            build_chat_completions_url("https://example.com/v1"),
            "https://example.com/v1/chat/completions"
        );
    }

    #[test]
    fn only_openrouter_uses_openrouter_headers() {
        assert!(should_send_openrouter_headers(ProviderVariant::OpenRouter));
        assert!(!should_send_openrouter_headers(ProviderVariant::OpenAICompatible));
    }

    #[test]
    fn reports_brand_name_from_variant() {
        assert_eq!(provider_brand_name(ProviderVariant::OpenRouter), "OpenRouter");
        assert_eq!(
            provider_brand_name(ProviderVariant::OpenAICompatible),
            "OpenAI-Compatible"
        );
    }

    #[tokio::test]
    async fn invalid_custom_base_url_returns_configuration_error() {
        let client = OpenAICompatibleClient::new_with_base_url(
            "test-key".to_string(),
            Some("test-model".to_string()),
            Some("not a URL".to_string()),
            "Custom".to_string(),
            "custom".to_string(),
        );

        let error = client
            .generate_text("test prompt")
            .await
            .expect_err("invalid URL should fail while building request");

        assert!(error.starts_with("API 요청 구성 실패:"));
    }

    #[test]
    fn decodes_multibyte_utf8_and_crlf_split_across_chunks() {
        let payload = concat!(
            ": keepalive\r\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"<p id=\\\"title\\\">한국어\"}}]}\r\n\r\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\" 제목 😀</p>\"}}],\"usage\":{\"prompt_tokens\":15,\"completion_tokens\":25}}\r\n\r\n",
            "data: [DONE]\r\n",
        )
        .as_bytes();

        let han_pos = payload
            .windows(3)
            .position(|w| w == "한".as_bytes())
            .expect("korean bytes present");
        let crlf_pos = payload
            .windows(4)
            .position(|w| w == b"\r\n\r\n")
            .expect("double crlf present");

        let chunks = [
            &payload[..han_pos + 1],
            &payload[han_pos + 1..han_pos + 2],
            &payload[han_pos + 2..crlf_pos + 1],
            &payload[crlf_pos + 1..crlf_pos + 3],
            &payload[crlf_pos + 3..],
        ];

        let mut parser = OpenAiCompatibleStreamParser::new();
        let mut full_text = String::new();
        let mut usage = None;

        for chunk in chunks {
            for delta in parser.push_chunk(chunk) {
                if let Some(u) = delta.usage {
                    usage = Some(u);
                }
                if let Some(t) = delta.text {
                    full_text.push_str(&t);
                }
            }
        }
        if let Some(delta) = parser.finish() {
            if let Some(u) = delta.usage {
                usage = Some(u);
            }
            if let Some(t) = delta.text {
                full_text.push_str(&t);
            }
        }

        assert_eq!(full_text, "<p id=\"title\">한국어 제목 😀</p>");
        let usage = usage.expect("usage parsed");
        assert_eq!(usage.input_tokens, 15);
        assert_eq!(usage.output_tokens, 25);
    }

    #[test]
    fn decodes_one_byte_chunks_and_unterminated_final_line() {
        let payload = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"한글\"}}]}\r\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"과 日本語\"}}]}",
        )
        .as_bytes();

        let mut parser = OpenAiCompatibleStreamParser::new();
        let mut full_text = String::new();

        for byte in payload {
            for delta in parser.push_chunk(&[*byte]) {
                if let Some(t) = delta.text {
                    full_text.push_str(&t);
                }
            }
        }
        if let Some(delta) = parser.finish() {
            if let Some(t) = delta.text {
                full_text.push_str(&t);
            }
        }

        assert_eq!(full_text, "한글과 日本語");
    }
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

pub struct OpenAICompatibleClient {
    client: Client,
    api_key: String,
    pub model: String,
    base_url: String,
    provider_variant: ProviderVariant,
    provider_name: String,
    debug_provider: String,
}

impl OpenAICompatibleClient {
    pub fn new_openrouter(api_key: String, model: Option<String>) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: model.unwrap_or_else(|| "anthropic/claude-sonnet-4".to_string()),
            base_url: OPENROUTER_API_BASE.to_string(),
            provider_variant: ProviderVariant::OpenRouter,
            provider_name: provider_brand_name(ProviderVariant::OpenRouter).to_string(),
            debug_provider: "openrouter".to_string(),
        }
    }

    pub fn new_with_base_url(
        api_key: String,
        model: Option<String>,
        base_url: Option<String>,
        provider_name: String,
        debug_provider: String,
    ) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: model.unwrap_or_else(|| "claude-sonnet-4-20250514".to_string()),
            base_url: base_url.unwrap_or_else(|| OPENROUTER_API_BASE.to_string()),
            provider_variant: ProviderVariant::OpenAICompatible,
            provider_name,
            debug_provider,
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

    fn build_url(&self) -> String {
        build_chat_completions_url(&self.base_url)
    }

    fn with_provider_headers(
        &self,
        request: reqwest::RequestBuilder,
    ) -> reqwest::RequestBuilder {
        if should_send_openrouter_headers(self.provider_variant) {
            request
                .header("HTTP-Referer", "https://transnovel.app")
                .header("X-Title", "TransNovel")
        } else {
            request
        }
    }

    pub async fn generate_text(&self, prompt: &str) -> Result<String, String> {
        let url = self.build_url();

        let request = self.build_request(prompt, false);
        let request_json = serde_json::to_string(&request).unwrap_or_default();

        let mut log_entry =
            ApiLogEntry::new("POST", &url, &self.provider_name, "OpenAI", Some(self.model.clone()));
        log_entry.request_body = Some(request_json);

        let start = Instant::now();
        let response = match self.with_provider_headers(self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
        )
            .send()
            .await
        {
            Ok(resp) => resp,
            Err(e) => {
                log_entry.duration_ms = start.elapsed().as_millis() as u64;
                log_entry.error = Some(e.to_string());
                let entry = log_entry;
                let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
                let prefix = if e.is_builder() || e.is_redirect() {
                    "API 요청 구성 실패"
                } else {
                    "API 요청 실패"
                };
                return Err(format!("{}: {}", prefix, e));
            }
        };

        let status = response.status();
        log_entry.status = status.as_u16();
        let response_text = if status.is_success() {
            response
                .text()
                .await
                .map_err(|e| format!("응답 읽기 실패: {}", e))?
        } else {
            response.text().await.unwrap_or_default()
        };
        log_entry.duration_ms = start.elapsed().as_millis() as u64;
        log_entry.response_body = Some(response_text.clone());

        if !status.is_success() {
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
            return Err(format!("{} 오류: {}", self.provider_name, error.message));
        }

        let text = openrouter_response
            .choices
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.message)
            .and_then(|m| m.content)
            .ok_or("응답에서 텍스트를 찾을 수 없습니다.")?;

        let entry = log_entry;
        let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });

        Ok(text)
    }

    pub async fn translate(
        &self,
        paragraphs: &[String],
        original_indices: &[usize],
        has_subtitle: bool,
        system_prompt: &str,
    ) -> Result<Vec<String>, String> {
        let url = self.build_url();

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
            ApiLogEntry::new("POST", &url, &self.provider_name, "OpenAI", Some(self.model.clone()));
        log_entry.request_body = Some(request_json);

        let start = Instant::now();

        let response = match self.with_provider_headers(self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
        )
            .send()
            .await
        {
            Ok(resp) => resp,
            Err(e) => {
                log_entry.duration_ms = start.elapsed().as_millis() as u64;
                log_entry.error = Some(e.to_string());
                let entry = log_entry;
                let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
                let prefix = if e.is_builder() || e.is_redirect() {
                    "API 요청 구성 실패"
                } else {
                    "API 요청 실패"
                };
                return Err(format!("{}: {}", prefix, e));
            }
        };

        let status = response.status();
        log_entry.status = status.as_u16();

        let response_text = if status.is_success() {
            response
                .text()
                .await
                .map_err(|e| format!("응답 읽기 실패: {}", e))?
        } else {
            response.text().await.unwrap_or_default()
        };
        log_entry.duration_ms = start.elapsed().as_millis() as u64;
        log_entry.response_body = Some(response_text.clone());

        if !status.is_success() {
            eprintln!("[{}] API error ({}): {}", self.provider_name, status, response_text);
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
            return Err(format!("{} 오류: {}", self.provider_name, error.message));
        }

        let entry = log_entry;
        let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });

        let text = openrouter_response
            .choices
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.message)
            .and_then(|m| m.content)
            .ok_or("응답에서 텍스트를 찾을 수 없습니다.")?;

        parse_translated_paragraphs_by_indices(&text, original_indices, has_subtitle)
    }

    pub async fn translate_streaming<R: tauri::Runtime>(
        &self,
        paragraphs: &[String],
        original_indices: &[usize],
        has_subtitle: bool,
        system_prompt: &str,
        cache_writer: &mut StreamingCacheWriter,
        app_handle: &AppHandle<R>,
    ) -> Result<(Vec<String>, Option<TokenUsage>), String> {
        let url = self.build_url();

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
                "provider": &self.debug_provider,
                "model": &self.model,
                "body": request_json
            }),
        );

        let mut log_entry =
            ApiLogEntry::new("POST", &url, &self.provider_name, "OpenAI", Some(self.model.clone()));
        log_entry.request_body = Some(request_json);

        let start = Instant::now();

        let response = match self.with_provider_headers(self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
        )
            .send()
            .await
        {
            Ok(resp) => resp,
            Err(e) => {
                log_entry.duration_ms = start.elapsed().as_millis() as u64;
                log_entry.error = Some(e.to_string());
                let entry = log_entry;
                let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
                let prefix = if e.is_builder() || e.is_redirect() {
                    "API 요청 구성 실패"
                } else {
                    "API 요청 실패"
                };
                return Err(format!("{}: {}", prefix, e));
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
                    "provider": &self.debug_provider,
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
        let mut parser = OpenAiCompatibleStreamParser::new();
        let mut emitted_indices = std::collections::HashSet::new();
        let mut final_usage: Option<TokenUsage> = None;

        while let Some(chunk) = stream.next().await {
            let chunk = match chunk {
                Ok(chunk) => chunk,
                Err(e) => {
                    let prefix = if emitted_indices.is_empty() {
                        "스트림 읽기 실패"
                    } else {
                        "부분 스트림 읽기 실패"
                    };
                    return Err(format!("{}: {}", prefix, e));
                }
            };

            for delta in parser.push_chunk(&chunk) {
                apply_openai_compatible_delta(
                    delta,
                    &mut full_text,
                    &mut final_usage,
                    original_indices,
                    has_subtitle,
                    &mut emitted_indices,
                    cache_writer,
                    app_handle,
                )
                .await;
            }
        }

        if let Some(delta) = parser.finish() {
            apply_openai_compatible_delta(
                delta,
                &mut full_text,
                &mut final_usage,
                original_indices,
                has_subtitle,
                &mut emitted_indices,
                cache_writer,
                app_handle,
            )
            .await;
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
                "provider": &self.debug_provider,
                "status": 200,
                "body": &full_text
            }),
        );

        let result =
            parse_translated_paragraphs_by_indices(&full_text, original_indices, has_subtitle)?;
        Ok((result, final_usage))
    }
}

#[derive(Debug, Default)]
struct OpenAiCompatibleStreamDelta {
    text: Option<String>,
    usage: Option<TokenUsage>,
}

#[derive(Debug, Default)]
struct OpenAiCompatibleStreamParser {
    line_buffer: SseLineBuffer,
}

impl OpenAiCompatibleStreamParser {
    fn new() -> Self {
        Self::default()
    }

    fn push_chunk(&mut self, chunk: &[u8]) -> Vec<OpenAiCompatibleStreamDelta> {
        self.line_buffer
            .push_chunk(chunk)
            .into_iter()
            .filter_map(|line| Self::parse_line(&line))
            .collect()
    }

    fn finish(&mut self) -> Option<OpenAiCompatibleStreamDelta> {
        self.line_buffer
            .finish()
            .and_then(|line| Self::parse_line(&line))
    }

    fn parse_line(line: &str) -> Option<OpenAiCompatibleStreamDelta> {
        if line.is_empty() || line.starts_with(':') {
            return None;
        }

        let data = parse_sse_data_line(line)?;
        if data.trim() == "[DONE]" {
            return None;
        }

        let event = serde_json::from_str::<StreamEvent>(data).ok()?;
        let usage = event.usage.map(|usage| TokenUsage {
            input_tokens: usage.prompt_tokens.unwrap_or(0),
            output_tokens: usage.completion_tokens.unwrap_or(0),
        });
        let text = event
            .choices
            .and_then(|choices| choices.into_iter().next())
            .and_then(|choice| choice.delta)
            .and_then(|delta| delta.content)
            .filter(|content| !content.is_empty());

        if text.is_none() && usage.is_none() {
            return None;
        }

        Some(OpenAiCompatibleStreamDelta { text, usage })
    }
}

#[allow(clippy::too_many_arguments)]
async fn apply_openai_compatible_delta<R: tauri::Runtime>(
    delta: OpenAiCompatibleStreamDelta,
    full_text: &mut String,
    final_usage: &mut Option<TokenUsage>,
    original_indices: &[usize],
    has_subtitle: bool,
    emitted_indices: &mut std::collections::HashSet<usize>,
    cache_writer: &mut StreamingCacheWriter,
    app_handle: &AppHandle<R>,
) {
    if let Some(usage) = delta.usage {
        *final_usage = Some(usage);
    }

    if let Some(content) = delta.text {
        full_text.push_str(&content);

        let chunks = extract_completed_paragraphs(full_text);
        for chunk in chunks {
            if let Some(chunk) =
                accept_streamed_chunk(chunk, original_indices, has_subtitle, emitted_indices)
            {
                cache_writer.cache_completed_chunk(&chunk).await;
                let _ = app_handle.emit("translation-chunk", chunk);
            }
        }
    }
}
