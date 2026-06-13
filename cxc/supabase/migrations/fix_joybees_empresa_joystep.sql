-- ============================================================================
-- Fix: Joybees empresa_codigo 'vistana' → 'joystep'
-- ============================================================================
-- mk_marcas.empresa_codigo de Joybees estaba mal ('vistana'); la empresa real
-- es 'joystep'. Verificado que el cambio NO mueve ningún número en reportes,
-- lista/tarjetas ni ZIP con la data actual:
--   - 0 facturas con Joybees (mk_factura_marcas) y las facturas no usan empresa_codigo.
--   - Única entrega con Joybees tiene total_por_empresa_interna = {} (vacío), así
--     que el lookup por empresa_codigo ya devolvía 0 con 'vistana' y sigue en 0.
-- Además corrige un riesgo latente: 'vistana' lo comparte Calvin Klein (externa),
-- lo que podría doble-contar el 50% interno si alguna entrega mezclara ambas.
--
-- Correr UNA vez en Supabase SQL Editor.
-- ============================================================================

UPDATE mk_marcas SET empresa_codigo = 'joystep' WHERE nombre = 'Joybees';

-- Validación (no modifica nada): debe devolver Joybees | joystep
SELECT nombre, empresa_codigo FROM mk_marcas WHERE nombre = 'Joybees';
