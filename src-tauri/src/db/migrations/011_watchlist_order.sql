ALTER TABLE watchlist_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Preserve the pre-migration display order (updated_at DESC, id DESC) as a 0-based rank.
UPDATE watchlist_items
SET sort_order = (
    SELECT COUNT(*)
    FROM watchlist_items AS other
    WHERE COALESCE(other.updated_at, '') > COALESCE(watchlist_items.updated_at, '')
       OR (
           COALESCE(other.updated_at, '') = COALESCE(watchlist_items.updated_at, '')
           AND other.id > watchlist_items.id
       )
);
