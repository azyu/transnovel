# TransNovel - Technical Reference

**Generated:** 2026-02-20 | **Commit:** 7ead666 (main) | **253 commits**

## 1. Architecture Overview

Tauri 2.0 desktop app: React 19 frontend (thin UI) + Rust backend (heavy logic) + SQLite persistence.

```
User → React UI → Tauri IPC (invoke/emit) → Rust Commands → Services → External APIs
                                                            → Parsers  → Novel Sites
                                                            → DB       → SQLite
```

**Data flow for a single chapter translation:**
1. Frontend `invoke('parse_chapter', { url })` → Parser scrapes HTML → Returns paragraphs
2. Frontend `invoke('translate_paragraphs_streaming', { ... })` → TranslatorService
3. TranslatorService: Substitution(Pre) → Cache Check → LLM API Call → Substitution(Post) → Cache Save
4. Rust `app.emit("translation-chunk", ...)` streams results back in real-time
5. Frontend `listen("translation-chunk")` updates UI paragraph-by-paragraph

## 2. Tech Stack

### Frontend
| Tech | Version | Purpose |
|------|---------|---------|
| React | 19.2.0 | UI framework |
| TypeScript | 5.9.3 | Type safety (`strict`, `verbatimModuleSyntax`) |
| Vite | 7.2.4 | Build tool |
| Tailwind CSS | 3.4.19 | Styling (dark mode default) |
| Zustand | 5.0.5 | State management |
| Headless UI | 2.2.9 | Accessible modal, select components |
| Vitest | 4.0.17 | Test framework (jsdom) |

### Backend (Rust)
| Crate | Version | Purpose |
|-------|---------|---------|
| tauri | 2.9.5 | App framework |
| sqlx | 0.8 | SQLite async ORM |
| tokio | 1.x | Async runtime |
| reqwest | 0.12 | HTTP client (JSON + SSE streaming) |
| scraper | 0.23 | HTML DOM parsing |
| serde/serde_json | 1.0 | Serialization |
| thiserror | 2.0 | Error types |
| sha2 + hex | 0.10/0.4 | Cache hashing |
| regex | 1.11 | Text substitution, HTML parsing |
| async-trait | 0.1 | Parser trait |
| chrono | 0.4 | Timestamps |
| uuid | 1.0 | Log entry IDs |

### Tauri Plugins
| Plugin | Purpose |
|--------|---------|
| tauri-plugin-http | CSP-aware HTTP requests |
| tauri-plugin-dialog | Native file save dialogs |
| tauri-plugin-log | Structured logging |
| tauri-plugin-sql | SQLite (used for plugin init, actual queries via sqlx) |

## 3. Frontend Architecture

### 3.1 Component Tree
```
App.tsx                              # Tab-based routing via uiStore.currentTab
├── Header.tsx                       # Tab navigation (translation | series | settings)
├── [tabpanel: translation]
│   └── TranslationView.tsx          # Main translation UI
│       ├── UrlInput.tsx             # URL entry with history dropdown
│       ├── ParagraphList.tsx        # Parallel text display (original ↔ translated)
│       └── SaveModal.tsx            # Export dialog (TXT/HTML, with/without original)
├── [tabpanel: series]
│   └── SeriesManager.tsx            # Batch translation entry
│       ├── ChapterList.tsx          # Chapter list with completion status
│       └── BatchTranslationModal.tsx # Real-time batch progress
├── [tabpanel: settings]
│   └── SettingsPanel.tsx            # Tabbed settings container
│       ├── LLMSettings.tsx          # Provider + Model management
│       │   └── llm/
│       │       ├── ProviderList.tsx  # Provider CRUD
│       │       ├── ProviderModal.tsx # Add/edit provider
│       │       ├── ModelList.tsx     # Model CRUD
│       │       ├── ModelModal.tsx    # Add/edit model (with API fetch)
│       │       └── types.ts         # LLM-specific types
│       ├── TranslationSettings.tsx  # System prompt, notes, substitution
│       ├── ViewSettings.tsx         # Font size, weight, spacing
│       ├── ApiLogsSettings.tsx      # API request/response history
│       │   └── ApiLogDetailModal.tsx # Log detail viewer
│       ├── AdvancedSettings.tsx     # Cache management, reset
│       └── AboutSettings.tsx        # Version info
├── StatusBar.tsx                    # Bottom status bar
├── Toast.tsx                        # Notification popups
└── common/                          # Shared atomic components
    ├── Button.tsx
    ├── Input.tsx
    ├── Modal.tsx                    # Headless UI Dialog wrapper
    ├── Toggle.tsx                   # Switch component
    ├── NumberStepper.tsx            # Numeric +/- control
    ├── SearchableSelect.tsx         # Headless UI Combobox wrapper
    └── DebugPanel.tsx               # Translation debug log viewer
```

### 3.2 Navigation
- **No router** (react-router not used)
- Tab-based: `uiStore.currentTab` controls visibility via CSS (`opacity-0 invisible` / `opacity-100 visible`)
- Lazy rendering: `SeriesManager` and `SettingsPanel` only mount when their tab is active

### 3.3 Zustand Stores
| Store | File | State | Purpose |
|-------|------|-------|---------|
| `useTranslationStore` | `translationStore.ts` | `chapter`, `paragraphById`, `translatedCount`, `isTranslating`, `failedParagraphIndices` | Current chapter state, paragraph-level translation tracking |
| `useSeriesStore` | `seriesStore.ts` | `novelMetadata`, `chapterList`, `batchProgress` | Series/batch translation state |
| `useUIStore` | `uiStore.ts` | `currentTab`, `theme`, `toast`, `viewConfigVersion` | App-wide UI state |
| `useApiLogStore` | `apiLogStore.ts` | `logs`, `totalCount`, `currentPage`, `filter` | API log pagination + filtering |
| `useDebugStore` | `debugStore.ts` | `debugMode`, `debugLogs` | In-memory debug log stream (buffered, max 500 entries) |

### 3.4 Custom Hooks
| Hook | File | Purpose |
|------|------|---------|
| `useTranslation` | `useTranslation.ts` | **Primary logic hub.** Wraps all Tauri invocations (parse, translate, batch, retry, export). Sets up event listeners for streaming. |
| `useTauriEvents` | `useTauriEvents.ts` | Global background event listeners (batch progress, chapter-completed) |
| `useKeyboardShortcuts` | `useKeyboardShortcuts.ts` | App-wide keyboard shortcuts |
| `useViewSettings` | `useViewSettings.ts` | Loads font/spacing settings from backend, computes CSS values |

### 3.5 Frontend → Backend Communication
| Pattern | API | Usage |
|---------|-----|-------|
| Command-Response | `invoke(cmd, args)` | Parsing, settings CRUD, export |
| Event Streaming | `listen(event, handler)` | `translation-chunk`, `translation-complete`, `translation-error`, `translation-failed-paragraphs`, `debug-cache`, `debug-api`, `translation-progress`, `batch-translation-complete`, `chapter-completed` |

### 3.6 Types (`src/types/index.ts`)
| Type | Fields | Usage |
|------|--------|-------|
| `TabType` | `'translation' \| 'series' \| 'settings'` | Navigation |
| `NovelMetadata` | `site, novel_id, title, author, total_chapters` | Series info |
| `Chapter` | `number, title, url, status?` | Chapter list |
| `Paragraph` | `id, original, translated?` | Translation unit |
| `ChapterContent` | `site, novel_id, chapter_number, title, subtitle, paragraphs, prev_url, next_url, novel_title` | Parsed chapter |
| `TranslationChunk` | `paragraph_id, text, is_complete` | Streaming event payload |
| `ApiKey` | `id, key_type, api_key, is_active` | API key management |
| `TranslationProgress` | `current_chapter, total_chapters, chapter_title, status, error_message?` | Batch progress |
| `ExportOptions` | `format, include_original, include_notes, output_dir?` | Export config |
| `ExportRequest` | `novel_id, novel_title, chapters, options` | Export payload |
| `ApiLogSummary/Entry` | `id, timestamp, method, path, status, durationMs, model?, provider, protocol, inputTokens?, outputTokens?, error?` | API debugging |

## 4. Backend Architecture

### 4.1 Module Structure
```
src-tauri/src/
├── lib.rs              # App setup: plugins, command registration, DB init
├── main.rs             # Binary entry (DO NOT modify cfg_attr)
├── commands/           # Tauri IPC handlers (thin wrappers → services)
│   ├── mod.rs
│   ├── translation.rs  # translate_chapter, translate_text, translate_paragraphs, translate_paragraphs_streaming
│   ├── parser.rs       # parse_url, parse_chapter, get_chapter_content, get_chapter_list, get_series_info
│   ├── series.rs       # start_batch_translation, pause/resume/stop, mark_chapter_complete, get_completed_chapters
│   ├── export.rs       # export_novel, save_chapter, save_chapter_with_dialog
│   ├── settings.rs     # get/set_setting, API key CRUD, fetch_*_models, cache stats, reset
│   └── api_logs.rs     # get_api_logs, get_api_log_detail, get_api_logs_count, clear_api_logs
├── services/           # Business logic
│   ├── mod.rs
│   ├── translator.rs   # TranslatorService: provider switching, pipeline orchestration
│   ├── gemini.rs       # GeminiClient: Google Generative AI API (REST + SSE streaming)
│   ├── openrouter.rs   # OpenRouterClient: OpenAI-compatible API (REST + SSE streaming)
│   ├── cache.rs        # SHA256 cache: get_cached_translations, cache_translations (batched tx)
│   ├── paragraph.rs    # Semantic ID encoding (title/subtitle/p-N), HTML response parsing
│   ├── substitution.rs # Regex-based pre/post text substitution
│   └── api_logger.rs   # API request/response logging to SQLite
├── parsers/            # Site scrapers (async_trait NovelParser)
│   ├── mod.rs          # ParsedUrl::from_url(), get_parser_for_url(), fetch_html()
│   ├── syosetu.rs      # ncode.syosetu.com
│   ├── hameln.rs       # syosetu.org
│   ├── kakuyomu.rs     # kakuyomu.jp (JS-rendered, uses embedded JSON)
│   └── nocturne.rs     # novel18.syosetu.com (18+ cookie handling)
├── models/             # Shared data structs
│   ├── mod.rs
│   ├── novel.rs        # Novel, Chapter, ChapterContent, ChapterInfo, SeriesInfo, TranslationProgress
│   ├── translation.rs  # TranslationRequest, TranslationResult, Paragraph, TranslationCache
│   └── api_log.rs      # ApiLogEntry, ApiLogSummary
└── db/                 # SQLite persistence
    ├── mod.rs           # init_db(), get_pool() (OnceLock<Pool<Sqlite>>), run_migrations()
    ├── schema.rs        # SCHEMA_VERSION constant
    └── migrations/
        ├── 001_initial.sql           # Core tables: novels, chapters, translations, translation_cache, api_keys, settings, completed_chapters
        ├── 002_api_logs.sql          # api_logs table
        └── 003_api_logs_provider.sql # ALTER TABLE api_logs ADD provider column
```

### 4.2 Registered Tauri Commands (40 total)
```
commands::translation::  translate_chapter, translate_text, translate_paragraphs, translate_paragraphs_streaming
commands::parser::       parse_url, parse_chapter, get_chapter_content, get_chapter_list, get_series_info
commands::series::       start_batch_translation, pause_translation, resume_translation, stop_translation,
                         get_translation_progress, mark_chapter_complete, get_completed_chapters
commands::export::       export_novel, save_chapter, save_chapter_with_dialog
commands::settings::     get_settings, set_setting, get_api_keys, add_api_key, remove_api_key,
                         open_url,
                         fetch_gemini_models, fetch_openrouter_models,
                         get_cache_stats, get_cache_stats_detailed, clear_cache, clear_cache_by_novel, reset_all
commands::api_logs::     get_api_logs, get_api_log_detail, get_api_logs_count, clear_api_logs
```

### 4.3 Parser Trait
```rust
#[async_trait]
pub trait NovelParser: Send + Sync {
    fn matches_url(&self, url: &str) -> bool;
    async fn get_chapter(&self, url: &str) -> Result<ChapterContent, String>;
    async fn get_series_info(&self, url: &str) -> Result<SeriesInfo, String>;
}
```

**Supported sites:**
| Site | Parser | Domain | Notes |
|------|--------|--------|-------|
| Syosetu | `syosetu.rs` | `ncode.syosetu.com` | Most common, used as reference pattern |
| Hameln | `hameln.rs` | `syosetu.org` | Similar to Syosetu |
| Kakuyomu | `kakuyomu.rs` | `kakuyomu.jp` | JS-rendered; parses embedded `__NEXT_DATA__` JSON |
| Nocturne | `nocturne.rs` | `novel18.syosetu.com` | 18+ site; sends `over18=yes` cookie |

**URL routing:** `ParsedUrl::from_url()` tries each parser's static URL matcher in order.

### 4.4 TranslatorService Pipeline
```
TranslatorService::new()
  → load_settings() → read providers/models from settings table
  → create ApiClient enum (Gemini | OpenRouter)
  → create SubstitutionService from config

translate_paragraphs_streaming()
  1. substitution.apply_to_paragraphs(input)           # Pre-process
  2. get_cached_translations(novel_id, preprocessed)     # Cache lookup
  3. emit("debug-cache") for each paragraph              # Debug events
  4. emit("translation-chunk") for cache hits             # Send cached results immediately
  5. For uncached: chunk by 50KB threshold
     a. client.translate_streaming() → SSE stream
     b. paragraph.rs parses <p id="..."> tags from stream
     c. emit("translation-chunk") per completed paragraph
     d. substitution.apply_to_paragraphs(output)         # Post-process
     e. cache_translations(novel_id, pairs)               # Save to cache
  6. emit("translation-complete") or emit("translation-failed-paragraphs")
```

### 4.5 API Providers
| Provider | API Format | Auth | Streaming | Base URL |
|----------|-----------|------|-----------|----------|
| Gemini | Google Generative AI | `x-goog-api-key` header | SSE (`?alt=sse`) | `generativelanguage.googleapis.com/v1beta` |
| OpenRouter | OpenAI Chat Completions | `Bearer` token | SSE (`stream: true`) | `openrouter.ai/api/v1` |
| Custom | OpenAI Chat Completions | `Bearer` token | SSE | User-configured base URL |

**Provider switching:** Uses `ApiClient` enum. `provider_type` field from settings determines which variant.

**Also supports `anthropic`, `openai`, `custom` provider types** — these all route through `OpenRouterClient::new_with_base_url()`.

### 4.6 Paragraph ID Encoding
The system uses semantic IDs to track paragraph identity through the translation pipeline:

```
Index 0           → "title"
Index 1 (if sub)  → "subtitle"
Index 2+ (if sub) → "p-1", "p-2", ...
Index 1+ (no sub) → "p-1", "p-2", ...
```

LLM input format: `<p id="title">日本語タイトル</p>`
LLM output format: `<p id="title">일본어 타이틀</p>`

The parser (`paragraph.rs`) handles malformed HTML gracefully:
- Missing `</p>` before next `<p` tag
- Missing `</p>` at end (uses `</main>` as fallback boundary)
- Less-than symbols in content

### 4.7 Caching
- **Hash:** `SHA256(novel_id + ":" + original_text)` — per-novel isolation
- **Storage:** `translation_cache` table with `hit_count` and `last_used_at`
- **Batch:** Uses SQLite transactions for bulk inserts
- **Cache invalidation:** Manual only (clear_cache, clear_cache_by_novel)

### 4.8 Substitution Service
Regex-based text replacement applied before and after translation.

```
# Config format (from settings "substitutions" key):
pattern/replacement     # One rule per line
# Comments start with #

# Examples:
상하이/상해              # Simple text replacement
(철수)([은는이가을를])/영희$2  # Regex with capture groups
```

### 4.9 Batch Translation
- **Control:** `AtomicBool` statics (`IS_PAUSED`, `SHOULD_STOP`) for thread-safe pause/stop
- **Skip completed:** Reads `completed_chapters` table, skips already-translated chapters
- **Events:** `translation-progress`, `chapter-completed`, `batch-translation-complete`, `translation-error`
- **Limitation:** Kakuyomu batch not supported (chapter URLs not sequential)

### 4.10 Export
| Format | Implementation | Output |
|--------|---------------|--------|
| TxtSingle | `export_txt_single()` | Single `.txt` file with all chapters |
| TxtChapters | `export_txt_chapters()` | Directory with `{NNNN}_{title}.txt` per chapter |
| Html (save) | `save_chapter_with_dialog()` | Single HTML with ruby text support |
| Epub | Not implemented | Returns error |

**Ruby text conversion:** `漢字(읽는법)` → `<ruby>漢字<rt>읽는법</rt></ruby>` (HTML export only)

## 5. Database Schema

### Tables (7 total)
```sql
novels (id, site, novel_id, title, author, total_chapters, created_at, updated_at)
  UNIQUE(site, novel_id)

chapters (id, novel_id FK→novels, chapter_number, chapter_url, title, subtitle, original_content, status, created_at)
  UNIQUE(novel_id, chapter_number)

translations (id, chapter_id FK→chapters, paragraph_index, original_text, translated_text, model_used, created_at)
  UNIQUE(chapter_id, paragraph_index)

translation_cache (id, text_hash UNIQUE, novel_id, original_text, translated_text, hit_count, created_at, last_used_at)

api_keys (id, key_type, api_key, is_active, daily_usage, last_used_at, last_error, created_at)

settings (key PK, value, updated_at)

completed_chapters (novel_id + chapter_number PK, paragraph_count, completed_at)

api_logs (id PK, timestamp, method, path, status, duration_ms, model, provider, protocol, input_tokens, output_tokens, request_body, response_body, error)
```

### Settings Keys (key-value store)
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `llm_providers` | JSON array | `[]` | `[{id, type, apiKey, baseUrl}]` |
| `llm_models` | JSON array | `[]` | `[{id, providerId, modelId}]` |
| `active_model_id` | string | none | Currently selected model |
| `system_prompt` | string | Built-in Korean translation prompt | LLM system instruction |
| `translation_note` | string | `""` | Additional per-novel instructions |
| `substitutions` | string | `""` | Pre/post processing rules |
| `use_streaming` | `"true"/"false"` | `"true"` | Enable SSE streaming |
| `model` | string | `gemini-2.0-flash` | Legacy default model |
| `temperature` | string | `1.0` | Legacy default temperature |
| `top_p` | string | `0.95` | Legacy default top_p |

### Migration Strategy
- **No sqlx::migrate!** — Uses `include_str!()` + manual `sqlx::query().execute()` per migration
- **Schema evolution:** `run_migrations()` checks columns via `pragma_table_info()` before ALTER TABLE
- **Connection:** `OnceLock<Pool<Sqlite>>` singleton, 5 max connections

## 6. Tauri Events (Backend → Frontend)

| Event | Payload | Source | Description |
|-------|---------|--------|-------------|
| `translation-chunk` | `{paragraph_id, text, is_complete}` | `translator.rs`, streaming clients | Real-time paragraph translation |
| `translation-complete` | `{success, total, failed_count, input_tokens, output_tokens, stopped?}` | `translator.rs` | Translation finished |
| `translation-failed-paragraphs` | `{failed_indices, total}` | `translator.rs` | List of failed paragraph indices |
| `translation-error` | `{error_type, title, message, request_preview?, response_preview?}` | `translator.rs` | Error with context |
| `translation-progress` | `TranslationProgress` | `series.rs` | Batch: current chapter progress |
| `chapter-completed` | `{chapter, novel_id}` | `series.rs` | Batch: one chapter done |
| `batch-translation-complete` | `novel_id` | `series.rs` | Batch: all chapters done |
| `debug-cache` | `{paragraph_id, cache_hit, original_preview}` | `translator.rs` | Cache hit/miss debug |
| `debug-api` | `{type, provider, model?, status?, body}` | streaming clients | API request/response debug |

## 7. Configuration

### Tauri App Config (`tauri.conf.json`)
- **Identifier:** `com.azyu.noveltr`
- **Window:** 1200x800 (min 800x600), centered, resizable
- **CSP:** `self`, `generativelanguage.googleapis.com`, `localhost:8080`
- **Targets:** All platforms (macOS, Windows, Linux)
- **iOS:** Initialized (`tauri ios init` done)

### TypeScript Config
- **Strict mode:** Enabled (`strict`, `noUnusedLocals`, `noUnusedParameters`)
- **Module:** `verbatimModuleSyntax: true` — must use `import type` for type-only imports
- **Target:** ES2022
- **No path aliases configured**

### ESLint
- Flat config format (`eslint.config.js`)
- `typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh`

## 8. Implementation Status

### Done
- 4 site parsers (Syosetu, Hameln, Kakuyomu, Nocturne)
- 3 API providers (Gemini, OpenRouter) + custom/anthropic/openai routing
- SSE streaming translation with real-time UI updates
- Per-novel SHA256 translation cache
- Batch translation with pause/stop/resume controls
- TXT export (single file + per-chapter)
- HTML export with ruby text support via save dialog
- Dark/Light theme
- API request/response logging with detail viewer
- Debug panel with buffered log stream
- Provider/Model CRUD with dynamic model fetching
- Regex-based text substitution (pre/post processing)
- URL history with metadata
- Chapter completion tracking
- View settings (font size, weight, spacing)
- Failed paragraph retry mechanism
- iOS project initialized

### Not Implemented
- EPUB export (returns error)
- Auto-retry on API failure (manual retry only, MAX_RETRIES=1)
- API key rotation (single key per provider)
- `novels`, `chapters`, `translations` tables exist but are unused (cache-only flow)

## 9. Key Patterns & Conventions

### Error Handling
- **Rust commands:** Return `Result<T, String>` — Tauri serializes errors as strings to frontend
- **No custom error types in commands** — `thiserror` + `anyhow` available but not actively used in command layer
- **Frontend:** Try/catch with `showError()` toast notifications

### State Flow
- **Settings:** Stored in SQLite `settings` table as key-value pairs. Loaded fresh on each `TranslatorService::new()`
- **Translation state:** In-memory only (Zustand). Not persisted between sessions except via cache
- **Completion tracking:** `completed_chapters` table survives restarts

### Code Style
- **Korean** error messages and UI text throughout
- **Feature-based** component organization (`translation/`, `series/`, `settings/`)
- **Commands are thin wrappers** — business logic lives in services
- **No global app state** in Rust — DB pool via `OnceLock`, control flags via `AtomicBool`
