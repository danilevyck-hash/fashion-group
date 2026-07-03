-- ─────────────────────────────────────────────────────────────────────────────
-- Fidelización ACS: descuento global por factura (detección automática del 5%)
-- ─────────────────────────────────────────────────────────────────────────────
-- Regla de negocio (Daniel, 3-jul-2026): el 5% de fidelización SIEMPRE se
-- aplica como DESCUENTO GLOBAL de la factura en Switch. /apifactura/info lo
-- expone como factura.descuentoGlobalPorcentaje (separado del descuento por
-- línea/promos), verificado en vivo. El cron acs-fidelizacion baja ese detalle
-- para las facturas ACS y lo persiste acá.
--
--   descuento_global_pct  % global de la factura (5 = usó fidelización;
--                         0 = sin global; NULL = detalle aún no bajado)
--   detalle_synced_at     cuándo se bajó el detalle (NULL = pendiente; el cron
--                         procesa pendientes de más nuevo a más viejo)
--
-- Aditivo: columnas NULL para todas las demás empresas; nada existente cambia.
-- Índice parcial: el scan de pendientes del cron (solo ACS, solo sin detalle).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE switch_facturas
  ADD COLUMN IF NOT EXISTS descuento_global_pct numeric(8,4),
  ADD COLUMN IF NOT EXISTS detalle_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_switch_facturas_acs_detalle_pendiente
  ON switch_facturas (fecha DESC)
  WHERE empresa_key = 'american_classic' AND detalle_synced_at IS NULL;

NOTIFY pgrst, 'reload schema';
