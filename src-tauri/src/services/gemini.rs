use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::cache::cache_translation;
use super::paragraph::{
    encode_paragraph_id, decode_paragraph_id, extract_completed_paragraphs,
    parse_translated_paragraphs, parse_translated_paragraphs_by_indices,
};

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

    pub async fn translate(
        &mut self,
        paragraphs: &[String],
        original_indices: &[usize],
        has_subtitle: bool,
        system_prompt: &str,
    ) -> Result<Vec<String>, String> {
        let api_key = self.get_next_api_key()?.to_string();

        let url = format!(
            "{}/models/{}:generateContent?key={}",
            GEMINI_API_BASE, self.model, api_key
        );

        let numbered_text = paragraphs
            .iter()
            .zip(original_indices.iter())
            .map(|(p, &idx)| format!("<p id=\"{}\">{}</p>", encode_paragraph_id(idx, has_subtitle), p))
            .collect::<Vec<_>>()
            .join("\n");

        let full_prompt = format!("{}\n\n{}", system_prompt, numbered_text);
        let request = self.build_request(&full_prompt);

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("API 요청 실패: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("API 오류 ({}): {}", status, error_text));
        }

        let gemini_response: GeminiResponse = response
            .json()
            .await
            .map_err(|e| format!("응답 파싱 실패: {}", e))?;

        if let Some(error) = gemini_response.error {
            return Err(format!("Gemini 오류: {}", error.message));
        }

        let text = gemini_response
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.content)
            .and_then(|c| c.parts.into_iter().next())
            .and_then(|p| p.text)
            .ok_or("응답에서 텍스트를 찾을 수 없습니다.")?;

        parse_translated_paragraphs(&text, paragraphs.len())
    }

    pub async fn translate_streaming<R: tauri::Runtime>(
        &mut self,
        novel_id: &str,
        paragraphs: &[String],
        original_indices: &[usize],
        has_subtitle: bool,
        system_prompt: &str,
        app_handle: &AppHandle<R>,
    ) -> Result<Vec<String>, String> {
        let api_key = self.get_next_api_key()?.to_string();

        let url = format!(
            "{}/models/{}:streamGenerateContent?alt=sse&key={}",
            GEMINI_API_BASE, self.model, api_key
        );

        let numbered_text = paragraphs
            .iter()
            .zip(original_indices.iter())
            .map(|(p, &idx)| format!("<p id=\"{}\">{}</p>", encode_paragraph_id(idx, has_subtitle), p))
            .collect::<Vec<_>>()
            .join("\n");

        let full_prompt = format!("{}\n\n{}", system_prompt, numbered_text);
        let request = self.build_request(&full_prompt);

        let response = self
            .client
            .post(&url)
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

            while let Some(pos) = buffer.find("\n\n") {
                let line = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                if let Some(data) = line.strip_prefix("data: ") {
                    if let Ok(response) = serde_json::from_str::<GeminiResponse>(data) {
                        if let Some(text) = response
                            .candidates
                            .and_then(|c| c.into_iter().next())
                            .and_then(|c| c.content)
                            .and_then(|c| c.parts.into_iter().next())
                            .and_then(|p| p.text)
                        {
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

        parse_translated_paragraphs_by_indices(&full_text, original_indices)
    }
}
