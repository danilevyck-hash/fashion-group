-- Run this in Supabase Dashboard > SQL Editor
-- Fix: ensure reclamo_items columns exist and clean up test data

ALTER TABLE reclamo_items ADD COLUMN IF NOT EXISTS referencia text DEFAULT '';
ALTER TABLE reclamo_items ADD COLUMN IF NOT EXISTS descripcion text DEFAULT '';
ALTER TABLE reclamo_items ADD COLUMN IF NOT EXISTS talla text DEFAULT '';
ALTER TABLE reclamo_items ADD COLUMN IF NOT EXISTS cantidad integer DEFAULT 1;
ALTER TABLE reclamo_items ADD COLUMN IF NOT EXISTS precio_unitario numeric(10,2) DEFAULT 0;
ALTER TABLE reclamo_items ADD COLUMN IF NOT EXISTS motivo text DEFAULT 'Faltante de Mercancía';

-- Delete test reclamos
DELETE FROM reclamos WHERE nro_factura IN ('77', '998') AND created_at > '2026-03-25';
