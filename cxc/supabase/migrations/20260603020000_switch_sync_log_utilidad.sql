-- Permite sync_type='utilidad' en switch_sync_log (sync del reporte de utilidad B2B).
-- Mismo patrón que 20260530000400_switch_sync_log_costo.sql.
ALTER TABLE switch_sync_log DROP CONSTRAINT IF EXISTS switch_sync_log_sync_type_check;

ALTER TABLE switch_sync_log
  ADD CONSTRAINT switch_sync_log_sync_type_check
  CHECK (sync_type IN ('facturas', 'estadocuenta', 'costo', 'utilidad'));
