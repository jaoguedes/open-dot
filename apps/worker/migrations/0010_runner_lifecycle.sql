-- Aditiva. Tentativas legadas ativas sem lease serão reconciliadas como uncertain, nunca repetidas.
ALTER TABLE od_runner_tasks ADD COLUMN lease_until INTEGER;
ALTER TABLE od_runner_tasks ADD COLUMN attempt_deadline INTEGER;
ALTER TABLE od_runner_events ADD COLUMN digest TEXT;
