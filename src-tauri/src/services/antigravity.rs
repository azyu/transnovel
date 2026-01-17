use reqwest::Client;
use serde::{Deserialize, Serialize};

pub const ANTIGRAVITY_BASE: &str = "http://localhost:8045";

#[derive(Debug, Serialize)]
struct AntigravityRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<Message>,
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

pub struct AntigravityClient {
    client: Client,
    model: String,
}

impl AntigravityClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            model: "claude-sonnet-4-5-thinking".to_string(),
        }
    }

    pub fn with_model(mut self, model: &str) -> Self {
        self.model = model.to_string();
        self
    }

    pub async fn check_health(&self) -> bool {
        self.client
            .get(format!("{}/health", ANTIGRAVITY_BASE))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    pub async fn translate(
        &self,
        paragraphs: &[String],
        system_prompt: &str,
    ) -> Result<Vec<String>, String> {
        let url = format!("{}/v1/messages", ANTIGRAVITY_BASE);

        let numbered_text = paragraphs
            .iter()
            .enumerate()
            .map(|(i, p)| format!("<p id=\"{}\">{}</p>", encode_paragraph_id(i), p))
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
        };

        let response = self
            .client
            .post(&url)
            .header("Authorization", "Bearer test")
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("API 요청 실패: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("API 오류 ({}): {}", status, error_text));
        }

        let antigravity_response: AntigravityResponse = response
            .json()
            .await
            .map_err(|e| format!("응답 파싱 실패: {}", e))?;

        if let Some(error) = antigravity_response.error {
            return Err(format!("Antigravity 오류: {}", error.message));
        }

        let text = antigravity_response
            .content
            .and_then(|blocks| {
                blocks
                    .into_iter()
                    .find(|b| b.content_type == "text")
                    .and_then(|b| b.text)
            })
            .ok_or("응답에서 텍스트를 찾을 수 없습니다.")?;

        parse_translated_paragraphs(&text, paragraphs.len())
    }
}

fn encode_paragraph_id(n: usize) -> String {
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

fn parse_translated_paragraphs(text: &str, expected_count: usize) -> Result<Vec<String>, String> {
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

    let mut result = 0usize;

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
