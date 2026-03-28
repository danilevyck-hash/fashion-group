-- ============================================================
-- M10: UNIQUE constraints to prevent race conditions
-- in auto-incrementing numero fields
-- Run this in Supabase SQL Editor
-- ============================================================

-- Guia transporte: numero generated via SELECT MAX + 1 in API
ALTER TABLE guia_transporte ADD CONSTRAINT guia_numero_unique UNIQUE (numero);

-- Caja periodos: numero generated via SELECT MAX + 1 in API
ALTER TABLE caja_periodos ADD CONSTRAINT caja_numero_unique UNIQUE (numero);
