---
name: novel-parser-guide
description: >
  Guide for implementing or debugging `NovelParser` integrations in the TransNovel backend.
  Use when adding a new supported site, fixing selector drift, changing URL parsing, or reviewing scraper behavior.
  Triggers: new parser, new site, parser bug, selector update, scraping, chapter parsing, series parsing.
---

# Novel Parser Guide

Use this skill for site-specific parsing work. If the task is generic backend structure, pair it with `tauri-rust-patterns`. If the task is about translation behavior after parsing succeeds, use `translation-pipeline` instead.

## Current Parser Contract

`src-tauri/src/parsers/mod.rs` defines:

```rust
#[async_trait]
pub trait NovelParser: Send + Sync {
    fn matches_url(&self, url: &str) -> bool;
    async fn get_chapter(&self, url: &str) -> Result<ChapterContent, String>;
    async fn get_series_info(&self, url: &str) -> Result<SeriesInfo, String>;
}
```

Supported parsers are registered through both `ParsedUrl::from_url()` and `get_parser_for_url()`.

## Use This Workflow

1. Pick the closest existing parser.
   - Match by URL shape first.
   - Match by content source second: DOM selectors vs embedded JSON.
2. Implement the parser file.
   - Add a parser struct with `new()`.
   - Add `parse_url_static()` for router use.
   - Implement `matches_url()`, `get_chapter()`, and `get_series_info()`.
3. Register the parser in both router paths.
   - Add the module declaration.
   - Add the `ParsedUrl::from_url()` branch.
   - Add the `get_parser_for_url()` branch.
4. Decide batch support explicitly.
   - If chapter URLs are sequential and derivable, add a `build_chapter_url()` branch in `commands/series.rs`.
   - If chapter URLs are not sequential, return an explicit batch-unsupported error the way Kakuyomu does.

## Extraction Rules

- Keep chapter body HTML structure when the downstream translator expects `<p>` tags.
- Produce full URLs for navigation and chapter links.
- Return clear site-specific errors when selectors fail instead of unwrapping.
- If the site requires cookies or headers, add them in `fetch_html()` only when the rule applies to that domain.

## Helper Guidance

- Reuse existing shared helpers when they already exist in the target parser file.
- If a helper such as `extract_text()` or URL normalization does not exist, add a small local helper in the parser file instead of assuming a shared utility exists.
- If the site stores content in embedded JSON, copy the Kakuyomu-style approach and parse the script payload directly.

## Minimum Verification

- Unit test `parse_url_static()` for index URLs and chapter URLs.
- If the parser requires live HTML, add an ignored integration test with the current site URL pattern.
- Confirm both `parse_url` and `get_chapter_content` command paths can reach the new parser through the router.

## Fallbacks

- If neither selectors nor embedded JSON yield stable content, stop and report which part of the page is dynamic.
- If chapter numbering cannot be derived safely, block batch translation rather than inventing a numbering scheme.
- If the target site shares a hostname pattern with an existing parser, verify `matches_url()` exclusivity before merging.
