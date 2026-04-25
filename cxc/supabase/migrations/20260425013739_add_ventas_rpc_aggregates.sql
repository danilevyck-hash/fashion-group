-- Migration: agregaciones server-side para módulo de ventas
--
-- Reemplaza paginación JS (que truncaba silenciosamente por timeout en Vercel
-- serverless) con 4 funciones SQL que hacen las agregaciones en Postgres.
-- Resuelve:
--   - /api/ventas/v2/status truncando a ~20,629 filas (45 páginas secuenciales)
--   - /api/ventas/v2 perdiendo abril 2026 del dashboard (currentRows ordenado
--     ASC, las filas más nuevas quedaban al final de la paginación y se cortaban)
--
-- Convenciones replicadas del JS:
--   * Empresas retail excluidas por KEY: 'boston', 'american_classic'
--     (el JS las identifica por display name post-mapEmpresa, equivalente).
--   * Clientes internos: CONFECCIONES BOSTON, MULTI FASHION HOLDING,
--     MULTIFASHION, BOSTON.
--   * Clientes genéricos: CONTADO, VENTAS, (Sin nombre).
--   * normalizeName JS: UPPER + remove [.,] + collapse \s+ + trim.
--
-- Ver docs/known-debt.md tras commit para inconsistencias preservadas (deuda 1-4).

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 1 — ventas_status_summary
-- Alimenta los cards de /upload?tab=ventas. Una fila por empresa.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_status_summary()
RETURNS TABLE (
  empresa text,
  last_fecha date,
  last_uploaded timestamptz,
  total_count bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    empresa,
    MAX(fecha)::date AS last_fecha,
    MAX(uploaded_at) AS last_uploaded,
    COUNT(*)::bigint AS total_count
  FROM ventas_raw
  GROUP BY empresa
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 2 — ventas_dashboard_summary
-- Alimenta byEmpresaMes y prevYear del dashboard /ventas.
-- Devuelve KEYS de empresa (el endpoint hace mapEmpresa después).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_dashboard_summary(p_anio int)
RETURNS TABLE (
  empresa text,
  mes int,
  total_subtotal numeric,
  total_costo numeric,
  total_utilidad numeric,
  total_facturado numeric,
  filas bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    empresa,
    mes,
    SUM(subtotal)::numeric AS total_subtotal,
    SUM(costo)::numeric AS total_costo,
    SUM(utilidad)::numeric AS total_utilidad,
    SUM(total)::numeric AS total_facturado,
    COUNT(*)::bigint AS filas
  FROM ventas_raw
  WHERE anio = p_anio
  GROUP BY empresa, mes
  ORDER BY empresa, mes
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 3 — ventas_topclientes_summary
-- Top N clientes del año por subtotal. Replica aggregateTopClientes (JS):
--   - NO filtra CLIENTES_INTERNOS ni CLIENTES_GENERICOS (ver deuda 1).
--   - NO filtra empresa retail.
--   - Agrupa por normalizeName(cliente) || '(Sin nombre)'.
--   - Sort subtotal DESC, slice top N.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_topclientes_summary(
  p_anio int,
  p_top int DEFAULT 10
)
RETURNS TABLE (
  cliente text,
  total_subtotal numeric,
  total_utilidad numeric
)
LANGUAGE sql STABLE AS $$
  WITH normalized AS (
    SELECT
      COALESCE(
        NULLIF(
          TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(cliente), '[.,]', '', 'g'), '\s+', ' ', 'g')),
          ''
        ),
        '(Sin nombre)'
      ) AS cliente_norm,
      subtotal,
      utilidad
    FROM ventas_raw
    WHERE anio = p_anio
  )
  SELECT
    cliente_norm,
    SUM(subtotal)::numeric,
    SUM(utilidad)::numeric
  FROM normalized
  GROUP BY cliente_norm
  ORDER BY SUM(subtotal) DESC
  LIMIT p_top
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 4 — ventas_clientes_detalle_summary
-- Replica aggregateClientesDetalle (JS) bit-by-bit. Tabla de clientes con:
--   - subtotal_actual / utilidad_actual: año actual filtrado por desde,
--     excluye empresa retail (boston, american_classic) y CLIENTES_INTERNOS.
--   - prev_subtotal: año anterior, excluye SOLO CLIENTES_INTERNOS
--     (no excluye empresa retail — comportamiento JS preservado, ver deuda 2).
--   - last_fecha / last12m_total: últimos 12 meses, excluye empresa retail,
--     CLIENTES_INTERNOS y CLIENTES_GENERICOS.
--   - is_inactive: last_fecha < hoy-60d AND last12m_total >= 5000
--     AND cliente NOT IN GENERICOS.
--   - empresas (jsonb): sub-agregación por (cliente, empresa) del año actual
--     filtrado, ordenado por subtotal desc. Empresas en KEY (no display).
--
-- Incluye clientes con last_fecha pero sin ventas año actual (subtotal_actual=0)
-- para el feature "zero-sales merge" del JS (línea 146-150).
-- Preserva clientes GENERICOS si tienen ventas año actual (deuda 3, OR
-- subtotal_actual > 0 al final del WHERE).
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
      AND empresa NOT IN ('boston', 'american_classic')
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
  -- Comportamiento JS preservado (deuda 2).
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
      AND empresa NOT IN ('boston', 'american_classic')
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
  -- Replica JS line 134 (skip CLIENTES_INTERNOS en map principal) ya aplicado
  -- vía current_filtered + last12m_filtered.
  -- Preserva GENERICOS si tienen ventas año actual (deuda 3): OR subtotal_actual > 0
  WHERE COALESCE(c.cliente_norm, l.cliente_norm) NOT IN ('CONTADO', 'VENTAS', '(Sin nombre)')
     OR COALESCE(c.subtotal_actual, 0) > 0
  ORDER BY COALESCE(c.subtotal_actual, 0) DESC
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Permisos
-- ─────────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION ventas_status_summary() TO service_role;
GRANT EXECUTE ON FUNCTION ventas_dashboard_summary(int) TO service_role;
GRANT EXECUTE ON FUNCTION ventas_topclientes_summary(int, int) TO service_role;
GRANT EXECUTE ON FUNCTION ventas_clientes_detalle_summary(int, date, date, date) TO service_role;
