-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_sync_log permite sync_type='costo' (auditoría 🟡-8)
--
-- switch-costo-diario ahora loguea a switch_sync_log igual que facturas y
-- estadocuenta. El CHECK original solo permitía ('facturas','estadocuenta'), así
-- que el INSERT con sync_type='costo' fallaría. Se reemplaza el constraint.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor (ANTES de deploy del código
-- que escribe sync_type='costo').
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE switch_sync_log DROP CONSTRAINT IF EXISTS switch_sync_log_sync_type_check;

ALTER TABLE switch_sync_log
  ADD CONSTRAINT switch_sync_log_sync_type_check
  CHECK (sync_type IN ('facturas', 'estadocuenta', 'costo'));

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'switch_sync_log_sync_type_check';
--   -- debe incluir 'costo'.
-- ─────────────────────────────────────────────────────────────────────────────
