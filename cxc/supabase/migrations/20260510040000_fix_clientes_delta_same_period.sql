-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: fix Δ vs prev year en clientes_empresa_12m_vw — same-period
--
-- BUG (audit 2026-05-10): el comparativo divide YTD del año actual (4 meses
-- Ene-Abr) entre AÑO COMPLETO del año previo (12 meses). Apples-to-oranges.
-- Sesgo sistemático ≈ -67% para clientes con run-rate constante.
--
-- FIX: same-period. Calcular max_mes = MAX(mes WHERE anio = año_actual) una
-- sola vez (global). Ambos numerador y denominador suman SUM(subtotal) WHERE
-- mes <= max_mes — comparan exactamente el mismo número de meses calendario
-- en posiciones equivalentes.
--
-- Cambio adicional: agregar cliente_norm a las columnas y crear UNIQUE INDEX
-- en (cliente_norm, empresa) para habilitar REFRESH MATERIALIZED VIEW
-- CONCURRENTLY en futuros refrescos (cron pendiente).
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW              IF EXISTS clientes_agregado_12m_vw CASCADE;
DROP MATERIALIZED VIEW IF EXISTS clientes_empresa_12m_vw  CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Materialized view granular: (cliente_norm, empresa) — same-period delta
-- ─────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW clientes_empresa_12m_vw AS
WITH
  normalized AS (
    SELECT
      r.empresa,
      r.subtotal,
      r.fecha,
      r.anio,
      r.mes,
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
  current_year AS (
    SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS y
  ),
  -- max_mes: último mes con ventas en el año actual. Se usa como tope para
  -- ambos numerador (year actual) y denominador (year previo) → ventanas
  -- comparables en tamaño y posición temporal.
  max_mes AS (
    SELECT COALESCE(MAX(f.mes), 12) AS m
    FROM filtered f, current_year cy
    WHERE f.anio = cy.y
  ),
  -- Pares (cliente_norm, empresa) con al menos una factura en últimos 12 meses
  active_pairs AS (
    SELECT DISTINCT f.cliente_norm, f.empresa
    FROM filtered f, cutoff c
    WHERE f.fecha >= c.d
  ),
  ytd_actual AS (
    SELECT f.cliente_norm, f.empresa, SUM(f.subtotal) AS compras_ytd
    FROM filtered f, current_year cy, max_mes mm
    WHERE f.anio = cy.y AND f.mes <= mm.m
    GROUP BY f.cliente_norm, f.empresa
  ),
  prev_year AS (
    SELECT f.cliente_norm, f.empresa, SUM(f.subtotal) AS compras_anio_anterior
    FROM filtered f, current_year cy, max_mes mm
    WHERE f.anio = cy.y - 1 AND f.mes <= mm.m
    GROUP BY f.cliente_norm, f.empresa
  ),
  ultima AS (
    SELECT cliente_norm, empresa, MAX(fecha) AS ultima_compra
    FROM filtered
    GROUP BY cliente_norm, empresa
  )
SELECT
  ap.cliente_norm                                                     AS cliente_norm,
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

-- UNIQUE index requerido por REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX idx_clientes_empresa_12m_vw_unq
  ON clientes_empresa_12m_vw (cliente_norm, empresa);

CREATE INDEX idx_clientes_empresa_12m_vw_empresa_ultima
  ON clientes_empresa_12m_vw (empresa, ultima_compra DESC NULLS LAST);

CREATE INDEX idx_clientes_empresa_12m_vw_cliente_id
  ON clientes_empresa_12m_vw (cliente_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Vista agregada (Todas) — sin cambios de lógica, sólo rebuild por CASCADE.
--    PARTITION BY (cliente_id, cliente_nombre) sigue agrupando cliente único.
--    Como el delta interno es per-fila, los totales también heredan el fix
--    same-period (los valores per-empresa ya vienen filtrados por max_mes).
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
    COUNT(*)                   OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS empresas_count,
    SUM(compras_ytd)           OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS total_compras_ytd,
    SUM(compras_anio_anterior) OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS total_compras_prev,
    MAX(ultima_compra)         OVER (PARTITION BY cliente_id, cliente_nombre)                                           AS ultima_compra_agg,
    ROW_NUMBER()               OVER (PARTITION BY cliente_id, cliente_nombre ORDER BY compras_ytd DESC NULLS LAST)      AS rn
  FROM clientes_empresa_12m_vw
) ranked
WHERE rn = 1
ORDER BY ultima_compra_agg DESC NULLS LAST;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Refresh inicial + permisos
--    Este REFRESH es non-concurrent (requerido para primera población).
--    Refrescos posteriores pueden usar CONCURRENTLY gracias al UNIQUE index.
-- ─────────────────────────────────────────────────────────────────────────────

REFRESH MATERIALIZED VIEW clientes_empresa_12m_vw;

GRANT SELECT ON clientes_empresa_12m_vw  TO service_role;
GRANT SELECT ON clientes_agregado_12m_vw TO service_role;
