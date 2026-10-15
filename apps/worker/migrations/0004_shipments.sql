-- Entregas: encomendas (só código e status) e orçamento mensal do provedor de rastreio.
-- Nome de exibição escolhido pela pessoa (name_custom). Aditiva. Sem DROP.

ALTER TABLE od_owners ADD COLUMN name_custom INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS od_shipments (
  id                  TEXT PRIMARY KEY,
  owner_id            TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  code                TEXT NOT NULL,
  carrier             TEXT,
  confidence          TEXT,
  store_label         TEXT,
  status              TEXT,
  status_label        TEXT,
  last_event_at       TEXT,
  last_event          TEXT,
  events_json         TEXT NOT NULL DEFAULT '[]',
  provider            TEXT,
  provider_checked_at TEXT,
  delivered_at        TEXT,
  active              INTEGER NOT NULL DEFAULT 1,
  needs_carrier       INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE (owner_id, code)
);
CREATE INDEX IF NOT EXISTS od_shipments_due ON od_shipments(owner_id, active, provider_checked_at);

CREATE TABLE IF NOT EXISTS od_tracking_budget (
  owner_id TEXT NOT NULL,
  month    TEXT NOT NULL,
  calls    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, month)
);
