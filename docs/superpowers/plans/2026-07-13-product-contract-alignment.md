# Product Contract Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Implemented locally; awaiting commit  
**Tracking:** GitHub Issue #27

**Goal:** Align product documentation, tracker state, GitHub backlog, and shared frontend localization with the current TransNovel implementation.

**Architecture:** Treat the current Rust command/service registration and React locale state as runtime truth. Correct documentation and tracker drift without adding product features, and localize shared UI through the existing `getMessages(language)` path. Perform external GitHub changes only after local tests, repository checks, and an independent review pass.

**Tech Stack:** React 19, TypeScript 5.9, Zustand, Vitest/jsdom, Rust/Tauri 2, SQLite, Markdown/HTML, GitHub CLI

## Global Constraints

- Do not re-enable Linux release jobs.
- Do not implement EPUB, retry, multiple-key failover, or `chapters/translations` persistence.
- Do not implement native Anthropic transport or remove the Anthropic preset in this task.
- Do not implement the full accessibility keyboard-navigation backlog.
- Reuse `uiStore.language`, `getMessages(language)`, and the existing locale files; add no new global state.
- Keep the frontend as a thin UI layer and preserve Tauri command/event contracts.
- Do not modify `src-tauri/gen/*`.
- Do not commit or push; those require a separate user request.
- Keep `.context/TASKS.md` as an active execution snapshot and GitHub Issues as the durable backlog.

---

## File Structure

### Frontend localization

- Modify: `src/i18n/ko/common.ts`, `src/i18n/en/common.ts` — shared accessible names and status-bar copy.
- Modify: `src/i18n/ko/translation.ts`, `src/i18n/en/translation.ts` — supported Syosetu input link.
- Modify: `src/components/common/Modal.tsx`, `Toast.tsx`, `NumberStepper.tsx` — consume shared locale messages.
- Modify: `src/components/layout/Header.tsx`, `StatusBar.tsx` — consume locale messages and expose language selection state.
- Create: `src/components/common/Modal.test.tsx`, `Toast.test.tsx`, `NumberStepper.test.tsx`, `src/components/layout/StatusBar.test.tsx`.
- Modify: `src/components/layout/Header.test.tsx`, `src/components/translation/UrlInput.test.tsx`.

### Product and architecture documentation

- Modify: `README.md`, `README.ko.md`, `README.en.md`.
- Modify: `.context/STEERING.md`, `.context/TASKS.md`.
- Modify: `docs/quickstart.html`, `docs/index.html`, `docs/references.md`.
- Modify historical status headers under `docs/superpowers/specs/` and `docs/superpowers/plans/` for rename, watchlist, release update, and YAML override documents.

### External tracker

- Create six GitHub Issues for durable backlog work.
- Close GitHub Issue #26 only after release-note generator verification.

---

### Task 1: Localize shared common controls

**Files:**
- Modify: `src/i18n/ko/common.ts`
- Modify: `src/i18n/en/common.ts`
- Create: `src/components/common/Modal.test.tsx`
- Create: `src/components/common/Toast.test.tsx`
- Create: `src/components/common/NumberStepper.test.tsx`
- Modify: `src/components/common/Modal.tsx`
- Modify: `src/components/common/Toast.tsx`
- Modify: `src/components/common/NumberStepper.tsx`

**Interfaces:**
- Consumes: `useUIStore((state) => state.language)` and `getMessages(language)`.
- Produces: `common.accessibility.close`, `closeNotification`, `decrement`, and `increment` strings in both locales.

- [ ] **Step 1: Add failing tests for English accessible names**

Use the existing raw React/Vitest pattern (`createRoot`, `act`, `useUIStore.setState`). Each test must set `language: 'en'` and assert the button by exact `aria-label`:

```tsx
expect(document.body.querySelector('button[aria-label="Close"]')).toBeTruthy();
expect(document.body.querySelector('button[aria-label="Close notification"]')).toBeTruthy();
expect(container.querySelector('button[aria-label="Decrease"]')).toBeTruthy();
expect(container.querySelector('button[aria-label="Increase"]')).toBeTruthy();
```

For `Toast.test.tsx`, seed the store with:

```ts
useUIStore.setState({
  theme: 'dark',
  language: 'en',
  toast: { message: 'Saved', type: 'success' },
});
```

For `NumberStepper.test.tsx`, render:

```tsx
<NumberStepper value={2} min={0} max={3} onChange={vi.fn()} />
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/components/common/Modal.test.tsx src/components/common/Toast.test.tsx src/components/common/NumberStepper.test.tsx
```

Expected: failures because labels are currently Korean literals.

- [ ] **Step 3: Add the shared locale contract**

Add the same object shape to both locale files:

```ts
accessibility: {
  close: '닫기',
  closeNotification: '알림 닫기',
  decrement: '감소',
  increment: '증가',
  mainTabs: '메인 탭',
  languageSelector: '언어 선택',
  koreanLanguage: '한국어',
  englishLanguage: '영어',
  switchToLightMode: '라이트 모드로 전환',
  switchToDarkMode: '다크 모드로 전환',
},
statusBar: {
  provider: '제공자',
  model: '모델',
  none: '없음',
  notConfigured: '미설정',
  streaming: '스트리밍',
  batch: '일괄',
},
```

English values:

```ts
accessibility: {
  close: 'Close',
  closeNotification: 'Close notification',
  decrement: 'Decrease',
  increment: 'Increase',
  mainTabs: 'Main tabs',
  languageSelector: 'Language',
  koreanLanguage: 'Korean',
  englishLanguage: 'English',
  switchToLightMode: 'Switch to light mode',
  switchToDarkMode: 'Switch to dark mode',
},
statusBar: {
  provider: 'Provider',
  model: 'Model',
  none: 'None',
  notConfigured: 'Not configured',
  streaming: 'Streaming',
  batch: 'Batch',
},
```

- [ ] **Step 4: Replace common-component literals with locale lookups**

In each component, select `language` beside the existing theme/store selector and compute:

```ts
const commonMessages = getMessages(language).common;
```

Use:

```tsx
aria-label={commonMessages.accessibility.close}
aria-label={commonMessages.accessibility.closeNotification}
aria-label={commonMessages.accessibility.decrement}
aria-label={commonMessages.accessibility.increment}
```

Do not add props or new context because all three components already depend on `uiStore`.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run the command from Step 2.

Expected: all three test files pass.

---

### Task 2: Localize Header and StatusBar shell copy

**Files:**
- Modify: `src/components/layout/Header.test.tsx`
- Create: `src/components/layout/StatusBar.test.tsx`
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/layout/StatusBar.tsx`

**Interfaces:**
- Consumes: common locale keys added in Task 1.
- Produces: localized shell labels and explicit `aria-pressed` state for KO/EN selection.

- [ ] **Step 1: Add failing Header assertions**

Extend the English rendering test to assert:

```ts
expect(container.querySelector('nav[aria-label="Main tabs"]')).toBeTruthy();
expect(container.querySelector('button[aria-label="Switch to light mode"]')).toBeTruthy();
expect(container.querySelector('button[aria-label="English"]')?.getAttribute('aria-pressed')).toBe('true');
expect(container.querySelector('button[aria-label="Korean"]')?.getAttribute('aria-pressed')).toBe('false');
```

Also assert the language-button wrapper has `role="group"` and `aria-label="Language"`.

- [ ] **Step 2: Add failing StatusBar locale tests**

Parameterize Korean and English. Mock `invoke('get_settings')` with `use_streaming=true`, render `StatusBar`, flush queued work with `await act(async () => {})`, and assert the selected locale's provider, model, empty-state, and streaming labels while excluding the other locale. Then dispatch `settings-changed` with `use_streaming=false` and assert the localized batch label replaces the streaming label.

- [ ] **Step 3: Run layout tests and verify RED**

```bash
pnpm exec vitest run src/components/layout/Header.test.tsx src/components/layout/StatusBar.test.tsx
```

Expected: failures on hard-coded Korean/English labels and missing selection state.

- [ ] **Step 4: Implement Header localization**

Replace literals with:

```tsx
aria-label={messages.common.accessibility.mainTabs}
```

Give the language wrapper:

```tsx
role="group"
aria-label={messages.common.accessibility.languageSelector}
```

Give each language button:

```tsx
aria-label={value === 'ko'
  ? messages.common.accessibility.koreanLanguage
  : messages.common.accessibility.englishLanguage}
aria-pressed={language === value}
```

Use the current theme to select `switchToLightMode` or `switchToDarkMode`.

- [ ] **Step 5: Implement StatusBar localization**

Select `language` from `uiStore`, compute `const statusMessages = getMessages(language).common.statusBar`, and replace the provider, model, empty-state, streaming, and batch literals with locale lookups.

- [ ] **Step 6: Run layout tests and verify GREEN**

Run the command from Step 3.

Expected: both files pass.

---

### Task 3: Align the Syosetu support link

**Files:**
- Modify: `src/components/translation/UrlInput.test.tsx`
- Modify: `src/i18n/ko/translation.ts`
- Modify: `src/i18n/en/translation.ts`

**Interfaces:**
- Produces: both locale datasets use `{ name: 'ncode.syosetu.com', url: 'https://ncode.syosetu.com' }`.

- [ ] **Step 1: Add a failing URL invocation test**

Replace the current inline mock with an assertable hoisted mock:

```ts
const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async () => null),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));
```

Find the `ncode.syosetu.com` button after render, click it, and assert:

```ts
expect(invokeMock).toHaveBeenCalledWith('open_url', {
  url: 'https://ncode.syosetu.com',
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm exec vitest run src/components/translation/UrlInput.test.tsx
```

Expected: the button is absent because both locales currently expose `syosetu.com`.

- [ ] **Step 3: Update both locale entries**

Replace the first supported-site entry in Korean and English with:

```ts
{ name: 'ncode.syosetu.com', url: 'https://ncode.syosetu.com' },
```

- [ ] **Step 4: Run the test and verify GREEN**

Run the command from Step 2.

Expected: all `UrlInput` tests pass.

---

### Task 4: Correct product-facing documentation and steering rules

**Files:**
- Modify: `README.md`
- Modify: `README.ko.md`
- Modify: `README.en.md`
- Modify: `.context/STEERING.md`
- Modify: `docs/quickstart.html`
- Modify: `docs/index.html`

**Interfaces:**
- Consumes: current release matrix, provider routing, SQLite cache, YAML configuration, and the GitHub latest-release API.

- [ ] **Step 1: Correct README installation claims in all three variants**

Remove the Linux installer row. Keep macOS `.dmg` and Windows `.exe`/`.msi`. Change the source-run introduction so it explicitly targets development or local modification, for example:

```md
로컬 개발이나 코드 수정이 필요하면 소스에서 직접 실행할 수 있습니다.
```

Use equivalent English in `README.en.md` and keep the root README’s language consistent with its existing content.

- [ ] **Step 2: Correct STEERING constraints and decisions**

Replace the API-key and cache constraints with precise statements:

```md
- UI에서 관리하는 API 키는 SQLite `api_keys` 테이블에 저장한다. 외부 YAML override 사용 시 API 키는 `config.yaml`에서 관리하며, 환경변수 입력 경로는 지원하지 않는다.
- 기존 SQLite `translation_cache` 기반 캐시를 유지한다. `novels`/`chapters`/`translations` 영속화와 캐시는 별도 책임으로 다룬다.
```

Mark the 2026-02-20 decision as superseded rather than deleting history, and add a current decision row stating that OAuth obtains/refreshes the token and `CodexClient` calls the Codex Backend API.

- [ ] **Step 3: Correct Quick Start copy**

Make Step 0 say that the guide uses Gemini as its recommended path, not that Gemini is mandatory. Split the provider table into:

- OpenAI — API key + model; preset endpoint
- Anthropic — native transport is not implemented; direct users to OpenRouter or a Custom provider backed by an OpenAI-compatible proxy
- Custom — API key + base URL + model

Change URL guidance to state that Syosetu and Nocturne accept work or chapter URLs, Hameln requires an individual `.htm`/`.html` chapter URL, and Kakuyomu should use individual episode URLs.

- [ ] **Step 4: Update the landing fallback version**

Change `docs/index.html`’s static `data-version` text from `v0.1.1` to the non-versioned fallback `latest`. Do not alter release API behavior or download cards; a successful request still replaces the fallback with `tag_name`.

- [ ] **Step 5: Run static contradiction checks**

```bash
rg -n '\.AppImage|\.deb|파일 기반|OpenAI OAuth 제거|실제 번역에는 Gemini API 키가 필요|작품 목록 URL이 아니라' README*.md .context/STEERING.md docs/quickstart.html
```

Expected: no stale claims. Review any match before treating it as failure because historical status text may intentionally quote the old decision.

---

### Task 5: Refresh technical references and historical document status

**Files:**
- Modify: `docs/references.md`
- Modify: `docs/superpowers/specs/2026-03-18-transnovel-rename-design.md`
- Modify: `docs/superpowers/plans/2026-03-18-transnovel-rename.md`
- Modify: `docs/superpowers/specs/2026-04-08-watchlist-design.md`
- Modify: `docs/superpowers/specs/2026-04-13-github-release-update-check-design.md`
- Modify: `docs/superpowers/plans/2026-04-13-github-release-update-check.md`
- Modify: `docs/superpowers/specs/2026-04-15-config-yaml-override-design.md`
- Modify: `docs/superpowers/plans/2026-04-15-config-yaml-override.md`

**Interfaces:**
- Consumes: `src-tauri/src/lib.rs`, `services/mod.rs`, `db/mod.rs`, migration SQL, and `translator.rs`.

- [ ] **Step 1: Refresh reference metadata and module tree**

Replace the old generated/branch/commit-count line with precise provenance: `Updated: 2026-07-13 | Working tree based on: afa5b6d`. List all 13 service modules: `api_logger`, `cache`, `character_dictionary`, `codex`, `gemini`, `llm_config`, `novel_metadata`, `openai_compatible`, `openai_oauth`, `paragraph`, `substitution`, `translator`, and `watchlist`.

List migrations `001` through `006`, noting that `003` and `006` are conditional compatibility migrations.

- [ ] **Step 2: Refresh command and provider sections**

Change the registered-command total from 43 to 50 and include:

- update check
- OpenAI-compatible model fetch
- OAuth start/status/refresh/catalog
- five watchlist commands

Describe `ApiClient` as `Gemini | OpenAICompatible | Codex` and include provider routing for `gemini`, `openrouter`, `anthropic`, `openai`, `custom`, and `openai-oauth`. Explicitly record that `anthropic` currently combines the native Anthropic base URL with OpenAI Chat Completions transport and therefore does not support direct Anthropic API keys. Update the frontend/component overview so the `series` tab is described as the watchlist surface backed by `SeriesManager`, while noting that legacy batch controls remain available only where the current code exposes them.

- [ ] **Step 3: Refresh database and current-status sections**

Document 12 effective tables: the seven initial tables, `api_logs`, `novel_character_dictionary`, and three watchlist tables. Do not count temporary `_new` tables created during migration 006.

Change the persistence limitation from all three core tables being unused to:

- `novels` is used for parsed metadata and cache statistics.
- `chapters` and `translations` are not yet connected to runtime persistence.

Describe API-key rotation as partial infrastructure: `GeminiClient` can rotate a vector, but current settings supply one key.

- [ ] **Step 4: Mark historical plans/specs as implemented**

Add a concise status line near the top of each listed document. Use these implementation references where applicable:

- Rename: `4096b31`
- Release update: `47735cb`
- YAML override: `a042de4`
- Watchlist: implemented and later expanded; direct readers to the current README for supported sites

Do not rewrite old checkboxes or historical design scope.

- [ ] **Step 5: Verify references against code**

```bash
rg -n '43 total|Tables \(7 total\)|Gemini \| OpenAICompatible\)|all unused|single key per provider|Draft for review|Approved for implementation' docs/references.md docs/superpowers
```

Expected: stale current-state claims are gone; any remaining historical phrase has an adjacent `Implemented`/`Superseded` marker.

---

### Task 6: Run local verification and independent review

**Files:**
- No production-file changes unless fixing a verified failure from Tasks 1–5.

- [ ] **Step 1: Run focused frontend tests**

```bash
pnpm exec vitest run \
  src/components/common/Modal.test.tsx \
  src/components/common/Toast.test.tsx \
  src/components/common/NumberStepper.test.tsx \
  src/components/layout/Header.test.tsx \
  src/components/layout/StatusBar.test.tsx \
  src/components/translation/UrlInput.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run repository checks**

```bash
pnpm run lint
pnpm run build
(cd src-tauri && cargo test)
(cd src-tauri && cargo clippy -- -D warnings)
```

Expected: all commands exit 0. Classify any pre-existing or environmental failure explicitly before changing code.

- [ ] **Step 3: Verify release-note generator for Issue #26**

```bash
node scripts/generate-release-notes.mjs --repo azyu/transnovel v0.1.3 > /tmp/transnovel-v0.1.3-release-notes.md
rg -n '^## (New Features|Bug Fixes|Documentation|CI|Changelog|Commit Changes)$|Full Changelog:' /tmp/transnovel-v0.1.3-release-notes.md
```

Expected: at least one grouped summary section, `## Changelog` with the compare URL, and `## Commit Changes` with commit entries.

- [ ] **Step 4: Request an independent review**

Ask a separate reviewer to inspect the complete working-tree diff for correctness, i18n type consistency, documentation accuracy, and unintended scope. Resolve only findings that reproduce against code or tests.

- [ ] **Step 5: Confirm a clean diff shape**

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only files named by this plan are changed.

---

### Task 7: Move durable backlog to GitHub and normalize TASKS

**Files:**
- Modify: `.context/TASKS.md`
- External: GitHub Issues in `azyu/transnovel`

**Interfaces:**
- Consumes: successful Task 6 checks and review.
- Produces: six durable Issues, a local active-work snapshot, and closed Issue #26.

- [ ] **Step 1: Confirm no equivalent open Issues exist**

```bash
gh issue list -R azyu/transnovel --state open --limit 100 --json number,title,url
```

Do not create duplicates; reuse an equivalent Issue if one exists.

- [ ] **Step 2: Create six narrowly scoped Issues**

Run each command only when Step 1 found no equivalent open Issue:

```bash
gh issue create -R azyu/transnovel --title 'Add EPUB export' --body-file - <<'EOF'
## Background
TransNovel currently exports TXT and HTML, while EPUB remains explicitly unsupported.

## Goal
Add EPUB export with chapter ordering and metadata suitable for e-readers.

## Scope
- Add an EPUB export format in the Rust export service.
- Preserve chapter order, titles, and translated content.
- Preserve the existing ruby-text behavior where the EPUB format supports it.

## Exclusions
- Redesigning the existing export UI.
- Changing TXT or HTML output contracts.

## Verification
- Automated tests cover metadata, chapter order, and generated entries.
- A generated EPUB opens in a standard reader and contains the expected chapters.
EOF

gh issue create -R azyu/transnovel --title 'Retry transient translation provider failures' --body-file - <<'EOF'
## Background
The translation loop contains retry scaffolding, but `MAX_RETRIES = 1` means requests are attempted once.

## Goal
Retry classified transient provider failures with bounded backoff.

## Scope
- Define retryable transport/status failures.
- Increase attempts through the existing translation orchestration path.
- Preserve final failure events and failed-paragraph reporting.

## Exclusions
- Retrying authentication failures or deterministic invalid requests.
- Adding a new queue or background-job system.

## Verification
- Tests prove retry count and backoff for transient failures.
- Tests prove non-retryable errors fail immediately.
- Tests prove exhausted retries surface the final failure once.
EOF

gh issue create -R azyu/transnovel --title 'Support multiple API keys with error-driven failover' --body-file - <<'EOF'
## Background
`GeminiClient` accepts multiple keys, but current settings provide only one key to the runtime client.

## Goal
Persist and configure multiple provider keys, then fail over when a key reaches a retryable provider limit or error.

## Scope
- Define storage and active-key ordering.
- Reuse or adapt the existing Gemini key-selection logic.
- Record exhausted or failing keys without hiding terminal errors.

## Exclusions
- Round-robin-only behavior without error semantics.
- A new shared-state architecture outside the existing SQLite settings/API-key path.

## Verification
- Tests cover zero keys, one key, successful failover, and all keys exhausted.
- Existing single-key configurations continue to work.
EOF

gh issue create -R azyu/transnovel --title 'Persist chapters and translations in SQLite runtime flows' --body-file - <<'EOF'
## Background
The `novels` table is used for parsed metadata, but the existing `chapters` and `translations` tables are not connected to runtime persistence.

## Goal
Connect chapter and translated-paragraph persistence to the current parse and translation flows.

## Scope
- Persist chapter metadata/content through existing backend services.
- Persist translated paragraphs with stable chapter relationships.
- Define read/update behavior for existing rows.

## Exclusions
- Replacing the separate `translation_cache` table.
- Moving persistence logic into React.

## Verification
- Tests cover insert, read, update, and relationship integrity.
- Existing databases migrate or initialize without data loss.
EOF

gh issue create -R azyu/transnovel --title 'Complete frontend keyboard and ARIA accessibility patterns' --body-file - <<'EOF'
## Background
Shared accessible names are localized, but several navigation and switch controls still lack complete keyboard and state semantics.

## Goal
Complete keyboard and ARIA behavior for the identified frontend controls.

## Scope
- Settings sub-tabs: tablist/tab/tabpanel relationships and arrow-key navigation.
- Main tabs: roving tab index and arrow-key navigation.
- Streaming switch: accessible name and visible keyboard focus.
- Language selector: grouped label and selected-state semantics.

## Exclusions
- Visual redesign.
- Replacing the current Zustand tab state with a router.

## Verification
- Tests cover keyboard movement, focus, accessible names, and selected/pressed state.
- Existing mouse and shortcut behavior remains intact.
EOF

gh issue create -R azyu/transnovel --title 'Implement native Anthropic transport or remove the nonfunctional preset' --body-file - <<'EOF'
## Background
The `anthropic` preset points to `https://api.anthropic.com`, but the runtime routes it through `OpenAICompatibleClient`, which sends `/v1/chat/completions` requests with Bearer authentication. Direct Anthropic API keys therefore do not work.

## Goal
Make the Anthropic provider contract truthful by either implementing native Anthropic transport or removing the nonfunctional preset.

## Scope
- Choose and document one supported outcome: native Anthropic transport or preset removal.
- If implemented, use Anthropic-native request, authentication, response, and streaming contracts.
- If removed, remove the preset from selectable/configured provider paths while preserving OpenRouter and Custom OpenAI-compatible proxy options.

## Exclusions
- Changing OpenRouter or Custom provider transport contracts.
- Presenting an OpenAI-compatible proxy path as native Anthropic support.

## Verification
- A direct Anthropic API key works end to end with native transport, or the Anthropic preset is absent from runtime and user-facing provider choices.
- Tests prove the selected behavior and prevent OpenAI Chat Completions payloads from being sent to `api.anthropic.com`.
EOF
```

Capture the six returned Issue URLs/numbers for the final TASKS and completion report.

- [ ] **Step 3: Resolve the stale workspace entry**

Record that history search found only the unexplained tracker insertion in commit `2337f0e` and no recoverable “workspace refresh” requirement. Do not create an invented Issue. Remove the combined stale row after the accessibility Issue is created.

- [ ] **Step 4: Normalize `.context/TASKS.md`**

Remove the four pending backlog rows and the stale combined row after their Issue numbers are known. Mark `제품 문서·tracker·UI i18n 정합성 복구` as `[x]` only after all local and external steps complete. Keep the table format unchanged.

- [ ] **Step 5: Close Issue #26 after verified acceptance criteria**

```bash
gh issue close 26 -R azyu/transnovel
```

Expected: Issue #26 state becomes `CLOSED`.

- [ ] **Step 6: Verify final tracker state**

```bash
gh issue list -R azyu/transnovel --state open --limit 100 --json number,title,url
gh issue view 26 -R azyu/transnovel --json state,url
git diff --check
git status --short
```

Expected: the six durable backlog Issues exist, #26 is closed, the active task row is `[x]`, and no commit or push has occurred.
