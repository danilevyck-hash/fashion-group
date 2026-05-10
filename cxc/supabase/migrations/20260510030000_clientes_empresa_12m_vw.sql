-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: clientes_empresa_12m_vw — granularidad (cliente, empresa)
--
-- BUG fix: la view anterior clientes_12m_vw asignaba cada cliente a UNA sola
-- empresa (DISTINCT ON (cliente_norm) ORDER BY SUM(subtotal) DESC), excluyendo
-- los clientes que compran a múltiples empresas del filtro por empresa
-- específica. City Mall Paso Canoa (vistana, $602k) y otros 43 clientes de
-- Vistana se "perdían" porque ganaba otra empresa en el DISTINCT ON.
--
-- Cambio: una fila por par (cliente_norm, empresa) con compras en últimos
-- 12 meses. Las agregaciones para el modo "Todas" se hacen via window
-- functions en queries.ts, pre-empaquetadas en la VIEW clientes_agregado_12m_vw.
--
-- TODO follow-up: cron diario que ejecute REFRESH MATERIALIZED VIEW.
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS clientes_12m_vw CASCADE;
DROP VIEW             IF EXISTS clientes_agregado_12m_vw CASCADE;
DROP MATERIALIZED VIEW IF EXISTS clientes_empresa_12m_vw CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Materialized view granular: (cliente_norm, empresa)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW clientes_empresa_12m_vw AS
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
  -- Pares (cliente_norm, empresa) con al menos una factura en últimos 12 meses
  active_pairs AS (
    SELECT DISTINCT f.cliente_norm, f.empresa
    FROM filtered f, cutoff c
    WHERE f.fecha >= c.d
  ),
  current_year AS (
    SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS y
  ),
  ytd_actual AS (
    SELECT f.cliente_norm, f.empresa, SUM(f.subtotal) AS compras_ytd
    FROM filtered f, current_year cy
    WHERE f.anio = cy.y
    GROUP BY f.cliente_norm, f.empresa
  ),
  prev_year AS (
    SELECT f.cliente_norm, f.empresa, SUM(f.subtotal) AS compras_anio_anterior
    FROM filtered f, current_year cy
    WHERE f.anio = cy.y - 1
    GROUP BY f.cliente_norm, f.empresa
  ),
  ultima AS (
    SELECT cliente_norm, empresa, MAX(fecha) AS ultima_compra
    FROM filtered
    GROUP BY cliente_norm, empresa
  )
SELECT
  m.id                                                                AS cliente_id,
  COALESCE(m.nombre, ap.cliente_norm)                                 AS cliente_nombre,
  COALESCE(m.codigo, '—')                                             AS cliente_codigo,
  ap.empresa                                                          AS empresa,
  COALESCE(ya.compras_ytd, 0)::numeric                                AS compras_ytd,
  COALESCE(py.compras_anio_anterior, 0)::numeric                      AS compras_anio_anterior,
  CASE
    WHEN COALESCE(py.compras_anio_anterior, 0) > 0
      THEN ((COALESCE(ya.compras_ytd, 0) - py.compras_anio_anterior) / py.compras_anio_anterior)::numeric
    ELSE NULL
  END                                                                 AS delta_vs_2025,
  u.ultima_compra                                                     AS ultima_compra,
  COALESCE(NULLIF(m.celular, ''), NULLIF(m.telefono, ''))             AS whatsapp
FROM active_pairs ap
LEFT JOIN ytd_actual ya ON ya.cliente_norm = ap.cliente_norm AND ya.empresa = ap.empresa
LEFT JOIN prev_year  py ON py.cliente_norm = ap.cliente_norm AND py.empresa = ap.empresa
LEFT JOIN ultima     u  ON u.cliente_norm  = ap.cliente_norm AND u.empresa  = ap.empresa
LEFT JOIN clientes_master m ON m.nombre_normalized = ap.cliente_norm AND m.deleted = false
ORDER BY u.ultima_compra DESC NULLS LAST;

CREATE INDEX idx_clientes_empresa_12m_vw_empresa_ultima
  ON clientes_empresa_12m_vw (empresa, ultima_compra DESC NULLS LAST);

CREATE INDEX idx_clientes_empresa_12m_vw_cliente_id
  ON clientes_empresa_12m_vw (cliente_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Vista agregada (Todas) — window functions sobre la materialized view
--    PARTITION BY (cliente_id, cliente_nombre): cliente_id puede ser NULL para
--    clientes sin match en master, así que cliente_nombre garantiza el group.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW clientes_agregado_12m_vw AS
SELECT
  cliente_id,
  cliente_nombre,
  cliente_codigo,
  whatsapp,
  empresa_principal       AS empresa,
  empresas_count,
  total_compras_ytd       AS compras_ytd,
  total_compras_prev      AS compras_anio_anterior,
  CASE
    WHEN total_compras_prev > 0
      THEN (total_compras_ytd - total_compras_prev) / total_compras_prev
    ELSE NULL
  END                     AS delta_vs_2025,
  ultima_compra_agg       AS ultima_compra
FROM (
  SELECT
    cliente_id,
    cliente_nombre,
    cliente_codigo,
    whatsapp,
    empresa AS empresa_principal,
    COUNT(*)         OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS empresas_count,
    SUM(compras_ytd)             OVER (PARTITION BY cliente_id, cliente_nombre)                                AS total_compras_ytd,
    SUM(compras_anio_anterior)   OVER (PARTITION BY cliente_id, cliente_nombre)                                AS total_compras_prev,
    MAX(ultima_compra)           OVER (PARTITION BY cliente_id, cliente_nombre)                                AS ultima_compra_agg,
    ROW_NUMBER()     OVER (PARTITION BY cliente_id, cliente_nombre ORDER BY compras_ytd DESC NULLS LAST)       AS rn
  FROM clientes_empresa_12m_vw
) ranked
WHERE rn = 1
ORDER BY ultima_compra_agg DESC NULLS LAST;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Refresh inicial + permisos
-- ─────────────────────────────────────────────────────────────────────────────

REFRESH MATERIALIZED VIEW clientes_empresa_12m_vw;

GRANT SELECT ON clientes_empresa_12m_vw  TO service_role;
GRANT SELECT ON clientes_agregado_12m_vw TO service_role;
