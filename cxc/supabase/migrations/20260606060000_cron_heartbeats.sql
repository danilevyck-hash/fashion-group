-- cron_heartbeats: ultima corrida exitosa por cron.
-- El watchdog (dentro de /api/cron/switch-reconciliacion, 10:00 UTC) revisa esta
-- tabla y alerta por Telegram si algun cron lleva mas de 30h sin success.
-- Cada cron hace upsert via recordCronHeartbeat() (src/lib/cron-telemetry.ts).

CREATE TABLE IF NOT EXISTS cron_heartbeats (
  cron_name text PRIMARY KEY,
  last_success_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cron_heartbeats ENABLE ROW LEVEL SECURITY;

-- Solo service_role escribe/lee (los crons corren con service role key).
DROP POLICY IF EXISTS service_role_all ON cron_heartbeats;
CREATE POLICY service_role_all ON cron_heartbeats
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
