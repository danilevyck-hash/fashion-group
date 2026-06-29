-- ─────────────────────────────────────────────────────────────────────────────
-- Reclamos → pipeline de 3 estados: Creado → En proceso → Pagado.
--
-- Para pasar de Creado a "En proceso" se exige una FOTO de comprobante + nota
-- opcional, que se guardan asociadas al reclamo (columnas comprobante_*).
-- Aditivo: las filas existentes (Creado/Pagado) siguen válidas; rollback de un
-- paso permitido (En proceso → Creado, Pagado → En proceso).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Comprobante del paso "En proceso" (foto + nota), asociado al cambio de estado.
ALTER TABLE reclamos ADD COLUMN IF NOT EXISTS comprobante_url  text;
ALTER TABLE reclamos ADD COLUMN IF NOT EXISTS comprobante_path text;
ALTER TABLE reclamos ADD COLUMN IF NOT EXISTS comprobante_nota text;

-- CHECK de estado → agrega 'En proceso'. Cero filas en estados removidos.
ALTER TABLE reclamos DROP CONSTRAINT IF EXISTS reclamos_estado_check;
ALTER TABLE reclamos ADD CONSTRAINT reclamos_estado_check
  CHECK (estado IN ('Creado', 'En proceso', 'Pagado'));

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación:
--   SELECT estado, count(*) FROM reclamos GROUP BY estado;     -- distribución
--   -- Debe ACEPTAR un update a 'En proceso' (probar en uno de prueba y revertir).
-- ─────────────────────────────────────────────────────────────────────────────
