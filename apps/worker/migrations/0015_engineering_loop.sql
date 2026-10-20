-- Sequential opt-in scheduler; existing Runner remains the only executor.
CREATE TABLE od_engineering_plans (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES od_owners(id),
 device_id TEXT NOT NULL REFERENCES od_runner_devices(id),
 project_id TEXT NOT NULL,
 mechanism TEXT NOT NULL,
 request_key TEXT NOT NULL,
 definition_digest TEXT NOT NULL,
 title_enc TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('active','paused','completed','blocked','uncertain','cancelled')),
 revision INTEGER NOT NULL DEFAULT 1,
 dispatch_nonce TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 UNIQUE(owner_id,request_key)
);
CREATE TABLE od_engineering_tasks (
 id TEXT PRIMARY KEY,
 plan_id TEXT NOT NULL REFERENCES od_engineering_plans(id),
 position INTEGER NOT NULL,
 phase INTEGER NOT NULL,
 payload_enc TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','assigned','completed','failed','uncertain','cancelled')),
 UNIQUE(plan_id,position)
);
CREATE TABLE od_engineering_dependencies (
 task_id TEXT NOT NULL REFERENCES od_engineering_tasks(id),
 dependency_id TEXT NOT NULL REFERENCES od_engineering_tasks(id),
 PRIMARY KEY(task_id,dependency_id), CHECK(task_id<>dependency_id)
);
CREATE TABLE od_engineering_attempts (
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL UNIQUE REFERENCES od_engineering_tasks(id),
 runner_task_id TEXT NOT NULL UNIQUE REFERENCES od_runner_tasks(id),
 created_at INTEGER NOT NULL
);
CREATE INDEX od_engineering_plans_dispatch ON od_engineering_plans(device_id,state,created_at);
