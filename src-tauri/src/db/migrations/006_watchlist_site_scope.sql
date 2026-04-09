CREATE TABLE watchlist_episodes_new (
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

INSERT INTO watchlist_episodes_new (
    id,
    site,
    novel_id,
    chapter_number,
    chapter_url,
    title,
    is_new,
    created_at,
    updated_at
)
SELECT
    episodes.id,
    COALESCE(items.site, 'syosetu'),
    episodes.novel_id,
    episodes.chapter_number,
    episodes.chapter_url,
    episodes.title,
    episodes.is_new,
    episodes.created_at,
    episodes.updated_at
FROM watchlist_episodes AS episodes
LEFT JOIN watchlist_items AS items
  ON items.novel_id = episodes.novel_id;

DROP TABLE watchlist_episodes;
ALTER TABLE watchlist_episodes_new RENAME TO watchlist_episodes;

CREATE INDEX IF NOT EXISTS idx_watchlist_episodes_novel
    ON watchlist_episodes(site, novel_id);

CREATE TABLE viewed_episodes_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site TEXT NOT NULL,
    novel_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(site, novel_id, chapter_number)
);

INSERT INTO viewed_episodes_new (
    id,
    site,
    novel_id,
    chapter_number,
    viewed_at
)
SELECT
    viewed.id,
    COALESCE(items.site, 'syosetu'),
    viewed.novel_id,
    viewed.chapter_number,
    viewed.viewed_at
FROM viewed_episodes AS viewed
LEFT JOIN watchlist_items AS items
  ON items.novel_id = viewed.novel_id;

DROP TABLE viewed_episodes;
ALTER TABLE viewed_episodes_new RENAME TO viewed_episodes;

CREATE INDEX IF NOT EXISTS idx_viewed_episodes_novel
    ON viewed_episodes(site, novel_id);
