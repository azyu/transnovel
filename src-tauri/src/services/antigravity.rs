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
struct AntigravityResponse {
    candidates: Option<Vec<Candidate>>,
    error: Option<AntigravityError>,
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
    finish_reason: Option<String>,
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
struct AntigravityError {
    message: String,
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

    fn build_request(&self, prompt: &str) -> AntigravityRequest {
        AntigravityRequest {
            contents: vec![Content {
                role: "user".to_string(),
                parts: vec![Part {
                    text: prompt.to_string(),
                }],
            }],
            generation_config: GenerationConfig {
                temperature: 1.0,
                top_p: 0.8,
                max_output_tokens: 65536,
            },
            safety_settings: Self::build_safety_settings(),
        }
    }

    pub async fn check_health(&self) -> bool {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(3))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        client
            .get(format!("{}/v1beta/models", self.base_url))
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
        let path = format!("/v1beta/models/{}:generateContent", self.model);
        let url = format!("{}{}", self.base_url, path);

        let numbered_text = paragraphs
            .iter()
            .zip(original_indices.iter())
            .map(|(p, &idx)| {
                format!(
                    "<p id=\"{}\">{}",
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
            ApiLogEntry::new("POST", &url, "Antigravity", "Gemini", Some(self.model.clone()));
        log_entry.request_body = Some(request_json);

        let start = Instant::now();

        let response = match self
            .client
            .post(&url)
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

        if let Some(ref usage) = antigravity_response.usage_metadata {
            log_entry.input_tokens = usage.prompt_token_count;
            log_entry.output_tokens = usage.candidates_token_count;
        }

        if let Some(error) = antigravity_response.error {
            log_entry.error = Some(error.message.clone());
            let entry = log_entry;
            let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
            return Err(format!("Antigravity 오류: {}", error.message));
        }

        let parts = antigravity_response
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.content)
            .map(|c| c.parts)
            .unwrap_or_default();

        if parts.is_empty() {
            let error_msg =
                "콘텐츠 필터링에 의해 응답이 차단되었습니다. 다른 모델을 사용해보세요.".to_string();
            log_entry.error = Some(error_msg.clone());
            let entry = log_entry;
            let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
            return Err(error_msg);
        }

        let entry = log_entry;
        let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });

        let text = parts
            .into_iter()
            .filter(|p| !p.thought.unwrap_or(false))
            .filter_map(|p| p.text)
            .filter(|t| !t.is_empty())
            .collect::<Vec<_>>()
            .join("");

        if text.is_empty() {
            return Err("응답에서 텍스트를 찾을 수 없습니다.".to_string());
        }

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
        let path = format!("/v1beta/models/{}:streamGenerateContent?alt=sse", self.model);
        let url = format!("{}{}", self.base_url, path);

        let numbered_text = paragraphs
            .iter()
            .zip(original_indices.iter())
            .map(|(p, &idx)| {
                format!(
                    "<p id=\"{}\">{}",
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
            ApiLogEntry::new("POST", &url, "Antigravity", "Gemini", Some(self.model.clone()));
        log_entry.request_body = Some(request_json);

        let start = Instant::now();

        let response = match self
            .client
            .post(&url)
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

        let mut full_text = String::new();
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut emitted_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut final_usage: Option<TokenUsage> = None;
        let mut last_finish_reason: Option<String> = None;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("스트림 읽기 실패: {}", e))?;
            let chunk_str = String::from_utf8_lossy(&chunk).replace("\r\n", "\n").replace('\r', "\n");
            buffer.push_str(&chunk_str);

            while let Some(pos) = buffer.find("\n\n") {
                let line = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                if let Some(data) = line.strip_prefix("data: ") {
                    if let Ok(response) = serde_json::from_str::<AntigravityResponse>(data) {
                        if let Some(usage) = response.usage_metadata {
                            final_usage = Some(TokenUsage {
                                input_tokens: usage.prompt_token_count.unwrap_or(0),
                                output_tokens: usage.candidates_token_count.unwrap_or(0),
                            });
                        }

                        if let Some(candidates) = &response.candidates {
                            if let Some(candidate) = candidates.first() {
                                if let Some(reason) = &candidate.finish_reason {
                                    last_finish_reason = Some(reason.clone());
                                }
                            }
                        }

                        if let Some(text) = response
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
                        {
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

        log_entry.duration_ms = start.elapsed().as_millis() as u64;
        log_entry.response_body = Some(full_text.clone());
        if let Some(ref usage) = final_usage {
            log_entry.input_tokens = Some(usage.input_tokens);
            log_entry.output_tokens = Some(usage.output_tokens);
        }

        if let Some(reason) = &last_finish_reason {
            match reason.as_str() {
                "SAFETY" => {
                    log_entry.error = Some("Content filtered (SAFETY)".to_string());
                    let entry = log_entry;
                    let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
                    return Err(
                        "콘텐츠 필터링에 의해 응답이 차단되었습니다. 다른 모델을 사용해보세요."
                            .to_string(),
                    );
                }
                "RECITATION" => {
                    log_entry.error = Some("Content filtered (RECITATION)".to_string());
                    let entry = log_entry;
                    let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
                    return Err("저작권 문제로 응답이 차단되었습니다.".to_string());
                }
                _ => {}
            }
        }

        if full_text.is_empty() {
            let error_msg = match last_finish_reason.as_deref() {
                Some("SAFETY") => {
                    "콘텐츠 필터링에 의해 응답이 차단되었습니다. 다른 모델을 사용해보세요."
                }
                Some("RECITATION") => "저작권 문제로 응답이 차단되었습니다.",
                Some(reason) => {
                    log_entry.error = Some(format!("Empty response, finishReason: {}", reason));
                    let entry = log_entry;
                    let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
                    return Err(format!("응답이 비어있습니다. (finishReason: {})", reason));
                }
                None => "응답이 비어있습니다.",
            };
            log_entry.error = Some(error_msg.to_string());
            let entry = log_entry;
            let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
            return Err(error_msg.to_string());
        }

        let entry = log_entry;
        let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });

        let result =
            parse_translated_paragraphs_by_indices(&full_text, original_indices, has_subtitle)?;
        Ok((result, final_usage))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_candidates_error() {
        let response = AntigravityResponse {
            candidates: Some(vec![]),
            error: None,
            usage_metadata: None,
        };

        let text = response
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.content)
            .and_then(|c| c.parts.into_iter().next())
            .and_then(|p| p.text);

        assert!(text.is_none());
    }

    #[test]
    fn test_candidate_without_text() {
        let response = AntigravityResponse {
            candidates: Some(vec![Candidate {
                content: Some(CandidateContent {
                    parts: vec![ResponsePart { text: None, thought: None }],
                }),
                finish_reason: Some("STOP".to_string()),
            }]),
            error: None,
            usage_metadata: None,
        };

        let text = response
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.content)
            .and_then(|c| c.parts.into_iter().next())
            .and_then(|p| p.text);

        assert!(text.is_none());
    }
}
