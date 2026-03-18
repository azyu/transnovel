---
name: translation-pipeline
description: >
  Translation orchestration guide for paragraph encoding, substitution, caching, event emission,
  and batch-flow behavior in the TransNovel backend.
  Use when debugging or changing cache behavior, paragraph IDs, prompt assembly, event sequencing,
  retry flow, failed paragraph handling, or batch translation behavior.
  Triggers: translation bug, cache issue, paragraph id, prompt assembly, failed paragraphs, batch translation, translation events.
---

# Translation Pipeline

Use this skill when the problem is in translation orchestration. If the issue is provider authentication, HTTP request shape, or provider-specific SSE parsing, use `llm-api-integration` instead.

## Current Pipeline

`src-tauri/src/services/translator.rs` orchestrates:

1. pre-substitution
2. cache lookup
3. provider call
4. post-substitution
5. cache save
6. event emission

Provider clients currently include Gemini, OpenRouter-compatible clients, and Codex via `openai-oauth`.

## Use This Workflow

1. Identify the failing stage from the symptom.
   - cache mismatch: inspect `services/cache.rs`
   - wrong paragraph IDs or parse loss: inspect `services/paragraph.rs`
   - wrong prompt note or system prompt merge: inspect `TranslatorService::build_prompt()`
   - duplicate or missing UI updates: inspect event emission points in `translator.rs` and `commands/series.rs`
2. Change the smallest stage that explains the symptom.
   - Keep provider transport fixes out of this layer unless the bug is clearly orchestration-related.
3. Verify both normal and streaming paths if the behavior is shared.

## Stable Invariants

- Paragraph IDs must stay semantic: `title`, optional `subtitle`, then `p-N`.
- Cache keys remain `SHA256(novel_id + ":" + original_text)`.
- `translation-chunk` emits only completed paragraphs.
- `translation-complete`, `translation-error`, and `translation-failed-paragraphs` remain the frontend contract for translation status.

## Stage Checks

### Cache

- Cache lookup happens after pre-substitution.
- Cache writes use the preprocessed original text as the key input.
- If a paragraph is cached, the pipeline should skip the provider call for that paragraph.

### Paragraph Parsing

- `extract_completed_paragraphs()` handles streaming partial output.
- `parse_translated_paragraphs_by_indices()` handles final paragraph extraction by original indices.
- If output is missing a paragraph, return an explicit empty or failed result path instead of reindexing silently.

### Batch Translation

- Batch progress and stop/pause behavior live in `commands/series.rs`.
- Kakuyomu is intentionally blocked from batch translation because chapter URLs are not sequentially derived.
- Completed chapters are skipped through `completed_chapters` tracking.

## Fallbacks

- If the symptom could be caused by both provider parsing and pipeline orchestration, inspect the provider client first and then return here only if the provider output is structurally valid.
- If a missing paragraph starts in the provider response, stop and hand the issue to `llm-api-integration`.
- If the bug spans parsing, pipeline, and frontend event handling, fix the earliest incorrect boundary and verify downstream behavior before making more changes.
