-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: filtrar retail (Boston + Multifashion) del view agregado
--
-- El modo "Todas" del tab Clientes representa el negocio B2B. Los clientes
-- de retail (Confecciones Boston, Multifashion) son consumidor final y
-- distorsionan la lista en esta vista. Sus pills individuales siguen
-- funcionando contra la materialized view granular (sin filtro).
--
-- Sólo afecta el VIEW regular agregado (clientes_agregado_12m_vw). La
-- materialized view granular se mantiene completa para que el filtro por
-- empresa específica siga viendo Boston y Multi.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS clientes_agregado_12m_vw;

CREATE VIEW clientes_agregado_12m_vw AS
WITH
  -- Pre-filtro B2B: excluye 'confecciones_boston' y 'american_classic'.
  -- Hardcoded por simplicidad; sincronizado con B2B_EMPRESA_KEYS en
  -- src/lib/empresa-mapping.ts.
  b2b_only AS (
    SELECT *
    FROM clientes_empresa_12m_vw
    WHERE empresa IN ('vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes', 'active_wear', 'joystep')
  ),
  breakdowns AS (
    SELECT
      cliente_nombre,
      cliente_id,
      jsonb_agg(
        jsonb_build_object('empresa', empresa, 'monto', compras_ytd)
        ORDER BY compras_ytd DESC NULLS LAST
      ) AS empresas_breakdown
    FROM b2b_only
    GROUP BY cliente_nombre, cliente_id
  ),
  ranked AS (
    SELECT
      cliente_id,
      cliente_nombre,
      cliente_codigo,
      whatsapp,
      empresa AS empresa_principal,
      compras_ytd,
      compras_anio_anterior,
      ultima_compra,
      COUNT(*)                   OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS empresas_count,
      SUM(compras_ytd)           OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS total_compras_ytd,
      SUM(compras_anio_anterior) OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS total_compras_prev,
      MAX(ultima_compra)         OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS ultima_compra_agg,
      ROW_NUMBER()               OVER (PARTITION BY cliente_id, cliente_nombre ORDER BY compras_ytd DESC NULLS LAST)      AS rn
    FROM b2b_only
  )
SELECT
  r.cliente_id,
  r.cliente_nombre,
  r.cliente_codigo,
  r.whatsapp,
  r.empresa_principal       AS empresa,
  r.empresas_count,
  r.total_compras_ytd       AS compras_ytd,
  r.total_compras_prev      AS compras_anio_anterior,
  CASE
    WHEN r.total_compras_prev > 0
      THEN (r.total_compras_ytd - r.total_compras_prev) / r.total_compras_prev
    ELSE NULL
  END                       AS delta_vs_2025,
  r.ultima_compra_agg       AS ultima_compra,
  b.empresas_breakdown
FROM ranked r
LEFT JOIN breakdowns b
  ON b.cliente_nombre = r.cliente_nombre
 AND b.cliente_id IS NOT DISTINCT FROM r.cliente_id
WHERE r.rn = 1
ORDER BY r.ultima_compra_agg DESC NULLS LAST;

GRANT SELECT ON clientes_agregado_12m_vw TO service_role;
