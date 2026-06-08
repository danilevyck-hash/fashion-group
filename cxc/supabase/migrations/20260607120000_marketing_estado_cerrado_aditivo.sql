-- ============================================================================
-- Marketing — agregar estado 'cerrado' al CHECK (ADITIVO, no destructivo)
-- ============================================================================
-- Decisión de negocio (Daniel, jun 2026): Marketing pasa a ser un archivo de
-- GASTOS. La UI maneja solo dos estados: abierto / cerrado. Los estados legacy
-- 'enviado' y 'cobrado' YA NO SE ESCRIBEN desde la UI, pero los proyectos
-- viejos que los tengan se siguen LEYENDO (se interpretan como 'cerrado' en la
-- capa de lectura del front). Por eso NO se hace backfill ni se quita ningún
-- valor del CHECK: solo se AMPLÍA para permitir 'cerrado'.
--
-- Cero migraciones destructivas. No se borran columnas, flags ni filas.
--
-- Corre esta migración UNA SOLA VEZ en Supabase SQL Editor.
-- ============================================================================

-- 1. Ampliar el CHECK constraint de estado para incluir 'cerrado' (aditivo)
ALTER TABLE mk_proyectos DROP CONSTRAINT IF EXISTS mk_proyectos_estado_check;
ALTER TABLE mk_proyectos
  ADD CONSTRAINT mk_proyectos_estado_check
  CHECK (estado IN ('abierto','enviado','cobrado','cerrado'));

-- 2. Verificación — el CHECK ahora permite 4 valores; sin backfill de legacy.
--    Los proyectos en 'enviado'/'cobrado' se quedan tal cual (se leen como
--    'cerrado' en la UI). Esta consulta solo muestra el reparto actual.
SELECT estado, COUNT(*) AS total
  FROM mk_proyectos
 WHERE anulado_en IS NULL
 GROUP BY estado
 ORDER BY estado;
