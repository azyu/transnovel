# AI Novel Translator - Agent Documentation

> A Tauri 2.0 desktop application for translating Japanese web novels to Korean using AI.

## Project Overview

| Item | Details |
|------|---------|
| **App Name** | AI Novel Translator |
| **Platform** | Tauri 2.0 Desktop App (macOS, Windows, Linux) |
| **Frontend** | React 18 + TypeScript + TailwindCSS |
| **Backend** | Rust (Tauri) |
| **Database** | SQLite (sqlx) |
| **Package Manager** | pnpm |
| **Translation** | Japanese → Korean |
| **UI Language** | Korean |

## Supported Novel Sites

| Site | Domain | Parser ID |
|------|--------|-----------|
| Syosetu (小説家になろう) | ncode.syosetu.com | `syosetu` |
| Hameln (ハーメルン) | syosetu.org | `hameln` |
| Kakuyomu (カクヨム) | kakuyomu.jp | `kakuyomu` |
| Nocturne Novels | novel18.syosetu.com | `nocturne` |

## API Authentication Methods

### 1. Google AI Studio (Primary)
- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta`
- **Auth**: API Key via `x-goog-api-key` header
- **Models**: `gemini-2.5-flash-preview`, `gemini-3-flash-preview`
- **Free Tier**: ~20 RPD (requests per day)

### 2. Antigravity Claude Proxy (Alternative)
- **Endpoint**: `http://localhost:8080`
- **Auth**: Google OAuth via proxy
- **Models**: Claude Sonnet 4.5, Gemini models
- **Requires**: Running `antigravity-claude-proxy` locally

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Tauri Desktop App                               │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                 Frontend (React + TypeScript)                    │    │
│  │  - URL Input Component                                          │    │
│  │  - Translation Viewer (Original + Translated side-by-side)      │    │
│  │  - Series Manager (batch translation UI)                        │    │
│  │  - Settings Panel (API keys, prompts, themes)                   │    │
│  │  - Export Dialog (TXT, EPUB formats)                            │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │ Tauri IPC                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Backend (Rust)                                │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐    │    │
│  │  │ Site Parser │ │ Translator  │ │ Series Manager          │    │    │
│  │  │ - Syosetu   │ │ - Gemini    │ │ - Batch Translation     │    │    │
│  │  │ - Hameln    │ │ - Antigrav. │ │ - Progress Tracking     │    │    │
│  │  │ - Kakuyomu  │ │ - Streaming │ │ - Resume Support        │    │    │
│  │  │ - Nocturne  │ │ - Caching   │ │ - Export (TXT/EPUB)     │    │    │
│  │  └─────────────┘ └─────────────┘ └─────────────────────────┘    │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │                   SQLite Database                        │    │    │
│  │  │  novels | chapters | translations | settings | api_keys  │    │    │
│  │  └─────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
ai-novel-translator/
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
├── index.html
│
├── src/                          # React Frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── layout/
│   │   ├── translation/
│   │   ├── series/
│   │   ├── settings/
│   │   └── common/
│   ├── hooks/
│   ├── services/
│   ├── stores/                   # Zustand stores
│   ├── types/
│   └── styles/
│
└── src-tauri/                    # Rust Backend
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    │   └── default.json
    └── src/
        ├── main.rs
        ├── lib.rs
        ├── commands/             # Tauri Commands
        │   ├── translation.rs
        │   ├── series.rs
        │   ├── parser.rs
        │   └── export.rs
        ├── services/
        │   ├── gemini.rs
        │   ├── antigravity.rs
        │   └── translator.rs
        ├── parsers/
        │   ├── syosetu.rs
        │   ├── hameln.rs
        │   ├── kakuyomu.rs
        │   └── nocturne.rs
        ├── models/
        └── db/
```

## Database Schema

```sql
-- Novel metadata
CREATE TABLE novels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site TEXT NOT NULL,                    -- 'syosetu', 'hameln', etc.
    novel_id TEXT NOT NULL,                -- Site-specific ID (e.g., n4029bs)
    title TEXT,
    author TEXT,
    total_chapters INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(site, novel_id)
);

-- Chapter data
CREATE TABLE chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    novel_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    chapter_url TEXT NOT NULL,
    title TEXT,
    subtitle TEXT,
    original_content TEXT,
    status TEXT DEFAULT 'pending',         -- 'pending', 'translating', 'completed', 'error'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
    UNIQUE(novel_id, chapter_number)
);

-- Paragraph-level translations
CREATE TABLE translations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER NOT NULL,
    paragraph_index INTEGER NOT NULL,
    original_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    model_used TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
    UNIQUE(chapter_id, paragraph_index)
);

-- Translation cache (for reusing identical sentences)
CREATE TABLE translation_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text_hash TEXT NOT NULL UNIQUE,
    original_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    hit_count INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API key management
CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_type TEXT NOT NULL,                -- 'gemini', 'antigravity'
    api_key TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    daily_usage INTEGER DEFAULT 0,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- App settings
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Key Features

### 1. Single Chapter Translation
- Input URL or paste text
- Stream translation results in real-time
- Display original and translated text side-by-side
- Cache translations for reuse

### 2. Series Batch Translation
- Detect series from single chapter URL
- Select range of chapters to translate (e.g., 1-150)
- Background translation with progress tracking
- Pause/Resume support
- Auto-retry on errors

### 3. Export Functionality
- **TXT (Single File)**: All chapters in one file
- **TXT (Per Chapter)**: Each chapter as separate file
- **EPUB**: E-book format with metadata
- Options: Include original text, include translation notes

### 4. Translation Engine
- Paragraph-based ID system for alignment
- SSE streaming for real-time display
- Multiple API key rotation for rate limits
- Automatic model fallback on errors

## Translation Prompt Template

```
<|im_start|>system
You are a professional translator specializing in Japanese web novels to Korean.

Rules:
1. Preserve the id attribute of each <p> tag in your translation.
2. Maintain the original tone and writing style.
3. Translate dialogue naturally in Korean colloquial style.
4. Transliterate proper nouns (names, places) to Hangul.
5. Format ruby text as: 漢字(읽는법)
6. Do not omit or add sentences.

{{note}}
<|im_end|>
<|im_start|>user
Translate the following Japanese text to Korean:

{{slot}}
<|im_end|>
```

## Paragraph ID Encoding

The system uses a custom ID encoding for paragraph alignment:

```
0-25   → A-Z
26-51  → a-z
52+    → Two-letter combinations (AA, AB, ..., Ba, Bb, ...)
```

Example:
```html
<!-- Request -->
<p id="A">これは最初の段落です。</p>
<p id="B">これは二番目の段落です。</p>

<!-- Response -->
<p id="A">이것은 첫 번째 문단입니다.</p>
<p id="B">이것은 두 번째 문단입니다.</p>
```

## API Configuration

### Gemini API Request Format

```json
{
  "contents": [{
    "role": "user",
    "parts": [{"text": "prompt with paragraphs"}]
  }],
  "generationConfig": {
    "temperature": 1.0,
    "topP": 0.8,
    "maxOutputTokens": 65536,
    "thinkingConfig": {
      "thinkingBudget": 0
    }
  },
  "safetySettings": [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "OFF"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "OFF"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "OFF"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "OFF"}
  ]
}
```

### Antigravity Proxy Request Format

```json
{
  "model": "claude-sonnet-4-5-thinking",
  "max_tokens": 65536,
  "messages": [{
    "role": "user",
    "content": "prompt with paragraphs"
  }]
}
```

## Site Parser Patterns

### Syosetu (ncode.syosetu.com)
- **URL Pattern**: `https://ncode.syosetu.com/{novel_id}/{chapter}/`
- **Title Selector**: `.novel_title`
- **Author Selector**: `.novel_writername a`
- **Content Selector**: `#novel_honbun`
- **Chapter List**: `.novel_sublist2 .subtitle a`

### Hameln (syosetu.org)
- **URL Pattern**: `https://syosetu.org/novel/{novel_id}/{chapter}.html`
- **Content Selector**: `#honbun`
- **Navigation**: `.novelnavi a`

### Kakuyomu (kakuyomu.jp)
- **URL Pattern**: `https://kakuyomu.jp/works/{novel_id}/episodes/{episode_id}`
- **Content Selector**: `.widget-episodeBody`

### Nocturne (novel18.syosetu.com)
- Same structure as Syosetu with adult content verification

## Development Commands

```bash
# Install dependencies
pnpm install

# Development mode
pnpm run tauri dev

# Build for production
pnpm run tauri build

# Build frontend only
pnpm run build

# Run Rust tests
cargo test --manifest-path src-tauri/Cargo.toml
```

## Development Workflow

1. **Implement**: Build feature by feature
2. **Test**: Verify build and test functionality
3. **Commit**: Commit after tests pass

> Follow the cycle: Implement → Test → Commit for each feature.

## Environment Variables

```bash
# Optional: Default API key (can also be set in app settings)
GEMINI_API_KEY=AIzaSy...

# Antigravity proxy URL (default: http://localhost:8080)
ANTIGRAVITY_PROXY_URL=http://localhost:8080
```

## Error Handling

| Error Code | Description | Recovery |
|------------|-------------|----------|
| `429` | Rate limit exceeded | Rotate to next API key or wait |
| `400` | Invalid API key | Prompt user to check key |
| `500` | Server error | Retry with exponential backoff |
| `SAFETY` | Content filtered | Reduce batch size, retry |

## Design Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-17 | Tauri 2.0 over Electron | Smaller bundle (~10MB vs ~200MB), Rust backend for performance |
| 2026-01-17 | SQLite over IndexedDB | Portable, easy backup, powerful queries |
| 2026-01-17 | React over Vue/Svelte | Larger ecosystem, team familiarity |
| 2026-01-17 | Japanese→Korean only | Optimized prompts, focused scope |
| 2026-01-17 | Korean UI only | Primary user base, simpler maintenance |
| 2026-01-17 | Dual API support | Flexibility between free (Gemini) and OAuth (Antigravity) |

## Implementation Status

### Completed (P0)
- [x] Project setup (Tauri 2.0 + React + TypeScript + TailwindCSS + pnpm)
- [x] Site parsers (Syosetu, Hameln, Kakuyomu, Nocturne)
- [x] Frontend UI (3 tabs: Translation, Series, Settings)
- [x] SQLite database with sqlx (API keys, settings, translation cache)
- [x] Gemini API integration with paragraph-based translation
- [x] Antigravity proxy fallback support
- [x] Single chapter translation flow

### Completed (P1)
- [x] Translation caching (SHA256 hash-based deduplication)
- [x] Batch translation with pause/resume/stop controls
- [x] TXT export (single file and per-chapter)

### Pending (P2)
- [ ] EPUB export
- [ ] Streaming translation display
- [ ] Auto-retry on API errors
- [ ] API key rotation

### Ruby Text Handling
- Format: `漢字(읽는법)` (parenthetical notation)
- Consistent across all output formats (display, TXT, EPUB)

## References

- [Tauri 2.0 Documentation](https://v2.tauri.app/)
- [Google AI Studio](https://aistudio.google.com/)
- [Antigravity Claude Proxy](https://github.com/badrisnarayanan/antigravity-claude-proxy)
- [Colomo Translator](https://syosetu.colomo.dev/) - Reference implementation

---

*This document is maintained by AI agents working on the project.*
