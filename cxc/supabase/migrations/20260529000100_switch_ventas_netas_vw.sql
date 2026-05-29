-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_ventas_netas_vw — ventas netas contables por empresa + mes
--
-- Fórmula validada contra el panel oficial de Switch (Daniel):
--   ventas_netas = SUM(Factura + Tiquete + Transacción + Nota de Débito)
--                  − SUM(Nota de Crédito)
-- (cotizaciones/apartados NO cuentan; nunca se sincronizan a switch_facturas).
--
-- Las NCs y NDs se guardan con total POSITIVO en switch_facturas; el signo
-- contable (restar NCs) se aplica acá, en query time.
--
-- Fuente: switch_facturas (las 8 empresas; american_classic también, en paralelo
-- a multifashion_tickets legacy). La consume fashiongr.com en fase 2.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW switch_ventas_netas_vw AS
SELECT
  empresa_key,
  DATE_TRUNC('month', fecha)::date AS mes,
  COALESCE(
    SUM(total) FILTER (
      WHERE tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito')
    ), 0
  )
  - COALESCE(
      SUM(total) FILTER (WHERE tipo_comprobante = 'Nota de Crédito'), 0
    ) AS ventas_netas,
  COALESCE(
    SUM(total) FILTER (
      WHERE tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito')
    ), 0
  ) AS bruto_positivo,
  COALESCE(SUM(total) FILTER (WHERE tipo_comprobante = 'Nota de Crédito'), 0) AS notas_credito,
  COALESCE(SUM(total) FILTER (WHERE tipo_comprobante = 'Nota de Débito'), 0) AS notas_debito,
  COUNT(*) FILTER (WHERE tipo_comprobante = 'Factura') AS n_facturas,
  COUNT(*) FILTER (WHERE tipo_comprobante = 'Tiquete') AS n_tiquetes,
  COUNT(*) FILTER (WHERE tipo_comprobante = 'Transacción') AS n_transacciones,
  COUNT(*) FILTER (WHERE tipo_comprobante = 'Nota de Débito') AS n_notas_debito,
  COUNT(*) FILTER (WHERE tipo_comprobante = 'Nota de Crédito') AS n_notas_credito
FROM switch_facturas
GROUP BY empresa_key, DATE_TRUNC('month', fecha)::date;

GRANT SELECT ON switch_ventas_netas_vw TO service_role;

NOTIFY pgrst, 'reload schema';
