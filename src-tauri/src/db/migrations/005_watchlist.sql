CREATE TABLE IF NOT EXISTS watchlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site TEXT NOT NULL,
    work_url TEXT NOT NULL,
    novel_id TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    last_known_chapter INTEGER NOT NULL DEFAULT 0,
    last_checked_at DATETIME,
    last_check_status TEXT NOT NULL DEFAULT 'idle',
    last_check_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(site, novel_id)
);

CREATE TABLE IF NOT EXISTS watchlist_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site TEXT NOT NULL,
    novel_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    chapter_url TEXT NOT NULL,
    title TEXT,
    is_new BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(site, novel_id, chapter_number)
);

CREATE TABLE IF NOT EXISTS viewed_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site TEXT NOT NULL,
    novel_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(site, novel_id, chapter_number)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_items_site_novel
    ON watchlist_items(site, novel_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_episodes_novel
    ON watchlist_episodes(site, novel_id);
CREATE INDEX IF NOT EXISTS idx_viewed_episodes_novel
    ON viewed_episodes(site, novel_id);
