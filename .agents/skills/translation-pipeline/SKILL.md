---
name: translation-pipeline
description: >
  Full translation pipeline flow for the TransNovel: paragraph encoding, substitution,
  caching, LLM API calls, streaming, and event emission. Use when working on translation logic,
  cache behavior, paragraph ID encoding, prompt construction, streaming output, or batch translation.
  Triggers: translation bug, cache issue, paragraph ID, streaming, substitution, prompt, batch translation.
---

# Translation Pipeline

## Pipeline Overview

```
Frontend invoke("translate_paragraphs_streaming", { paragraphs, novel_id, ... })
  │
  ▼
commands/translation.rs → reset_translation_control_flags()
  │                      → TranslatorService::new().await  (loads settings, creates API client)
  ▼
services/translator.rs :: translate_paragraphs_streaming()
  │
  ├─ 1. Substitution (Pre):  SubstitutionService::apply_to_paragraphs(paragraphs)
  ├─ 2. Cache Check:         get_cached_translations(novel_id, &preprocessed)
  │     ├─ Cache HIT  → emit "translation-chunk" immediately, skip LLM
  │     └─ Cache MISS → collect uncached paragraphs + indices
  ├─ 3. LLM API Call:        client.translate_streaming(novel_id, uncached, indices, ...)
  │     ├─ Formats prompt:   system_prompt + "\n\n" + <p id="...">原文</p> per paragraph
  │     ├─ SSE stream:       accumulates text, extracts completed <p> tags
  │     └─ Per-paragraph:    emit "translation-chunk", cache_translation()
  ├─ 4. Substitution (Post): SubstitutionService::apply_to_paragraphs(&translated)
  ├─ 5. Cache Save:          cache_translations(novel_id, &pairs)
  └─ 6. Emit Events:         "translation-complete" (or "translation-error", "translation-failed-paragraphs")
```

## Paragraph ID Encoding

Semantic IDs map array indices to meaningful paragraph identifiers:

```
has_subtitle=true:   [0]=title, [1]=subtitle, [2]=p-1, [3]=p-2, ...
has_subtitle=false:  [0]=title, [1]=p-1, [2]=p-2, [3]=p-3, ...
```

```rust
// services/paragraph.rs
pub fn encode_paragraph_id(n: usize, has_subtitle: bool) -> String {
    match n {
        0 => "title".to_string(),
        1 if has_subtitle => "subtitle".to_string(),
        _ => {
            let paragraph_num = if has_subtitle { n - 1 } else { n };
            format!("p-{}", paragraph_num)
        }
    }
}
```

### LLM Input/Output Format

```xml
<!-- Input to LLM -->
<p id="title">章のタイトル</p>
<p id="subtitle">サブタイトル</p>
<p id="p-1">最初の段落</p>
<p id="p-2">次の段落</p>

<!-- Expected LLM output -->
<p id="title">챕터 제목</p>
<p id="subtitle">부제목</p>
<p id="p-1">첫 번째 문단</p>
<p id="p-2">다음 문단</p>
</main>
```

### Response Parsing

`parse_translated_paragraphs_by_indices()` handles:
- Normal `<p id="...">text</p>` tags
- Missing `</p>` (falls back to next `<p` or `</main>`)
- Partial results (returns empty string for missing paragraphs)
- `< / >` characters inside content (not confused with tags)

## Caching

**Key formula**: `SHA256(novel_id + ":" + original_text)` → 64-char hex

```rust
// services/cache.rs
fn compute_hash(novel_id: &str, text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(novel_id.as_bytes());
    hasher.update(b":");
    hasher.update(text.as_bytes());
    hex::encode(hasher.finalize())
}
```

- Cache is per-novel: same text in different novels = different cache entries
- Cache uses pre-substitution text as key (after apply_to_paragraphs pre-processing)
- `ON CONFLICT` upserts: updates translated_text, increments hit_count
- Batch inserts use transactions for atomicity

## Substitution

Regex-based text replacement, applied **before** and **after** LLM call.

```
# Config format (settings key: "substitutions")
# Lines: pattern/replacement (separator: first /)
# Comments: lines starting with #

상하이/상해
巖/岩
(철수)([은는이가을를])/영희$2
```

Pre-substitution: normalize input before caching/LLM.
Post-substitution: fix output after LLM translation.

## Streaming Flow

SSE parsing differs by provider:

| Provider | Delimiter | Data format | Done signal |
|----------|-----------|-------------|-------------|
| Gemini | `\n\n` | `data: {GeminiResponse}` | Stream ends |
| OpenRouter | `\n` | `data: {StreamEvent}` | `data: [DONE]` |

Common streaming logic:
1. Accumulate text chunks into `full_text`
2. Run `extract_completed_paragraphs(&full_text)` after each chunk
3. Track `emitted_ids: HashSet<String>` to avoid duplicate emissions
4. Emit `translation-chunk` event for each newly completed paragraph
5. `cache_translation()` per-paragraph during stream (not after)

## Chunked Translation

For large chapters (>50KB):

```rust
const MAX_SINGLE_BATCH_CHARS: usize = 50_000;
const FALLBACK_CHUNK_SIZE: usize = 50;  // paragraphs per chunk
const MAX_RETRIES: u32 = 1;             // Effectively no retry (1 attempt)

let chunk_size = if total_chars <= MAX_SINGLE_BATCH_CHARS {
    uncached_paragraphs.len()  // Send all at once
} else {
    FALLBACK_CHUNK_SIZE
};
```

## Batch Translation (Series)

```
commands/series.rs :: start_batch_translation()
  │
  ├─ Skip completed chapters (completed_chapters table)
  ├─ For each chapter:
  │   ├─ Check SHOULD_STOP / IS_PAUSED (AtomicBool)
  │   ├─ Emit "translation-progress"
  │   ├─ Parse chapter URL → get content
  │   ├─ translate_paragraphs() (non-streaming for batch)
  │   ├─ mark_chapter_complete()
  │   └─ Emit "chapter-completed"
  └─ Emit "batch-translation-complete"
```

Chapter URL construction: `build_chapter_url(base_url, site, novel_id, chapter_num)`

Kakuyomu blocked from batch (non-sequential episode URLs).

## Event Reference

| Event | Payload | When |
|-------|---------|------|
| `translation-chunk` | `{ paragraph_id, text, is_complete }` | Each paragraph translated |
| `translation-complete` | `{ success, total, failed_count, input_tokens, output_tokens, stopped? }` | Translation finishes |
| `translation-error` | `{ error_type, title, message, request_preview, response_preview }` | Chunk fails all retries |
| `translation-failed-paragraphs` | `{ failed_indices, total }` | Some paragraphs failed |
| `debug-cache` | `{ paragraph_id, cache_hit, original_preview }` | Cache check per paragraph |
| `debug-api` | `{ type, provider, model?, status?, body }` | API request/response logging |
| `translation-progress` | `{ current_chapter, total_chapters, chapter_title, status, error_message? }` | Batch progress |
| `batch-translation-complete` | `novel_id` (string) | Batch finishes |
| `chapter-completed` | `{ chapter, novel_id }` | Single chapter done in batch |

## System Prompt

Default prompt stored in `translator.rs` as `DEFAULT_SYSTEM_PROMPT`. Key rules:
- Preserve `<p id="XX">` tags exactly
- 1:1 line correspondence (N input lines = N output lines)
- End output with `</main>`
- `{{note}}` placeholder replaced with user's translation_note setting

## Retry Logic

```
Error types detected:
- "input_tokens=0" → Content filtered by provider → "콘텐츠 필터링 감지"
- "API 오류" → API error → pass through
- Other → Unknown → pass through

Failed paragraphs: indices collected, emitted via "translation-failed-paragraphs"
Frontend can retry specific indices via original_indices parameter.
```
