CREATE TABLE IF NOT EXISTS novel_character_dictionary (
    site TEXT NOT NULL,
    novel_id TEXT NOT NULL,
    entries_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (site, novel_id)
);

CREATE INDEX IF NOT EXISTS idx_novel_character_dictionary_novel
    ON novel_character_dictionary(novel_id);
