-- Turn caja_gastos.responsable from free text into an FK against a
-- closed catálogo. The legacy text column stays populated for display
-- (PrintView, GastoTable mobile card, Excel export) and so historical
-- rows keep rendering correctly; responsable_id is the new source of
-- truth for form inputs.

-- 1. Rename existing catálogo rows to match the agreed naming
UPDATE caja_responsables SET nombre = 'Daniel' WHERE nombre = 'Daniel Levy';
UPDATE caja_responsables SET nombre = 'andrea' WHERE nombre = 'Andrea Perez';

-- 2. Seed missing responsables (case-insensitive guard to avoid dupes)
INSERT INTO caja_responsables (nombre)
SELECT v.nombre
  FROM (VALUES ('Julio'), ('Rodrigo'), ('Rey'), ('Jennifer'), ('Otro')) AS v(nombre)
 WHERE NOT EXISTS (
   SELECT 1 FROM caja_responsables cr
    WHERE lower(trim(cr.nombre)) = lower(trim(v.nombre))
 );

-- 3. FK column + index. ON DELETE SET NULL so removing a responsable
--    from the catálogo never wipes a gasto's financial history.
ALTER TABLE caja_gastos
  ADD COLUMN IF NOT EXISTS responsable_id uuid
    REFERENCES caja_responsables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS caja_gastos_responsable_id_idx
  ON caja_gastos(responsable_id);

-- 4. Backfill: match legacy text to catálogo by lower(trim())
UPDATE caja_gastos cg
   SET responsable_id = cr.id
  FROM caja_responsables cr
 WHERE lower(trim(cr.nombre)) = lower(trim(cg.responsable))
   AND cg.responsable_id IS NULL;

-- Unmatched rows stay NULL. Audit (2026-04-18) found:
--   - "Angela garciia" (typo, double i) → no match
--   - ""               (empty)          → no match possible
--   - one deleted legacy row
-- These must be edited and saved once before responsable_id gets set.
