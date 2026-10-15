ALTER TABLE od_feed_items ADD COLUMN state TEXT NOT NULL DEFAULT 'open';
ALTER TABLE od_feed_items ADD COLUMN resolved_at TEXT;
ALTER TABLE od_feed_items ADD COLUMN snooze_until TEXT;
