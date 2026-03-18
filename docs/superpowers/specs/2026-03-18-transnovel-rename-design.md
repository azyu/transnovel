# TransNovel Rename Design

Date: 2026-03-18
Status: Approved for implementation

## Goal

Rename the project from `AI Novel Translator` / `ai-novel-translator` to `TransNovel` / `transnovel` across user-facing surfaces and core internal identifiers, while avoiding unrelated refactors.

## Scope

Included:

- User-facing display names in app UI and docs
- Package and crate identifiers where the project currently uses `ai-novel-translator`
- Tauri app metadata such as `productName`
- OpenRouter metadata headers that identify the app
- Apple generated project metadata and related names when they are part of the committed tree
- Shared project documentation and agent docs that still reference the old name

Excluded:

- Unrelated architectural or behavioral changes
- Rewriting code that does not reference the old project name
- Non-project generic skill text unless it explicitly names this project

## Naming Rules

- Display name: `TransNovel`
- Internal slug/package name: `transnovel`
- Repository/app URL references that are project-branded: `https://transnovel.app`

## Implementation Plan

1. Update tracked name references in docs, package metadata, Tauri config, and UI labels.
2. Update Rust and service-level metadata such as crate/package fields and provider headers.
3. Update committed Apple project/generated metadata that still embeds the old name.
4. Run targeted search to confirm old project name references are removed or intentionally retained.
5. Run repository verification commands relevant to the rename.

## Risks

- Apple generated project files may embed the old slug in multiple places; partial edits can break builds if inconsistent.
- Renaming internal package identifiers can affect build tooling if any references are missed.
- Some project-specific skill files under `.agents/skills/` intentionally mention this repository and should be updated; generic cross-project skill content should not be touched.

## Verification

- `rg -n --hidden --glob '!.git' "AI Novel Translator|ai-novel-translator" .`
- `pnpm run lint`
- `pnpm run build`
- `pnpm run test`
- `cd src-tauri && cargo test`
