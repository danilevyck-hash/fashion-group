-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: CHECK de dominio en ventas_raw.empresa (auditoría 🟢-18)
--
-- PROBLEMA: ventas_raw.empresa era `text NOT NULL` sin CHECK ni FK. Un typo en
-- el upload (ej. 'fashionwear', 'vistanaa') entraba sin error y caía al ELSE de
-- los CASE de las vistas/RPCs (switch_ventas_unificado_vw, ventas_dashboard_*),
-- quedando como una empresa_key fantasma que el frontend ignora — pérdida
-- silenciosa de ventas.
--
-- SOLUCIÓN: CHECK constraint que restringe empresa al dominio válido. Cualquier
-- typo futuro es rechazado en el INSERT (el upload falla ruidoso, no silencioso).
--
-- DOMINIO: las 8 empresa_keys canónicas (ALL_EMPRESA_KEYS en
-- src/lib/empresa-mapping.ts) + 2 aliases legacy que los CASE de las vistas aún
-- normalizan (vistana_international → vistana, boston → confecciones_boston).
-- Se incluyen los aliases para no romper un re-upload de CSVs históricos.
--
-- SEGURO DE APLICAR VALIDADO: verificado 2026-05-30 contra ~48,400 filas →
-- 0 filas fuera de esta lista (scripts/_diag-tanda3-boundary-empresa.mjs).
--
-- Pre-check opcional antes de aplicar (debe devolver 0):
--   SELECT count(*) FROM ventas_raw WHERE empresa NOT IN (
--     'vistana','fashion_wear','fashion_shoes','active_shoes','active_wear',
--     'joystep','confecciones_boston','american_classic',
--     'vistana_international','boston');
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ventas_raw
  DROP CONSTRAINT IF EXISTS ventas_raw_empresa_check;

ALTER TABLE ventas_raw
  ADD CONSTRAINT ventas_raw_empresa_check
  CHECK (empresa IN (
    'vistana',
    'fashion_wear',
    'fashion_shoes',
    'active_shoes',
    'active_wear',
    'joystep',
    'confecciones_boston',
    'american_classic',
    'vistana_international',
    'boston'
  ));
