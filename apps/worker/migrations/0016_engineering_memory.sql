-- Additional opt-in; captures the exact existing memory consent revision.
ALTER TABLE od_engineering_plans ADD COLUMN memory_policy_revision INTEGER;
ALTER TABLE od_engineering_tasks ADD COLUMN memory_sync_state TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE od_engineering_tasks ADD COLUMN memory_sync_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE od_engineering_tasks ADD COLUMN memory_recorded_revision INTEGER;
