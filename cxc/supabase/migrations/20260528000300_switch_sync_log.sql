-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_sync_log
--
-- Log generalizado de corridas del sync multi-empresa (facturas + estado de
-- cuenta). Equivalente a multifashion_sync_log pero con empresa_key + sync_type.
-- Multifashion (american_classic) sigue logueando en multifashion_sync_log para
-- su sync legacy; el sync nuevo loguea acá.
--
-- skip_details: array [{facturaId, secuencial, campo, valorCrudo}] — anti
-- skip-silencioso, mismo principio que multifashion_sync_log.skip_details.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS switch_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_key text NOT NULL,
  sync_type text NOT NULL CHECK (sync_type IN ('facturas', 'estadocuenta')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'success', 'error')),
  range_from date,
  range_to date,
  records_inserted int DEFAULT 0,
  records_updated int DEFAULT 0,
  records_skipped int DEFAULT 0,
  skip_details jsonb,
  error_message text,
  triggered_by text NOT NULL CHECK (triggered_by IN ('cron', 'manual', 'backfill'))
);

CREATE INDEX IF NOT EXISTS idx_ssl_empresa_type_started
  ON switch_sync_log (empresa_key, sync_type, started_at DESC);

ALTER TABLE switch_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON switch_sync_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
