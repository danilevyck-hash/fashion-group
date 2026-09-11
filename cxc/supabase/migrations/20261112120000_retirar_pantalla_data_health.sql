-- ============================================================================
-- Data Health se va de la PANTALLA. La medición se queda entera.
-- ============================================================================
-- Daniel, textual (11-sep-2026):
--   «data health quiero que el sistema o tú mida todo pero no verlo… no lo uso
--    y no lo quiero usar»
-- Y antes (3-sep-2026, al decidir que el cuadre de costo avisara por Telegram):
--   «yo no uso Data Health, nunca lo veo»
--
-- Lo que se retiró es la PANTALLA: era la 2ª pestaña de `/admin/usuarios`
-- (antes del 13-ago-2026 había sido una ficha suelta del grupo Administración)
-- y el aviso proactivo del Inicio. `/admin/data-health` y `/data-health`
-- redirigen al Inicio (307, next.config.js).
--
-- 🔴 QUÉ NO HACE, Y NO ES UNA OMISIÓN:
--   · NO toca `data_integrity_checks` — es insert-only y es EL DATO. 870 filas,
--     121 corridas, desde el 13-may-2026. Sigue creciendo.
--   · NO toca el cron `integrity-check` (12:00 UTC), ni su recuperación
--     in-process dentro de `switch-reconciliacion`. El heartbeat del 11-sep-2026
--     es de las 12:00:11 UTC y los 7 checks vivos dieron `ok`.
--   · NO toca la alerta: un check `critical` sigue saliendo por 🔧 SISTEMA.
--   · NO toca `usuarios`. Quien tenía Usuarios sigue teniendo Usuarios.
--
-- MEDIDO EN PRODUCCIÓN el 11-sep-2026, ANTES de escribir esto: la key
-- `data-health` YA NO ESTÁ en ninguna parte — la migración `20260813120000` se
-- aplicó y limpió las dos tablas:
--   · `role_permissions`: los 7 roles, ninguno la trae.
--   · `fg_users.modulos_override`: los 2 overrides vivos (`Angela`, `andrea`)
--     tampoco.
-- O sea que los dos UPDATE de abajo son un BARRIDO PREVENTIVO y hoy afectan
-- CERO filas. Se escriben igual porque son idempotentes y porque la key pudo
-- volver a escribirse a mano entre agosto y hoy desde la pantalla de Usuarios.
-- Aditiva: ni una fila cambia de valor si la key no estaba.
-- ============================================================================

-- 1. La key retirada sale del menú guardado por ROL.
UPDATE role_permissions
SET modulos = array_remove(modulos, 'data-health')
WHERE 'data-health' = ANY (COALESCE(modulos, '{}'));

-- 2. Y de los permisos por USUARIO, si alguno la tuviera puesta a mano.
UPDATE fg_users
SET modulos_override = array_remove(modulos_override, 'data-health')
WHERE modulos_override IS NOT NULL
  AND 'data-health' = ANY (modulos_override);

-- Verificación (no escribe): no debe quedar ninguna fila con la key, y
-- `data_integrity_checks` tiene que seguir recibiendo filas todos los días.
--   SELECT role, modulos FROM role_permissions ORDER BY role;
--   SELECT name, role, modulos_override FROM fg_users WHERE modulos_override IS NOT NULL;
--   SELECT max(checked_at), count(*) FROM data_integrity_checks;
