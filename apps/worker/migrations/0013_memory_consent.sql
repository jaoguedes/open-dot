-- Consentimento por dono/projeto; tombstones evitam reutilizar revisões de uma autorização revogada.
CREATE TABLE od_project_memory_policies (
 owner_id TEXT NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE, project_id TEXT NOT NULL,
 revision INTEGER NOT NULL, enabled INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 operation_id TEXT NOT NULL, PRIMARY KEY(owner_id,project_id)
);
