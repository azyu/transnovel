# AI Novel Translator

A desktop application for translating Japanese web novels to Korean using AI. Built with Tauri 2.0, React, and Rust.

[한국어 문서](./README.ko.md)

## Features

- **Multi-site Support**: Parse novels from Syosetu, Hameln, Kakuyomu, and Nocturne
- **Multiple AI Providers**: Choose between Gemini API, OpenRouter, or Antigravity Proxy
- **Batch Translation**: Translate entire series with progress tracking
- **Smart Caching**: SHA256-based cache to avoid redundant API calls
- **Per-Novel Cache**: Translation cache is isolated per novel
- **Streaming Output**: Real-time translation display as AI generates text
- **Dark Mode**: Full dark theme support
- **Export**: Save translated chapters as TXT files

## Supported Sites

| Site | Domain |
|------|--------|
| Syosetu | ncode.syosetu.com |
| Hameln | syosetu.org |
| Kakuyomu | kakuyomu.jp |
| Nocturne | novel18.syosetu.com |

## AI Providers

| Provider | Auth Method | Notes |
|----------|-------------|-------|
| Gemini API | API Key | Free tier available at [Google AI Studio](https://aistudio.google.com/apikey) |
| OpenRouter | API Key | Access to Claude, GPT-4, Llama, etc. at [OpenRouter](https://openrouter.ai) |
| Antigravity Proxy | Google OAuth | No API key needed, uses local proxy |

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) 1.77+
- [pnpm](https://pnpm.io/) (recommended)

### Build from Source

```bash
# Clone the repository
git clone https://github.com/azyu/ai-novel-translator.git
cd ai-novel-translator

# Install dependencies
pnpm install

# Run in development mode
pnpm run tauri dev

# Build for production
pnpm run tauri build
```

## Usage

1. **Add API Key**: Go to Settings → LLM Settings → Add your API key
2. **Select Provider**: Choose one provider (Gemini, OpenRouter, or Antigravity)
3. **Paste URL**: Enter a chapter or series URL from a supported site
4. **Translate**: Click the translate button or use batch translation for series

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Zustand
- **Backend**: Rust, Tauri 2.0, SQLite (via sqlx)
- **Build**: Vite, pnpm

## License

MIT
