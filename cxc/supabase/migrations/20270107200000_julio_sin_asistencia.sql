-- ═════════════════════════════════════════════════════════════════════════════
-- Julio deja de ver «Asistencia y planilla» (7-oct-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel: «Quítale Asistencia y planilla a julio y a jorman también» — mismo
-- pedido que ya se aplicó a Jorman en `20270102120000_jorman_sin_asistencia.sql`,
-- esta vez para Julio.
--
-- 🩸 POR QUÉ. Julio es `bodega` (creado el 6-oct-2026 por
-- `20261231130000_usuarios_julio_jorman.sql`, con `modulos_override` en NULL —
-- hereda del rol) y el rol `bodega` trae `asistencia` en su lista
-- (`role_permissions.bodega.modulos`). Igual que Jorman, Julio no tiene
-- ninguna fila en `asistencia_aprobador_empresa`, así que la pantalla
-- «Aprobaciones» que ese módulo le abre le sale vacía — un permiso que no
-- puede usar.
--
-- 🔑 EL CAMINO ES EL OVERRIDE, no tocar el rol — mismo patrón que Jorman,
-- Rodrigo (`20261125120000_rol_marcacion_y_rodrigo.sql`) y andrea
-- (`20261118120000_andrea_sin_multifashion.sql`): quitarle `asistencia` a
-- `role_permissions.bodega` se lo quitaría a TODOS los bodega (hoy también
-- angel y rodrigo); el override lo acota a Julio.
--
-- Y como el override REEMPLAZA la lista del rol (no la suma), acá se escribe
-- la lista COMPLETA de bodega menos `asistencia` — leída de `role_permissions`
-- en el momento de correr, no copiada a mano, igual que con Jorman y Rodrigo.
--
-- ⚠️ Lo que GANA: nada — sigue viendo exactamente lo mismo que hoy, menos la
-- ficha vacía. Lo que PIERDE: Asistencia y planilla › Aprobaciones (que no
-- podía usar). Guías, Catálogos y Consulta de artículos quedan intactos.
--
-- 🔴 NO SE LE AGREGA `marcacion`: eso no se pidió. Julio NO despacha con el
-- reloj del teléfono, es un módulo distinto, con su propio candado
-- (`lib/marcacion/acceso.ts`) que no se toca acá.
--
-- 🔴 QUÉ NO HACE:
--   · NO toca a Jorman, Angel, Rodrigo ni a ningún otro usuario — la condición
--     es por `name` EXACTO (`julio`) Y por tener hoy `modulos_override IS NULL`
--     (si alguien ya le puso uno a mano, esta sentencia no lo pisa).
--   · NO toca `role_permissions.bodega`: los demás bodega no pierden nada.
--   · NO cierra la sesión viva de Julio: su cookie trae los módulos viejos
--     hasta que vuelva a entrar (mismo precio que ya pagó Jorman y Rodrigo).
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
 WHERE name = 'julio'
   AND role = 'bodega'
   AND modulos_override IS NULL
   AND active = true;

-- Verificación (no escribe):
--   SELECT name, role, modulos_override FROM fg_users WHERE name IN ('jorman','julio','angel','rodrigo');
-- Esperado: jorman y julio → {guias,catalogos,referencia}; angel y rodrigo, sin cambio.
