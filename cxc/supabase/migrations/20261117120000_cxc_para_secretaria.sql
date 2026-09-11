-- ============================================================================
-- La secretaria cobra: Cuentas por Cobrar entra a su menú.
-- ============================================================================
-- Daniel, textual (11-sep-2026), al preguntarle si le daba el módulo completo
-- o solo el botón «Cobrar» de la ficha del cliente:
--   «a) sí, le doy CXC completo»
--
-- 🩸 EL DEFECTO. La secretaria YA cobraba: la pantalla `/cxc` la nombra en sus
-- `allowedRoles`, las 12 rutas de `/api/cxc/*` salen de `ROLES_CXC`
-- (admin · secretaria · vendedor), y desde la ficha del cliente le sale
-- «Cobrar» y le funciona. Lo único que faltaba era la PUERTA: el catálogo de
-- módulos (`src/lib/modules.ts`) tenía la lista escrita a mano
-- (`["admin","vendedor"]`) y `role_permissions.secretaria` tampoco traía la
-- key, así que el módulo no salía ni en el Inicio, ni en el sidebar, ni en la
-- lista «Ir a…» de la búsqueda global. Para llegar había que saberse
-- la dirección.
--
-- MEDIDO EN PRODUCCIÓN ANTES DE ESCRIBIR ESTO (11-sep-2026):
--   · `role_permissions.secretaria` = {asistencia, caja, cargar, catalogos,
--     cheques, comisiones, directorio, guias, marketing, reclamos} — sin `cxc`.
--   · `role_permissions.vendedor` y `admin` SÍ la traen.
--   · Las dos secretarias vivas (Angela y andrea) tienen
--     `modulos_override` y las dos YA traen `cxc` adentro, así que para ellas
--     el menú no cambia: el override REEMPLAZA la lista del rol. Lo que
--     arregla esta migración es la SIGUIENTE secretaria, la que se cree sin
--     permisos personalizados.
--
-- 🔴 QUÉ NO HACE, Y NO ES UNA OMISIÓN:
--   · NO toca Boston. Esa cartera es otro módulo (`boston`) con su propia
--     lista (`ROLES_MODULO_BOSTON`), y la secretaria no está en ella.
--   · NO toca `modulos_override` de nadie. Quien tenga permisos
--     personalizados los conserva tal cual.
--   · NO toca los otros 6 roles.
--
-- Aditiva e idempotente: se agrega solo si no está, con `array_append`. Correr
-- esto dos veces deja exactamente el mismo array.
-- ============================================================================

UPDATE role_permissions
SET modulos = array_append(COALESCE(modulos, '{}'), 'cxc')
WHERE role = 'secretaria'
  AND NOT ('cxc' = ANY (COALESCE(modulos, '{}')));

-- Verificación (no escribe): la fila de `secretaria` tiene que traer `cxc`
-- UNA sola vez, y las de los otros 6 roles no pueden haber cambiado.
--   SELECT role, modulos FROM role_permissions ORDER BY role;
