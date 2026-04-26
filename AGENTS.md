# TransNovel

Tauri 2.0 desktop app for translating Japanese web novels into Korean. The React frontend is a thin UI layer. The Rust backend owns parsing, translation, caching, export, and persistence.

## Source Of Truth

- Verify current code before trusting generated summaries or old status notes.
- If a document conflicts with the codebase, follow the code and update the document in the same change.
- Use GitHub Issues as the source of truth for backlog and non-trivial task context. Keep issue bodies short but sufficient: background, goal, scope, exclusions, verification, and follow-up links when needed.
- Use `src-tauri/src/AGENTS.md` for backend-specific rules.
- Use `docs/references.md` when you need command lists, event payloads, or architecture detail.
- Use `docs/DESIGN.md` as the design system contract for the GitHub Pages landing site (`docs/index.html`, `docs/quickstart.html`). Does not apply to the desktop app UI in `src/`.

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
| Landing site styling | `docs/` | Follow tokens and rules in `docs/DESIGN.md`; do not introduce new colors or `rounded` steps. Update DESIGN.md in the same change |

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
- For new work that should survive across sessions, create or update a GitHub Issue before implementation unless the task is truly trivial. Prefer one issue per independently shippable task.
- Use `.context/TASKS.md` as a local execution snapshot for active work, not as the long-term backlog. Keep durable backlog and follow-up items in GitHub Issues.
- Keep `.context/TASKS.md` as a single Markdown table with the columns `상태 | 등록일 | 작업내용 | 담당 agent`.
- Track only non-trivial work that directly affects product behavior, runtime or release reliability, supported sites/providers, persistence, or other shippable project outcomes.
- Skip rows for simple one-off chores and project-adjacent meta work such as README edits, agent-instruction maintenance, tracker format changes, issue workflow bookkeeping, and similar coordination-only updates.
- For multi-step implementation, keep the lightweight plan in the issue body or an issue comment. Write a dedicated document only when the task is complex enough that the plan or investigation needs to outlive the issue discussion.
- Use `[ ]`, `[~]`, and `[x]` in the `상태` column for pending, in progress, and done.
- Set `등록일` to the date when the task was first recorded in `.context/TASKS.md`. If the date is unclear, check `git log -- .context/TASKS.md` before editing.
- When starting mutating work, add a new row or update an existing row in `.context/TASKS.md` with `상태` = `[~]` and your agent name in `담당 agent`.
- When finishing mutating work, update that row to `상태` = `[x]` if the task is complete.
- For read-only review, planning, or investigation, read `.context/*` as needed and leave the tracker unchanged.
- If a task needs a durable project document, write it under `docs/`. Do not create parallel `mydocs/`-style task folders.
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

## After Code Changes

Default verification order:

1. Run the most relevant automated test scope for the changed behavior.
2. Run the repository verification checks in `## Verification`.
3. Ask a separate agent to review the completed code changes before declaring the task done.
4. Confirm the task DoD is satisfied.
5. Commit the completed work.

If a check is intentionally skipped, state why explicitly.
