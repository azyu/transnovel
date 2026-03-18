---
name: tauri-rust-patterns
description: >
  Tauri 2.0 + Rust backend conventions for the TransNovel project.
  Use when implementing Tauri commands, services, DB operations, or any Rust backend work.
  Triggers: new command, new service, DB migration, Rust code review, backend feature, async handler.
---

# Tauri Rust Patterns

## Project Architecture

```
commands/   → Thin IPC wrappers (NO business logic)
services/   → Business logic, API clients, caching
parsers/    → Site scrapers (NovelParser trait)
models/     → Shared data structs (serde derives)
db/         → SQLite via sqlx, OnceLock pool singleton
```

## Command Pattern

Commands are thin wrappers. All logic lives in `services/`.

```rust
// commands/translation.rs
#[tauri::command]
pub async fn translate_paragraphs_streaming(
    app: AppHandle,
    novel_id: String,
    paragraphs: Vec<String>,
    has_subtitle: Option<bool>,
    note: Option<String>,
    original_indices: Option<Vec<usize>>,
) -> Result<TranslateParagraphsResult, String> {
    reset_translation_control_flags();
    let mut translator = TranslatorService::new().await?;
    let translated = translator
        .translate_paragraphs_streaming(
            &novel_id, &paragraphs, has_subtitle.unwrap_or(true),
            note.as_deref(), original_indices, &app,
        )
        .await?;
    Ok(TranslateParagraphsResult { translated })
}
```

### Rules

- Return `Result<T, String>` — Tauri IPC requires String errors
- Use `async` for all commands
- Register in `lib.rs` `invoke_handler(generate_handler![...])`
- Accept `AppHandle` param when emitting events
- Serde derives: `#[derive(Debug, Serialize, Deserialize)]`
- Use `#[serde(rename_all = "camelCase")]` for frontend compat

## State Management

**No global app state.** Instead:

```rust
// DB pool — OnceLock singleton (db/mod.rs)
static DB_POOL: OnceLock<Pool<Sqlite>> = OnceLock::new();

pub fn get_pool() -> Result<&'static Pool<Sqlite>, String> {
    DB_POOL.get().ok_or_else(|| "DB not initialized".to_string())
}

// Control flags — AtomicBool (commands/series.rs)
static IS_PAUSED: AtomicBool = AtomicBool::new(false);
static SHOULD_STOP: AtomicBool = AtomicBool::new(false);
```

## DB Pattern

**SQLite via sqlx.** Manual migrations, NOT `sqlx::migrate!` macro.

```rust
// db/mod.rs — init
sqlx::query(include_str!("migrations/001_initial.sql"))
    .execute(&pool).await.map_err(|e| e.to_string())?;

// Adding columns (SQLite lacks IF NOT EXISTS for ALTER TABLE)
let has_col: Vec<(String,)> = sqlx::query_as(
    "SELECT name FROM pragma_table_info('table') WHERE name = 'column'"
).fetch_all(pool).await.map_err(|e| e.to_string())?;

if has_col.is_empty() {
    sqlx::query("ALTER TABLE table ADD COLUMN column TEXT")
        .execute(pool).await.map_err(|e| e.to_string())?;
}
```

### Migration Checklist

1. Create `migrations/NNN_description.sql`
2. Load via `include_str!()` in `db/mod.rs`
3. Guard with `pragma_table_info` check for idempotency
4. Never use `sqlx::migrate!` macro

## Event Emission

Frontend ↔ Backend via Tauri events:

```rust
use tauri::{AppHandle, Emitter};

// Emit to frontend
let _ = app_handle.emit("translation-chunk", TranslationChunk {
    paragraph_id: encode_paragraph_id(idx, has_subtitle),
    text: translated_text,
    is_complete: true,
});

// JSON events
let _ = app_handle.emit("debug-api", serde_json::json!({
    "type": "request",
    "provider": "gemini",
    "model": &self.model,
    "body": request_json
}));
```

Key events: `translation-chunk`, `translation-complete`, `translation-error`,
`translation-failed-paragraphs`, `debug-cache`, `debug-api`,
`translation-progress`, `batch-translation-complete`, `chapter-completed`

## Error Handling

```rust
// DO: Propagate with ? and map_err
let pool = get_pool()?;
let result = sqlx::query("...").execute(pool).await.map_err(|e| e.to_string())?;

// DO: Korean error messages for user-facing errors
return Err("API 키가 설정되지 않았습니다.".to_string());

// DON'T: .unwrap() in prod code (OK in Regex::new for compile-time patterns)
// DON'T: empty catch blocks
// DON'T: as any / type suppression equivalents
```

## Async Patterns

```rust
// Blocking in async — use spawn_blocking
let result = tokio::task::spawn_blocking(|| heavy_computation()).await;

// Fire-and-forget logging (don't block on log saves)
let entry = log_entry;
let _ = tokio::spawn(async move { api_logger::save_api_log(&entry).await });

// Pause loop with AtomicBool
while IS_PAUSED.load(Ordering::SeqCst) {
    if SHOULD_STOP.load(Ordering::SeqCst) { break; }
    tokio::time::sleep(Duration::from_millis(100)).await;
}
```

## App Setup (lib.rs)

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::translation::translate_chapter,
            // ... all commands here
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                if let Err(e) = db::init_db(&handle).await {
                    log::error!("Failed to initialize database: {}", e);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## Anti-Patterns

| Avoid | Instead |
|-------|---------|
| `.unwrap()` in prod code | `?` or explicit error handling |
| `sqlx::migrate!` macro | `include_str!()` + manual execute |
| Business logic in commands | Delegate to services |
| Blocking in async | `spawn_blocking` or `tokio::time::sleep` |
| Hardcoded URLs | Constants (`const API_BASE: &str`) |
| Edit `src-tauri/gen/*` | Auto-generated, will be overwritten |
| Remove `#![cfg_attr(...)]` in main.rs | Causes console window on Windows |
| `confirm()`, `alert()`, `prompt()` | Use `@tauri-apps/plugin-dialog` |

## Testing

```bash
cargo test -p app_lib                    # Unit tests
cargo test -p app_lib -- --ignored       # Network integration tests
cargo clippy -- -D warnings              # Lint (must pass clean)
```

Network tests use `#[ignore = "requires network"]`:

```rust
#[tokio::test]
#[ignore = "requires network - run with: cargo test -- --ignored"]
async fn test_get_chapter_selectors() {
    let parser = SyosetuParser::new();
    let result = parser.get_chapter("https://ncode.syosetu.com/n4029bs/1/").await;
    assert!(result.is_ok());
}
```
