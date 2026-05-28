-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_sync_log.skip_details
--
-- Agrega columna jsonb para diagnóstico de facturas descartadas durante el sync.
-- Cada elemento: { facturaId, secuencial, campo, valorCrudo }.
--
-- Contexto: el sync descartaba en SILENCIO facturas con montos >= $1,000 porque
-- parseAmount() no quitaba la coma de miles ("2,112.0000" → NaN). Se perdieron
-- todas las wholesale (LA FRONTERA, etc.). Fix aplicado en sync.ts; esta columna
-- deja rastro explícito de cualquier skip futuro para que nunca vuelva a ser
-- silencioso.
--
-- IMPORTANTE: aplicar ANTES de re-correr el backfill. El código es resiliente
-- (reintenta sin skip_details si la columna no existe), pero sin la columna no
-- se persiste el detalle de los skips.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE multifashion_sync_log
  ADD COLUMN IF NOT EXISTS skip_details jsonb;

COMMENT ON COLUMN multifashion_sync_log.skip_details IS
  'Array de facturas descartadas en el run: [{facturaId, secuencial, campo, valorCrudo}]. '
  'NULL o [] = ningún skip. Diagnóstico anti-skip-silencioso.';

NOTIFY pgrst, 'reload schema';
