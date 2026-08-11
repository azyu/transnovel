# Product Contract Alignment Design

**Date:** 2026-07-12  
**Status:** Implemented locally; awaiting commit  
**Tracking:** GitHub Issue #27

## Goal

Bring the product-facing documentation, local execution tracker, GitHub backlog, and shared frontend UI strings back into alignment with the current implementation. This work corrects verified drift without adding unrelated product functionality.

## Source of Truth

Use the current code as the runtime source of truth:

- Tauri command registration: `src-tauri/src/lib.rs`
- Provider routing: `src-tauri/src/services/translator.rs`
- Cache storage: `src-tauri/src/services/cache.rs`
- Services and migrations: `src-tauri/src/services/mod.rs`, `src-tauri/src/db/mod.rs`, and migration SQL
- Frontend behavior and locale data: `src/`
- Durable backlog: GitHub Issues
- Active local execution snapshot: `.context/TASKS.md`

Historical plans and specs remain historical records. Where their pre-implementation status is misleading, add concise implementation status metadata rather than rewriting every old checklist.

## Scope

### 1. Product and architecture documentation

Update the following documents to match the current runtime:

- `README.md`, `README.ko.md`, `README.en.md`
  - Do not claim that Linux release installers are currently published.
  - Describe source execution as the development path rather than the default user installation path.
- `.context/STEERING.md`
  - Describe the cache as SQLite `translation_cache` storage.
  - Mark the old “OpenAI OAuth removed” decision as superseded and describe the current OAuth-token-to-Codex path.
  - State that UI-managed API keys live in SQLite while YAML override keys live in `config.yaml`; environment-variable input remains unsupported.
- `docs/quickstart.html`
  - Present Gemini as the recommended Quick Start path, not a universal requirement.
  - Document that native Anthropic transport is not implemented and direct users to OpenRouter or a Custom provider backed by an OpenAI-compatible proxy.
  - State that Syosetu and Nocturne accept work or chapter URLs, Hameln requires an individual `.htm`/`.html` chapter URL, and Kakuyomu should use individual episode URLs.
- `docs/references.md`
  - Refresh command registration, service modules, provider routing, migrations/tables, and watchlist surfaces from current code.
- `docs/index.html`
  - Use a non-versioned `latest` fallback that the release API replaces with `tag_name` on success.

### 2. Tracker and GitHub backlog

- Narrow the pending database task from `novels/chapters/translations` to `chapters/translations`, because `novels` metadata is already used.
- Move durable pending work into separate GitHub Issues:
  1. EPUB export
  2. Automatic provider retry
  3. Multiple API key storage and error-driven failover
  4. `chapters/translations` persistence integration
  5. Frontend accessibility keyboard and ARIA improvements
  6. Native Anthropic transport or removal of the nonfunctional preset
- Do not invent a “workspace refresh” Issue if its intended outcome cannot be recovered from code, history, or documentation. Report the ambiguity and remove the stale in-progress state only after preserving any recoverable intent.
- Keep `.context/TASKS.md` as an active execution snapshot rather than a long-term backlog.
- Verify Issue #26’s stated acceptance criteria, then close it.

### 3. Shared frontend i18n

Move verified hard-coded shared UI strings into the existing locale structure:

- Modal close label
- Toast close label
- NumberStepper decrement/increment labels
- StatusBar provider/model/empty-state and streaming/batch labels
- Header main-tab, language-selector, and theme-toggle accessibility labels

Prefer existing locale access patterns. Do not introduce a new global state or routing abstraction. If a shared component cannot use the existing locale pattern without undesirable coupling, use a small optional label prop supplied by localized call sites.

Change the Syosetu support link shown beside URL input from the general portal to `https://ncode.syosetu.com`, matching the documented parser input domain.

## Explicit Non-goals

- Re-enable Linux release jobs
- Implement EPUB export
- Implement retry behavior
- Add multiple-key configuration or failover behavior
- Connect `chapters/translations` persistence
- Implement native Anthropic transport or remove the Anthropic preset
- Implement the full accessibility keyboard-navigation backlog
- Refactor adjacent frontend components or alter visual design

## Testing

Add or update focused frontend tests for observable behavior:

- Modal, Toast, and NumberStepper accessible names in Korean and English
- StatusBar labels, empty states, and streaming/batch modes in Korean and English
- Header accessible names, theme states, and language selection state in Korean and English
- Syosetu support link target

Verify Issue #26 by running the release-note generator against the issue’s documented tag range and checking grouped sections, the full changelog link, and commit entries.

Then run repository verification:

1. Focused frontend tests
2. `pnpm run lint`
3. `pnpm run build`
4. `cd src-tauri && cargo test`
5. `cd src-tauri && cargo clippy -- -D warnings`
6. Independent code review

No check may be silently skipped. Report environmental or unrelated failures separately from implementation failures.

## External Change Ordering

1. Apply and verify local documentation, tracker, UI, and tests.
2. Complete an independent review.
3. Create durable backlog Issues.
4. Normalize `.context/TASKS.md` to the active local snapshot.
5. Close Issue #26 only after its verification passes.

If GitHub access fails, keep local completion and external tracker completion as separate statuses. Do not bypass permissions.

## Completion Criteria

- The verified documentation contradictions no longer reproduce.
- Shared KO/EN UI strings and accessible names follow the selected language in covered components.
- Focused and repository verification checks pass, or every failure is explicitly classified.
- Durable pending work exists as GitHub Issues rather than only in `.context/TASKS.md`.
- The stale combined accessibility/workspace entry no longer remains ambiguously in progress.
- Issue #26 is closed after verification.
- No unrelated files or behavior are changed.

## Commit Policy

This design approval authorizes local changes, verification, GitHub backlog Issue creation, and Issue #26 closure. It does not authorize commit or push; those require a separate user request.
