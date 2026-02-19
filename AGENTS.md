# AI Novel Translator

**Generated:** 2026-02-20 | **Commit:** 7ead666 | **Branch:** main

## Overview

Tauri 2.0 desktop app translating Japanese web novels → Korean. React frontend, Rust backend, SQLite persistence.

## Structure

```
./
├── src/                    # React frontend (thin UI layer)
│   ├── components/         # Feature-based: common/, layout/, translation/, series/, settings/
│   ├── stores/             # Zustand state (translation, series, ui, apiLog, debug)
│   ├── hooks/              # Custom React hooks (useTranslation, useTauriEvents, etc.)
│   ├── types/              # Shared TypeScript types (index.ts)
│   └── utils/              # Utilities (urlHistory.ts)
├── src-tauri/              # Rust backend (heavy logic)
│   └── src/                # See src-tauri/src/AGENTS.md
├── docs/                   # Technical documentation
│   └── references.md       # Comprehensive architecture reference
└── index.html              # Vite entry
```

## Where to Look

| Task                  | Location                        | Notes                                    |
| --------------------- | ------------------------------- | ---------------------------------------- |
| Add novel site parser | `src-tauri/src/parsers/`        | Implement `NovelParser` trait, add to `mod.rs` router |
| Add AI provider       | `src-tauri/src/services/`       | Add `ApiClient` enum variant in `translator.rs` |
| UI component          | `src/components/{feature}/`     | Feature-based organization               |
| Tauri command         | `src-tauri/src/commands/`       | Register in `lib.rs` invoke_handler      |
| DB migration          | `src-tauri/src/db/migrations/`  | Loaded via `include_str!()` in `db/mod.rs` |
| Settings UI           | `src/components/settings/`      | LLMSettings.tsx, TranslationSettings.tsx |
| LLM provider/model UI | `src/components/settings/llm/`  | ProviderList/Modal, ModelList/Modal      |
| Common UI components  | `src/components/common/`        | Button, Modal, Toggle, SearchableSelect, NumberStepper |

## Supported Sites

| Site     | Parser     | Domain              | Notes |
| -------- | ---------- | ------------------- | ----- |
| Syosetu  | `syosetu`  | ncode.syosetu.com   | Reference pattern |
| Hameln   | `hameln`   | syosetu.org         | |
| Kakuyomu | `kakuyomu` | kakuyomu.jp         | JS-rendered; parses embedded JSON. No batch support |
| Nocturne | `nocturne` | novel18.syosetu.com | 18+ cookie handling |

## API Providers

| Provider    | Auth                       | API Format       | Endpoint                          |
| ----------- | -------------------------- | ---------------- | --------------------------------- |
| Gemini      | API Key (`x-goog-api-key`) | Google GenAI     | generativelanguage.googleapis.com |
| OpenRouter  | API Key (`Bearer`)         | OpenAI Chat      | openrouter.ai/api/v1              |
| Antigravity | OAuth (localhost proxy)    | Google GenAI     | localhost:8045 (configurable)     |
| Custom      | API Key (`Bearer`)         | OpenAI Chat      | User-configured base URL          |

Provider types `anthropic`, `openai`, `custom` all route through `OpenRouterClient::new_with_base_url()`.

## Conventions

### TypeScript

- `verbatimModuleSyntax: true` → use `import type` for types
- Zustand for cross-component state (not Context)
- Feature-based component organization
- Tab-based navigation via `uiStore.currentTab` (no react-router)
- Headless UI for accessible modals and selects

### Rust

- Commands in `commands/`, logic in `services/`
- Parsers implement `NovelParser` async trait
- Async with tokio, DB with sqlx
- Commands return `Result<T, String>` for Tauri IPC
- No global app state — DB pool via `OnceLock`, control flags via `AtomicBool`

### Translation

- Paragraph IDs: `title`, `subtitle`, `p-1`, `p-2`, ... (semantic encoding in `paragraph.rs`)
- LLM format: `<p id="title">原文</p>` → `<p id="title">번역</p>`
- Ruby text: `漢字(읽는법)` format
- Cache: `SHA256(novel_id + ":" + original_text)` — per-novel isolation
- Substitution: regex-based pre/post text processing

### Frontend ↔ Backend Communication

- **Command-Response:** `invoke(cmd, args)` for parsing, settings, export
- **Event Streaming:** `listen(event)` for real-time translation chunks, progress, errors
- Key events: `translation-chunk`, `translation-complete`, `translation-error`, `translation-failed-paragraphs`, `debug-cache`, `debug-api`, `translation-progress`, `batch-translation-complete`, `chapter-completed`

## Anti-Patterns

| Pattern                               | Why                                    |
| ------------------------------------- | -------------------------------------- |
| `.unwrap()` in parsers                | Sites change; use `?` or handle errors |
| Edit `src-tauri/gen/*`                | Auto-generated, will be overwritten    |
| Remove `#![cfg_attr(...)]` in main.rs | Causes console window on Windows       |
| `as any`, `@ts-ignore`                | Type safety violations                 |
| `confirm()`, `alert()`, `prompt()`    | Use `@tauri-apps/plugin-dialog` instead |

## Workflow

- TDD-driven development (Red → Green → Refactor)
- Commit after completing feature implementation or bug fix
- Use conventional commit messages (feat:, fix:, refactor:, etc.)
- **Verification (MANDATORY)**: Run all checks before considering work complete:
  ```bash
  pnpm run lint          # TypeScript/ESLint
  pnpm run build         # Frontend build
  cd src-tauri && cargo test   # Rust tests
  cd src-tauri && cargo clippy -- -D warnings  # Rust lint
  ```

## Commands

```bash
pnpm install              # Install deps
pnpm run tauri dev        # Dev mode
pnpm run tauri build      # Production build
pnpm run build            # Frontend only
pnpm run test             # Frontend tests (vitest)
cd src-tauri && cargo test  # Rust tests
```

## Database Tables

```
novels → chapters → translations (1:N:N)    # Defined but unused in current flow
translation_cache (SHA256 dedup, per-novel)  # Primary persistence
completed_chapters (novel_id + chapter PK)   # Batch progress tracking
settings (key-value store)                   # All app configuration
api_keys (legacy, still used for add/remove) # API key storage
api_logs (request/response debugging)        # API call history
```

## Implementation Status

| Status     | Features                                                 |
| ---------- | -------------------------------------------------------- |
| ✅ Done    | 4 Parsers, 3+ Providers, SSE Streaming, Batch Translation, Per-novel Cache, TXT/HTML Export, Dark/Light Theme, API Logging, Debug Panel, Provider/Model CRUD, Substitution, URL History, Chapter Tracking, Retry Failed, View Settings, iOS Init |
| 🔲 Pending | EPUB export, Auto-retry (MAX_RETRIES=1), Key rotation, `novels`/`chapters`/`translations` table usage |

## AI Agent Guidelines

### Multi-Agent Coordination (MANDATORY)

When multiple agents collaborate on a task, coordination files track shared state:

| File | Purpose | When to Read | When to Write |
|------|---------|--------------|---------------|
| `PLAN.md` | What needs to be done — task breakdown, priorities, dependencies | **Always read first** before starting any work | When a plan is created or tasks are added/reprioritized |
| `PROGRESS.md` | What has been done — completed work, decisions made, current blockers | **Always read first** before starting any work | After completing a task, hitting a blocker, or making a key decision |

**Agent startup protocol (NON-NEGOTIABLE):**
1. Read `PLAN.md` — understand the full scope and what's assigned to you
2. Read `PROGRESS.md` — understand what others have done, avoid duplicate work
3. Begin your assigned work
4. Update `PROGRESS.md` as you complete tasks or encounter blockers

**PLAN.md format:**
```markdown
# Plan: [Feature/Task Name]
## Goal
[One-line objective]
## Tasks
- [ ] Task 1 — [owner/agent if assigned] — [priority]
- [x] Task 2 — completed
- [ ] Task 3 — depends on Task 1
## Notes
[Key decisions, constraints, open questions]
```

**PROGRESS.md format:**
```markdown
# Progress
## Completed
- [timestamp or order] Task description — what was done, key files changed
## In Progress
- Task description — current status, who is working on it
## Blockers
- Issue description — what's blocked and why
## Decisions
- Decision description — rationale
```

### Clarification Process

When information is insufficient or unclear, ask clarifying questions. Continue this iterative questioning process until you have a complete and clear understanding of the user's needs.

### Key Reference

For comprehensive technical details (all 40 commands, data flow, schema, event payloads), see `docs/references.md`.
