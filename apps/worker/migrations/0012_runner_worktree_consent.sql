-- Não executar fila legada sem consentimento específico para metadados compartilhados.
ALTER TABLE od_runner_tasks ADD COLUMN worktree_consent INTEGER NOT NULL DEFAULT 0;
UPDATE od_runner_tasks SET state='cancelled',cancel_requested=1 WHERE state='queued' AND worktree_consent=0;
