-- Dispositivos antigos devem negociar antes de executar, sem presumir suporte do heartbeat.
ALTER TABLE od_runner_devices ADD COLUMN protocol_version INTEGER NOT NULL DEFAULT 0;
