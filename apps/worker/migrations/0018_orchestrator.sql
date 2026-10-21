-- Orquestrador v0.2: snapshot de ferramentas por dispositivo (sem credenciais) e resultados para calibração.
-- Só expansão: tabelas novas.
CREATE TABLE IF NOT EXISTS od_tool_snapshots (
  device_id TEXT PRIMARY KEY REFERENCES od_runner_devices(id),
  owner_id TEXT NOT NULL REFERENCES od_owners(id),
  snapshot_json TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS od_tool_snapshots_owner ON od_tool_snapshots (owner_id);
CREATE TABLE IF NOT EXISTS od_orchestrator_outcomes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES od_owners(id),
  role TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  calls INTEGER NOT NULL,
  runner_task_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS od_orchestrator_outcomes_owner ON od_orchestrator_outcomes (owner_id, created_at);
CREATE TABLE IF NOT EXISTS od_tool_quota (
  owner_id TEXT NOT NULL REFERENCES od_owners(id),
  tool_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, tool_id)
);
CREATE TABLE IF NOT EXISTS od_orchestrator_settings (
  owner_id TEXT PRIMARY KEY REFERENCES od_owners(id),
  claude_opt_in INTEGER NOT NULL DEFAULT 0,
  claude_ack_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS od_pipelines (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES od_owners(id),
  device_id TEXT NOT NULL REFERENCES od_runner_devices(id),
  project_id TEXT NOT NULL,
  idea_enc TEXT NOT NULL,
  team_json TEXT NOT NULL,
  state TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS od_pipelines_device ON od_pipelines (device_id, state);
CREATE TABLE IF NOT EXISTS od_pipeline_steps (
  pipeline_id TEXT NOT NULL REFERENCES od_pipelines(id),
  position INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  runner_task_id TEXT,
  state TEXT NOT NULL,
  output_enc TEXT,
  errors TEXT,
  PRIMARY KEY (pipeline_id, position)
);
CREATE UNIQUE INDEX IF NOT EXISTS od_pipeline_steps_task ON od_pipeline_steps (runner_task_id);
