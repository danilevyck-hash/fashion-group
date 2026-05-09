-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION DESIGN — Sprint 1 Fase 3: ventas_raw + cliente_codigo  (2026-05-09)
--
-- Sumá una columna `cliente_codigo` a ventas_raw para guardar tal cual viene
-- el codigo D-XXX desde el CSV de Switch. El `cliente_id` (FK a
-- clientes_master.id) ya existe desde clientes-master-backfill.sql.
--
-- La tabla está vacía (TRUNCATE ya ejecutado en Fase 1), así que la migración
-- es trivial.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ventas_raw
  ADD COLUMN IF NOT EXISTS cliente_codigo text;

CREATE INDEX IF NOT EXISTS idx_ventas_raw_cliente_codigo
  ON ventas_raw(cliente_codigo);

-- Verificación:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ventas_raw'
  AND column_name IN ('cliente', 'cliente_codigo', 'cliente_id')
ORDER BY column_name;
-- Esperado: las 3 columnas presentes (cliente=text, cliente_codigo=text, cliente_id=uuid).

SELECT COUNT(*) FROM ventas_raw;
-- Esperado: 0 (Fase 1 dejó la tabla vacía).
