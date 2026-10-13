-- Open Dot · migração inicial
-- Aditiva e idempotente: só cria objetos novos com prefixo próprio (od_).
-- Nunca altera tabelas de outros projetos. Use um banco Turso separado para o Open Dot.
-- Toda tabela de dados tem owner_id; toda consulta autenticada filtra por ele.

CREATE TABLE IF NOT EXISTS od_owners (
  id            TEXT PRIMARY KEY,
  google_sub    TEXT UNIQUE,            -- identidade estável do login (não o e-mail)
  email         TEXT NOT NULL,
  display_name  TEXT,
  time_zone     TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS od_sessions (
  id_hash       TEXT PRIMARY KEY,       -- SHA-256 do token; o token só existe no cookie
  owner_id      TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  user_agent    TEXT
);
CREATE INDEX IF NOT EXISTS od_sessions_owner ON od_sessions(owner_id);

-- Estado temporário de OAuth (state + PKCE). Expira em 10 minutos.
CREATE TABLE IF NOT EXISTS od_oauth_states (
  state_hash    TEXT PRIMARY KEY,
  owner_id      TEXT,                   -- null no login; preenchido ao conectar um serviço
  purpose       TEXT NOT NULL,          -- 'login' | 'gmail'
  verifier_enc  TEXT NOT NULL,          -- code_verifier cifrado
  nonce         TEXT,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS od_connections (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,          -- 'gmail' | 'github' | 'vercel'
  status        TEXT NOT NULL,          -- connected | reauth_required | error | disabled
  account_label TEXT,
  external_id   TEXT,                   -- installation_id, e-mail da conta etc.
  scopes        TEXT NOT NULL DEFAULT '[]',
  cursor        TEXT,                   -- historyId do Gmail guardado como TEXTO
  cursor_at     TEXT,
  last_sync_at  TEXT,
  last_error    TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  refresh_lease_until TEXT,             -- lock para renovação de token
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(owner_id, provider, external_id)
);
CREATE INDEX IF NOT EXISTS od_connections_owner ON od_connections(owner_id, provider);

-- Segredos separados dos campos públicos. Sempre cifrados (AES-GCM, chave versionada fora do banco).
CREATE TABLE IF NOT EXISTS od_connection_secrets (
  connection_id TEXT PRIMARY KEY REFERENCES od_connections(id) ON DELETE CASCADE,
  owner_id      TEXT NOT NULL,
  key_version   TEXT NOT NULL,
  ciphertext    TEXT NOT NULL,          -- JSON {access_token, refresh_token, expires_at} cifrado
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS od_routines (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  agent_id      TEXT NOT NULL,
  kind          TEXT NOT NULL,          -- 'email_review'
  times         TEXT NOT NULL,          -- JSON ["08:00","17:00"] em horário local
  time_zone     TEXT NOT NULL,
  weekdays      TEXT NOT NULL DEFAULT '[]',
  enabled       INTEGER NOT NULL DEFAULT 1,
  last_planned_at TEXT,                 -- até onde o scheduler já planejou
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS od_routines_owner ON od_routines(owner_id);

CREATE TABLE IF NOT EXISTS od_runs (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  routine_id    TEXT,
  agent_id      TEXT NOT NULL,
  kind          TEXT NOT NULL,
  slot_key      TEXT,                   -- dono+rotina+slot; impede execução duplicada
  scheduled_at  TEXT,
  late          INTEGER NOT NULL DEFAULT 0,
  state         TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  attempt       INTEGER NOT NULL DEFAULT 0,
  lease_until   TEXT,
  next_attempt_at TEXT,
  error_code    TEXT,
  error_message TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(owner_id, slot_key)
);
CREATE INDEX IF NOT EXISTS od_runs_pick ON od_runs(state, next_attempt_at);
CREATE INDEX IF NOT EXISTS od_runs_owner ON od_runs(owner_id, created_at);

-- Deduplicação de eventos recebidos (webhooks, mensagens sincronizadas).
CREATE TABLE IF NOT EXISTS od_inbox_events (
  provider      TEXT NOT NULL,
  delivery_id   TEXT NOT NULL,
  owner_id      TEXT,
  received_at   TEXT NOT NULL,
  payload_hash  TEXT NOT NULL,
  processed_at  TEXT,
  PRIMARY KEY (provider, delivery_id)
);

-- Mensagens de e-mail: apenas metadados e trecho curto cifrado.
CREATE TABLE IF NOT EXISTS od_email_messages (
  owner_id      TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
  message_id    TEXT NOT NULL,
  thread_id     TEXT NOT NULL,
  from_enc      TEXT NOT NULL,
  subject_enc   TEXT NOT NULL,
  snippet_enc   TEXT,
  received_at   TEXT NOT NULL,
  labels        TEXT NOT NULL DEFAULT '[]',
  list_unsub    INTEGER NOT NULL DEFAULT 0,
  bulk          INTEGER NOT NULL DEFAULT 0,
  category      TEXT,
  reason        TEXT,
  triaged_by    TEXT,
  digest_run_id TEXT,
  fetched_at    TEXT NOT NULL,
  PRIMARY KEY (owner_id, connection_id, message_id)
);
CREATE INDEX IF NOT EXISTS od_email_messages_digest ON od_email_messages(owner_id, digest_run_id, received_at);

CREATE TABLE IF NOT EXISTS od_evidence (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  source        TEXT NOT NULL,
  external_id   TEXT NOT NULL,
  source_url    TEXT,
  title_enc     TEXT NOT NULL,
  excerpt_enc   TEXT,
  sensitivity   TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  observed_at   TEXT NOT NULL,
  fetched_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  UNIQUE(owner_id, source, external_id, content_hash)
);
CREATE INDEX IF NOT EXISTS od_evidence_owner ON od_evidence(owner_id, observed_at);

CREATE TABLE IF NOT EXISTS od_feed_items (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  agent_id      TEXT NOT NULL,
  run_id        TEXT,
  kind          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body_enc      TEXT NOT NULL,          -- JSON cifrado (resumo, itens, ações)
  freshness     TEXT NOT NULL,
  coverage      TEXT,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  UNIQUE(owner_id, run_id, kind)
);
CREATE INDEX IF NOT EXISTS od_feed_owner ON od_feed_items(owner_id, created_at, id);

CREATE TABLE IF NOT EXISTS od_feed_evidence (
  feed_id       TEXT NOT NULL REFERENCES od_feed_items(id) ON DELETE CASCADE,
  evidence_id   TEXT NOT NULL REFERENCES od_evidence(id) ON DELETE CASCADE,
  owner_id      TEXT NOT NULL,
  PRIMARY KEY (feed_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS od_approvals (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  run_id        TEXT,
  action        TEXT NOT NULL,
  proposal_enc  TEXT NOT NULL,
  payload_hash  TEXT NOT NULL,
  status        TEXT NOT NULL,          -- pending|approved|rejected|expired|consumed|invalidated
  version       INTEGER NOT NULL DEFAULT 1,
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  decided_at    TEXT
);
CREATE INDEX IF NOT EXISTS od_approvals_owner ON od_approvals(owner_id, status);

-- Orçamento de IA: contadores diários com atualização condicional (reserva atômica).
CREATE TABLE IF NOT EXISTS od_quota_counters (
  scope_key     TEXT NOT NULL,          -- owner:<id> | model:<provider>:<model>
  day           TEXT NOT NULL,
  calls         INTEGER NOT NULL DEFAULT 0,
  tokens        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope_key, day)
);

CREATE TABLE IF NOT EXISTS od_quota_reservations (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL,
  day           TEXT NOT NULL,
  owner_key     TEXT NOT NULL,
  model_key     TEXT NOT NULL,
  tokens        INTEGER NOT NULL,
  state         TEXT NOT NULL,          -- reserved | committed | released
  created_at    TEXT NOT NULL
);

-- Consumo de IA sem conteúdo.
CREATE TABLE IF NOT EXISTS od_ai_usage (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id      TEXT NOT NULL,
  at            TEXT NOT NULL,
  task_kind     TEXT NOT NULL,
  provider_id   TEXT NOT NULL,
  model_id      TEXT NOT NULL,
  outcome       TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  latency_ms    INTEGER NOT NULL,
  http_status   INTEGER
);
CREATE INDEX IF NOT EXISTS od_ai_usage_owner ON od_ai_usage(owner_id, at);

CREATE TABLE IF NOT EXISTS od_monitors (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  host          TEXT NOT NULL,
  label         TEXT NOT NULL,
  interval_min  INTEGER NOT NULL DEFAULT 5,
  enabled       INTEGER NOT NULL DEFAULT 1,
  incident      TEXT NOT NULL DEFAULT '{}',
  last_check_at TEXT,
  created_at    TEXT NOT NULL,
  UNIQUE(owner_id, url)
);

CREATE TABLE IF NOT EXISTS od_monitor_samples (
  monitor_id    TEXT NOT NULL REFERENCES od_monitors(id) ON DELETE CASCADE,
  owner_id      TEXT NOT NULL,
  at            TEXT NOT NULL,
  ok            INTEGER NOT NULL,
  status        INTEGER,
  latency_ms    INTEGER,
  error         TEXT,
  PRIMARY KEY (monitor_id, at)
);

CREATE TABLE IF NOT EXISTS od_audit_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id      TEXT,
  at            TEXT NOT NULL,
  actor         TEXT NOT NULL,          -- user | routine | system
  action        TEXT NOT NULL,
  target        TEXT,
  outcome       TEXT NOT NULL,
  detail        TEXT                    -- nunca tokens, e-mails ou prompts
);
CREATE INDEX IF NOT EXISTS od_audit_owner ON od_audit_events(owner_id, at);

-- IDs descobertos pelo history.list ainda sem metadados (permite avançar o cursor com segurança
-- e buscar metadados aos poucos, dentro do limite de subrequisições do Worker gratuito).
CREATE TABLE IF NOT EXISTS od_email_pending (
  owner_id      TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
  message_id    TEXT NOT NULL,
  thread_id     TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, connection_id, message_id)
);

-- Instalações do GitHub App → dono. O dono vem daqui, nunca do payload do webhook.
CREATE TABLE IF NOT EXISTS od_github_installations (
  installation_id INTEGER PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  account_login TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT NOT NULL
);

-- Último estado aplicado por recurso (evita regredir com evento fora de ordem).
CREATE TABLE IF NOT EXISTS od_github_resources (
  owner_id      TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  resource_key  TEXT NOT NULL,
  kind          TEXT NOT NULL,
  repo          TEXT,
  title         TEXT NOT NULL,
  state         TEXT NOT NULL,
  conclusion    TEXT,
  url           TEXT,
  head_sha      TEXT,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (owner_id, resource_key)
);

-- Deployments observados (leitura).
CREATE TABLE IF NOT EXISTS od_deployments (
  owner_id      TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  deployment_id TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  state         TEXT NOT NULL,
  target        TEXT,
  sha           TEXT,
  url           TEXT,
  inspector_url TEXT,
  created_at    TEXT NOT NULL,
  observed_at   TEXT NOT NULL,
  PRIMARY KEY (owner_id, deployment_id)
);
