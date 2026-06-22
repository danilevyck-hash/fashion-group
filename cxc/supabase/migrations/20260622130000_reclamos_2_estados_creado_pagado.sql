-- ─────────────────────────────────────────────────────────────────────────────
-- Reclamos → pipeline de 2 estados.
--
-- 'Borrador' y 'Enviado' se FUSIONAN en 'Creado'. 'Pagado' se mantiene.
-- Orden (en transacción):
--   1. DROP del CHECK viejo (para poder escribir 'Creado', que no estaba permitido).
--   2. UPDATE de TODAS las filas (incluye deleted=true) Borrador/Enviado → Creado.
--   3. ADD del CHECK nuevo: ('Creado','Pagado').
--   4. DEFAULT de la columna → 'Creado'.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE reclamos DROP CONSTRAINT IF EXISTS reclamos_estado_check;

UPDATE reclamos
SET estado = 'Creado'
WHERE estado IN ('Borrador', 'Enviado');

ALTER TABLE reclamos ADD CONSTRAINT reclamos_estado_check
  CHECK (estado IN ('Creado', 'Pagado'));

ALTER TABLE reclamos ALTER COLUMN estado SET DEFAULT 'Creado';

COMMIT;

NOTIFY pgrst, 'reload schema';
