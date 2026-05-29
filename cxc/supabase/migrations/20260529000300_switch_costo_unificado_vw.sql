-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: vistas unificadas para el módulo Ventas (fase 2.1)
--
-- Hallazgo de cobertura (no estaba en la spec): switch_facturas arranca
-- 2025-05-02 y switch_costo_diario arranca 2026-05. Cualquier vista de un año
-- fiscal con comparativo de año anterior toca meses anteriores a esas fechas,
-- que solo existen en ventas_raw. Por eso se necesitan DOS vistas unificadas
-- (no solo costo): cada una usa switch donde hay cobertura y cae a ventas_raw
-- para lo anterior. Ambas en base contable consistente (neto con impuesto;
-- ventas_raw ya guarda NCs en negativo, así que SUM(total)/SUM(costo) netean).
--
-- Mapeo de empresa: ventas_raw.empresa tiene aliases (vistana_international,
-- boston); se normaliza a la empresa_key canónica (igual que B2B_EMPRESA_KEYS
-- en src/lib/empresa-mapping.ts — mantener sincronizado).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor (después de switch_costo_diario).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Ventas unificadas (empresa_key, mes, ventas_netas) ────────────────────
-- BASE CONTABLE: post-descuento PRE-IMPUESTO (subtotal), igual que la versión
-- vieja de ventas_dashboard_summary (SUM(subtotal) de ventas_raw). NO usamos
-- switch_ventas_netas_vw (que es total CON ITBMS, base del panel) para no
-- inflar ~7% los números y no romper los YoY al migrar.
--   - switch_facturas.subtotal_descuento = ventas_raw.subtotal (match exacto:
--     FW nov 2025 ambos = 769,292.75). Fórmula contable: positivos − NC.
--   - switch cubre >= 2025-05; ventas_raw cubre < 2025-05.
CREATE OR REPLACE VIEW switch_ventas_unificado_vw AS
  SELECT
    empresa_key,
    date_trunc('month', fecha)::date AS mes,
    COALESCE(SUM(subtotal_descuento) FILTER (
      WHERE tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito')
    ), 0)
    - COALESCE(SUM(subtotal_descuento) FILTER (
      WHERE tipo_comprobante = 'Nota de Crédito'
    ), 0) AS ventas_netas
  FROM switch_facturas
  WHERE fecha >= DATE '2025-05-01'
  GROUP BY 1, 2
UNION ALL
  SELECT
    CASE
      WHEN empresa IN ('vistana', 'vistana_international') THEN 'vistana'
      WHEN empresa IN ('boston', 'confecciones_boston') THEN 'confecciones_boston'
      ELSE empresa
    END AS empresa_key,
    make_date(anio, mes, 1) AS mes,
    SUM(subtotal)::numeric AS ventas_netas
  FROM ventas_raw
  WHERE make_date(anio, mes, 1) < DATE '2025-05-01'
  GROUP BY 1, 2;

GRANT SELECT ON switch_ventas_unificado_vw TO service_role;

-- ── 2. Costo unificado (empresa_key, mes, costo_total) ───────────────────────
-- switch_costo_diario cubre >= 2026-05 (forward); ventas_raw cubre < 2026-05.
CREATE OR REPLACE VIEW switch_costo_unificado_vw AS
  SELECT
    empresa_key,
    date_trunc('month', fecha)::date AS mes,
    SUM(costo_total)::numeric AS costo_total
  FROM switch_costo_diario
  WHERE fecha >= DATE '2026-05-01'
  GROUP BY 1, 2
UNION ALL
  SELECT
    CASE
      WHEN empresa IN ('vistana', 'vistana_international') THEN 'vistana'
      WHEN empresa IN ('boston', 'confecciones_boston') THEN 'confecciones_boston'
      ELSE empresa
    END AS empresa_key,
    make_date(anio, mes, 1) AS mes,
    SUM(costo)::numeric AS costo_total
  FROM ventas_raw
  WHERE make_date(anio, mes, 1) < DATE '2026-05-01'
  GROUP BY 1, 2;

GRANT SELECT ON switch_costo_unificado_vw TO service_role;

NOTIFY pgrst, 'reload schema';
