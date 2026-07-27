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

- Before mutating tracked files, read `.context/STEERING.md` and the relevant GitHub Issue.
- GitHub Issues are the sole source of truth for task, backlog, plan, progress, blocker, verification, and completion state. Do not maintain a parallel local task or Todo tracker.
- Create or update a GitHub Issue before starting non-trivial work. Prefer one Issue per independently shippable task; reuse an existing Issue when it already covers the work.
- Keep Issue bodies short but sufficient: background, goal, scope, exclusions, and verification. Put lightweight multi-step plans and subsequent progress in the Issue body or comments.
- Record blockers, consequential decisions, verification evidence, commit/PR links, and follow-up Issue links in the active Issue.
- Close an Issue only after its acceptance criteria and verification pass. If work stops incomplete, leave the Issue open and record the exact blocker or remaining scope.
- Work too trivial to merit durable tracking does not need an Issue, but must not be added to a local tracker.
- Completed history migrated from `.context/TASKS.md` is archived in GitHub Issue #35. Do not recreate `.context/TASKS.md`.
- For read-only review, planning, or investigation, update the relevant Issue only when the result must survive the current session.
- If a task needs a durable project document, write it under `docs/`. Do not create parallel `mydocs/`-style task folders.
- If intent is still unclear after checking code, docs, and Issues, state the ambiguity explicitly and ask one focused clarifying question.

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
