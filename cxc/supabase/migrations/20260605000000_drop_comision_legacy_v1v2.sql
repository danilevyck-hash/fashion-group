-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: limpieza de comisiones legacy (v1/v2 + tabla de tasas vieja)
--
-- Contexto: la cadena de comisiones B2B evolucionó comision_b2b (v1) ->
-- comision_b2b_v2 -> comision_b2b_v3 -> comision_b2b_v4 (vigente, la que llama
-- el frontend) + comision_b2b_detalle. La tabla de tasas migro de la per-empresa
-- comision_tasas a la global comision_vendedor_tasa.
--
-- Verificado (read-only):
--   - El frontend solo llama comision_b2b_v4 y comision_b2b_detalle.
--   - v3, v4 y detalle leen SOLO comision_vendedor_tasa (NO comision_tasas).
--   - Nada vivo llama comision_b2b (v1) ni comision_b2b_v2 ni lee comision_tasas.
--
-- Esta migracion dropea v1 (comision_b2b sin sufijo), v2 y la tabla legacy
-- comision_tasas. NO toca v3 (se deprecara despues), v4, detalle, ni
-- comision_vendedor_tasa.
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS comision_b2b(text, int, int);
DROP FUNCTION IF EXISTS comision_b2b_v2(text, int, int);
DROP TABLE IF EXISTS comision_tasas;

NOTIFY pgrst, 'reload schema';
