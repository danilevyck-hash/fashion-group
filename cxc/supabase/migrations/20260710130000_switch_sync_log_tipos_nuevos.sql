-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_sync_log admite los sync_type nuevos de la política
-- anti-ruido 401 (alert-policy.ts, PR #225 y extensión jul-2026):
--   articulos        → switch-articulos (ventas por artículo/día)
--   multifashion     → multifashion-sync (tickets legacy, empresa american_classic)
--   catalogo_reebok  → reebok-catalogo (empresa active_shoes)
--   catalogo_joybees → joybees-catalogo (empresa joystep)
--   proveedores      → sync-proveedores: su createLog YA escribía este tipo pero
--                      el CHECK nunca lo admitió (gap conocido, documentado en
--                      20260608120000_proveedor_cxp.sql) — cada corrida perdía su
--                      log en silencio. Se aprovecha esta ampliación para cerrarlo.
--
-- Mientras esta migración NO se aplique, el código degrada sin romper: los
-- INSERT de los tipos nuevos fallan (console.error, logId null) y la política
-- 401 hace fail-open → esos crons alertan el 401 de inmediato, como antes.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE switch_sync_log DROP CONSTRAINT IF EXISTS switch_sync_log_sync_type_check;

ALTER TABLE switch_sync_log
  ADD CONSTRAINT switch_sync_log_sync_type_check
  CHECK (sync_type IN (
    'facturas',
    'estadocuenta',
    'costo',
    'utilidad',
    'recibos',
    'proveedores',
    'articulos',
    'multifashion',
    'catalogo_reebok',
    'catalogo_joybees'
  ));

-- Verificación:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'switch_sync_log_sync_type_check';
