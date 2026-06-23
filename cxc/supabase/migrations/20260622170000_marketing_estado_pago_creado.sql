-- ─────────────────────────────────────────────────────────────────────────────
-- Marketing — estado_pago de facturas: 'pendiente' → 'creado' (alinear con
-- Reclamos: Creado/Pagado). 'pagado' se mantiene.
--
-- SOLO toca mk_facturas.estado_pago (el estado de pago VISIBLE de la factura).
-- NO toca ninguna maquinaria de cobranza/proyecto (estados de proyecto
-- Abierto/Enviado/Cobrado, OCR, etc.) — esas viven en otras columnas/tablas.
--
-- Aditiva/no destructiva. Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE mk_facturas DROP CONSTRAINT IF EXISTS mk_facturas_estado_pago_check;

UPDATE mk_facturas
SET estado_pago = 'creado'
WHERE estado_pago = 'pendiente';

ALTER TABLE mk_facturas ADD CONSTRAINT mk_facturas_estado_pago_check
  CHECK (estado_pago IN ('creado', 'pagado'));

ALTER TABLE mk_facturas ALTER COLUMN estado_pago SET DEFAULT 'creado';

COMMIT;

NOTIFY pgrst, 'reload schema';
