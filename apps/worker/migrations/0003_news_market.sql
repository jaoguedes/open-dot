-- Agentes Notícias, Mercado e Marketing: itens públicos, cotações e liga/desliga por dono.
-- Aditiva. Sem DROP.

CREATE TABLE IF NOT EXISTS od_agent_settings (
  owner_id     TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  agent_id     TEXT NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 1,
  config       TEXT NOT NULL DEFAULT '{}',
  last_test_at TEXT,
  last_error   TEXT,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (owner_id, agent_id)
);

CREATE TABLE IF NOT EXISTS od_news_items (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  feed_id      TEXT NOT NULL,
  theme        TEXT NOT NULL,
  outlet       TEXT NOT NULL,
  title        TEXT NOT NULL,
  title_norm   TEXT NOT NULL,
  link         TEXT NOT NULL,
  published_at TEXT,
  fetched_at   TEXT NOT NULL,
  UNIQUE (owner_id, link)
);
CREATE INDEX IF NOT EXISTS od_news_owner_fetched ON od_news_items(owner_id, fetched_at);

CREATE TABLE IF NOT EXISTS od_quotes (
  owner_id   TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  symbol     TEXT NOT NULL,
  price      REAL NOT NULL,
  change_pct REAL,
  source     TEXT NOT NULL,
  quoted_at  TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, symbol)
);
