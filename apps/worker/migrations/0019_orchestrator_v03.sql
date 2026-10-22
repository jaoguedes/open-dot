-- Orquestrador v0.3: preferências por dono (todas desligadas por padrão), estado da calibração,
-- pacotes de agentes importados e propostas de skill. Só expansão: tabelas novas, nada removido.
-- NÃO aplicada em produção nesta rodada.
CREATE TABLE IF NOT EXISTS od_orchestrator_prefs (
  owner_id TEXT PRIMARY KEY REFERENCES od_owners(id),
  prefs_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS od_orchestrator_calibration (
  owner_id TEXT PRIMARY KEY REFERENCES od_owners(id),
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS od_agent_imports (
  owner_id TEXT NOT NULL REFERENCES od_owners(id),
  agent_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  files_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, agent_id)
);
CREATE TABLE IF NOT EXISTS od_skill_proposals (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES od_owners(id),
  pattern TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  draft_json TEXT NOT NULL,
  hash TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS od_skill_proposals_owner ON od_skill_proposals (owner_id, state);
