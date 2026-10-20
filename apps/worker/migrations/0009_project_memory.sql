-- Ledger pequeno cifrado por dono/projeto. Não concede permissões nem executa comandos.
CREATE TABLE od_project_ledgers (
 owner_id TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK (revision > 0),
 payload_enc TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id, project_id)
);
