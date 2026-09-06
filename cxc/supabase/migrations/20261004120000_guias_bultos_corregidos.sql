-- ═════════════════════════════════════════════════════════════════════════════
-- guia_items — el RASTRO de los bultos que bodega corrige al despachar
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel, 5-sep-2026: «porque bodega si al despachar cuentan más bultos de lo
-- que puso la secretaria, quiero que lo pueda cambiar en caso de algún error»
-- y, sobre dejar constancia: «¿queda registro?» → sí.
--
-- 🔴 ESTO NO AFLOJA EL CANDADO. Los bultos de una guía YA DESPACHADA siguen sin
-- tocarse — «es lo que el transportista firmó»: no están en la lista de tres de
-- campos-editables.ts y el PUT rechaza una Completada entera. Lo que se abre es
-- la ventana ANTERIOR a la firma, y el servidor lo mira por `previous.estado`.
--
-- 🔴 ADITIVA. Ni una fila cambia de valor: las tres columnas nacen en NULL y
-- solo se escriben cuando alguien corrige de verdad. `bultos_original` es lo
-- que había ANTES de la PRIMERA corrección y no se pisa después (el servidor
-- hace COALESCE contra lo que ya está).
--
-- ⚠️ EL CÓDIGO NO DEPENDE DE QUE ESTO CORRA. Sin las columnas, la corrección se
-- guarda igual (el servidor reintenta escribiendo solo `bultos`) y la línea
-- «Bultos corregidos por … : 7 → 8» simplemente no se muestra: sin dato no se
-- afirma nada. Perder el número por falta de DDL sería lo único grave.
--
-- Medido contra producción el 5-sep-2026: 566 renglones (532 vivos), 7.564
-- bultos en las 222 guías vivas. Después de esta migración esos números NO
-- cambian — es solo estructura.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE guia_items
  ADD COLUMN IF NOT EXISTS bultos_original      integer,
  ADD COLUMN IF NOT EXISTS bultos_corregido_por text,
  ADD COLUMN IF NOT EXISTS bultos_corregido_en  timestamptz;

COMMENT ON COLUMN guia_items.bultos_original IS
  'Bultos que había ANTES de la primera corrección de bodega al despachar. NULL = nunca se corrigió. No se pisa en correcciones posteriores.';
COMMENT ON COLUMN guia_items.bultos_corregido_por IS
  'Nombre de la sesión que corrigió los bultos (5-sep-2026, Daniel: «¿queda registro?»).';
COMMENT ON COLUMN guia_items.bultos_corregido_en IS
  'Cuándo se corrigieron los bultos por última vez.';
