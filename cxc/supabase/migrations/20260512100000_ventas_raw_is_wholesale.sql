-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: separar retail vs wholesale en Multifashion
--
-- Contexto: en abril 2026 hay $25,399.37 que no se atribuyen a ninguna
-- vendedora. Investigación del CSV de Switch Soft confirma:
--   - 11 tickets con VENDEDOR='DEFAULT' en abril, suman $25,399.37
--   - 1 ticket (Factura 11-000023263, 07-04-2026, LA FRONTERA DUTY FREE)
--     = $24,807.00 = 97.6% del gap
--   - LA FRONTERA es cliente mayorista duty-free, no retail mostrador
--
-- Decisión arquitectónica: vendedor='DEFAULT' (TRIM+UPPER) en Multifashion
-- marca venta wholesale. Otras empresas son B2B por naturaleza, así que
-- el flag is_wholesale solo se prende para american_classic.
--
-- Después de aplicar esta migration, ejecutar:
--   SELECT COUNT(*) FROM ventas_raw WHERE is_wholesale = true;
--   -- esperado: 182 filas (todas american_classic con DEFAULT)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ventas_raw
  ADD COLUMN IF NOT EXISTS is_wholesale BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN ventas_raw.is_wholesale IS
  'true cuando empresa=american_classic AND TRIM(UPPER(vendedor))=DEFAULT. '
  'Marca ventas wholesale de Multifashion (ej. LA FRONTERA DUTY FREE). '
  'Para otras empresas (B2B), siempre false — el flag aplica solo a Multifashion.';

-- Backfill: solo american_classic + DEFAULT
UPDATE ventas_raw
SET is_wholesale = true
WHERE empresa = 'american_classic'
  AND TRIM(UPPER(vendedor)) = 'DEFAULT';

-- Partial index: 182 filas — fits in buffer cache; speeds up RPC queries que
-- filtran is_wholesale = true.
CREATE INDEX IF NOT EXISTS idx_ventas_raw_is_wholesale
  ON ventas_raw (fecha)
  WHERE is_wholesale = true;
