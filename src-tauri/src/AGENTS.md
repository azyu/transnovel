# Rust Backend

## Structure
```
src/
├── lib.rs              # Tauri app config, plugin init, command registration (40 commands)
├── main.rs             # Binary entry (DO NOT modify cfg_attr)
├── commands/           # Tauri IPC handlers (thin wrappers → services)
│   ├── translation.rs  # translate_chapter, translate_text, translate_paragraphs, translate_paragraphs_streaming
│   ├── parser.rs       # parse_url, parse_chapter, get_chapter_content, get_chapter_list, get_series_info
│   ├── series.rs       # start_batch_translation, pause/resume/stop, mark_chapter_complete, get_completed_chapters
│   ├── export.rs       # export_novel, save_chapter, save_chapter_with_dialog
│   ├── settings.rs     # get/set_setting, API key CRUD, fetch_*_models, cache stats, reset_all
│   └── api_logs.rs     # get_api_logs, get_api_log_detail, get_api_logs_count, clear_api_logs
├── services/           # Business logic
│   ├── translator.rs   # TranslatorService: provider switching, cache pipeline, chunked streaming
│   ├── gemini.rs       # GeminiClient: Google GenAI API (REST + SSE streaming)
│   ├── openrouter.rs   # OpenRouterClient: OpenAI Chat API (REST + SSE streaming)
│   ├── antigravity.rs  # AntigravityClient: Local proxy (Gemini format + SSE)
│   ├── cache.rs        # SHA256 per-novel cache (get_cached_translations, cache_translations)
│   ├── paragraph.rs    # Semantic ID encoding (title/subtitle/p-N), HTML response parsing
│   ├── substitution.rs # Regex-based pre/post text substitution
│   └── api_logger.rs   # API request/response logging to SQLite
├── parsers/            # Site scrapers (async_trait NovelParser)
│   ├── mod.rs          # ParsedUrl::from_url(), get_parser_for_url(), fetch_html()
│   ├── syosetu.rs      # ncode.syosetu.com (reference pattern)
│   ├── hameln.rs       # syosetu.org
│   ├── kakuyomu.rs     # kakuyomu.jp (embedded JSON, no batch)
│   └── nocturne.rs     # novel18.syosetu.com (18+ cookie)
├── models/             # Shared data structs
│   ├── novel.rs        # Novel, Chapter, ChapterContent, ChapterInfo, SeriesInfo, TranslationProgress
│   ├── translation.rs  # TranslationRequest, TranslationResult, Paragraph, TranslationCache
│   └── api_log.rs      # ApiLogEntry, ApiLogSummary
└── db/                 # SQLite persistence
    ├── mod.rs           # init_db(), get_pool() — OnceLock<Pool<Sqlite>>
    ├── schema.rs        # SCHEMA_VERSION
    └── migrations/      # 001_initial.sql, 002_api_logs.sql, 003_api_logs_provider.sql
```

## Where to Look

| Task | File | Pattern |
|------|------|---------|
| New site parser | `parsers/{site}.rs` | Implement `NovelParser` trait, add to `mod.rs` router |
| New AI provider | `services/{provider}.rs` | Add `ApiClient` enum variant in `translator.rs` |
| New Tauri command | `commands/{domain}.rs` | Add to `lib.rs` invoke_handler |
| DB schema change | `db/migrations/*.sql` | Add new file, load via `include_str!()` in `db/mod.rs` |

## Module Patterns

### Parsers (`parsers/`)
```rust
#[async_trait]
pub trait NovelParser: Send + Sync {
    fn matches_url(&self, url: &str) -> bool;
    async fn get_chapter(&self, url: &str) -> Result<ChapterContent, String>;
    async fn get_series_info(&self, url: &str) -> Result<SeriesInfo, String>;
}
```
- Use `scraper` crate for DOM parsing
- Static `parse_url_static()` for URL detection
- `#[ignore = "requires network"]` for integration tests

### Services (`services/`)
```rust
// translator.rs orchestrates the pipeline:
// Substitution(Pre) → Cache Check → LLM API Call → Substitution(Post) → Cache Save

pub enum ApiClient {
    Gemini(GeminiClient),
    OpenRouter(OpenRouterClient),
    Antigravity(AntigravityClient),
}
```
- **Gemini:** Google GenAI REST + SSE streaming
- **OpenRouter:** OpenAI Chat Completions + SSE streaming
- **Antigravity:** Local proxy, Gemini API format + SSE streaming
- **Custom/Anthropic/OpenAI:** Route through `OpenRouterClient::new_with_base_url()`

### Commands (`commands/`)
- Thin IPC layer; delegate ALL business logic to services
- Return `Result<T, String>` for Tauri error handling
- Series commands use `AtomicBool` statics for pause/stop control

## Anti-Patterns

| Avoid | Instead |
|-------|---------|
| `.unwrap()` in prod code | `?` or explicit error handling |
| Blocking in async | Use `spawn_blocking` |
| Hardcoded URLs | Constants or config |
| `sqlx::migrate!` macro | `include_str!()` + manual execute (current pattern) |

## Key Files

| File | Purpose |
|------|---------|
| `lib.rs:run()` | App setup, plugin init, DB init, command registration |
| `services/translator.rs` | Translation orchestration, provider switching, cache pipeline |
| `services/paragraph.rs` | Semantic ID encoding/decoding, LLM response HTML parsing |
| `parsers/mod.rs` | URL router, `NovelParser` trait, `fetch_html()` |
| `db/mod.rs` | Connection pool singleton, migrations, `get_pool()` |
| `commands/series.rs` | Batch translation with AtomicBool pause/stop |

## Testing
```bash
cargo test -p app_lib                    # Unit tests
cargo test -p app_lib -- --ignored       # Network integration tests
cargo clippy -- -D warnings              # Lint
```
