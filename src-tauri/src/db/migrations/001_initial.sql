CREATE TABLE IF NOT EXISTS novels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site TEXT NOT NULL,
    novel_id TEXT NOT NULL,
    title TEXT,
    author TEXT,
    total_chapters INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(site, novel_id)
);

CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    novel_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    chapter_url TEXT NOT NULL,
    title TEXT,
    subtitle TEXT,
    original_content TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
    UNIQUE(novel_id, chapter_number)
);

CREATE TABLE IF NOT EXISTS translations (
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

CREATE TABLE IF NOT EXISTS translation_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text_hash TEXT NOT NULL UNIQUE,
    novel_id TEXT,
    original_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    hit_count INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_type TEXT NOT NULL,
    api_key TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    daily_usage INTEGER DEFAULT 0,
    last_used_at DATETIME,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chapters_novel ON chapters(novel_id);
CREATE INDEX IF NOT EXISTS idx_chapters_status ON chapters(status);
CREATE INDEX IF NOT EXISTS idx_translations_chapter ON translations(chapter_id);
CREATE INDEX IF NOT EXISTS idx_cache_hash ON translation_cache(text_hash);
CREATE INDEX IF NOT EXISTS idx_cache_novel_id ON translation_cache(novel_id);
