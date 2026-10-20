-- Internal checkpoints only: no execution authority, token or provider credential.
CREATE TABLE od_task_checkpoints (
 owner_id TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL,
 task_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision > 0),
 payload_enc TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id, project_id, task_id)
);
