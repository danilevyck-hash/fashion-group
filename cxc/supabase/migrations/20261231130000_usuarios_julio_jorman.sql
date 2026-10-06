-- ═════════════════════════════════════════════════════════════════════════════
-- Julio y Jorman, los dos usuarios de bodega que faltaban (6-oct-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel, 6-oct-2026, al decidir quién ve qué en Guías › Pedidos: «Julio y
-- Jorman NO tienen usuario: créalos los dos con rol bodega».
--
-- 🔑 LOS DOS YA ESTABAN EN EL SISTEMA, pero como TEXTO, no como personas que
-- entran: `DESPACHADORES_BASE = ["Julio", "Rodrigo", "Eloyn", "Jorman"]`
-- (`src/lib/guias/despachadores.ts`) es la lista de «Despachado por» de una
-- guía. Medido el 25-ago-2026 sobre las 212 guías vivas: `Julio ×178 ·
-- Rodrigo ×31 · vacío ×3`. Julio es quien más despacha del grupo y no tenía
-- con qué entrar.
--
-- 🔴 LA CONTRASEÑA NO VA AQUÍ. Se escribe un marcador y Daniel le pone la suya
-- desde Usuarios › Editar usuario, que es lo único que la guarda con bcrypt
-- (el login RECHAZA cualquier contraseña que no esté hasheada, así que con este
-- marcador no se puede entrar: la fila existe y la puerta sigue cerrada).
-- Es el mismo camino que se usó con `david` el 27-ago-2026.
--
-- `role = 'bodega'`: los cuatro módulos de siempre (guías con despacho,
-- catálogos solo para ver, Consulta de artículos, Asistencia solo aprobar).
-- No se les regala nada nuevo.
--
-- `associated_company` en NULL a propósito: esa columna es el filtro de empresa
-- del CXC del GRUPO (un vendedor con empresa asociada ve solo la suya), y
-- bodega no entra al CXC por ningún lado. 🔴 Qué empresas de PEDIDOS ve cada uno
-- NO sale de aquí: sale de `EMPRESAS_POR_PERSONA`
-- (`src/lib/guias/pedidos-bultos.ts`), que es una lista escrita a mano y la
-- hace valer el SERVIDOR —
--     Julio:  Fashion Wear · Fashion Shoes · Active Shoes · Active Wear · Joystep
--     Jorman: Vistana        (igual que Rodrigo, que ya tiene usuario)
-- — porque es una regla de ESTE módulo, no un permiso del rol.
--
-- `modulos_override` en NULL = hereda los del rol. Ponerle una lista propia
-- sería una segunda fuente de permisos para la misma persona.
--
-- 🔴 SE APLICA CON EL «SÍ» DE DANIEL. Esta corrida solo se mostró en --dry-run.
-- Toca DOS filas, las dos nuevas, y no modifica ninguna existente.
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO fg_users (name, password, role, active, associated_company, modulos_override, nombre_completo)
SELECT 'julio',
       'PENDIENTE-DANIEL-PONE-LA-CONTRASENA-EN-ADMIN-USUARIOS',
       'bodega',
       true,
       NULL,
       NULL,
       'Julio'
 WHERE NOT EXISTS (SELECT 1 FROM fg_users WHERE LOWER(name) = 'julio');

INSERT INTO fg_users (name, password, role, active, associated_company, modulos_override, nombre_completo)
SELECT 'jorman',
       'PENDIENTE-DANIEL-PONE-LA-CONTRASENA-EN-ADMIN-USUARIOS',
       'bodega',
       true,
       NULL,
       NULL,
       'Jorman'
 WHERE NOT EXISTS (SELECT 1 FROM fg_users WHERE LOWER(name) = 'jorman');
