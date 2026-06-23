-- ─────────────────────────────────────────────────────────────────────────────
-- reclamo_items.genero — género del ítem reclamado (Men/Women/Kids/Accessories).
--
-- Aditiva, NO destructiva: las filas históricas quedan con genero NULL (es
-- correcto, son reclamos viejos previos al campo). El form de creación lo exige
-- de aquí en adelante; en edición se exige solo al reclamo que se edite.
--
-- El CHECK permite NULL (históricos) o uno de los 4 valores fijos. NOT VALID +
-- VALIDATE evita escanear/bloquear la tabla por las filas viejas (que son NULL
-- y pasan el check igual; el patrón es por prudencia/escala).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor ANTES del deploy (sin la
-- columna, el POST /api/reclamos con `genero` en los ítems falla).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE reclamo_items
  ADD COLUMN IF NOT EXISTS genero text;

ALTER TABLE reclamo_items
  DROP CONSTRAINT IF EXISTS reclamo_items_genero_check;

ALTER TABLE reclamo_items
  ADD CONSTRAINT reclamo_items_genero_check
  CHECK (genero IS NULL OR genero IN ('Men', 'Women', 'Kids', 'Accessories'))
  NOT VALID;

ALTER TABLE reclamo_items
  VALIDATE CONSTRAINT reclamo_items_genero_check;

NOTIFY pgrst, 'reload schema';
