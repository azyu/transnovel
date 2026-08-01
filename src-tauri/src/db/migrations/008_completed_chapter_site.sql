-- Legacy completion rows have no site and cannot be safely reused.
DROP TABLE IF EXISTS completed_chapters_v2;
CREATE TABLE completed_chapters_v2 (
    site TEXT NOT NULL,
    novel_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    paragraph_count INTEGER NOT NULL,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (site, novel_id, chapter_number)
);

DROP TABLE completed_chapters;
ALTER TABLE completed_chapters_v2 RENAME TO completed_chapters;

CREATE INDEX idx_completed_chapters_work
    ON completed_chapters(site, novel_id);
