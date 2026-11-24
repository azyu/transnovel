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
    #[serde(rename = "usageMetadata")]
    usage_metadata: Option<UsageMetadata>,
}

#[derive(Debug, Deserialize)]
struct UsageMetadata {
    #[serde(rename = "promptTokenCount")]
    prompt_token_count: Option<u32>,
    #[serde(rename = "candidatesTokenCount")]
    candidates_token_count: Option<u32>,
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
    /// Gemini thinking models return reasoning parts with `thought: true`.
    /// These must be filtered out to get only the actual model output.
    thought: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct GeminiError {
    message: String,
    _status: Option<String>,
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

    pub async fn generate_text(&mut self, prompt: &str) -> Result<String, String> {
        let api_key = self.get_next_api_key()?.to_string();
        let url = format!(
            "{}/models/{}:generateContent?key={}",
            GEMINI_API_BASE, self.model, api_key
        );

        let request = self.build_request(prompt);
        let request_json = serde_json::to_string(&request).unwrap_or_default();

        let mut log_entry =
            ApiLogEntry::new("POST", &url, "Gemini", "Gemini", Some(self.model.clone()));
        log_entry.request_body = Some(request_json);

        let start = Instant::now();
        let response = match self.client.post(&url).json(&request).send().await {
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

        let gemini_response: GeminiResponse =
            serde_json::from_str(&response_text).map_err(|e| format!("응답 파싱 실패: {}", e))?;

        if let Some(ref usage) = gemini_response.usage_metadata {
            log_entry.input_tokens = usage.prompt_token_count;
            log_entry.output_tokens = usage.candidates_token_count;
        }

        if let Some(error) = gemini_response.error {
            log_entry.error = Some(error.message.clone());
            let entry = log_entry;
            let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
            return Err(format!("Gemini 오류: {}", error.message));
        }

        let text = gemini_response
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.content)
            .map(|c| {
                c.parts
                    .into_iter()
                    .filter(|p| !p.thought.unwrap_or(false))
                    .filter_map(|p| p.text)
                    .filter(|t| !t.is_empty())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .filter(|t| !t.is_empty())
            .ok_or("응답에서 텍스트를 찾을 수 없습니다.")?;

        let entry = log_entry;
        let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });

        Ok(text)
    }

    pub async fn translate(
        &mut self,
        paragraphs: &[String],
        original_indices: &[usize],
        has_subtitle: bool,
        system_prompt: &str,
    ) -> Result<Vec<String>, String> {
        let api_key = self.get_next_api_key()?.to_string();
        let url = format!("{}/models/{}:generateContent?key={}", GEMINI_API_BASE, self.model, api_key);

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
        let request = self.build_request(&full_prompt);
        let request_json = serde_json::to_string(&request).unwrap_or_default();

        let mut log_entry =
            ApiLogEntry::new("POST", &url, "Gemini", "Gemini", Some(self.model.clone()));
        log_entry.request_body = Some(request_json);

        let start = Instant::now();

        let response = match self.client.post(&url).json(&request).send().await {
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

        let gemini_response: GeminiResponse =
            serde_json::from_str(&response_text).map_err(|e| format!("응답 파싱 실패: {}", e))?;

        if let Some(ref usage) = gemini_response.usage_metadata {
            log_entry.input_tokens = usage.prompt_token_count;
            log_entry.output_tokens = usage.candidates_token_count;
        }

        if let Some(error) = gemini_response.error {
            log_entry.error = Some(error.message.clone());
            let entry = log_entry;
            let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
            return Err(format!("Gemini 오류: {}", error.message));
        }

        let entry = log_entry;
        let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });

        let text = gemini_response
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.content)
            .map(|c| {
                c.parts
                    .into_iter()
                    .filter(|p| !p.thought.unwrap_or(false))
                    .filter_map(|p| p.text)
                    .filter(|t| !t.is_empty())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .filter(|t| !t.is_empty())
            .ok_or("응답에서 텍스트를 찾을 수 없습니다.")?;

        parse_translated_paragraphs_by_indices(&text, original_indices, has_subtitle)
    }

    pub async fn translate_streaming<R: tauri::Runtime>(
        &mut self,
        paragraphs: &[String],
        original_indices: &[usize],
        has_subtitle: bool,
        system_prompt: &str,
        cache_writer: &mut StreamingCacheWriter,
        app_handle: &AppHandle<R>,
    ) -> Result<(Vec<String>, Option<TokenUsage>), String> {
        let api_key = self.get_next_api_key()?.to_string();
        let url = format!("{}/models/{}:streamGenerateContent?alt=sse&key={}", GEMINI_API_BASE, self.model, api_key);

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
        let request = self.build_request(&full_prompt);

        let request_json = serde_json::to_string_pretty(&request).unwrap_or_default();
        let _ = app_handle.emit(
            "debug-api",
            serde_json::json!({
                "type": "request",
                "provider": "gemini",
                "model": &self.model,
                "body": request_json
            }),
        );

        let mut log_entry =
            ApiLogEntry::new("POST", &url, "Gemini", "Gemini", Some(self.model.clone()));
        log_entry.request_body = Some(request_json);

        let start = Instant::now();

        let response = match self.client.post(&url).json(&request).send().await {
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
                    "provider": "gemini",
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
        let mut parser = GeminiStreamParser::new();
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
                apply_gemini_delta(
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
            apply_gemini_delta(
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
                "provider": "gemini",
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
struct GeminiStreamDelta {
    text: Option<String>,
    usage: Option<TokenUsage>,
}

#[derive(Debug, Default)]
struct GeminiStreamParser {
    line_buffer: SseLineBuffer,
}

impl GeminiStreamParser {
    fn new() -> Self {
        Self::default()
    }

    fn push_chunk(&mut self, chunk: &[u8]) -> Vec<GeminiStreamDelta> {
        self.line_buffer
            .push_chunk(chunk)
            .into_iter()
            .filter_map(|line| Self::parse_line(&line))
            .collect()
    }

    fn finish(&mut self) -> Option<GeminiStreamDelta> {
        self.line_buffer
            .finish()
            .and_then(|line| Self::parse_line(&line))
    }

    fn parse_line(line: &str) -> Option<GeminiStreamDelta> {
        if line.is_empty() || line.starts_with(':') {
            return None;
        }

        let data = parse_sse_data_line(line)?;
        let response = serde_json::from_str::<GeminiResponse>(data).ok()?;
        let usage = response.usage_metadata.map(|usage| TokenUsage {
            input_tokens: usage.prompt_token_count.unwrap_or(0),
            output_tokens: usage.candidates_token_count.unwrap_or(0),
        });
        let text = response
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.content)
            .map(|c| {
                c.parts
                    .into_iter()
                    .filter(|p| !p.thought.unwrap_or(false))
                    .filter_map(|p| p.text)
                    .filter(|t| !t.is_empty())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .filter(|t| !t.is_empty());

        if text.is_none() && usage.is_none() {
            return None;
        }

        Some(GeminiStreamDelta { text, usage })
    }
}

#[allow(clippy::too_many_arguments)]
async fn apply_gemini_delta<R: tauri::Runtime>(
    delta: GeminiStreamDelta,
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

    if let Some(text) = delta.text {
        full_text.push_str(&text);

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

#[cfg(test)]
mod tests {
    use super::GeminiStreamParser;

    #[test]
    fn decodes_multibyte_utf8_and_crlf_split_across_chunks() {
        let payload = concat!(
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"생각\",\"thought\":true},{\"text\":\"<p id=\\\"title\\\">한국어 제목</p>\"}]}}]}\r\n\r\n",
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"\\n<p id=\\\"p-1\\\">둘째 문단 😀</p>\"}]}}],\"usageMetadata\":{\"promptTokenCount\":12,\"candidatesTokenCount\":34}}\r\n\r\n",
        )
        .as_bytes();

        // Split directly inside UTF-8 bytes of '한' and across '\r' / '\n\r\n'
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

        let mut parser = GeminiStreamParser::new();
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

        assert_eq!(
            full_text,
            "<p id=\"title\">한국어 제목</p>\n<p id=\"p-1\">둘째 문단 😀</p>"
        );
        let usage = usage.expect("usage metadata parsed");
        assert_eq!(usage.input_tokens, 12);
        assert_eq!(usage.output_tokens, 34);
    }

    #[test]
    fn decodes_one_byte_chunks_and_unterminated_final_event() {
        let payload = concat!(
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"한글\"}]}}]}\r\n\r\n",
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"과 日本語\"}]}}]}",
        )
        .as_bytes();

        let mut parser = GeminiStreamParser::new();
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
