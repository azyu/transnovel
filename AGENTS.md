# AI Novel Translator

**Generated:** 2026-01-17 | **Commit:** e3e3c20 | **Branch:** main

## Overview
Tauri 2.0 desktop app translating Japanese web novels → Korean. React frontend, Rust backend, SQLite persistence.

## Structure
```
./
├── src/                    # React frontend (thin UI layer)
│   ├── components/         # Feature-based: translation/, series/, settings/
│   ├── stores/             # Zustand state
│   └── hooks/              # Custom React hooks
├── src-tauri/              # Rust backend (heavy logic)
│   └── src/                # See src-tauri/src/AGENTS.md
└── index.html              # Vite entry
```

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Add novel site parser | `src-tauri/src/parsers/` | Copy syosetu.rs pattern |
| Add AI provider | `src-tauri/src/services/` | Implement trait in translator.rs |
| UI component | `src/components/{feature}/` | Feature-based organization |
| Tauri command | `src-tauri/src/commands/` | Register in lib.rs |
| DB migration | `src-tauri/src/db/migrations/` | Embedded via sqlx::migrate! |
| Settings UI | `src/components/settings/` | LLMSettings.tsx, TranslationSettings.tsx |

## Supported Sites

| Site | Parser | Domain |
|------|--------|--------|
| Syosetu | `syosetu` | ncode.syosetu.com |
| Hameln | `hameln` | syosetu.org |
| Kakuyomu | `kakuyomu` | kakuyomu.jp |
| Nocturne | `nocturne` | novel18.syosetu.com |

## API Providers

| Provider | Auth | Endpoint |
|----------|------|----------|
| Gemini | API Key (`x-goog-api-key`) | generativelanguage.googleapis.com |
| Antigravity | OAuth (localhost proxy) | localhost:8045 |

## Conventions

### TypeScript
- `verbatimModuleSyntax: true` → use `import type` for types
- Zustand for cross-component state (not Context)
- Feature-based component organization

### Rust
- Commands in `commands/`, logic in `services/`
- Parsers implement common trait pattern
- Async with tokio, DB with sqlx

### Translation
- Paragraph IDs: A-Z, a-z, then AA, AB... (preserve in output)
- Ruby text: `漢字(읽는법)` format
- Cache via SHA256 hash

## Anti-Patterns

| Pattern | Why |
|---------|-----|
| `.unwrap()` in parsers | Sites change; use `?` or handle errors |
| Edit `src-tauri/gen/*` | Auto-generated, will be overwritten |
| Remove `#![cfg_attr(...)]` in main.rs | Causes console window on Windows |
| `as any`, `@ts-ignore` | Type safety violations |

## Commands
```bash
pnpm install              # Install deps
pnpm run tauri dev        # Dev mode
pnpm run tauri build      # Production build
pnpm run build            # Frontend only
cargo test -p app_lib     # Rust tests
```

## Database Tables
`novels` → `chapters` → `translations` (1:N:N)
`translation_cache` (SHA256 dedup), `api_keys`, `settings`

## Implementation Status

| Status | Features |
|--------|----------|
| ✅ Done | Parsers, Translation, Batch, TXT export, Cache |
| 🔲 Pending | EPUB export, Streaming display, Auto-retry, Key rotation |
