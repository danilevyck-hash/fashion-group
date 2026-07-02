-- Marketing · flag de grupo legacy (aditivo).
--
-- Rediseño a cards por marca: las facturas EXISTENTES (Tommy/Calvin + 1 Otros)
-- quedan congeladas en la card "Gastos Tommy y Calvin". Las NUEVAS facturas nacen
-- con grupo_legacy = false y se agrupan por su marca (mk_factura_marcas -> mk_marcas).
--
-- El flag vive en mk_facturas (no en mk_factura_marcas) porque:
--   - No hay facturas multi-marca (1 marca por factura hoy).
--   - Es un concepto de la factura (gasto atómico), independiente de la marca.
--   - Evita inconsistencias por-marca si una factura tuviera varias marcas.

ALTER TABLE mk_facturas
  ADD COLUMN IF NOT EXISTS grupo_legacy boolean NOT NULL DEFAULT false;

-- Marca como legacy TODAS las facturas existentes al momento de la migración
-- (incluye las anuladas, para que su papelera quede en el bucket viejo).
-- Las filas insertadas después de esta migración quedan en false por el DEFAULT.
UPDATE mk_facturas SET grupo_legacy = true;
