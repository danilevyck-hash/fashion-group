-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: fix is_wholesale por empresa en switch_facturas
--
-- BUG: la columna generada is_wholesale aplicaba la regla retail
-- (vendedor='DEFAULT' AND cliente identificado) a TODAS las empresas. Eso está
-- mal: las 6 empresas B2B son wholesale por definición (venden a comercios, no
-- a consumidor final), así que su is_wholesale debe ser SIEMPRE true sin importar
-- el vendedor/cliente.
--
-- FIX: recrear la columna generada con un CASE por empresa_key:
--   - 6 B2B  → true (siempre wholesale)
--   - american_classic / confecciones_boston (retail mixto) → regla retail:
--       vendedor='DEFAULT' AND cliente identificado (no CONTADO/CONSUMIDOR FINAL)
--   - cualquier otra → false
--
-- La rama retail replica la lógica ya usada en el codebase:
--   - 'DEFAULT' como marcador wholesale: 20260512100000_ventas_raw_is_wholesale.sql
--   - exclusión de cliente anónimo: 20260517000200_multifashion_retail_recurrentes_range.sql
--     usa TRIM(UPPER(cliente)) NOT IN ('CONTADO','CONSUMIDOR FINAL','')
-- (american_classic en la práctica no tiene filas en switch_facturas — sus
--  facturas viven en multifashion_tickets — pero se incluye por completitud.)
--
-- ⚠ ANTI-PATTERN (documentado en master context): la lista de las 6 B2B está
--    duplicada entre este CASE (SQL) y B2B_EMPRESA_KEYS en
--    src/lib/empresa-mapping.ts (TS). Una columna generada no puede importar la
--    constante TS, así que AMBAS listas deben mantenerse sincronizadas a mano.
--    Si agregás/quitás una empresa B2B, actualizá los dos lugares.
--
-- NOTA al aplicar: si existe un índice/objeto que dependa de is_wholesale, el
-- DROP COLUMN fallará; agregá CASCADE y recreá el índice. Verificá con
-- `\d+ switch_facturas` que el CASE retail coincide con el comportamiento que
-- esperás para Boston antes de aplicar.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE switch_facturas DROP COLUMN IF EXISTS is_wholesale;

ALTER TABLE switch_facturas
  ADD COLUMN is_wholesale boolean
  GENERATED ALWAYS AS (
    CASE
      -- 6 empresas B2B (= B2B_EMPRESA_KEYS en empresa-mapping.ts): wholesale siempre.
      WHEN empresa_key IN (
        'vistana',
        'fashion_wear',
        'fashion_shoes',
        'active_shoes',
        'active_wear',
        'joystep'
      ) THEN true
      -- Retail mixto: wholesale solo si DEFAULT + cliente identificado.
      WHEN empresa_key IN ('american_classic', 'confecciones_boston') THEN (
        UPPER(TRIM(COALESCE(vendedor_nombre, ''))) = 'DEFAULT'
        AND UPPER(TRIM(COALESCE(cliente_nombre, ''))) NOT IN ('CONTADO', 'CONSUMIDOR FINAL', '')
      )
      ELSE false
    END
  ) STORED;

COMMENT ON COLUMN switch_facturas.is_wholesale IS
  'Generada. 6 B2B (B2B_EMPRESA_KEYS) = true siempre; american_classic/confecciones_boston = '
  'vendedor=DEFAULT AND cliente identificado; resto = false. Mantener la lista B2B '
  'sincronizada con src/lib/empresa-mapping.ts (no se puede importar TS en SQL).';

NOTIFY pgrst, 'reload schema';
