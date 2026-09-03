-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: BARRER EL HEARTBEAT HUÉRFANO DE `sync-mayor`
--
-- El cron `sync-mayor` se retiró el 13-ago-2026 junto con el mayor contable
-- (ver docs/historico/superado.md): salió de vercel.json, de
-- CRONS_FAIL_CLOSED / SEED_TOLERANT_CRONS en src/lib/cron-telemetry.ts y de
-- src/, y hay test que lo fija (vista-general-gasto-egresos.test.ts). Pero su
-- FILA en cron_heartbeats quedó: `last_success_at = 2026-08-13T09:06:26Z`,
-- medido el 3-sep-2026 sobre 75 filas de la tabla.
--
-- Hoy NO alerta: `esCronRetirado` (cron-telemetry.ts) la ignora porque el
-- nombre no está en el registro de crons conocidos, y health-crons recorre
-- listas, nunca la tabla entera. Pero es una fila que envejece para siempre y
-- que cualquier barrido de "crons atrasados" tiene que saltar a mano.
--
-- Nadie la lee ni la espera: `grep -rn sync-mayor src scripts vercel.json`
-- solo trae comentarios que explican qué franja horaria dejó libre.
--
-- Borra UNA fila, por nombre EXACTO. Sin LIKE, sin rango.
--
-- El candado que evita que el PRÓXIMO cron retirado deje fila huérfana:
-- src/__tests__/integration/cron-heartbeats-huerfanos.test.ts (contra
-- producción, solo lectura, con RUN_DB_TESTS=1) + la sección D de
-- src/__tests__/lib/cron-registro.test.ts (el clasificador puro).
--
-- Aplicar con `npm run migrar supabase/migrations/20260914120000_barrer_heartbeat_sync_mayor.sql`
-- o a mano en Supabase Dashboard -> SQL Editor. No toca ningún cron vivo.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DELETE FROM cron_heartbeats
 WHERE cron_name = 'sync-mayor';

COMMIT;

-- Verificación post-aplicación (esperado: 0 filas):
--   SELECT cron_name, last_success_at FROM cron_heartbeats WHERE cron_name = 'sync-mayor';
