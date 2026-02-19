---
name: llm-api-integration
description: >
  LLM API provider integration patterns for the AI Novel Translator.
  Use when adding a new AI provider, debugging API calls, fixing streaming issues,
  or modifying provider authentication and request/response handling.
  Triggers: new provider, API client, SSE streaming, Gemini API, OpenAI API, OpenRouter,
  token usage, API logging, model fetching.
---

# LLM API Integration

## Provider Architecture

```rust
// services/translator.rs
pub enum ApiClient {
    Gemini(GeminiClient),          // Google GenAI format
    OpenRouter(OpenRouterClient),  // OpenAI Chat format
    Antigravity(AntigravityClient),// Gemini format via local proxy
}
```

Provider routing in `TranslatorService::new()`:

| `provider_type` | Client | Auth | API Format |
|-----------------|--------|------|------------|
| `"gemini"` | `GeminiClient` | `?key=` query param | Google GenAI |
| `"openrouter"` | `OpenRouterClient` | `Bearer` header | OpenAI Chat |
| `"anthropic"` / `"openai"` / `"custom"` | `OpenRouterClient::new_with_base_url()` | `Bearer` header | OpenAI Chat |
| `"antigravity"` | `AntigravityClient` | OAuth (proxy) | Google GenAI |

## Required Methods Per Client

Each client must implement:

```rust
// Non-streaming (batch translation)
pub async fn translate(
    &mut self,
    paragraphs: &[String],
    original_indices: &[usize],
    has_subtitle: bool,
    system_prompt: &str,
) -> Result<Vec<String>, String>

// Streaming (chapter translation)
pub async fn translate_streaming<R: tauri::Runtime>(
    &mut self,
    novel_id: &str,
    paragraphs: &[String],
    original_indices: &[usize],
    has_subtitle: bool,
    system_prompt: &str,
    app_handle: &AppHandle<R>,
) -> Result<(Vec<String>, Option<TokenUsage>), String>
```

## Google GenAI Format (Gemini / Antigravity)

### Request

```json
{
  "contents": [{ "role": "user", "parts": [{ "text": "prompt" }] }],
  "generationConfig": { "temperature": 1.0, "topP": 0.8, "maxOutputTokens": 65536 },
  "safetySettings": [
    { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "OFF" },
    { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "OFF" },
    { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "OFF" },
    { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "OFF" },
    { "category": "HARM_CATEGORY_CIVIC_INTEGRITY", "threshold": "OFF" }
  ]
}
```

### Endpoints

```
Non-streaming: POST {base}/models/{model}:generateContent?key={key}
Streaming:     POST {base}/models/{model}:streamGenerateContent?alt=sse&key={key}
```

Base: `https://generativelanguage.googleapis.com/v1beta`

### Thinking Models

Gemini thinking models return `thought: true` parts that must be filtered:

```rust
c.parts.into_iter()
    .filter(|p| !p.thought.unwrap_or(false))  // Filter thinking parts
    .filter_map(|p| p.text)
    .filter(|t| !t.is_empty())
    .collect::<Vec<_>>().join("")
```

### SSE Format

Delimiter: `\n\n` (double newline). CRLF normalized to LF.

```
data: {"candidates":[{"content":{"parts":[{"text":"chunk"}]}}]}

data: {"candidates":[...],"usageMetadata":{"promptTokenCount":100,"candidatesTokenCount":200}}
```

## OpenAI Chat Format (OpenRouter / Custom)

### Request

```json
{
  "model": "anthropic/claude-sonnet-4",
  "messages": [{ "role": "user", "content": "prompt" }],
  "max_tokens": 65536,
  "temperature": 0.7,
  "stream": true
}
```

### Endpoint

```
POST {base_url}/v1/chat/completions
```

Base URL normalization:
```rust
let url = format!("{}{}", self.base_url.trim_end_matches("/v1").trim_end_matches('/'), "/v1/chat/completions");
```

### Headers

```
Authorization: Bearer {api_key}
Content-Type: application/json
HTTP-Referer: https://ai-novel-translator.app
X-Title: AI Novel Translator
```

### SSE Format

Delimiter: `\n` (single newline). Done signal: `data: [DONE]`

```
data: {"choices":[{"delta":{"content":"chunk"}}]}
data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":200}}
data: [DONE]
```

## Prompt Construction

```rust
// System prompt with note injection
fn build_prompt(&self, additional_note: Option<&str>) -> String {
    let full_note = match additional_note {
        Some(n) if !n.is_empty() => format!("{}\n{}", self.translation_note, n),
        _ => self.translation_note.clone(),
    };
    self.system_prompt.replace("{{note}}", &full_note)
}

// Full prompt sent to LLM
let full_prompt = format!("{}\n\n{}", system_prompt, numbered_text);
// where numbered_text = <p id="title">原文</p>\n<p id="p-1">段落</p>\n...
```

## API Logging

Every API call is logged to `api_logs` table:

```rust
let mut log_entry = ApiLogEntry::new("POST", &url, "Gemini", "Gemini", Some(self.model.clone()));
log_entry.request_body = Some(request_json);
// ... after response ...
log_entry.duration_ms = start.elapsed().as_millis() as u64;
log_entry.response_body = Some(response_text);
log_entry.input_tokens = usage.prompt_token_count;
log_entry.output_tokens = usage.candidates_token_count;
// Fire-and-forget save
let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });
```

## Adding a New Provider

### Checklist

1. Create `services/newprovider.rs` with client struct
2. Add variant to `ApiClient` enum in `translator.rs`
3. Add match arm in `TranslatorService::new()` for provider_type routing
4. Implement `translate()` and `translate_streaming()` methods
5. Add model fetching command in `commands/settings.rs` (e.g., `fetch_newprovider_models`)
6. Register fetch command in `lib.rs`
7. Add API logging with `ApiLogEntry`
8. Emit `debug-api` events for request/response

### Streaming Implementation Pattern

```rust
let mut full_text = String::new();
let mut stream = response.bytes_stream();
let mut buffer = String::new();
let mut emitted_ids: HashSet<String> = HashSet::new();

while let Some(chunk) = stream.next().await {
    let chunk = chunk.map_err(|e| format!("스트림 읽기 실패: {}", e))?;
    buffer.push_str(&String::from_utf8_lossy(&chunk));

    // Parse SSE events from buffer (provider-specific delimiter)
    while let Some(pos) = buffer.find(DELIMITER) {
        let line = buffer[..pos].to_string();
        buffer = buffer[pos + DELIMITER.len()..].to_string();

        if let Some(data) = line.strip_prefix("data: ") {
            // Parse provider-specific response format
            // Extract text content, append to full_text
            full_text.push_str(&new_text);

            // Emit completed paragraphs
            let chunks = extract_completed_paragraphs(&full_text);
            for chunk in chunks {
                if !emitted_ids.contains(&chunk.paragraph_id) {
                    emitted_ids.insert(chunk.paragraph_id.clone());
                    // Cache individual paragraph
                    let _ = cache_translation(novel_id, &original, &chunk.text).await;
                    // Emit to frontend
                    let _ = app_handle.emit("translation-chunk", chunk);
                }
            }
        }
    }
}

// Final parse for complete results
parse_translated_paragraphs_by_indices(&full_text, original_indices, has_subtitle)
```
