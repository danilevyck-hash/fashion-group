-- ============================================================================
-- Marketing para CONTABILIDAD — la key del módulo en role_permissions
-- ============================================================================
-- Daniel (23-sep-2026), textual: el módulo lo ven «contabilidad, admin y
-- secres». Contabilidad entra a MIRAR: no registra, no edita, no anula, no
-- cierra períodos ni baja ZIPs.
--
-- ⚠️ ESTO NO ABRE UN PERMISO DE ESCRITURA. Lo que abre la lectura es el código
-- (`lib/marketing/roles.ts › ROLES_MARKETING` en las rutas GET y en las
-- páginas); las rutas que escriben siguen con `ROLES_MARKETING_ESCRITURA`
-- (admin · secretaria) y le contestan 403 a contabilidad.
--
-- MEDIDO EN PRODUCCIÓN ANTES DE ESCRIBIR ESTO (23-sep-2026):
--   · `role_permissions.contabilidad.modulos` =
--     {asistencia, prestamos, proveedores, gastos-contabilidad, comisiones}
--     — sin `marketing`.
--   · `admin` y `secretaria` SÍ la traen.
--
-- 🔴 LA PANTALLA FUNCIONA ANTES DE QUE ESTO CORRA. `MODULO_HEREDA_PERMISO_DE`
-- (`src/lib/modules.ts`) enciende la ficha para quien ya tiene
-- `gastos-contabilidad` —que contabilidad tiene, medido arriba—, acotada por
-- el `roles[]` del módulo. Esta migración es lo que permite RETIRAR esa
-- herencia más adelante, no lo que enciende el módulo.
--
-- QUÉ NO HACE:
--   · NO toca datos de negocio: solo `role_permissions.modulos`.
--   · NO le quita nada a nadie ni toca `modulos_override` de ningún usuario.
--   · NO toca los otros 7 roles.
--
-- Aditiva e idempotente: se agrega solo si no está, con `array_append`. Correr
-- esto dos veces deja exactamente el mismo array. UNA fila.
-- ============================================================================

UPDATE role_permissions
   SET modulos = array_append(COALESCE(modulos, '{}'), 'marketing'),
       updated_at = now()
 WHERE role = 'contabilidad'
   AND NOT ('marketing' = ANY (COALESCE(modulos, '{}')));

NOTIFY pgrst, 'reload schema';

-- Verificación (no escribe): debe listar admin, secretaria y contabilidad.
--   SELECT role, modulos FROM role_permissions
--   WHERE 'marketing' = ANY (COALESCE(modulos, '{}'));
