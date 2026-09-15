-- ─────────────────────────────────────────────────────────────────────────────
-- EL ROL `marcacion`, EL CÓDIGO DE COLABORADOR EN `fg_users`, Y RODRIGO
-- (14-sep-2026). ⚠️ SIN APLICAR: la corre Daniel con `npm run migrar`.
--
-- Daniel aprobó el reloj del teléfono para cuatro personas que trabajan afuera
-- y no pasan por ningún reloj físico. Textual: *«ponle marcación al módulo»*,
-- *«rodrigo es bodega con marcacion»*.
--
-- ADITIVA salvo por la fila de Rodrigo, que es el cambio pedido y va acotada
-- por nombre EXACTO y por el rol que tiene hoy. Idempotente: correrla dos
-- veces deja lo mismo.
--
-- 🔴 LOS TRES USUARIOS NUEVOS (ana · cindy · yeisibeth) NO NACEN ACÁ. Los crea
-- `scripts/_crear-usuarios-marcacion.ts`, porque su contraseña —el nombre,
-- por decisión de Daniel— tiene que pasar por la MISMA comprobación de
-- «¿ya la usa otro?» que usa la app (`contrasenaEnUso`), y eso es bcrypt en
-- Node, no SQL. Esta migración va PRIMERO: el script necesita la columna
-- `empleado_codigo` y la fila de `role_permissions`.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Los módulos del rol. UNO solo: `marcacion`. Misma forma que `gerente_acs`
--    (`{multifashion}`) y `gerente_boston` (`{boston}`): es lo que hace que el
--    auto-redirect de «rol con un solo módulo» lo mande directo a /marcacion
--    desde /home. Si la fila faltara, `getDefaultModulesForRole()` da lo
--    mismo (derivado del `roles[]` del módulo).
INSERT INTO role_permissions (role, modulos, activo)
VALUES ('marcacion', ARRAY['marcacion']::text[], true)
ON CONFLICT DO NOTHING;

UPDATE role_permissions
   SET modulos = ARRAY['marcacion']::text[], activo = true, updated_at = now()
 WHERE role = 'marcacion';

-- 2. Quién es la persona que marca: `fg_users.empleado_codigo` →
--    `asistencia_personas.empleado_codigo`. Es la identidad de la marca, no un
--    permiso: el permiso es el módulo. Un usuario sin código puede abrir la
--    pantalla (admin) y la pantalla tiene que decirle que no tiene a quién
--    marcarle — nunca inventarle uno.
--
--    FK a la ficha: no se ata a un código que no exista. ON DELETE SET NULL
--    por si un día una ficha se borra (hoy nadie borra fichas: se les pone
--    fecha de salida).
ALTER TABLE fg_users
  ADD COLUMN IF NOT EXISTS empleado_codigo text
    REFERENCES asistencia_personas(empleado_codigo) ON DELETE SET NULL;

COMMENT ON COLUMN fg_users.empleado_codigo IS
  'El colaborador (asistencia_personas.empleado_codigo) por quien marca este usuario en el reloj del teléfono (módulo Marcación). NULL = este usuario no marca por nadie. Un colaborador tiene a lo sumo UN usuario (índice único parcial).';

-- Un colaborador, un usuario: dos usuarios marcando por la misma persona sería
-- una marca sin dueño claro. Parcial: los NULL (todos los demás usuarios) no
-- compiten entre sí. Y de paso es el índice de la FK.
CREATE UNIQUE INDEX IF NOT EXISTS fg_users_empleado_codigo_uniq
  ON fg_users (empleado_codigo)
  WHERE empleado_codigo IS NOT NULL;

-- 3. Rodrigo: de vendedor a bodega, con Marcación.
--
--    🔴 EL CAMINO ES EL OVERRIDE, Y POR QUÉ. Un rol solo no alcanza para las
--    dos cosas. Ponerle `bodega` al `roles[]` del módulo se lo abriría a
--    TODOS los bodegas por la puerta de la URL; el override se lo da a UNA
--    persona. Y como el override REEMPLAZA la lista del rol (no la suma), acá
--    se escribe la lista COMPLETA de bodega —leída de `role_permissions` en
--    el momento de correr, no copiada a mano— más `marcacion`.
--
--    ⚠️ Lo que PIERDE, y Daniel lo aprobó sabiéndolo: Cuentas por Cobrar y el
--    directorio de Clientes, que hoy ve por ser vendedor. Lo que GANA: Guías
--    con despacho (bodega) y Marcación. Catálogos y Referencia los tenía y los
--    conserva (los dos roles los tienen).
--
--    ⚠️ Desde este día, si al rol bodega se le agrega un módulo, a Rodrigo NO
--    le llega solo: hay que tocar su override en Usuarios. Es el precio del
--    override, y es el mismo que ya pagan Angela y andrea.
--
--    Acotado por nombre exacto Y por su rol de hoy: si alguien ya lo cambió a
--    mano, esta sentencia no toca nada.
UPDATE fg_users
   SET role = 'bodega',
       modulos_override = (
         SELECT array_cat(
           COALESCE((SELECT modulos FROM role_permissions WHERE role = 'bodega' AND activo), ARRAY['guias','catalogos','referencia']::text[]),
           ARRAY['marcacion']::text[]
         )
       ),
       empleado_codigo = '13',
       updated_at = now()
 WHERE name = 'rodrigo'
   AND role = 'vendedor'
   AND active = true;

-- ⚠️ Lo que esta migración NO hace, a propósito:
--   · No toca la contraseña de nadie (Daniel: «no cambies la contraseña a nadie»).
--   · No cierra las sesiones vivas de Rodrigo: su cookie trae el rol viejo hasta
--     que vuelva a entrar; el menú y las rutas le cambian en su próximo login.
--   · No toca `role_permissions.bodega`: los demás bodegas no ganan nada.
