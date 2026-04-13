# GitHub Release Update Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-triggered update check in the About settings view that compares the installed version with the latest stable GitHub Release and opens the release page when an update exists.

**Architecture:** Keep the frontend thin. A new settings command fetches the latest stable GitHub Release metadata, while the About screen owns button clicks and status rendering. Version comparison stays in a small frontend utility with focused tests.

**Tech Stack:** TypeScript/React, Vitest, Rust/Tauri, reqwest

---

### Task 1: Add failing frontend coverage for update states

**Files:**
- Create: `src/components/settings/AboutSettings.test.tsx`
- Test: `src/components/settings/AboutSettings.tsx`
- Test: `src/utils/release.ts`

- [ ] **Step 1: Write a failing test for update available state**
- [ ] **Step 2: Run `pnpm test AboutSettings -- --runInBand` and confirm it fails for missing update UI**
- [ ] **Step 3: Add a failing test for up-to-date state**
- [ ] **Step 4: Add a failing test for release link action**

### Task 2: Add failing backend/unit coverage for release version handling

**Files:**
- Modify: `src-tauri/src/commands/settings.rs`

- [ ] **Step 1: Add a failing Rust unit test for normalizing `v0.1.2` to `0.1.2`**
- [ ] **Step 2: Add a failing Rust unit test for rejecting malformed release tags**
- [ ] **Step 3: Run `cd src-tauri && cargo test settings::tests -- --nocapture` and confirm the new tests fail**

### Task 3: Implement minimal backend release fetch command

**Files:**
- Modify: `src-tauri/src/commands/settings.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add a small response struct for the GitHub latest release payload**
- [ ] **Step 2: Implement a helper that normalizes stable release tags**
- [ ] **Step 3: Add `fetch_latest_release_info` command using `reqwest` with a short timeout and GitHub-compatible headers**
- [ ] **Step 4: Register the new command in the Tauri invoke handler**

### Task 4: Implement frontend update check UI

**Files:**
- Create: `src/utils/release.ts`
- Modify: `src/components/settings/AboutSettings.tsx`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add a small version comparison helper for `major.minor.patch`**
- [ ] **Step 2: Add the frontend type for release info**
- [ ] **Step 3: Extend the About screen with `업데이트 확인`, status text, and `릴리즈 열기`**
- [ ] **Step 4: Re-run the AboutSettings test file and make it pass**

### Task 5: Verify project checks

**Files:**
- Test/build only

- [ ] **Step 1: Run `pnpm run test -- AboutSettings`**
- [ ] **Step 2: Run `pnpm run lint`**
- [ ] **Step 3: Run `pnpm run build`**
- [ ] **Step 4: Run `cd src-tauri && cargo test`**
- [ ] **Step 5: Run `cd src-tauri && cargo clippy -- -D warnings`**
