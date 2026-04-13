<div align="center">
  <img src="src-tauri/icons/icon.png" alt="TransNovel icon" width="128">
  <h1>TransNovel</h1>
  <p>Desktop app for reading Japanese web novels in Korean through LLM translation.</p>
</div>

<p align="center">
  <a href="https://github.com/azyu/transnovel/releases"><img src="https://img.shields.io/github/v/release/azyu/transnovel?display_name=tag" alt="Latest Release"></a>
  <a href="https://github.com/azyu/transnovel/actions/workflows/ci.yml"><img src="https://github.com/azyu/transnovel/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
</p>

<p align="center">
  <a href="./README.ko.md">한국어</a>
</p>

## Overview

TransNovel lets you paste a Japanese web novel URL, load the work, and translate it into Korean with the LLM provider you prefer. It is designed around a simple flow for reading and saving chapters comfortably.

It is built to reduce the manual work of hopping between raw source pages, translation tools, and saved notes just to keep reading.

## Why It Helps

- Load chapter and series information directly from supported novel sites
- See translated text stream paragraph by paragraph instead of waiting for the entire chapter
- Reuse cached translations to save time and API cost on repeated text
- Add frequently followed works to a watchlist and check for new episodes
- Export translated output as TXT or HTML for offline reading
- Manage providers, models, prompts, substitutions, and reading view settings inside the app
- Inspect API request and response logs when something fails

## Install

The easiest way to use TransNovel is to download a release build for your platform from [Releases](https://github.com/azyu/transnovel/releases).

| Platform | Installer |
| --- | --- |
| macOS | `.dmg` |
| Windows | `.exe`, `.msi` |
| Linux | `.AppImage`, `.deb` |

> [!TIP]
> If you just want to use the app, start with a release build instead of running from source.

## Quick Start

1. Open `Settings > LLM Settings` and add the provider you want to use.
2. Enter an API key, or choose `OpenAI (Codex)` and sign in.
3. Paste the URL of a supported chapter or series.
4. Translate the chapter you want to read and start reading right away.
5. Optionally add the work to your watchlist to keep an eye on new episodes.
6. Export the result as TXT or HTML if you want to keep a copy.

> [!TIP]
> Start with a short chapter first to check that the model, prompt, and substitution rules match the reading style you want.

## Supported Sites

| Site | Domain | Current Status |
| --- | --- | --- |
| Syosetu | `ncode.syosetu.com` | Chapter and series translation supported |
| Hameln | `syosetu.org` | Chapter and series translation supported |
| Kakuyomu | `kakuyomu.jp` | Single-episode translation supported |
| Nocturne | `novel18.syosetu.com` | Chapter and series translation supported |

## Supported LLM Providers

| Provider | Auth | Notes |
| --- | --- | --- |
| Gemini | API key | Google Gemini models |
| OpenRouter | API key | Access multiple model families in one place |
| Anthropic | API key | Connected through an OpenAI-compatible path |
| OpenAI | API key | Connected through an OpenAI-compatible path |
| OpenAI (Codex) | ChatGPT sign-in | Uses the Codex Backend API |
| Custom | API key + base URL | Connect your own OpenAI-compatible server |

## Current Limitations

- EPUB export is not available yet.
- Watchlist registration currently supports Syosetu, Nocturne, and Kakuyomu work pages.

> [!IMPORTANT]
> Translation quality, speed, and cost depend heavily on the provider, model, and prompt you choose. The same novel can feel noticeably different when you switch models.

## Run From Source

If you want to develop or modify the app locally, run it from source.

### Prerequisites

- Node.js 18+
- pnpm
- Rust toolchain
- Tauri build prerequisites for your OS

```bash
git clone https://github.com/azyu/transnovel.git
cd transnovel
pnpm install
```

### Development Mode

```bash
pnpm run tauri dev
```

### Build

```bash
pnpm run tauri build
```

<details>
<summary>Developer Notes</summary>

### Tech Stack

- Frontend: React 19, TypeScript, Vite, Zustand, Headless UI, Tailwind CSS
- Backend: Rust, Tauri 2.0, tokio, sqlx, reqwest, scraper
- Persistence: SQLite for settings, API logs, and progress metadata

### Project Layout

```text
src/                    React UI, hooks, Zustand stores
src-tauri/src/          Tauri commands, services, parsers, DB code
docs/references.md      Detailed architecture and command reference
.context/               Shared task and steering documents
```

### Verification Commands

```bash
pnpm run lint
pnpm run build
pnpm run test
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```

</details>

## More

- For detailed architecture notes and internal command references, see [docs/references.md](./docs/references.md).
