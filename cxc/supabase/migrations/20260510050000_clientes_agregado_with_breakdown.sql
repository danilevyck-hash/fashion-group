-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: agregar empresas_breakdown a clientes_agregado_12m_vw
--
-- En modo "Todas" del tab Clientes, cuando un cliente compra a múltiples
-- empresas, la UI necesita mostrar la lista detallada (empresa + monto)
-- en un hover sobre la celda "EMPRESA". La materialized view ya tiene los
-- datos a nivel (cliente, empresa); aquí los empaquetamos como JSONB
-- ordenado por monto descendente en el regular view agregado.
--
-- Sólo afecta el VIEW regular (clientes_agregado_12m_vw). La materialized
-- view granular no se toca: empresa_breakdown sólo se necesita cuando hay
-- agregación cross-empresa (modo Todas).
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS clientes_agregado_12m_vw;

CREATE VIEW clientes_agregado_12m_vw AS
WITH breakdowns AS (
  SELECT
    cliente_nombre,
    cliente_id,
    jsonb_agg(
      jsonb_build_object('empresa', empresa, 'monto', compras_ytd)
      ORDER BY compras_ytd DESC NULLS LAST
    ) AS empresas_breakdown
  FROM clientes_empresa_12m_vw
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
  FROM clientes_empresa_12m_vw
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
