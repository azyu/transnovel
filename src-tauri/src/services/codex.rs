#![allow(clippy::let_underscore_future)]

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
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

const CODEX_API_URL: &str = "https://chatgpt.com/backend-api/codex/responses";
const CODEX_MODELS_URL: &str = "https://chatgpt.com/backend-api/codex/models";
pub const CODEX_MODELS_CLIENT_VERSION: &str = "0.120.0";

// -- Request types --

#[derive(Debug, Serialize)]
struct CodexRequest {
    model: String,
    instructions: String,
    input: Vec<CodexInput>,
    store: bool,
    stream: bool,
}

#[derive(Debug, Serialize)]
struct CodexInput {
    role: String,
    content: Vec<CodexInputContent>,
}

#[derive(Debug, Serialize)]
struct CodexInputContent {
    #[serde(rename = "type")]
    kind: String,
    text: String,
}

// -- Response types --

#[derive(Debug, Deserialize)]
struct CodexUsageInfo {
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct CodexModelInfo {
    pub slug: String,
    pub display_name: String,
    #[serde(default)]
    pub context_window: Option<i64>,
    #[serde(default)]
    pub max_context_window: Option<i64>,
    #[serde(default)]
    visibility: Option<String>,
    #[serde(default)]
    priority: Option<i32>,
}

impl CodexModelInfo {
    pub fn resolved_context_window(&self) -> Option<i64> {
        self.context_window.or(self.max_context_window)
    }

    fn is_visible_in_picker(&self) -> bool {
        self.visibility.as_deref().unwrap_or("list") == "list"
    }
}

#[derive(Debug, Deserialize)]
struct CodexModelsResponse {
    #[serde(default)]
    models: Vec<CodexModelInfo>,
}

pub struct CodexClient {
    client: Client,
    access_token: String,
    pub model: String,
    account_id: Option<String>,
}

/// Extract account_id from JWT access token claims.
/// The Codex OAuth JWT contains `{"https://api.openai.com/auth": {"account_id": "acct_..."}}`.
fn extract_account_id_from_jwt(token: &str) -> Option<String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let payload = parts[1];
    let decoded = URL_SAFE_NO_PAD
        .decode(payload)
        .or_else(|_| {
            let padded = match payload.len() % 4 {
                2 => format!("{}==", payload),
                3 => format!("{}=", payload),
                _ => payload.to_string(),
            };
            URL_SAFE_NO_PAD.decode(&padded)
        })
        .ok()?;
    let json: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    json.get("https://api.openai.com/auth")
        .and_then(|auth| auth.get("account_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

impl CodexClient {
    pub fn new(access_token: String, model: Option<String>) -> Self {
        let account_id = extract_account_id_from_jwt(&access_token);
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .build()
                .unwrap_or_else(|_| Client::new()),
            access_token,
            model: model.unwrap_or_else(|| "gpt-5.1-codex".to_string()),
            account_id,
        }
    }

    fn apply_auth_headers(&self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        let mut builder = builder
            .header("Authorization", format!("Bearer {}", self.access_token))
            .header("originator", "codex_cli_rs")
            .header("version", CODEX_MODELS_CLIENT_VERSION);

        if let Some(ref account_id) = self.account_id {
            builder = builder.header("chatgpt-account-id", account_id);
        }

        builder
    }

    fn build_request(&self, system_prompt: &str, user_text: &str) -> CodexRequest {
        CodexRequest {
            model: self.model.clone(),
            instructions: system_prompt.to_string(),
            input: vec![CodexInput {
                role: "user".to_string(),
                content: vec![CodexInputContent {
                    kind: "input_text".to_string(),
                    text: user_text.to_string(),
                }],
            }],
            store: false,
            stream: true,
        }
    }

    fn build_http_request(&self, request: &CodexRequest) -> reqwest::RequestBuilder {
        self.apply_auth_headers(self.client.post(CODEX_API_URL))
            .header("Content-Type", "application/json")
            .header("Accept", "text/event-stream")
            .json(request)
    }

    pub async fn list_models(&self, client_version: &str) -> Result<Vec<CodexModelInfo>, String> {
        let url = format!("{CODEX_MODELS_URL}?client_version={client_version}");
        let response = self
            .apply_auth_headers(self.client.get(&url))
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("Codex 모델 목록 요청 실패: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Codex 모델 목록 API 오류 ({}): {}", status, error_text));
        }

        let body = response
            .bytes()
            .await
            .map_err(|e| format!("Codex 모델 목록 응답 읽기 실패: {}", e))?;

        parse_codex_models_response(&body)
    }

    pub async fn generate_text(&self, prompt: &str) -> Result<String, String> {
        let request = self.build_request(
            "다음 입력을 처리하고 JSON 또는 일반 텍스트가 필요하면 그대로 반환하세요.",
            prompt,
        );
        let request_json = serde_json::to_string(&request).unwrap_or_default();

        let mut log_entry = ApiLogEntry::new(
            "POST",
            CODEX_API_URL,
            "Codex",
            "Responses",
            Some(self.model.clone()),
        );
        log_entry.request_body = Some(request_json);

        let start = Instant::now();
        let response = match self.build_http_request(&request).send().await {
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

        let body = response
            .text()
            .await
            .map_err(|e| format!("응답 읽기 실패: {}", e))?;

        let mut full_text = String::new();

        for line in body.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                let trimmed = data.trim();
                if trimmed.is_empty() || trimmed == "[DONE]" {
                    continue;
                }
                if let Ok(event) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    if let Some(err_msg) = Self::extract_error(&event) {
                        log_entry.duration_ms = start.elapsed().as_millis() as u64;
                        log_entry.error = Some(err_msg.clone());
                        let entry = log_entry;
                        let _ =
                            tokio::spawn(async move { api_logger::save_api_log(&entry).await });
                        return Err(format!("Codex API 오류: {}", err_msg));
                    }
                    if let Some((text, usage)) = Self::extract_event_text(&event) {
                        let event_type =
                            event.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        match event_type {
                            "response.output_text.delta" => {
                                full_text.push_str(&text);
                            }
                            "response.completed" | "response.done" => {
                                if full_text.is_empty() && !text.is_empty() {
                                    full_text = text;
                                }
                                if let Some(u) = usage {
                                    log_entry.input_tokens = u.input_tokens;
                                    log_entry.output_tokens = u.output_tokens;
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }

        log_entry.duration_ms = start.elapsed().as_millis() as u64;
        log_entry.response_body = Some(full_text.clone());
        let entry = log_entry;
        let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });

        if full_text.is_empty() {
            return Err("응답에서 텍스트를 찾을 수 없습니다.".to_string());
        }

        Ok(full_text)
    }

    /// Extract text from an SSE event value.
    fn extract_event_text(event: &serde_json::Value) -> Option<(String, Option<CodexUsageInfo>)> {
        let event_type = event.get("type").and_then(|v| v.as_str())?;
        match event_type {
            "response.output_text.delta" => {
                let delta = event.get("delta").and_then(|v| v.as_str())?;
                Some((delta.to_string(), None))
            }
            "response.completed" | "response.done" => {
                let response = event.get("response")?;
                let usage = response
                    .get("usage")
                    .and_then(|u| serde_json::from_value::<CodexUsageInfo>(u.clone()).ok());
                // output_text is the full response text
                let text = response
                    .get("output_text")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                // Return empty string for completed if no output_text (usage only)
                Some((text.unwrap_or_default(), usage))
            }
            "response.failed" => {
                let _error_msg = event
                    .get("response")
                    .and_then(|r| r.get("error"))
                    .and_then(|e| e.get("message"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown Codex API error");
                // Signal error via Err path; we use a special marker
                None // Caller should check for response.failed separately
            }
            _ => None,
        }
    }

    /// Check if an SSE event is an error event, returning the error message.
    fn extract_error(event: &serde_json::Value) -> Option<String> {
        let event_type = event.get("type").and_then(|v| v.as_str())?;
        match event_type {
            "error" => event
                .get("message")
                .or_else(|| event.get("error").and_then(|e| e.get("message")))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            "response.failed" => event
                .get("response")
                .and_then(|r| r.get("error"))
                .and_then(|e| e.get("message"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            _ => None,
        }
    }

    pub async fn translate(
        &self,
        paragraphs: &[String],
        original_indices: &[usize],
        has_subtitle: bool,
        system_prompt: &str,
    ) -> Result<Vec<String>, String> {
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

        let request = self.build_request(system_prompt, &numbered_text);
        let request_json = serde_json::to_string(&request).unwrap_or_default();

        let mut log_entry = ApiLogEntry::new(
            "POST",
            CODEX_API_URL,
            "Codex",
            "Responses",
            Some(self.model.clone()),
        );
        log_entry.request_body = Some(request_json);

        let start = Instant::now();

        let response = match self.build_http_request(&request).send().await {
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

        // Collect SSE stream into full text
        let body = response
            .text()
            .await
            .map_err(|e| format!("응답 읽기 실패: {}", e))?;

        let mut full_text = String::new();

        for line in body.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                let trimmed = data.trim();
                if trimmed.is_empty() || trimmed == "[DONE]" {
                    continue;
                }
                if let Ok(event) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    if let Some(err_msg) = Self::extract_error(&event) {
                        log_entry.duration_ms = start.elapsed().as_millis() as u64;
                        log_entry.error = Some(err_msg.clone());
                        let entry = log_entry;
                        let _ =
                            tokio::spawn(async move { api_logger::save_api_log(&entry).await });
                        return Err(format!("Codex API 오류: {}", err_msg));
                    }
                    if let Some((text, usage)) = Self::extract_event_text(&event) {
                        let event_type =
                            event.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        match event_type {
                            "response.output_text.delta" => {
                                full_text.push_str(&text);
                            }
                            "response.completed" | "response.done" => {
                                // Use output_text from completed if we didn't get deltas
                                if full_text.is_empty() && !text.is_empty() {
                                    full_text = text;
                                }
                                if let Some(u) = usage {
                                    log_entry.input_tokens = u.input_tokens;
                                    log_entry.output_tokens = u.output_tokens;
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }

        log_entry.duration_ms = start.elapsed().as_millis() as u64;
        log_entry.response_body = Some(full_text.clone());
        let entry = log_entry;
        let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });

        parse_translated_paragraphs(&full_text, paragraphs.len(), has_subtitle)
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

        let request = self.build_request(system_prompt, &numbered_text);
        let request_json = serde_json::to_string_pretty(&request).unwrap_or_default();

        let _ = app_handle.emit(
            "debug-api",
            serde_json::json!({
                "type": "request",
                "provider": "codex",
                "model": &self.model,
                "body": request_json
            }),
        );

        let mut log_entry = ApiLogEntry::new(
            "POST",
            CODEX_API_URL,
            "Codex",
            "Responses",
            Some(self.model.clone()),
        );
        log_entry.request_body = Some(request_json);

        let start = Instant::now();

        let response = match self.build_http_request(&request).send().await {
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
                    "provider": "codex",
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
                    let trimmed = data.trim();
                    if trimmed == "[DONE]" || trimmed.is_empty() {
                        continue;
                    }

                    if let Ok(event) = serde_json::from_str::<serde_json::Value>(trimmed) {
                        // Check for errors
                        if let Some(err_msg) = Self::extract_error(&event) {
                            let _ = app_handle.emit(
                                "debug-api",
                                serde_json::json!({
                                    "type": "response",
                                    "provider": "codex",
                                    "status": 500,
                                    "body": &err_msg
                                }),
                            );
                            log_entry.duration_ms = start.elapsed().as_millis() as u64;
                            log_entry.error = Some(err_msg.clone());
                            let entry = log_entry;
                            let _ = tokio::spawn(
                                async move { api_logger::save_api_log(&entry).await },
                            );
                            return Err(format!("Codex API 오류: {}", err_msg));
                        }

                        let event_type =
                            event.get("type").and_then(|v| v.as_str()).unwrap_or("");

                        match event_type {
                            "response.output_text.delta" => {
                                if let Some(delta) =
                                    event.get("delta").and_then(|v| v.as_str())
                                {
                                    full_text.push_str(delta);

                                    // Check for completed paragraphs and emit chunks
                                    let chunks = extract_completed_paragraphs(&full_text);
                                    for chunk in chunks {
                                        if !emitted_ids.contains(&chunk.paragraph_id) {
                                            emitted_ids.insert(chunk.paragraph_id.clone());

                                            if let Some(orig_idx) = decode_paragraph_id(
                                                &chunk.paragraph_id,
                                                has_subtitle,
                                            ) {
                                                if let Some(pos) = original_indices
                                                    .iter()
                                                    .position(|&x| x == orig_idx)
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

                                            let _ = app_handle
                                                .emit("translation-chunk", chunk);
                                        }
                                    }
                                }
                            }
                            "response.completed" | "response.done" => {
                                if let Some(response_obj) = event.get("response") {
                                    // Extract usage
                                    if let Some(usage) = response_obj.get("usage") {
                                        if let Ok(u) =
                                            serde_json::from_value::<CodexUsageInfo>(
                                                usage.clone(),
                                            )
                                        {
                                            final_usage = Some(TokenUsage {
                                                input_tokens: u.input_tokens.unwrap_or(0),
                                                output_tokens: u.output_tokens.unwrap_or(0),
                                            });
                                        }
                                    }
                                    // Fallback: use output_text if no deltas received
                                    if full_text.is_empty() {
                                        if let Some(text) = response_obj
                                            .get("output_text")
                                            .and_then(|v| v.as_str())
                                        {
                                            full_text = text.to_string();
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }

        // Final flush: emit any paragraphs not yet emitted during streaming
        let final_chunks = extract_completed_paragraphs(&full_text);
        for chunk in final_chunks {
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
                "provider": "codex",
                "status": 200,
                "body": &full_text
            }),
        );

        let result =
            parse_translated_paragraphs_by_indices(&full_text, original_indices, has_subtitle)?;
        Ok((result, final_usage))
    }
}

fn parse_codex_models_response(body: &[u8]) -> Result<Vec<CodexModelInfo>, String> {
    let models_response: CodexModelsResponse = serde_json::from_slice(body)
        .map_err(|e| format!("Codex 모델 목록 응답 파싱 실패: {}", e))?;

    let mut models: Vec<CodexModelInfo> = models_response
        .models
        .into_iter()
        .filter(CodexModelInfo::is_visible_in_picker)
        .collect();

    models.sort_by_key(|model| model.priority.unwrap_or(i32::MAX));
    Ok(models)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_account_id_from_jwt() {
        // Construct a fake JWT with the expected claim structure
        let header = URL_SAFE_NO_PAD.encode(r#"{"alg":"RS256","typ":"JWT"}"#);
        let payload = URL_SAFE_NO_PAD.encode(
            r#"{"sub":"user123","https://api.openai.com/auth":{"account_id":"acct_test123"}}"#,
        );
        let token = format!("{}.{}.fakesignature", header, payload);

        assert_eq!(
            extract_account_id_from_jwt(&token),
            Some("acct_test123".to_string())
        );
    }

    #[test]
    fn test_extract_account_id_missing_claim() {
        let header = URL_SAFE_NO_PAD.encode(r#"{"alg":"RS256"}"#);
        let payload = URL_SAFE_NO_PAD.encode(r#"{"sub":"user123"}"#);
        let token = format!("{}.{}.sig", header, payload);

        assert_eq!(extract_account_id_from_jwt(&token), None);
    }

    #[test]
    fn test_extract_error_response_failed() {
        let event: serde_json::Value = serde_json::json!({
            "type": "response.failed",
            "response": {
                "error": {
                    "message": "Rate limit exceeded"
                }
            }
        });
        assert_eq!(
            CodexClient::extract_error(&event),
            Some("Rate limit exceeded".to_string())
        );
    }

    #[test]
    fn test_extract_error_none_for_delta() {
        let event: serde_json::Value = serde_json::json!({
            "type": "response.output_text.delta",
            "delta": "hello"
        });
        assert_eq!(CodexClient::extract_error(&event), None);
    }

    #[test]
    fn parses_visible_codex_models_by_priority() {
        let body = br#"{
            "models": [
                {
                    "slug": "hidden-model",
                    "display_name": "Hidden Model",
                    "visibility": "hide",
                    "priority": 1,
                    "context_window": 400000
                },
                {
                    "slug": "gpt-5.5-codex",
                    "display_name": "GPT-5.5 Codex",
                    "visibility": "list",
                    "priority": 0,
                    "context_window": 1000000
                },
                {
                    "slug": "gpt-5.3-codex",
                    "display_name": "GPT-5.3 Codex",
                    "visibility": "list",
                    "priority": 2,
                    "max_context_window": 400000
                }
            ]
        }"#;

        let models = parse_codex_models_response(body).expect("parse codex models");

        assert_eq!(models.len(), 2);
        assert_eq!(models[0].slug, "gpt-5.5-codex");
        assert_eq!(models[0].resolved_context_window(), Some(1_000_000));
        assert_eq!(models[1].slug, "gpt-5.3-codex");
        assert_eq!(models[1].resolved_context_window(), Some(400_000));
    }
}
