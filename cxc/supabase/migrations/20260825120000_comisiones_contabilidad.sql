-- ═════════════════════════════════════════════════════════════════════════════
-- Comisiones para CONTABILIDAD — la key del módulo en role_permissions
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel (25-ago-2026), textual: ***"Q contabilidad vea comisiones"***.
--
-- ⚠️ ESTO NO ABRE UN PERMISO DE DATOS. Medido con cookies FIRMADAS contra los
-- handlers reales en `origin/main` (bf12fd05), ANTES de tocar nada:
--
--     GET /api/ventas/comisiones              contabilidad = 200
--     GET /api/ventas/comisiones/consolidado  contabilidad = 200
--     GET /api/ventas/comisiones/detalle      contabilidad = 200
--     GET /api/ventas/comisiones/descuentos   contabilidad = 200
--
-- Las cuatro ya le contestaban 200 (`requireRole(req,
-- ["admin","contabilidad","secretaria"])`). Lo que no tenía era PUERTA: ni la
-- ficha en el menú, ni la página (`/comisiones` la rebotaba a `/home`). Lo que
-- esta migración hace es dejar de esconder lo que ya podía leer.
--
-- LO QUE SIGUE CERRADO, y también está medido:
--     POST /api/ventas/comisiones/descuentos  contabilidad = 403  (toggle del mes)
--     GET  /api/ventas/comisiones/config      contabilidad = 403  (tasas, admin-only)
-- Contabilidad VE. No edita.
--
-- QUÉ NO HACE ESTE ARCHIVO:
--   · NO toca datos de negocio: solo `role_permissions.modulos`.
--   · NO le quita nada a nadie. Es aditivo e idempotente.
--   · NO le abre `/ventas` (admin-only, y su SSR manda Resumen y Clientes en el
--     HTML — eso sí sería un permiso nuevo).
--
-- ⚠️ LA PANTALLA FUNCIONA ANTES DE QUE ESTO CORRA. `MODULO_HEREDA_PERMISO_DE`
-- (src/lib/modules.ts) enciende la ficha para quien ya tiene `ventas` —que
-- contabilidad tiene, medido en producción—, acotada por el `roles[]` del
-- módulo. Esta migración es lo que permite RETIRAR esa herencia más adelante,
-- no lo que enciende el módulo.
-- ═════════════════════════════════════════════════════════════════════════════

UPDATE role_permissions
   SET modulos = array_append(modulos, 'comisiones'), updated_at = now()
 WHERE role = 'contabilidad'
   AND NOT ('comisiones' = ANY (COALESCE(modulos, '{}')));

NOTIFY pgrst, 'reload schema';

-- Verificación (no escribe): debe listar admin, secretaria y contabilidad.
--   SELECT role, modulos FROM role_permissions
--   WHERE 'comisiones' = ANY (COALESCE(modulos, '{}'));
