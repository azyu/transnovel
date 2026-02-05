#![allow(clippy::let_underscore_future)]

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

use super::api_logger;
use super::cache::cache_translation;
use super::paragraph::{encode_paragraph_id, parse_translated_paragraphs, TranslationChunk};
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

        let entry = log_entry;
        let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });

        let text = antigravity_response
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.content)
            .and_then(|c| c.parts.into_iter().next())
            .and_then(|p| p.text)
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
        let translated = self
            .translate(paragraphs, original_indices, has_subtitle, system_prompt)
            .await?;

        for (local_idx, &orig_idx) in original_indices.iter().enumerate() {
            if local_idx < translated.len() {
                let trans = &translated[local_idx];
                if !trans.is_empty() {
                    let _ = cache_translation(novel_id, &paragraphs[local_idx], trans).await;

                    let _ = app_handle.emit(
                        "translation-chunk",
                        TranslationChunk {
                            paragraph_id: encode_paragraph_id(orig_idx, has_subtitle),
                            text: trans.clone(),
                            is_complete: true,
                        },
                    );
                }
            }
        }

        Ok((translated, None))
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
                    parts: vec![ResponsePart { text: None }],
                }),
                _finish_reason: Some("STOP".to_string()),
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
