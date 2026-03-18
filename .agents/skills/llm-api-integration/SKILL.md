---
name: llm-api-integration
description: >
  LLM provider transport and authentication patterns for the TransNovel backend.
  Use when adding or changing a provider client, request shape, streaming parser, auth flow,
  model fetching, or API logging for a provider-backed call.
  Triggers: new provider, provider client, auth flow, SSE parser, model fetch, Gemini API, OpenRouter API, Codex API.
---

# LLM API Integration

Use this skill for provider-specific transport work. If the bug is about cache behavior, paragraph IDs, event ordering, or batch flow, use `translation-pipeline` first. Use `tauri-rust-patterns` as a baseline only when the task also changes generic backend structure.

## Current Routing

`src-tauri/src/services/translator.rs` routes providers as follows:

| `provider_type` | Client | Notes |
|---|---|---|
| `gemini` | `GeminiClient` | Google GenAI request and SSE format |
| `openrouter` | `OpenRouterClient::new()` | OpenAI Chat format |
| `anthropic`, `openai`, `custom` | `OpenRouterClient::new_with_base_url()` | OpenAI-compatible base URL |
| `openai-oauth` | `CodexClient` | OAuth token refreshed via `openai_oauth` service |

## Use This Workflow

1. Identify the provider boundary.
   - Routing lives in `translator.rs`.
   - Provider-specific request and streaming code lives in the matching `services/*.rs` file.
2. Make the smallest provider change.
   - Request shape, headers, endpoint normalization, streaming parsing, and provider-specific logging stay in the provider client.
   - Shared translation orchestration stays in `translator.rs`.
3. Keep both execution paths aligned.
   - Update non-streaming and streaming methods together when the provider supports both.
   - If a provider cannot support one path, return an explicit error instead of silently falling back.
4. Preserve logging.
   - Record request metadata and response metadata in `api_logs`.
   - Emit `debug-api` events when the existing provider pattern already emits them.

## Required Checks For A Provider Change

- `TranslatorService::new()` selects the correct client for the target `provider_type`.
- The client exposes both `translate()` and `translate_streaming()` when the provider supports both modes.
- Streaming parser handles the provider's delimiter, done signal, and usage metadata format.
- Model fetching commands in `commands/settings.rs` stay aligned with the provider type.

## Streaming Rules

- Reuse the delimiter and event shape from the matching provider file instead of inventing a generic parser.
- Append only newly parsed text to `full_text`.
- Run `extract_completed_paragraphs(&full_text)` after appending new text.
- Emit and cache each completed paragraph once.
- If the provider returns malformed SSE, stop and return a clear parse error instead of guessing the chunk format.

## Adding A New Provider

1. Create a provider client under `src-tauri/src/services/`.
2. Add an `ApiClient` variant and routing branch in `translator.rs`.
3. Implement non-streaming and streaming methods, or return an explicit unsupported-mode error.
4. Add or update model-fetching commands in `commands/settings.rs`.
5. Register new commands in `src-tauri/src/lib.rs`.
6. Mirror the existing logging pattern so requests remain visible in `api_logs`.

## Fallbacks

- If the provider uses an unknown stream format, inspect the closest existing provider client before writing a new parser.
- If auth details are unclear, stop at the client boundary and state which header, query param, or token source is missing.
- If a change affects prompt construction or cache behavior outside the client, hand off to `translation-pipeline` instead of expanding this skill's scope.
