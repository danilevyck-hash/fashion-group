-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: clientes_12m_vw — clientes activos en últimos 12 meses (rolling)
--
-- Reemplaza clientes_ytd_vw (year-fiscal) por una vista rolling de 12 meses
-- para identificar clientes caídos recientes y hacer follow-up.
--
-- Columnas:
--   cliente_id              uuid de clientes_master (NULL si no hay match)
--   cliente_nombre          display name (master si existe, si no normalized)
--   cliente_codigo          D-XXX (— si no hay match en master)
--   empresa                 long key normalizada (vistana, fashion_wear, ...)
--   compras_ytd             SUM(subtotal) año fiscal actual (puede ser 0)
--   compras_anio_anterior   SUM(subtotal) año previo
--   delta_vs_2025           numérico, NULL si compras_anio_anterior = 0
--   ultima_compra           fecha máxima
--   whatsapp                celular o teléfono de master (NULL si no hay)
--
-- Filtros:
--   - cliente con al menos 1 factura en últimos 12 meses
--   - excluye placeholders (CONTADO, VENTAS, agregadores Boston/Multi, etc.)
--
-- TODO follow-up: cron diario que ejecute REFRESH MATERIALIZED VIEW.
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS clientes_ytd_vw CASCADE;

CREATE MATERIALIZED VIEW clientes_12m_vw AS
WITH
  normalized AS (
    SELECT
      r.empresa,
      r.subtotal,
      r.fecha,
      r.anio,
      COALESCE(
        NULLIF(
          TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(r.cliente), '[.,]', '', 'g'), '\s+', ' ', 'g')),
          ''
        ),
        '(Sin nombre)'
      ) AS cliente_norm
    FROM ventas_raw r
    WHERE r.cliente IS NOT NULL
  ),
  filtered AS (
    SELECT *
    FROM normalized
    WHERE cliente_norm NOT IN (
      'CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON',
      'CONTADO', 'VENTAS', '(Sin nombre)'
    )
  ),
  cutoff AS (
    SELECT (date_trunc('month', NOW())::date - INTERVAL '12 months')::date AS d
  ),
  active_clientes AS (
    SELECT DISTINCT f.cliente_norm
    FROM filtered f, cutoff c
    WHERE f.fecha >= c.d
  ),
  current_year AS (
    SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS y
  ),
  ytd_actual AS (
    SELECT f.cliente_norm, SUM(f.subtotal) AS compras_ytd
    FROM filtered f, current_year cy
    WHERE f.anio = cy.y
    GROUP BY f.cliente_norm
  ),
  prev_year AS (
    SELECT f.cliente_norm, SUM(f.subtotal) AS compras_anio_anterior
    FROM filtered f, current_year cy
    WHERE f.anio = cy.y - 1
    GROUP BY f.cliente_norm
  ),
  ultima AS (
    SELECT cliente_norm, MAX(fecha) AS ultima_compra
    FROM filtered
    GROUP BY cliente_norm
  ),
  -- empresa con mayor subtotal del cliente en últimos 12 meses
  empresa_top AS (
    SELECT DISTINCT ON (f.cliente_norm)
      f.cliente_norm,
      f.empresa AS empresa_key
    FROM filtered f, cutoff c
    WHERE f.fecha >= c.d
    GROUP BY f.cliente_norm, f.empresa
    ORDER BY f.cliente_norm, SUM(f.subtotal) DESC
  )
SELECT
  m.id                                                                AS cliente_id,
  COALESCE(m.nombre, ac.cliente_norm)                                 AS cliente_nombre,
  COALESCE(m.codigo, '—')                                             AS cliente_codigo,
  COALESCE(et.empresa_key, '—')                                       AS empresa,
  COALESCE(ya.compras_ytd, 0)::numeric                                AS compras_ytd,
  COALESCE(py.compras_anio_anterior, 0)::numeric                      AS compras_anio_anterior,
  CASE
    WHEN COALESCE(py.compras_anio_anterior, 0) > 0
      THEN ((COALESCE(ya.compras_ytd, 0) - py.compras_anio_anterior) / py.compras_anio_anterior)::numeric
    ELSE NULL
  END                                                                 AS delta_vs_2025,
  u.ultima_compra                                                     AS ultima_compra,
  COALESCE(NULLIF(m.celular, ''), NULLIF(m.telefono, ''))             AS whatsapp
FROM active_clientes ac
LEFT JOIN ytd_actual  ya ON ya.cliente_norm = ac.cliente_norm
LEFT JOIN prev_year   py ON py.cliente_norm = ac.cliente_norm
LEFT JOIN ultima      u  ON u.cliente_norm  = ac.cliente_norm
LEFT JOIN empresa_top et ON et.cliente_norm = ac.cliente_norm
LEFT JOIN clientes_master m ON m.nombre_normalized = ac.cliente_norm AND m.deleted = false
ORDER BY u.ultima_compra DESC NULLS LAST;

CREATE INDEX idx_clientes_12m_vw_empresa_ultima
  ON clientes_12m_vw (empresa, ultima_compra DESC);

REFRESH MATERIALIZED VIEW clientes_12m_vw;

GRANT SELECT ON clientes_12m_vw TO service_role;
