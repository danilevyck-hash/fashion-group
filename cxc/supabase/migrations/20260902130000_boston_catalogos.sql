-- ─────────────────────────────────────────────────────────────────────────────
-- CATÁLOGOS PARA DAVID (`gerente_boston`) — 27-ago-2026
--
-- Daniel, textual: "catalogo para david si, solo eso".
--
-- ADITIVA: toca UNA fila y le AGREGA una key. No borra, no reemplaza y no
-- nombra a ningún otro rol.
--
-- 🔑 LA APP FUNCIONA ANTES DE QUE ESTO CORRA, y por eso no es bloqueante:
-- `MODULO_HEREDA_PERMISO_DE["catalogos"] = "boston"` (src/lib/modules.ts) le
-- enciende la ficha a quien ya tiene `boston`, y el recorte por `roles[]` la
-- acota a los roles que el módulo `catalogos` declara. La herencia se retira
-- del código CUANDO esta migración esté corrida y verificada, no antes.
--
-- 🔴 LO QUE ESTA FILA **NO** DA. `role_permissions.modulos` es la lista de
-- PUERTAS del menú, no de permisos de datos: quién entra a cada ruta lo siguen
-- decidiendo los `requireRole` del servidor. `gerente_boston` sigue recibiendo
-- **403** en administrar el catálogo, la lista de comprobantes, armar pedidos,
-- el directorio de clientes de Switch, los vendedores de Switch, el export y
-- `pedidos-unificado`. Lo único que gana es VER el catálogo.
-- ─────────────────────────────────────────────────────────────────────────────

-- Agrega 'catalogos' a los módulos del rol, sin pisar los que ya tiene y sin
-- duplicarlo si la migración se corre dos veces.
--
-- ⚠️ Se usa `array_append` sobre la fila EXISTENTE en vez de escribir la lista
-- completa: escribirla a mano dejaría la migración desactualizada el día que el
-- rol gane otro módulo, y la corrida siguiente le borraría lo que tuviera.
UPDATE role_permissions
   SET modulos = array_append(modulos, 'catalogos'),
       updated_at = now()
 WHERE role = 'gerente_boston'
   AND NOT ('catalogos' = ANY (modulos));

-- Si la fila no existiera (base nueva, o alguien la borró), se crea con los dos
-- módulos. Idempotente: no pisa nada si ya está.
INSERT INTO role_permissions (role, modulos, activo)
SELECT 'gerente_boston', ARRAY['boston', 'catalogos']::text[], true
 WHERE NOT EXISTS (SELECT 1 FROM role_permissions WHERE role = 'gerente_boston');
