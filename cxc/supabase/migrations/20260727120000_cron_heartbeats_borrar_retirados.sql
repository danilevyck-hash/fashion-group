-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: borrar de cron_heartbeats las filas de crons RETIRADOS
--
-- ── PROBLEMA ────────────────────────────────────────────────────────────────
-- El PR #316 (26-jul-2026) retiró el cron `multifashion-sync`: su entrada de
-- vercel.json, su route, su librería, el repaso que le hacía la reconciliación y
-- sus filas en las listas de vigilancia. Lo que NO se tocó fue su fila en
-- cron_heartbeats, que quedó congelada en 2026-07-26T05:00:34. A las 26h pasó a
-- stale y el watchdog Telegram —que recorre TODAS las filas de la tabla, no una
-- lista— empezó a mandar todos los días:
--
--     ⏰ Watchdog crons — 1 sin success reciente: multifashion-sync
--
-- El ARREGLO DE VERDAD es de código y ya está en este mismo PR: `esCronRetirado`
-- (src/lib/cron-telemetry.ts) descarta cualquier cron_name que no esté en el
-- registro de crons conocidos, y `cron-registro.test.ts` mantiene ese registro
-- en biyección con vercel.json. Esa parte NO depende de esta migración: con el
-- código desplegado la alerta se calla aunque la fila siga ahí.
--
-- Esta migración es HIGIENE. Se hace igual porque la fila no es un registro
-- histórico de nada: `last_success_at` es un único timestamp mutable (upsert por
-- cron_name), no una bitácora. La historia real del cron vive en
-- `multifashion_sync_log` (98 filas), que queda intacta y congelada. Dejar la
-- fila solo garantiza que el próximo que abra la tabla —o el próximo vigía que
-- alguien escriba— tenga que volver a preguntarse qué es.
--
-- ── FILAS QUE SE BORRAN (medidas contra producción el 27-jul-2026) ──────────
--
--   cron_name                              last_success_at             por qué
--   ─────────────────────────────────────  ──────────────────────────  ────────
--   multifashion-sync                      2026-07-26T05:00:34.139Z    cron
--     retirado en el #316 (tabla multifashion_tickets congelada). Ya no existe
--     ni su entrada de vercel.json ni su route. Es la fila que estaba alertando.
--
--   switch-sync:facturas-2315              2026-07-25T23:15:39.857Z    slot
--     retirado: la entrada de las 23:15 se movió a las 23:00 el 26-jul-2026, y
--     el slot se llama por su hora (`facturas-2300`). Ya estaba silenciada por
--     `esSlotRetirado` (#290); se limpia por el mismo motivo que la anterior.
--
--   switch-sync:facturas-2315#recuperado   2026-07-25T18:01:40.544Z    marca
--     de la reconciliación sobre el slot retirado de arriba. Sin su slot no
--     certifica nada.
--
-- ── POR QUÉ UNA LISTA EXPLÍCITA Y NO UN PATRÓN ──────────────────────────────
-- Nada de LIKE 'multifashion%' ni de borrar "lo que no esté en tal lista": un
-- patrón que se pase de listo puede llevarse la fila de un cron VIVO, y perder
-- un heartbeat vivo se ve exactamente igual que "el cron nunca corrió" —
-- fail-closed en health-crons → 503 y alerta falsa en la dirección contraria.
-- Tres nombres, escritos a mano, verificados uno por uno contra las 60 filas de
-- la tabla.
--
-- ── SEGURIDAD ───────────────────────────────────────────────────────────────
-- Idempotente (un segundo pase borra 0 filas). Reversible sin drama: si alguna
-- vez se vuelve a encender uno de estos crons, su primera corrida exitosa
-- re-crea la fila sola (recordCronHeartbeat hace upsert por cron_name).
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM cron_heartbeats
WHERE cron_name IN (
  'multifashion-sync',
  'switch-sync:facturas-2315',
  'switch-sync:facturas-2315#recuperado'
);
