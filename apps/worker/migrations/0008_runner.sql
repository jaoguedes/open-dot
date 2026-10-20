-- Canal Runner: segredos de dispositivo somente como hashes; conteúdo cifrado no serviço.
CREATE TABLE od_runner_pairings (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, secret_hash TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, expires_at INTEGER NOT NULL,
 owner_id TEXT REFERENCES od_owners(id), device_id TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE od_runner_devices (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES od_owners(id),
 name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL,
 revoked_at INTEGER, seen_at INTEGER NOT NULL DEFAULT 0, capabilities TEXT NOT NULL DEFAULT '[]',
 projects TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL
);
CREATE INDEX od_runner_devices_owner ON od_runner_devices(owner_id);
CREATE TABLE od_runner_tasks (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES od_owners(id),
 device_id TEXT NOT NULL REFERENCES od_runner_devices(id), project_id TEXT NOT NULL,
 mechanism TEXT NOT NULL, prompt_enc TEXT NOT NULL, state TEXT NOT NULL,
 request_key TEXT NOT NULL, cancel_requested INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(owner_id, request_key)
);
CREATE INDEX od_runner_tasks_device ON od_runner_tasks(device_id, state, created_at);
CREATE TABLE od_runner_events (
 task_id TEXT NOT NULL REFERENCES od_runner_tasks(id), seq INTEGER NOT NULL,
 kind TEXT NOT NULL, payload_enc TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(task_id, seq)
);
CREATE TABLE od_runner_approvals (
 task_id TEXT PRIMARY KEY REFERENCES od_runner_tasks(id), digest TEXT NOT NULL,
 proposal_enc TEXT NOT NULL, decision TEXT NOT NULL DEFAULT 'pending',
 expires_at INTEGER NOT NULL, decided_at INTEGER
);
