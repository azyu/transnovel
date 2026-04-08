# TransNovel

[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%202.0-24C8DB?logo=tauri&logoColor=FFC131)](https://tauri.app/)
[![CI](https://github.com/azyu/transnovel/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/azyu/transnovel/actions/workflows/ci.yml)

Desktop app for translating Japanese web novels into Korean with a React frontend, Rust backend, and Tauri 2.0 shell.

[한국어 문서](./README.ko.md)

## What It Does

- Parse chapters and series metadata from Syosetu, Hameln, Kakuyomu, and Nocturne
- Translate chapter content with streaming paragraph updates
- Run batch translation across a series with progress tracking and completed chapter history
- Store per-novel translation cache to avoid repeated API calls
- Save translated output as TXT or HTML
- Inspect API request and response logs from the settings panel
- Manage providers, models, prompts, substitutions, and view settings inside the app

## Supported Sites

| Site | Domain | Notes |
| --- | --- | --- |
| Syosetu | `ncode.syosetu.com` | Reference parser |
| Hameln | `syosetu.org` | Similar flow to Syosetu |
| Kakuyomu | `kakuyomu.jp` | Parses embedded JSON, no batch support |
| Nocturne | `novel18.syosetu.com` | Sends 18+ cookie |

## Supported Providers

| Provider type | Protocol | Auth |
| --- | --- | --- |
| Gemini | Google Generative AI | API key |
| OpenRouter | OpenAI-compatible chat completions | Bearer token |
| Custom | OpenAI-compatible chat completions | Bearer token |

`anthropic`, `openai`, and `custom` provider types all use the OpenAI-compatible client path internally.

## Current Feature Set

- Real-time translation streaming over Tauri events
- Per-paragraph semantic IDs (`title`, `subtitle`, `p-1`, ...)
- Regex-based pre/post substitution pipeline
- Per-novel SHA256 cache isolation
- Provider and model CRUD in settings
- API log viewer with request/response details
- Batch translation pause, resume, stop, and chapter completion tracking
- Theme and reading view customization
- TXT and HTML export

## Tech Stack

- Frontend: React 19, TypeScript, Vite, Zustand, Headless UI, Tailwind CSS
- Backend: Rust, Tauri 2.0, tokio, sqlx, reqwest, scraper
- Persistence: SQLite for settings, API logs, and progress metadata

## Project Layout

```text
src/                    React UI, hooks, Zustand stores
src-tauri/src/          Tauri commands, services, parsers, DB code
docs/references.md      Detailed architecture and command reference
.context/               Shared task and steering documents
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Rust toolchain
- Tauri build prerequisites for your OS

### Install

```bash
git clone git@github.com:azyu/transnovel.git
cd transnovel
pnpm install
```

### Run

```bash
pnpm run tauri dev
```

### Build

```bash
pnpm run tauri build
```

## Development Checks

```bash
pnpm run lint
pnpm run build
pnpm run test
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```

## Usage

1. Add a provider and API key in `Settings -> LLM Settings`.
2. Choose a provider and model.
3. Paste a supported chapter or series URL.
4. Translate a single chapter or start batch translation for the full series.
5. Export results as TXT or HTML when needed.

## Implementation Status

Implemented today:

- Multi-site parsing
- Streaming translation
- Batch translation
- Per-novel cache
- API logging
- Provider/model management
- TXT/HTML export

Not implemented yet:

- EPUB export
- Automatic retry beyond the current limit
- API key rotation
- Full use of `novels`, `chapters`, and `translations` tables in the main flow

## Reference

For command lists, event payloads, schema notes, and module-level architecture, see [docs/references.md](./docs/references.md).
