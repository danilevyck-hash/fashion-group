-- Packing Lists: garantizar ON DELETE CASCADE en FK pl_items → packing_lists.
--
-- Por qué: /api/packing-lists/[id] DELETE hace HARD DELETE en packing_lists
-- asumiendo que pl_items se borran por cascade. Si la FK no tiene CASCADE,
-- quedan items huérfanos y/o el DELETE falla con foreign_key_violation.
--
-- Este script es idempotente: drop + recreate garantiza el CASCADE
-- regardless del estado previo. No modifica data.

DO $$
DECLARE
  fk_name text;
BEGIN
  -- Encontrar el nombre de la FK actual (puede variar según cómo se creó)
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'pl_items'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'pl_id'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    -- Drop el FK existente
    EXECUTE format('ALTER TABLE pl_items DROP CONSTRAINT %I', fk_name);
    RAISE NOTICE 'Dropped FK: %', fk_name;
  ELSE
    RAISE NOTICE 'No existing FK found on pl_items.pl_id — creating fresh';
  END IF;

  -- Recrear con ON DELETE CASCADE (nombre canónico)
  ALTER TABLE pl_items
    ADD CONSTRAINT pl_items_pl_id_fkey
    FOREIGN KEY (pl_id)
    REFERENCES packing_lists(id)
    ON DELETE CASCADE;

  RAISE NOTICE 'Recreated FK pl_items_pl_id_fkey WITH ON DELETE CASCADE';
END $$;

-- Verificación post-migration:
-- SELECT rc.delete_rule FROM information_schema.referential_constraints rc
-- JOIN information_schema.table_constraints tc
--   ON tc.constraint_name = rc.constraint_name
-- WHERE tc.table_name = 'pl_items' AND tc.constraint_type = 'FOREIGN KEY';
-- → Debe retornar 'CASCADE'
