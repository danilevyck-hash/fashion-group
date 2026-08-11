-- ============================================================================
-- Retiro del módulo `gastos-empresa` (la carga MANUAL de gastos)
-- ============================================================================
-- Daniel decidió dejar UN solo módulo de gastos: "Gastos" (`gastos-contabilidad`,
-- el que baja el mayor de Switch). La carga manual —`empresa_gastos_mensuales`,
-- **0 filas en toda su historia**— se retiró de la app.
--
-- 🔴 QUÉ NO HACE ESTE ARCHIVO, y no es una omisión:
--   · NO borra `empresa_gastos_mensuales`. Tiene 0 filas, pero borrar una tabla
--     es irreversible y Daniel no lo pidió. Vista General la sigue leyendo y no
--     se rompe vacía — hoy YA está vacía y la pantalla funciona.
--   · NO borra `gastos_categorias` (6 filas). El módulo nuevo NO la usa (tiene
--     tabla propia: ver 20260810160000_mayor_contable.sql). Queda como está.
--   · NO toca `bancos_saldos`. Los saldos siguen vivos en su propio módulo.
--
-- LO ÚNICO que hace: sacar la key retirada del menú guardado y asegurar las dos
-- que la reemplazan. Aditivo para lo que suma, quirúrgico para lo que resta.
--
-- ⚠️ ORDEN: esta migración va DESPUÉS de que el PR que retira el módulo esté
-- desplegado. Correrla antes le apagaría la ficha a quien todavía la usa.
--
-- ⚠️ NO ES BLOQUEANTE PARA EL DEPLOY. `MODULO_HEREDA_PERMISO_DE`
-- (src/lib/modules.ts) hace que quien tenga `gastos-empresa` en su lista
-- guardada vea `saldos-banco` igual. Esta migración es lo que permite RETIRAR
-- esa herencia más adelante — corrida ésta, `saldos-banco` queda por derecho
-- propio y la herencia se puede borrar del código.
-- ============================================================================

-- 1. Las dos keys que reemplazan a la vieja, para quien tenía la vieja.
--    (`gastos-contabilidad` normalmente ya entró con 20260810160000; se repite
--    acá por si esa migración se corrió antes de que existiera la fila.)
UPDATE role_permissions
SET modulos = array_append(modulos, 'saldos-banco')
WHERE 'gastos-empresa' = ANY (COALESCE(modulos, '{}'))
  AND NOT ('saldos-banco' = ANY (COALESCE(modulos, '{}')));

UPDATE role_permissions
SET modulos = array_append(modulos, 'gastos-contabilidad')
WHERE 'gastos-empresa' = ANY (COALESCE(modulos, '{}'))
  AND NOT ('gastos-contabilidad' = ANY (COALESCE(modulos, '{}')));

-- 2. Recién ahora se saca la key retirada. Va DESPUÉS de los dos pasos de
--    arriba a propósito: si fuera primero, el `WHERE` de ellos no encontraría
--    a nadie y el rol se quedaría sin ningún módulo de gastos ni de saldos.
UPDATE role_permissions
SET modulos = array_remove(modulos, 'gastos-empresa')
WHERE 'gastos-empresa' = ANY (COALESCE(modulos, '{}'));

-- 3. Lo mismo para los permisos por USUARIO, si alguno tuviera la key a mano.
UPDATE fg_users
SET modulos_override = array_remove(modulos_override, 'gastos-empresa')
WHERE modulos_override IS NOT NULL
  AND 'gastos-empresa' = ANY (modulos_override);

-- Verificación (no escribe): nadie debería quedar con la key retirada, y
-- contabilidad tiene que tener las dos nuevas.
--   SELECT role, modulos FROM role_permissions ORDER BY role;
