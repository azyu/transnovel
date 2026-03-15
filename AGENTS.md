# TransNovel

Tauri 2.0 desktop app for translating Japanese web novels into Korean. The React frontend is a thin UI layer. The Rust backend owns parsing, translation, caching, export, and persistence.

## Source Of Truth

- Verify current code before trusting generated summaries or old status notes.
- If a document conflicts with the codebase, follow the code and update the document in the same change.
- Use `src-tauri/src/AGENTS.md` for backend-specific rules.
- Use `docs/references.md` when you need command lists, event payloads, or architecture detail.

## Structure

```text
./
├── src/                    # React frontend
│   ├── components/         # Feature-based UI
│   ├── hooks/              # Tauri event and feature hooks
│   ├── stores/             # Zustand stores
│   ├── types/              # Shared TypeScript types
│   └── utils/              # Frontend utilities
├── src-tauri/              # Rust backend
│   └── src/                # Commands, services, parsers, models, db
├── docs/                   # Reference docs
└── .context/               # Task tracker and steering
```

## Where To Work

| Task | Location | Rule |
|---|---|---|
| UI component or settings flow | `src/components/` | Keep heavy logic out of React when Rust can own it |
| Shared frontend state | `src/stores/` | Use Zustand for cross-component state |
| Tauri command | `src-tauri/src/commands/` | Keep the command thin and delegate to services |
| Parser change | `src-tauri/src/parsers/` | Implement `NovelParser` and register both router paths |
| Translation or provider change | `src-tauri/src/services/` | Keep orchestration in `translator.rs` and transport in provider clients |
| DB migration | `src-tauri/src/db/migrations/` | Add SQL file and load it through `include_str!()` in `db/mod.rs` |

## Current Runtime Boundaries

### Supported sites

| Site | Parser | Notes |
|---|---|---|
| Syosetu | `syosetu` | Reference parser pattern |
| Hameln | `hameln` | Sequential chapter URLs |
| Kakuyomu | `kakuyomu` | Embedded JSON parsing, batch translation blocked |
| Nocturne | `nocturne` | Over-18 cookie handling |

### Provider routing

| Provider type | Client | Notes |
|---|---|---|
| `gemini` | `GeminiClient` | Google GenAI request and SSE format |
| `openrouter` | `OpenRouterClient::new()` | OpenRouter endpoint and OpenAI Chat format |
| `anthropic`, `openai`, `custom` | `OpenRouterClient::new_with_base_url()` | OpenAI-compatible base URL |
| `openai-oauth` | `CodexClient` | OAuth tokens refreshed through `openai_oauth` |

### Translation invariants

- Keep paragraph IDs semantic: `title`, optional `subtitle`, then `p-N`.
- Keep the cache key formula as `SHA256(novel_id + ":" + original_text)`.
- Keep provider output compatible with `<p id="...">...</p>` parsing and `</main>` termination.
- Keep frontend event contracts stable unless the task explicitly changes them.

## Working Rules

- Use `import type` for TypeScript type-only imports.
- Keep tab navigation on `uiStore.currentTab`; do not introduce router-based tab switching.
- Keep frontend code focused on rendering, local interaction, and invoking backend commands.
- Put backend business logic in `src-tauri/src/services/`.
- Return `Result<T, String>` from Tauri commands.
- Use the existing `OnceLock` DB pool and `AtomicBool` control flags instead of introducing a new shared-state pattern.
- Use `@tauri-apps/plugin-dialog` for dialogs instead of browser `confirm()`, `alert()`, or `prompt()`.

## Safety Boundaries

- Treat `src-tauri/gen/*` as generated output and leave it untouched.
- Preserve `#![cfg_attr(...)]` in `src-tauri/src/main.rs`.
- If a task appears to require breaking one of these boundaries, stop and explain the conflict before editing.

## Agent Coordination

- Before mutating tracked files, read `.context/TASKS.md` and `.context/STEERING.md`.
- When starting mutating work, add or update an `[~]` item in `.context/TASKS.md` with your agent name.
- When finishing mutating work, update that item to `[x]` if the task is complete.
- For read-only review, planning, or investigation, read `.context/*` as needed and leave the tracker unchanged.
- If intent is still unclear after checking code and docs, state the ambiguity explicitly and ask one focused clarifying question.

## Verification

- For code changes, run the relevant checks before closing the task:
  ```bash
  pnpm run lint
  pnpm run build
  cd src-tauri && cargo test
  cd src-tauri && cargo clippy -- -D warnings
  ```
- For docs-only changes, state that runtime verification was skipped because application behavior did not change.
