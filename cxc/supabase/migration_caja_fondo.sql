-- Run this in Supabase Dashboard > SQL Editor
ALTER TABLE caja_periodos ADD COLUMN IF NOT EXISTS fondo_inicial numeric(10,2) DEFAULT 200;
