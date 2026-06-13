-- ============================================================================
-- Clientes nuevos para vincular guías: "City Mall" y "American Classics"
-- ============================================================================
-- El histórico de guías usa estos nombres (City Mall = 61 ítems; American
-- Classics/Clasic ≈ 19) pero NO existen en clientes_master, así que el match
-- por nombre normalizado no los vincula. Se agregan como clientes propios.
--
-- Códigos: siguientes disponibles tras el máximo actual (D-199) → D-200, D-201.
-- `codigo` NO es único en clientes_master (es referencia, no PK); el índice
-- único es PARCIAL sobre nombre_normalized WHERE deleted = false. Por eso el
-- ON CONFLICT va sobre ese índice → idempotente por nombre.
--
-- nombre_normalized = upper + quitar [.,] + colapsar espacios (normalizador
-- canónico de clientes_master). Para estos dos nombres no hay puntuación.
--
-- Aditiva e idempotente. Correr UNA vez en Supabase SQL Editor.
-- ============================================================================

INSERT INTO clientes_master (codigo, nombre, nombre_normalized)
VALUES
  ('D-200', 'City Mall',         'CITY MALL'),
  ('D-201', 'American Classics', 'AMERICAN CLASSICS')
ON CONFLICT (nombre_normalized) WHERE deleted = false DO NOTHING;

-- Validación (no modifica nada): deben aparecer las 2 filas.
SELECT codigo, nombre, nombre_normalized
FROM clientes_master
WHERE nombre_normalized IN ('CITY MALL', 'AMERICAN CLASSICS')
  AND deleted = false;
