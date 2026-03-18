---
name: tauri-rust-patterns
description: >
  Baseline Tauri 2.0 and Rust backend conventions for the TransNovel project.
  Use when the task changes backend structure, command wiring, DB access, shared models,
  or generic Rust service patterns that are not specific to a parser or provider domain.
  Triggers: tauri command, backend wiring, DB migration, shared rust pattern, rust backend review.
---

# Tauri Rust Patterns

Use this as the baseline backend conventions skill. If the task is parser-specific, provider-specific, or translation-pipeline-specific, use the matching domain skill first and apply this file only for shared Rust/Tauri conventions.

## Architecture Rules

- Put Tauri IPC entrypoints in `commands/`.
- Put business logic and provider clients in `services/`.
- Put site scraping logic in `parsers/`.
- Put persisted schema and migration work in `db/`.

## Command Rules

- Return `Result<T, String>` from Tauri commands.
- Accept `AppHandle` when the command emits frontend events.
- Keep command bodies thin: validate inputs, construct services, delegate work, return results.

## State Rules

- Use the existing `OnceLock` database pool from `db/mod.rs` for shared DB access.
- Use the existing `AtomicBool` control flags for pause and stop flow in batch translation.
- If a task needs broader shared state, stop and justify it before introducing a new pattern.

## DB Rules

- Add new SQL files under `src-tauri/src/db/migrations/`.
- Load migrations through `include_str!()` in `db/mod.rs`.
- Guard SQLite column additions with an idempotency check such as `pragma_table_info(...)`.
- Keep schema changes aligned with current manual migration style instead of introducing a separate migration system.

## Error And Event Rules

- Convert backend failures into clear `String` errors for IPC boundaries.
- Use Korean user-facing error messages where the existing code already presents errors to end users.
- Emit existing event names and payload shapes unless the task explicitly changes the frontend contract.

## Safety Boundaries

- Treat `src-tauri/gen/*` as generated output and leave it untouched.
- Preserve `#![cfg_attr(...)]` in `main.rs`; if a task appears to require changing it, stop and explain why.

## Fallbacks

- If a change starts pulling business logic into a command, move the logic into a service before adding more code.
- If a DB change needs a new runtime capability and the current migration pattern cannot express it safely, stop and explain the gap instead of introducing a second migration mechanism silently.
- If the task mixes domain work with backend wiring, make the domain change in its own file first and then update command registration or DB wiring second.
