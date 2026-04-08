# Watchlist Prototype Design

Date: 2026-04-08
Status: Draft for review

## Goal

Add a `관심작품` feature for tracked works, starting with `ncode.syosetu.com` work pages only.

The feature lets users register a work, check for newly published episodes in the background when the app starts, manually refresh the tracked list, and distinguish already viewed episodes from newly added ones.

## Scope

Included:

- User-facing naming `관심작품`
- A `관심작품` tab using the existing internal `series` tab id for now
- Registration from both the `관심작품` tab and the translation screen
- Syosetu work page support for URLs like `https://ncode.syosetu.com/...`
- Background update check on app startup
- Manual refresh action in the `관심작품` UI
- Episode status split between `본 화`, `새 화`, and default episodes
- Per-work failure status shown only inside the `관심작품` tab

Excluded:

- Other sites and parser integrations
- Push notifications, OS notifications, or periodic background polling after startup
- Manual read/unread toggles in the first prototype
- Reusing translation completion as reading state
- Refactoring unrelated existing series and batch translation flows beyond what this feature needs

## User Language

- Tab label: `관심작품`
- Primary actions: `관심작품에 추가`, `새로고침`
- Work-level status: `새 화 N개`, `확인 실패`
- Episode-level status: `본 화`, `새 화`

The internal tab key and related frontend state may stay `series` in the prototype to avoid unnecessary rename churn.

## Product Rules

- `읽음` means the user opened that episode in the translation screen at least once.
- `번역 완료` remains a separate concept and must continue using its current storage and semantics.
- When a work is first registered, all episodes that already exist at registration time are treated as viewed baseline episodes.
- Only episodes discovered after registration are marked as new.
- The startup check runs in the background and must not block the main UI from becoming usable.
- The tab badge shows the count of tracked works that currently have new episodes, not the total number of new episodes.
- If checking one work fails, other tracked works must still be checked.

## Data Model

Add dedicated storage for watchlist state instead of overloading existing translation tables.

### Tracked works

Store one row per tracked work with at least these fields:

- `site`
- `work_url`
- `novel_id`
- `title`
- `author`
- `last_known_chapter`
- `last_checked_at`
- `last_check_status`

This record answers what is being tracked and what happened on the last sync.

### Tracked episodes snapshot

Store per-episode metadata for each tracked work with at least these fields:

- `novel_id`
- `chapter_number`
- `chapter_url`
- `title`
- `is_new`

This snapshot allows deterministic comparison between the previously known work state and the newest parsed work state.

### Viewed episodes

Store viewed state separately from translation completion with at least these fields:

- `novel_id`
- `chapter_number`
- `viewed_at`

This keeps reading history independent from translation workflow state.

## Runtime Flow

### Registering a work

1. User registers a Syosetu work from the `관심작품` tab or from the translation screen.
2. Backend validates that the URL is a supported Syosetu work page.
3. Backend fetches work metadata and the current episode list.
4. Backend creates the tracked work row and stores the current episode snapshot.
5. All episodes present at registration time are treated as baseline viewed episodes for newness purposes.

### Startup background check

1. App loads tracked works during startup.
2. A background task checks each tracked work against the current Syosetu work page.
3. Backend compares the latest episode list with the saved snapshot.
4. Newly discovered episodes are marked as `새 화`.
5. `last_checked_at` and `last_check_status` are updated per work.
6. Failures are isolated to the affected work and surface only in the watchlist UI.

### Manual refresh

1. User presses `새로고침` in the `관심작품` tab.
2. The same per-work refresh logic runs on demand.
3. UI updates the tracked list and per-work status without requiring app restart.

### Marking an episode as viewed

1. User opens an episode in the translation screen.
2. Frontend sends a lightweight command indicating `novel_id` and `chapter_number`.
3. Backend stores viewed state for that episode.
4. That episode no longer renders as `새 화` in the watchlist UI.

## UI Design

### Tab-level behavior

- The visible label is `관심작품`.
- The badge shows the number of tracked works with at least one new episode.
- Startup checking should feel quiet and non-blocking.

### Watchlist screen

Show a work list rather than the current batch-translation-first layout.

Each work card should include:

- title
- author
- source site
- last checked time
- `새 화 N개` when applicable
- `확인 실패` when the latest refresh failed
- entry action to inspect episode list

The screen also needs:

- URL input for direct registration
- `새로고침` action
- empty state for zero tracked works

### Episode list

Each episode row should visibly distinguish:

- `본 화`
- `새 화`
- default episode rows with no extra badge

The visual treatment should preserve accessibility and avoid relying on color alone.

## Backend Responsibility

- URL validation
- parsing work metadata and episode list
- tracked work persistence
- startup and manual refresh checks
- viewed episode recording

Business logic stays in Rust services. Tauri commands remain thin wrappers that return `Result<T, String>`.

## Risks

- Syosetu work page parsing can drift, so this should reuse the existing parser patterns where possible.
- The current `series` tab already hosts batch translation behavior, so the prototype needs a careful UI reshape without breaking existing supported flows.
- Startup background checks may race with other app initialization if command wiring is not sequenced clearly.

## Verification

Design-level acceptance criteria:

- A user can add a Syosetu work from either entry point.
- Restarting the app preserves tracked works.
- Existing episodes at registration time are not marked as new.
- Newly added episodes cause the tracked work badge and work card status to update.
- Opening an episode from the translation screen marks it as viewed.
- One failed refresh does not block the rest of the tracked works.

Runtime verification is intentionally deferred because this document defines the approved prototype before implementation.
