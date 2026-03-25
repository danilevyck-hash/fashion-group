-- Run this in Supabase Dashboard > SQL Editor

ALTER TABLE caja_gastos
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS proveedor text,
  ADD COLUMN IF NOT EXISTS nro_factura text,
  ADD COLUMN IF NOT EXISTS responsable text;

-- Migrate existing data: move 'nombre' to 'descripcion' if not yet migrated
UPDATE caja_gastos SET descripcion = nombre WHERE descripcion IS NULL AND nombre IS NOT NULL;
