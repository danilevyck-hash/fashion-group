-- ============================================================================
-- Marketing — soporte para "compra en zona libre" en facturas
-- ============================================================================
-- Cuando tiene_importacion = true: el total de la factura suma 15% de
-- importación al subtotal (subtotal × 1.15). ITBMS no aplica en zona libre.
-- El reparto por marca en mk_factura_marcas se aplica sobre ese total.
-- ============================================================================

ALTER TABLE mk_facturas
ADD COLUMN tiene_importacion boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN mk_facturas.tiene_importacion IS 'Si true, suma 15% de importación al subtotal (compra en zona libre)';
