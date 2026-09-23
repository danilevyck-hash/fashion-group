-- ─────────────────────────────────────────────────────────────────────────────
-- CUENTAS POR COBRAR PARA DAVID (`gerente_boston`) — 23-sep-2026
--
-- Daniel, textual: «Llámalo Ventas Boston entonces. Y dale acceso a los otros
-- módulos».
--
-- ADITIVA: toca UNA fila y le AGREGA una key. No borra, no reemplaza y no
-- nombra a ningún otro rol. Idempotente: correrla dos veces no duplica nada.
--
-- 🔑 LA APP FUNCIONA ANTES DE QUE ESTO CORRA, y por eso no es bloqueante.
-- Mientras la fila no diga `cxc`, David ve «Por cobrar» adentro de `/boston`
-- como siempre (`pestanasDeBoston`, `lib/boston/ventas-boston.ts`) y el módulo
-- Cuentas por Cobrar no le aparece en el menú. Nada se rompe, nada se le abre
-- de más.
--
-- 🔴 LO QUE ESTA FILA **NO** DA. `role_permissions.modulos` es la lista de
-- PUERTAS del menú, no de permisos de datos: quién lee cada cartera lo siguen
-- decidiendo los `requireRole` del servidor. Con `cxc` en su fila, David abre
-- la pantalla `/cxc` y ésta le sirve ÚNICAMENTE la cartera de Confecciones
-- Boston (`/api/cxc/boston`, la única ruta de cartera que su rol puede leer).
-- Las 12 rutas del CXC del grupo (`/api/cxc/aging`, `/estado-cuenta`,
-- `/enviar-email`, `/cobrar-lote`, …) le siguen contestando **403** — lo prueba
-- `boston-acceso.test.ts` con cookies firmadas.
--
-- ⚠️ `gerente_boston` NO tiene `modulos_override` en `fg_users` (medido el
-- 23-sep-2026: David entra por `role_permissions`), así que esta fila alcanza.
-- ─────────────────────────────────────────────────────────────────────────────

-- Agrega 'cxc' a los módulos del rol, sin pisar los que ya tiene y sin
-- duplicarlo si la migración se corre dos veces. `array_append` sobre la fila
-- EXISTENTE: escribir la lista completa a mano dejaría la migración vieja el día
-- que el rol gane otro módulo. (1 fila esperada.)
UPDATE role_permissions
   SET modulos = array_append(modulos, 'cxc'),
       updated_at = now()
 WHERE role = 'gerente_boston'
   AND NOT ('cxc' = ANY (modulos));

-- Si la fila no existiera (base nueva, o alguien la borró), se crea con los
-- cuatro módulos de hoy. Idempotente: no pisa nada si ya está. (0 filas esperadas.)
INSERT INTO role_permissions (role, modulos, activo)
SELECT 'gerente_boston', ARRAY['boston', 'catalogos', 'asistencia', 'cxc']::text[], true
 WHERE NOT EXISTS (SELECT 1 FROM role_permissions WHERE role = 'gerente_boston');

COMMENT ON TABLE role_permissions IS
  'Los módulos (puertas del menú) de cada rol. gerente_boston: boston · catalogos · asistencia · cxc (23-sep-2026, «Ventas Boston»). Las rutas deciden los datos; esta tabla solo qué fichas se pintan.';
