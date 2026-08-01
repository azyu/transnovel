-- Legacy cache rows do not carry enough identity to be safely reused.
DROP TABLE IF EXISTS translation_cache_v2;
CREATE TABLE translation_cache_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text_hash TEXT NOT NULL UNIQUE,
    site TEXT NOT NULL,
    novel_id TEXT NOT NULL,
    context_fingerprint TEXT NOT NULL,
    normalized_source TEXT NOT NULL,
    original_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    hit_count INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE translation_cache;
ALTER TABLE translation_cache_v2 RENAME TO translation_cache;

CREATE INDEX idx_cache_identity
    ON translation_cache(site, novel_id, context_fingerprint);
CREATE INDEX idx_cache_hash ON translation_cache(text_hash);
CREATE INDEX idx_cache_novel_id ON translation_cache(novel_id);
