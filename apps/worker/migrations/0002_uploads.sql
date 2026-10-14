-- Open Dot · absorção de arquivos (texto extraído no navegador)
-- Aditiva: só cria objetos novos com prefixo od_. O arquivo original nunca chega ao servidor.

CREATE TABLE IF NOT EXISTS od_uploads (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  file_sha256   TEXT NOT NULL,          -- hash do arquivo original (calculado no navegador; usado para duplicata)
  text_sha256   TEXT NOT NULL,          -- hash do texto recebido (conferido pelo servidor)
  file_name_enc TEXT NOT NULL,          -- nome cifrado
  mime          TEXT NOT NULL,
  file_bytes    INTEGER NOT NULL,
  text_chars    INTEGER NOT NULL,
  pages         INTEGER,
  text_enc      TEXT NOT NULL,          -- texto extraído, cifrado (AES-GCM, AAD = id)
  state         TEXT NOT NULL,          -- received | processing | organized | failed
  run_id        TEXT,
  result_enc    TEXT,                   -- resultado da organização, cifrado
  error_code    TEXT,
  error_message TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(owner_id, file_sha256)
);
CREATE INDEX IF NOT EXISTS od_uploads_owner ON od_uploads(owner_id, created_at);
