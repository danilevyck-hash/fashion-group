-- Run this in Supabase Dashboard > SQL Editor
-- Add nro_factura and nro_orden_compra per item

ALTER TABLE reclamo_items ADD COLUMN IF NOT EXISTS nro_factura text DEFAULT '';
ALTER TABLE reclamo_items ADD COLUMN IF NOT EXISTS nro_orden_compra text DEFAULT '';
