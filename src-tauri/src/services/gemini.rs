use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::cache::cache_translation;

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

#[derive(Clone, Serialize)]
pub struct TranslationChunk {
    pub paragraph_id: String,
    pub text: String,
    pub is_complete: bool,
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
        system_prompt: &str,
    ) -> Result<Vec<String>, String> {
        let api_key = self.get_next_api_key()?.to_string();

        let url = format!(
            "{}/models/{}:generateContent?key={}",
            GEMINI_API_BASE, self.model, api_key
        );

        let numbered_text = paragraphs
            .iter()
            .enumerate()
            .map(|(i, p)| format!("<p id=\"{}\">{}</p>", encode_paragraph_id(i), p))
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
            .map(|(p, &idx)| format!("<p id=\"{}\">{}</p>", encode_paragraph_id(idx), p))
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

pub fn encode_paragraph_id(n: usize) -> String {
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

pub fn parse_translated_paragraphs(text: &str, _expected_count: usize) -> Result<Vec<String>, String> {
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

    let mut result: usize;

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
