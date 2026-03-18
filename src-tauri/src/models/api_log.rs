use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiLogEntry {
    pub id: String,
    pub timestamp: i64,
    pub method: String,
    pub path: String,
    pub status: u16,
    pub duration_ms: u64,
    pub model: Option<String>,
    pub provider: String,
    pub protocol: String,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
    pub request_body: Option<String>,
    pub response_body: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiLogSummary {
    pub id: String,
    pub timestamp: i64,
    pub method: String,
    pub path: String,
    pub status: u16,
    pub duration_ms: u64,
    pub model: Option<String>,
    pub provider: String,
    pub protocol: String,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
    pub error: Option<String>,
}

impl ApiLogEntry {
    pub fn new(
        method: impl Into<String>,
        path: impl Into<String>,
        provider: impl Into<String>,
        protocol: impl Into<String>,
        model: Option<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now().timestamp_millis(),
            method: method.into(),
            path: path.into(),
            status: 0,
            duration_ms: 0,
            model,
            provider: provider.into(),
            protocol: protocol.into(),
            input_tokens: None,
            output_tokens: None,
            request_body: None,
            response_body: None,
            error: None,
        }
    }
}
