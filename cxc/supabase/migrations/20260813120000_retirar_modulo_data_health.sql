-- ============================================================================
-- Retiro de la key `data-health` (Data Health pasó a ser PESTAÑA de Usuarios)
-- ============================================================================
-- Daniel pidió menos módulos en el menú y aprobó que "Data Health" dejara de ser
-- una ficha suelta para vivir dentro de Usuarios, como 2ª pestaña
-- (`/admin/usuarios?tab=data-health`). La pantalla es la MISMA, entera: es una
-- mudanza, no un recorte. La dirección vieja `/admin/data-health` sigue llegando
-- (redirect 307 en next.config.js).
--
-- ⚠️ NO ES BLOQUEANTE PARA EL DEPLOY, y por eso puede correrse cuando Daniel
-- quiera. La app ya funciona sin ella: `getVisibleModules` filtra contra
-- `ALL_MODULES`, y como `data-health` salió de ese catálogo, la key que quede
-- guardada en la base es INERTE — no pinta ninguna ficha ni abre ninguna
-- pantalla. Esto es puro barrido de una key muerta.
--
-- MEDIDO EN PRODUCCIÓN el 13-ago-2026, antes de escribir esto:
--   · `role_permissions`: la key está SOLO en el rol `admin`.
--   · `fg_users.modulos_override`: NINGÚN usuario la tiene (los dos overrides
--     que existen, `andrea` y `Angela`, no la traen).
--   Así que el impacto real es UNA fila, y el paso 2 es preventivo.
--
-- 🔴 QUÉ NO HACE, y no es una omisión:
--   · NO toca `data_integrity_checks` — los resultados de los checks son el DATO
--     que la pantalla muestra y siguen exactamente donde estaban.
--   · NO toca `usuarios`. Quien tenía Usuarios sigue teniendo Usuarios, ni más
--     ni menos: el permiso de Data Health NO se transfiere a nadie (la pantalla
--     es admin-only por código y su API es `requireRole(["admin"])`).
--   · NO agrega ninguna key nueva. No hay módulo nuevo que repartir.
--
-- ⚠️ ORDEN: correr DESPUÉS de que el PR esté desplegado. Correrla antes solo le
-- apagaría la ficha vieja a Daniel un rato antes de tiempo (no rompe nada).
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

-- Verificación (no escribe): no debería quedar ninguna fila con la key, y
-- `usuarios` tiene que seguir exactamente donde estaba.
--   SELECT role, modulos FROM role_permissions ORDER BY role;
--   SELECT name, role, modulos_override FROM fg_users WHERE modulos_override IS NOT NULL;
