-- Limite de taxa das rotas anônimas (pareamento do Runner e início do login).
-- Só expansão: tabela nova. O bucket guarda hash da origem, nunca o IP em claro.
CREATE TABLE IF NOT EXISTS od_rate_limits (
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);
CREATE INDEX IF NOT EXISTS od_rate_limits_expires ON od_rate_limits (expires_at);
