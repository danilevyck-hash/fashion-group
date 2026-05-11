-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Multifashion manager fix — Jennifer Castillo → Jennifer Miranda
--
-- En ventas_raw la única "Jennifer" registrada como vendedora de
-- Multifashion (empresa='american_classic') es "Jennifer Miranda". El
-- valor anterior ("Jennifer Castillo") no matcheaba a ninguna vendedora,
-- por lo que el badge "manager" nunca se prendía en la tabla del tab
-- Multifashion.
--
-- Idempotente: UPDATE puntual por key.
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE app_settings
SET value = '"Jennifer Miranda"'::jsonb, updated_at = now()
WHERE key = 'multifashion_manager';

UPDATE app_settings
SET value = '["Jennifer Miranda"]'::jsonb, updated_at = now()
WHERE key = 'multifashion_managers';
