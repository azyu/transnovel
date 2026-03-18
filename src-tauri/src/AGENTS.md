# Rust Backend

This document covers `src-tauri/src/`. Use the root `AGENTS.md` for repo-wide workflow and coordination rules.

## Structure

```text
src/
├── lib.rs              # Tauri builder, plugin init, command registration
├── main.rs             # Binary entry point
├── commands/           # Thin IPC handlers
├── services/           # Translation orchestration, provider clients, cache, OAuth
├── parsers/            # Site parsers implementing NovelParser
├── models/             # Shared serde structs
└── db/                 # SQLite init and migrations
```

## Current Backend Boundaries

### Service modules

- `translator.rs` owns translation orchestration and provider routing.
- `gemini.rs`, `openrouter.rs`, and `codex.rs` own provider-specific HTTP, auth, and streaming parsing.
- `openai_oauth.rs` owns OAuth token acquisition, refresh, and storage for `openai-oauth`.
- `cache.rs`, `paragraph.rs`, and `substitution.rs` own shared translation support logic.
- `api_logger.rs` owns writes and queries for `api_logs`.

### Provider routing

```rust
pub enum ApiClient {
    Gemini(GeminiClient),
    OpenRouter(OpenRouterClient),
    Codex(CodexClient),
}
```

- `gemini` routes to `GeminiClient`.
- `openrouter` routes to `OpenRouterClient::new()`.
- `anthropic`, `openai`, and `custom` route to `OpenRouterClient::new_with_base_url()`.
- `openai-oauth` routes to `CodexClient` after token refresh through `openai_oauth`.

## Working Rules

- Put Tauri commands in `commands/` and keep them thin.
- Validate command inputs, construct the service, delegate the work, and return the result.
- Keep provider-specific request formatting and SSE parsing in the provider client file, not in `translator.rs`.
- Keep parser-specific scraping in `parsers/`.
- Keep shared data contracts in `models/`.
- Return `Result<T, String>` at IPC boundaries.
- Use Korean user-facing error messages where the existing app already surfaces those errors to users.

## State And DB Rules

- Use the existing `OnceLock` pool from `db/mod.rs` for shared DB access.
- Use the existing `AtomicBool` pause and stop flags for batch translation control.
- Add new migrations under `db/migrations/`.
- Load migrations through `include_str!()` in `db/mod.rs`.
- Guard additive SQLite schema changes with an idempotency check such as `pragma_table_info(...)`.
- Keep the current manual migration pattern instead of introducing a second migration system.

## Parser Rules

- Implement `NovelParser` with `matches_url()`, `get_chapter()`, and `get_series_info()`.
- Register new parsers in both `ParsedUrl::from_url()` and `get_parser_for_url()`.
- Add batch URL support only when chapter URLs are sequential and derivable.
- If chapter URLs are not sequential, return an explicit batch-unsupported error instead of inventing a numbering scheme.

## Events And Contracts

- Reuse existing event names and payload shapes unless the task explicitly changes the frontend contract.
- Emit `translation-chunk` only for completed paragraphs.
- Keep `translation-complete`, `translation-error`, `translation-failed-paragraphs`, `translation-progress`, `batch-translation-complete`, and `chapter-completed` aligned with the current frontend listeners.

## Safety Boundaries

- Treat `src-tauri/gen/*` as generated output and leave it untouched.
- Preserve `#![cfg_attr(...)]` in `main.rs`.
- If a task appears to require new global mutable state beyond the current `OnceLock` or `AtomicBool` patterns, stop and justify it before adding a new pattern.

## Verification

- Run the backend checks that match the change:
  ```bash
  cargo test -p app_lib
  cargo test -p app_lib -- --ignored
  cargo clippy -- -D warnings
  ```
- Use the ignored test pass only when the task touches parser or network-backed behavior.
- For docs-only changes, state that backend runtime checks were skipped because no behavior changed.
