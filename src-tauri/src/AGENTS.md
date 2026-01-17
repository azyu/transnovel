# Rust Backend

## Structure
```
src/
├── lib.rs              # Tauri app config, command registration
├── main.rs             # Binary entry (DO NOT modify cfg_attr)
├── commands/           # Tauri IPC handlers (thin wrappers)
├── services/           # Business logic (translator, gemini, antigravity)
├── parsers/            # Site scrapers (syosetu, hameln, kakuyomu, nocturne)
├── models/             # Shared structs
└── db/                 # SQLite init + migrations
```

## Where to Look

| Task | File | Pattern |
|------|------|---------|
| New site parser | `parsers/{site}.rs` | Copy syosetu.rs, add to mod.rs |
| New AI provider | `services/{provider}.rs` | Match gemini.rs interface |
| New Tauri command | `commands/{domain}.rs` | Add to lib.rs invoke_handler |
| DB schema change | `db/migrations/*.sql` | sqlx::migrate! embeds at compile |

## Module Patterns

### Parsers (`parsers/`)
```rust
pub async fn parse_chapter(url: &str) -> Result<Chapter, String>
pub async fn parse_series(url: &str) -> Result<Vec<ChapterInfo>, String>
```
- Use `scraper` crate for DOM
- `#[ignore = "requires network"]` for tests

### Services (`services/`)
```rust
// translator.rs orchestrates; provider files implement
pub async fn translate(paragraphs: &[String], prompt: &str) -> Result<Vec<String>, String>
```
- Gemini: direct API with key rotation
- Antigravity: localhost proxy with OAuth

### Commands (`commands/`)
- Thin IPC layer; delegate to services
- Return `Result<T, String>` for Tauri error handling

## Anti-Patterns

| Avoid | Instead |
|-------|---------|
| `.unwrap()` in prod code | `?` or explicit error handling |
| Blocking in async | Use `spawn_blocking` |
| Hardcoded URLs | Constants or config |

## Key Files

| File | Purpose |
|------|---------|
| `lib.rs:run()` | App setup, DB init, command registration |
| `services/translator.rs` | Translation orchestration, caching |
| `parsers/mod.rs` | Router for site detection |
| `db/mod.rs` | Connection pool, init_db() |

## Testing
```bash
cargo test -p app_lib                    # Unit tests
cargo test -p app_lib -- --ignored       # Network tests
```
