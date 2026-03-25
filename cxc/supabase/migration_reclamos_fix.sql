-- Run this in Supabase Dashboard > SQL Editor
-- Fix: ensure missing columns exist

ALTER TABLE reclamos ADD COLUMN IF NOT EXISTS nro_orden_compra text DEFAULT '';
ALTER TABLE reclamos ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
