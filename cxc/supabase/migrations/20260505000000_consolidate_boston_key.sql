-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: consolidar empresa key 'boston' → 'confecciones_boston' en RPC
--
-- CONTEXTO:
-- Después de UPDATE ventas_raw SET empresa='confecciones_boston' WHERE empresa='boston',
-- los RPCs siguen filtrando 'boston' como empresa retail. Este script
-- recrea la función ventas_clientes_detalle_summary con la key correcta.
--
-- Solo cambia 'boston' → 'confecciones_boston' en los filtros NOT IN.
-- Resto de la función idéntico al original (20260425013739_add_ventas_rpc_aggregates.sql).
--
-- Nota: ventas_topclientes_summary NO necesita cambio (no filtra por empresa retail).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_clientes_detalle_summary(
  p_anio int,
  p_desde date,
  p_twelve_months_ago date,
  p_sixty_days_ago date
)
RETURNS TABLE (
  cliente text,
  subtotal_actual numeric,
  utilidad_actual numeric,
  prev_subtotal numeric,
  last_fecha date,
  last12m_total numeric,
  is_inactive boolean,
  empresas jsonb
)
LANGUAGE sql STABLE AS $$
  WITH
  -- Año actual filtrado: excluye empresa retail
  current_raw AS (
    SELECT
      COALESCE(
        NULLIF(
          TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(cliente), '[.,]', '', 'g'), '\s+', ' ', 'g')),
          ''
        ),
        '(Sin nombre)'
      ) AS cliente_norm,
      empresa,
      subtotal,
      utilidad
    FROM ventas_raw
    WHERE anio = p_anio
      AND (p_desde IS NULL OR fecha >= p_desde)
      AND empresa NOT IN ('confecciones_boston', 'american_classic')
  ),
  -- Excluye CLIENTES_INTERNOS para el cálculo principal
  current_filtered AS (
    SELECT *
    FROM current_raw
    WHERE cliente_norm NOT IN (
      'CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON'
    )
  ),
  current_agg AS (
    SELECT
      cliente_norm,
      SUM(subtotal)::numeric AS subtotal_actual,
      SUM(utilidad)::numeric AS utilidad_actual
    FROM current_filtered
    GROUP BY cliente_norm
  ),
  current_empresas AS (
    SELECT
      cliente_norm,
      jsonb_agg(
        jsonb_build_object(
          'empresa', empresa,
          'subtotal', emp_sub,
          'utilidad', emp_util
        )
        ORDER BY emp_sub DESC
      ) AS empresas
    FROM (
      SELECT
        cliente_norm,
        empresa,
        SUM(subtotal)::numeric AS emp_sub,
        SUM(utilidad)::numeric AS emp_util
      FROM current_filtered
      GROUP BY cliente_norm, empresa
    ) e
    GROUP BY cliente_norm
  ),
  -- Año anterior: excluye SOLO CLIENTES_INTERNOS (NO excluye empresa retail).
  prev_year AS (
    SELECT
      COALESCE(
        NULLIF(
          TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(cliente), '[.,]', '', 'g'), '\s+', ' ', 'g')),
          ''
        ),
        '(Sin nombre)'
      ) AS cliente_norm,
      SUM(subtotal)::numeric AS prev_subtotal
    FROM ventas_raw
    WHERE anio = p_anio - 1
    GROUP BY cliente_norm
  ),
  prev_filtered AS (
    SELECT *
    FROM prev_year
    WHERE cliente_norm NOT IN (
      'CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON'
    )
  ),
  -- Últimos 12 meses: excluye empresa retail, INTERNOS y GENERICOS
  last12m AS (
    SELECT
      COALESCE(
        NULLIF(
          TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(cliente), '[.,]', '', 'g'), '\s+', ' ', 'g')),
          ''
        ),
        '(Sin nombre)'
      ) AS cliente_norm,
      MAX(fecha)::date AS last_fecha,
      SUM(subtotal)::numeric AS last12m_total
    FROM ventas_raw
    WHERE fecha >= p_twelve_months_ago
      AND empresa NOT IN ('confecciones_boston', 'american_classic')
    GROUP BY cliente_norm
  ),
  last12m_filtered AS (
    SELECT *
    FROM last12m
    WHERE cliente_norm NOT IN (
      'CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON',
      'CONTADO', 'VENTAS', '(Sin nombre)'
    )
  )
  SELECT
    COALESCE(c.cliente_norm, l.cliente_norm) AS cliente,
    COALESCE(c.subtotal_actual, 0)::numeric AS subtotal_actual,
    COALESCE(c.utilidad_actual, 0)::numeric AS utilidad_actual,
    COALESCE(p.prev_subtotal, 0)::numeric AS prev_subtotal,
    l.last_fecha,
    COALESCE(l.last12m_total, 0)::numeric AS last12m_total,
    (
      l.last_fecha IS NOT NULL
      AND l.last_fecha < p_sixty_days_ago
      AND COALESCE(l.last12m_total, 0) >= 5000
      AND COALESCE(c.cliente_norm, l.cliente_norm) NOT IN ('CONTADO', 'VENTAS', '(Sin nombre)')
    ) AS is_inactive,
    COALESCE(ce.empresas, '[]'::jsonb) AS empresas
  FROM current_agg c
  FULL OUTER JOIN last12m_filtered l ON c.cliente_norm = l.cliente_norm
  LEFT JOIN prev_filtered p ON COALESCE(c.cliente_norm, l.cliente_norm) = p.cliente_norm
  LEFT JOIN current_empresas ce ON c.cliente_norm = ce.cliente_norm
  WHERE COALESCE(c.cliente_norm, l.cliente_norm) NOT IN ('CONTADO', 'VENTAS', '(Sin nombre)')
     OR COALESCE(c.subtotal_actual, 0) > 0
  ORDER BY COALESCE(c.subtotal_actual, 0) DESC
$$;

GRANT EXECUTE ON FUNCTION ventas_clientes_detalle_summary(int, date, date, date) TO service_role;
