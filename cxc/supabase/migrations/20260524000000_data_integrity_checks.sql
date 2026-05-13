-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: data_integrity_checks
--
-- Tabla histórica para los resultados del cron diario /api/cron/integrity-check.
-- Cada corrida del cron inserta 1 row por check (ver lista de checks en el
-- endpoint). El dashboard /admin/data-health lee los resultados más recientes
-- por check_name + el historial 30d.
--
-- Append-only: nunca se borran rows. El timeline 30d permite detectar
-- regresiones (ej: un check que estuvo OK 20 días y empezó a fallar).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS data_integrity_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name text NOT NULL,
  table_name text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical', 'ok')),
  rows_affected int NOT NULL DEFAULT 0,
  threshold_exceeded boolean NOT NULL DEFAULT false,
  details jsonb,
  checked_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dic_checked_at ON data_integrity_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_dic_severity ON data_integrity_checks(severity);
CREATE INDEX IF NOT EXISTS idx_dic_check_name ON data_integrity_checks(check_name);
CREATE INDEX IF NOT EXISTS idx_dic_check_name_checked_at ON data_integrity_checks(check_name, checked_at DESC);

ALTER TABLE data_integrity_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON data_integrity_checks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Verificación post-creación:
--   SELECT check_name, severity, rows_affected, checked_at
--   FROM data_integrity_checks
--   ORDER BY checked_at DESC LIMIT 20;
