-- ============================================================================
-- Retiro de la key `saldos-banco` (los saldos pasaron a ser PESTAÑA de Gastos)
-- ============================================================================
-- Daniel pidió menos módulos en el menú y, sobre Gastos y Saldos de Banco, fue
-- textual: *"y debeeria estar en un solo modulo"*. Los saldos dejaron de ser una
-- ficha suelta y viven dentro de "Gastos" (`gastos-contabilidad`) como 2ª
-- pestaña: `/gastos-contabilidad?tab=saldos-banco`. La pantalla es la MISMA,
-- entera —carga manual, corrección por fecha y ahora historial—: es una mudanza,
-- no un recorte. La dirección vieja `/saldos-banco` sigue llegando (redirect 307
-- en next.config.js).
--
-- ⚠️ NO ES BLOQUEANTE PARA EL DEPLOY, y por eso puede correrse cuando Daniel
-- quiera. La app ya funciona sin ella: `getVisibleModules` filtra contra
-- `ALL_MODULES`, y como `saldos-banco` salió de ese catálogo, la key que quede
-- guardada en la base es INERTE — no pinta ninguna ficha ni abre ninguna
-- pantalla. Esto es puro barrido de keys muertas.
--
-- MEDIDO EN PRODUCCIÓN el 13-ago-2026, antes de escribir esto
-- (`scripts/_diag-gastos-saldos-fusion.ts`, solo lectura):
--   · `role_permissions.contabilidad.modulos` =
--     ["asistencia","gastos-empresa","prestamos","proveedores","ventas",
--      "saldos-banco","gastos-contabilidad"]
--     → o sea que YA tiene `gastos-contabilidad` POR DERECHO PROPIO. Ésa es la
--       puerta al dato después de la fusión, y es la razón por la que se pudo
--       retirar del código el permiso PRESTADO (`MODULO_HEREDA_PERMISO_DE`).
--   · `fg_users.modulos_override`: los dos overrides que existen (`andrea` y
--     `Angela`, las dos secretarias) NO traen ninguna de las dos keys. El paso 3
--     es preventivo.
--   · Ningún otro rol tiene `saldos-banco` ni `gastos-empresa`.
--
-- 🔴 QUÉ NO HACE, y no es una omisión:
--   · NO toca `bancos_saldos`. Ni una fila, ni una columna, ni un índice. Las 52
--     filas cargadas por Contabilidad (ene→ago 2026, 7 empresas) quedan donde
--     están, la escritura sigue siendo el MISMO upsert (empresa_key, fecha_dato)
--     y la "Disponibilidad" de Vista General las sigue leyendo igual que
--     siempre: $629.531,03.
--   · NO le quita `gastos-contabilidad` a nadie. Al contrario: el paso 1 se
--     asegura de que quien tenía alguna de las keys viejas lo tenga, ANTES de
--     sacarle nada.
--   · NO agrega ningún módulo nuevo. No hay ficha nueva que repartir.
--
-- ⚠️ ORDEN: correr DESPUÉS de que el PR esté desplegado. Correrla antes solo le
-- apagaría la ficha vieja a Contabilidad un rato antes de tiempo (no rompe nada:
-- la pantalla nueva es la misma y su puerta ya está repartida).
-- ============================================================================

-- 1. PRIMERO se asegura la key que reemplaza a las dos viejas. Va antes del
--    borrado a propósito: si fuera después, el WHERE no encontraría a nadie y el
--    rol podría quedarse sin ningún módulo de gastos ni de saldos.
UPDATE role_permissions
SET modulos = array_append(modulos, 'gastos-contabilidad')
WHERE ('saldos-banco' = ANY (COALESCE(modulos, '{}'))
       OR 'gastos-empresa' = ANY (COALESCE(modulos, '{}')))
  AND NOT ('gastos-contabilidad' = ANY (COALESCE(modulos, '{}')));

-- 2. RECIÉN AHORA salen las keys retiradas del menú guardado por ROL.
--    `gastos-empresa` quedó de la migración 20260811130000, que nunca se corrió:
--    también es inerte desde que el módulo viejo se retiró del código.
UPDATE role_permissions
SET modulos = array_remove(array_remove(modulos, 'saldos-banco'), 'gastos-empresa')
WHERE 'saldos-banco' = ANY (COALESCE(modulos, '{}'))
   OR 'gastos-empresa' = ANY (COALESCE(modulos, '{}'));

-- 3. Y de los permisos por USUARIO, si alguno las tuviera puestas a mano.
UPDATE fg_users
SET modulos_override = array_remove(array_remove(modulos_override, 'saldos-banco'), 'gastos-empresa')
WHERE modulos_override IS NOT NULL
  AND ('saldos-banco' = ANY (modulos_override) OR 'gastos-empresa' = ANY (modulos_override));

-- Verificación (no escribe): no debería quedar ninguna fila con las keys viejas,
-- y contabilidad tiene que conservar `gastos-contabilidad`.
--   SELECT role, modulos FROM role_permissions ORDER BY role;
--   SELECT name, role, modulos_override FROM fg_users WHERE modulos_override IS NOT NULL;
