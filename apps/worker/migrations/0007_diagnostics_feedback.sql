-- 0007 (aditiva): estado do sistema para o Diagnóstico (F4) e retorno do dono sobre a
-- triagem do Correio (G). Nada de corpo nem endereço de e-mail em claro: o domínio do
-- remetente fica como hash (busca) e cifrado (para mostrar em "Remetentes silenciados").
CREATE TABLE IF NOT EXISTS od_system_state (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS od_triage_feedback (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id            TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
  sender_domain_hash  TEXT NOT NULL,
  sender_label_enc    TEXT,
  categoria           TEXT NOT NULL,
  rotulo              TEXT NOT NULL,  -- 'importante' | 'nao_importa' | 'desfazer'
  at                  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS od_triage_feedback_owner ON od_triage_feedback(owner_id, sender_domain_hash, at);
