-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: BORRAR EL HEARTBEAT HUÉRFANO DE `prestamos-caducan`
--
-- El cron `prestamos-caducan` vivió del 5 al 11-sep-2026: borraba los préstamos
-- que llevaban 7 días esperando la aprobación de Daniel. Se retiró junto con la
-- aprobación (Daniel: «Aprobar préstamos: eso también se quita»): salió de
-- vercel.json, de `src/lib/cron-telemetry.ts` (SEED_TOLERANT_CRONS) y de
-- `src/lib/alertas/crons-que-avisan.ts`, y su route ya no existe. Pero su FILA
-- en cron_heartbeats quedó: `last_success_at = 2026-09-11T13:15Z`, medido el
-- 11-sep-2026 en la auditoría.
--
-- Es el huérfano de `sync-mayor` otra vez (20260914120000): no alerta —
-- `esCronRetirado` la ignora porque el nombre ya no está en el registro— pero
-- envejece para siempre y cualquier barrido de «crons atrasados» tiene que
-- saltarla a mano.
--
-- Borra UNA fila, por nombre EXACTO. Sin LIKE, sin rango. Aditiva en el sentido
-- de la casa: no toca ningún cron vivo ni ninguna otra tabla.
--
-- Aplicar con `npm run migrar supabase/migrations/20261116120000_borrar_heartbeat_prestamos_caducan.sql`.
-- Candado: src/__tests__/integration/cron-heartbeats-huerfanos.test.ts (contra
-- producción, RUN_DB_TESTS=1) + prestamos-salida-con-deuda.test.ts (esta migración).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DELETE FROM cron_heartbeats
 WHERE cron_name = 'prestamos-caducan';

COMMIT;

-- Verificación post-aplicación (esperado: 0 filas):
--   SELECT cron_name, last_success_at FROM cron_heartbeats WHERE cron_name = 'prestamos-caducan';
