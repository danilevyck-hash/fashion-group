-- ============================================================================
-- Clientes nuevos para vincular guías: "City Mall" y "American Classics"
-- ============================================================================
-- El histórico de guías usa estos nombres (City Mall = 61 ítems; American
-- Classics/Clasic ≈ 19) pero NO existen en clientes_master, así que el match
-- por nombre normalizado no los vincula. Se agregan como clientes propios.
--
-- Esquema REAL de clientes_master (verificado contra la DB):
--   - El único índice UNIQUE es sobre `codigo` (parcial):
--       idx_clientes_master_codigo_uq ON (codigo) WHERE deleted = false AND codigo IS NOT NULL
--     (migración 20260530000200). El sync upsertea con onConflict="codigo".
--   - NO existe índice único sobre nombre_normalized en la DB (el de
--     clientes-master.sql nunca se aplicó) → por eso ON CONFLICT(nombre_normalized)
--     daba 42P10. Esta versión NO usa ON CONFLICT.
--   - `nombre_normalized` es columna NOT NULL escribible (no generada): el sync
--     la setea con N2(nombre) = upper + quitar [.,] + colapsar espacios. Para
--     estos dos nombres (sin puntuación) → 'CITY MALL' / 'AMERICAN CLASSICS'.
--   - Soft-delete real: columna `deleted` (boolean, default false).
--
-- Códigos: siguientes disponibles tras el máximo actual (D-199) → D-200, D-201.
--
-- Idempotente y sin choques: inserta cada fila SOLO si no existe ya (vivo) otro
-- cliente con ese nombre_normalized NI con ese codigo. Re-correr no duplica.
-- Aditiva. Correr UNA vez en Supabase SQL Editor.
-- ============================================================================

INSERT INTO clientes_master (codigo, nombre, nombre_normalized)
SELECT v.codigo, v.nombre, v.nombre_normalized
FROM (VALUES
  ('D-200', 'City Mall',         'CITY MALL'),
  ('D-201', 'American Classics', 'AMERICAN CLASSICS')
) AS v(codigo, nombre, nombre_normalized)
WHERE NOT EXISTS (
  SELECT 1
  FROM clientes_master c
  WHERE c.deleted = false
    AND (c.nombre_normalized = v.nombre_normalized OR c.codigo = v.codigo)
);

-- Validación (no modifica nada): deben aparecer las 2 filas.
SELECT codigo, nombre, nombre_normalized
FROM clientes_master
WHERE nombre_normalized IN ('CITY MALL', 'AMERICAN CLASSICS')
  AND deleted = false
ORDER BY codigo;
