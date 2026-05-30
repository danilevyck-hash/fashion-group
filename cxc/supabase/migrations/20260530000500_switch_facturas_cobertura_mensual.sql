-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_facturas_cobertura_mensual VIEW (auditoría 🟡-6)
--
-- Las vistas de ventas (switch_ventas_unificado_vw, etc.) asumen cobertura
-- COMPLETA de switch_facturas desde 2025-05-01. Si el backfill saltó un
-- empresa-mes (ej. el cron arrancó tarde, o backfillFacturas hizo fail++ en un
-- mes), ese mes no produce filas y el dashboard lo cuenta como $0 — visualmente
-- idéntico a "mes futuro sin data". No había forma de distinguir "se perdió" de
-- "no ha pasado".
--
-- Esta vista expone el conteo de filas por empresa×mes (resultado chico: ~8×13).
-- El integrity-check 'switch_facturas_continuidad' la lee a diario, enumera los
-- meses esperados (2025-05 .. último mes cerrado) por cada empresa con
-- facturas=true y alerta los huecos (count=0).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW switch_facturas_cobertura_mensual AS
SELECT
  empresa_key,
  to_char(date_trunc('month', fecha), 'YYYY-MM') AS mes,
  COUNT(*) AS filas
FROM switch_facturas
GROUP BY empresa_key, date_trunc('month', fecha);

GRANT SELECT ON switch_facturas_cobertura_mensual TO service_role;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación:
--   SELECT * FROM switch_facturas_cobertura_mensual ORDER BY empresa_key, mes;
--   -- cada empresa B2B debe tener una fila por cada mes desde 2025-05.
-- ─────────────────────────────────────────────────────────────────────────────
