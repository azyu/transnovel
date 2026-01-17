use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::cache::cache_translation;
use super::gemini::TranslationChunk;

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
}

pub struct OpenRouterClient {
    client: Client,
    api_key: String,
    pub model: String,
}

impl OpenRouterClient {
    pub fn new(api_key: String, model: Option<String>) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: model.unwrap_or_else(|| "anthropic/claude-sonnet-4".to_string()),
        }
    }

    fn build_request(&self, prompt: &str, stream: bool) -> OpenRouterRequest {
        OpenRouterRequest {
            model: self.model.clone(),
            messages: vec![Message {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
            max_tokens: Some(65536),
            temperature: Some(0.7),
            stream: Some(stream),
        }
    }

    pub async fn translate(&self, paragraphs: &[String], system_prompt: &str) -> Result<Vec<String>, String> {
        let url = format!("{}/chat/completions", OPENROUTER_API_BASE);

        let numbered_text = paragraphs
            .iter()
            .enumerate()
            .map(|(i, p)| format!("<p id=\"{}\">{}</p>", encode_paragraph_id(i), p))
            .collect::<Vec<_>>()
            .join("\n");

        let full_prompt = format!("{}\n\n{}", system_prompt, numbered_text);
        let request = self.build_request(&full_prompt, false);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .header("HTTP-Referer", "https://ai-novel-translator.app")
            .header("X-Title", "AI Novel Translator")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("API 요청 실패: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("API 오류 ({}): {}", status, error_text));
        }

        let openrouter_response: OpenRouterResponse = response
            .json()
            .await
            .map_err(|e| format!("응답 파싱 실패: {}", e))?;

        if let Some(error) = openrouter_response.error {
            return Err(format!("OpenRouter 오류: {}", error.message));
        }

        let text = openrouter_response
            .choices
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.message)
            .and_then(|m| m.content)
            .ok_or("응답에서 텍스트를 찾을 수 없습니다.")?;

        parse_translated_paragraphs(&text, paragraphs.len())
    }

    pub async fn translate_streaming<R: tauri::Runtime>(
        &self,
        novel_id: &str,
        paragraphs: &[String],
        original_indices: &[usize],
        system_prompt: &str,
        app_handle: &AppHandle<R>,
    ) -> Result<Vec<String>, String> {
        let url = format!("{}/chat/completions", OPENROUTER_API_BASE);

        let numbered_text = paragraphs
            .iter()
            .zip(original_indices.iter())
            .map(|(p, &idx)| format!("<p id=\"{}\">{}</p>", encode_paragraph_id(idx), p))
            .collect::<Vec<_>>()
            .join("\n");

        let full_prompt = format!("{}\n\n{}", system_prompt, numbered_text);
        let request = self.build_request(&full_prompt, true);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .header("HTTP-Referer", "https://ai-novel-translator.app")
            .header("X-Title", "AI Novel Translator")
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
                        if let Some(choices) = event.choices {
                            if let Some(choice) = choices.into_iter().next() {
                                if let Some(delta) = choice.delta {
                                    if let Some(content) = delta.content {
                                        full_text.push_str(&content);

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
                }
            }
        }

        parse_translated_paragraphs(&full_text, paragraphs.len())
    }
}

fn encode_paragraph_id(n: usize) -> String {
    if n < 26 {
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

fn decode_paragraph_id(id: &str) -> Option<usize> {
    let chars: Vec<char> = id.chars().collect();
    if chars.is_empty() || chars.len() > 2 {
        return None;
    }

    let decode_char = |c: char| -> Option<usize> {
        if c.is_ascii_uppercase() {
            Some((c as usize) - 65)
        } else if c.is_ascii_lowercase() {
            Some((c as usize) - 71)
        } else {
            None
        }
    };

    if chars.len() == 1 {
        decode_char(chars[0])
    } else {
        let first = decode_char(chars[0])?;
        let second = decode_char(chars[1])?;
        Some(52 + first * 52 + second)
    }
}

fn extract_completed_paragraphs(text: &str) -> Vec<TranslationChunk> {
    let re = regex::Regex::new(r#"(?s)<p id="([A-Za-z]+)">(.*?)</p>"#).unwrap();
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

fn parse_translated_paragraphs(text: &str, expected_count: usize) -> Result<Vec<String>, String> {
    let re = regex::Regex::new(r#"(?s)<p id="[A-Za-z]+">(.*?)</p>"#).unwrap();
    let mut results: Vec<String> = re
        .captures_iter(text)
        .filter_map(|cap| cap.get(1).map(|m| m.as_str().to_string()))
        .collect();

    while results.len() < expected_count {
        results.push(String::new());
    }

    Ok(results)
}
