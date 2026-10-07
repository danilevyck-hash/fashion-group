-- ═════════════════════════════════════════════════════════════════════════════
-- Jorman deja de ver «Asistencia y planilla» (7-oct-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel: «Jorman no debería ver asistencia».
--
-- 🩸 POR QUÉ. Jorman es `bodega` (creado el 6-oct-2026 por
-- `20261231130000_usuarios_julio_jorman.sql`, con `modulos_override` en NULL —
-- hereda del rol) y el rol `bodega` trae `asistencia` en su lista
-- (`role_permissions.bodega.modulos`). Medido el 7-oct-2026 contra
-- `asistencia_aprobador_empresa`: Jorman no tiene ninguna fila ahí, así que
-- la pantalla «Aprobaciones» que ese módulo le abre le sale vacía — un permiso
-- que no puede usar, igual que el `multifashion` de andrea.
--
-- 🔑 EL CAMINO ES EL OVERRIDE, no tocar el rol — mismo patrón que
-- `20261125120000_rol_marcacion_y_rodrigo.sql` (Rodrigo) y
-- `20261118120000_andrea_sin_multifashion.sql` (andrea): quitarle `asistencia`
-- a `role_permissions.bodega` se lo quitaría a TODOS los bodega (hoy también
-- julio, angel y rodrigo); el override lo acota a Jorman.
--
-- Y como el override REEMPLAZA la lista del rol (no la suma), acá se escribe
-- la lista COMPLETA de bodega menos `asistencia` — leída de `role_permissions`
-- en el momento de correr, no copiada a mano, igual que con Rodrigo.
--
-- ⚠️ Lo que GANA: nada — sigue viendo exactamente lo mismo que hoy, menos la
-- ficha vacía. Lo que PIERDE: Asistencia y planilla › Aprobaciones (que no
-- podía usar). Guías, Catálogos y Consulta de artículos quedan intactos.
--
-- 🔴 NO SE LE AGREGA `marcacion`: eso no se pidió. Jorman NO despacha con el
-- reloj del teléfono, es un módulo distinto, con su propio candado
-- (`lib/marcacion/acceso.ts`) que no se toca acá.
--
-- 🔴 QUÉ NO HACE:
--   · NO toca a Julio, Angel, Rodrigo ni a ningún otro usuario — la condición
--     es por `name` EXACTO (`jorman`) Y por tener hoy `modulos_override IS NULL`
--     (si alguien ya le puso uno a mano, esta sentencia no lo pisa).
--   · NO toca `role_permissions.bodega`: los demás bodega no pierden nada.
--   · NO cierra la sesión viva de Jorman: su cookie trae los módulos viejos
--     hasta que vuelva a entrar (mismo precio que ya pagó Rodrigo).
--
-- Idempotente: correrla dos veces deja el mismo array (la segunda vez
-- `modulos_override` ya no es NULL, así que el WHERE no vuelve a tocar nada).
-- ═════════════════════════════════════════════════════════════════════════════

UPDATE fg_users
   SET modulos_override = (
         SELECT array_remove(
           COALESCE((SELECT modulos FROM role_permissions WHERE role = 'bodega' AND activo), ARRAY['guias','catalogos','referencia','asistencia']::text[]),
           'asistencia'
         )
       ),
       updated_at = now()
 WHERE name = 'jorman'
   AND role = 'bodega'
   AND modulos_override IS NULL
   AND active = true;

-- Verificación (no escribe):
--   SELECT name, role, modulos_override FROM fg_users WHERE name IN ('jorman','julio','angel','rodrigo');
-- Esperado: jorman → {guias,catalogos,referencia}; los otros tres, sin cambio.
