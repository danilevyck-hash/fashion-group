-- ============================================================================
-- Referencia para vendedores y bodega — la key del módulo nuevo
-- ============================================================================
-- Daniel (12-ago-2026), textual: "habilita referencia para los vendedores y
-- bodega". La pestaña Referencia de Ventas ganó ruta propia (/referencia,
-- key `referencia`) para esos roles; /ventas sigue siendo solo admin y el
-- margen NO viaja para vendedor/bodega ("quita margen, lo demas dejalo" —
-- ese gate vive en el API, no acá).
--
-- QUÉ NO HACE ESTE ARCHIVO:
--   · NO toca datos de negocio: solo `role_permissions.modulos`.
--   · NO le quita nada a nadie. Es aditivo e idempotente.
--
-- ⚠️ LA PANTALLA FUNCIONA ANTES DE QUE ESTO CORRA. `MODULO_HEREDA_PERMISO_DE`
-- (src/lib/modules.ts) enciende la ficha para quien tiene `catalogos`,
-- acotada por el roles[] del módulo (admin, vendedor, bodega — secretaria
-- también tiene catalogos y NO la ve). Esta migración es lo que permite
-- RETIRAR esa herencia más adelante, no lo que enciende el módulo.
-- ============================================================================

UPDATE role_permissions
SET modulos = array_append(modulos, 'referencia')
WHERE role IN ('admin', 'vendedor', 'bodega')
  AND NOT ('referencia' = ANY (COALESCE(modulos, '{}')));

-- Verificación (no escribe): las filas que deberían tener la key nueva.
--   SELECT role, modulos FROM role_permissions
--   WHERE 'referencia' = ANY (COALESCE(modulos, '{}'));
