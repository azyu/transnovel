# TransNovel Rename Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the project from `AI Novel Translator` / `ai-novel-translator` to `TransNovel` / `transnovel` across user-visible surfaces and core project metadata without changing behavior.

**Architecture:** This is a surgical rename. Update committed references in docs, frontend copy, package metadata, Rust/Tauri configuration, and committed Apple project metadata. Keep behavior unchanged and verify the rename with search plus normal project checks.

**Tech Stack:** Markdown, JSON, TypeScript/React, Rust/Tauri, Xcode project metadata

---

## Chunk 1: Docs And UI Labels

### Task 1: Update project-facing documentation names

**Files:**
- Modify: `README.md`
- Modify: `README.ko-kr.md`
- Modify: `AGENTS.md`
- Modify: `docs/references.md`
- Modify: `.context/TASKS.md`

- [ ] Step 1: Update display name references from `AI Novel Translator` to `TransNovel`.
- [ ] Step 2: Update slug references from `ai-novel-translator` to `transnovel` only where they identify this project.
- [ ] Step 3: Keep all existing behavior/status text intact aside from rename-specific edits.

### Task 2: Update frontend display labels

**Files:**
- Modify: `src/components/settings/AboutSettings.tsx`

- [ ] Step 1: Replace visible app name and alt text with `TransNovel`.
- [ ] Step 2: Confirm no behavior or layout code changes are mixed in.

## Chunk 2: Package, Rust, And Tauri Metadata

### Task 3: Update package and Tauri metadata

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/capabilities/default.json`

- [ ] Step 1: Change package/crate slug references to `transnovel`.
- [ ] Step 2: Change user-facing product names to `TransNovel`.
- [ ] Step 3: Update any repository/app URL or author strings only where they are project-branded.

### Task 4: Update service-level provider metadata

**Files:**
- Modify: `src-tauri/src/services/openrouter.rs`
- Modify: `.agents/skills/llm-api-integration/SKILL.md`

- [ ] Step 1: Update `HTTP-Referer` to `https://transnovel.app`.
- [ ] Step 2: Update `X-Title` to `TransNovel`.
- [ ] Step 3: Keep request behavior otherwise identical.

## Chunk 3: Committed Apple Metadata

### Task 5: Update committed Apple project names

**Files:**
- Modify: `src-tauri/gen/apple/Podfile`
- Modify: `src-tauri/gen/apple/project.yml`
- Modify: `src-tauri/gen/apple/ai-novel-translator.xcodeproj/project.pbxproj`
- Modify: `src-tauri/gen/apple/ai-novel-translator.xcodeproj/xcshareddata/xcschemes/ai-novel-translator_iOS.xcscheme`

- [ ] Step 1: Update display names to `TransNovel`.
- [ ] Step 2: Update committed slug/target references from `ai-novel-translator` to `transnovel` only if all linked references in the same committed metadata set are updated consistently.
- [ ] Step 3: Leave unrelated generated assets and binary blobs untouched.

## Chunk 4: Verification

### Task 6: Confirm rename coverage

**Files:**
- Search only

- [ ] Step 1: Run `rg -n --hidden --glob '!.git' "AI Novel Translator|ai-novel-translator" .`
- [ ] Step 2: Review remaining matches and keep only intentional non-project leftovers, if any.

### Task 7: Run project checks

**Files:**
- Test/build only

- [ ] Step 1: Run `pnpm run lint`.
- [ ] Step 2: Run `pnpm run build`.
- [ ] Step 3: Run `pnpm run test`.
- [ ] Step 4: Run `cd src-tauri && cargo test`.
