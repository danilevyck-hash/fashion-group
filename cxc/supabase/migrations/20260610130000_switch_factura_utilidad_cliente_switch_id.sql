-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_factura_utilidad.cliente_switch_id (aditiva)
--
-- El reporte web de utilidad (/reportesventa/facturas) YA devuelve clienteSwitchId
-- (id del cliente en Switch, por empresa) — se usa hoy para atribuir cartera al
-- vendedor, pero NO se persistía. Sin el id, agrupar utilidad por cliente queda
-- atado al NOMBRE (frágil: homónimos, typos). Esta columna habilita agrupar por
-- id estable (utilidad_por_cliente).
--
-- Aditiva, nullable: las filas existentes quedan en NULL hasta el primer resync.
-- El sync de Comisiones (sync-utilidad) ya empieza a poblarla en filas nuevas /
-- re-upserteadas tras desplegar el código del PR.
--
-- BACKFILL de las filas 2026 existentes (poblar el id en lo ya sincronizado):
--   GET /api/cron/sync-utilidad?backfill=1&year=2026  (Bearer CRON_SECRET)
--   → re-sincroniza Ene..mes-actual de las 5 B2B; el upsert (onConflict
--     empresa_key,secuencial) actualiza cada fila con su cliente_switch_id.
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE switch_factura_utilidad
  ADD COLUMN IF NOT EXISTS cliente_switch_id integer;

COMMENT ON COLUMN switch_factura_utilidad.cliente_switch_id IS
  'Id del cliente en Switch (clienteSwitchId del reporte web), por empresa. Clave estable para agrupar utilidad por cliente. NULL en filas previas al backfill.';

NOTIFY pgrst, 'reload schema';
