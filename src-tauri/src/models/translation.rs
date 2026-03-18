use serde::{Deserialize, Serialize};

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationRequest {
    pub paragraphs: Vec<String>,
    pub system_prompt: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationResult {
    pub original: Vec<String>,
    pub translated: Vec<String>,
    pub model_used: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Paragraph {
    pub id: String,
    pub original: String,
    pub translated: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationCache {
    pub text_hash: String,
    pub original_text: String,
    pub translated_text: String,
    pub hit_count: i32,
}
