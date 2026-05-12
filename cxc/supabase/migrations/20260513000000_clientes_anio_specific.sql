-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: clientes_anio(p_year, p_empresa) — vista año-específica
--
-- Sirve al tab Clientes del módulo Ventas cuando selectedYear != año actual.
-- Las materialized views clientes_empresa_12m_vw y clientes_agregado_12m_vw
-- siguen siendo la fuente para el año en curso (rolling 12 meses); esta RPC
-- es el complemento para años cerrados (filtrar por compras en p_year).
--
-- Modos:
--   - p_empresa IS NULL  → modo "Todas" (B2B only, empresas_breakdown)
--   - p_empresa = 'vistana' (o cualquier key) → modo per-empresa
--
-- Same-period delta:
--   - Si p_year == año calendario actual → max_mes = MAX(mes WHERE anio=p_year)
--     y compara cur-vs-prev con mes <= max_mes en ambos lados.
--   - Si p_year < año actual (cerrado) → max_mes = 12, full year vs full year.
--
-- Universo: clientes con compras > 0 en p_year (cualquier empresa o la
-- especificada). El delta vs p_year-1 puede ser null si no hubo prev data.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION clientes_anio(
  p_year    integer,
  p_empresa text DEFAULT NULL
)
RETURNS TABLE (
  cliente_norm           text,
  cliente_id             uuid,
  cliente_nombre         text,
  cliente_codigo         text,
  empresa                text,
  compras_ytd            numeric,
  compras_anio_anterior  numeric,
  delta_vs_2025          numeric,
  ultima_compra          date,
  whatsapp               text,
  empresas_count         bigint,
  empresas_breakdown     jsonb
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_year_now int;
  v_max_mes  int;
  v_is_todas boolean;
BEGIN
  v_year_now := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_is_todas := (p_empresa IS NULL OR p_empresa = 'todas');

  -- max_mes: para año actual = último mes con data; para año cerrado = 12
  IF p_year = v_year_now THEN
    SELECT COALESCE(MAX(mes), 12) INTO v_max_mes
    FROM ventas_raw
    WHERE anio = p_year;
  ELSE
    v_max_mes := 12;
  END IF;

  RETURN QUERY
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
        ) AS c_norm
      FROM ventas_raw r
      WHERE r.cliente IS NOT NULL
    ),
    filtered AS (
      SELECT *
      FROM normalized n
      WHERE n.c_norm NOT IN (
        'CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON',
        'CONTADO', 'VENTAS', '(Sin nombre)'
      )
      -- Filtro por empresa para modo per-empresa. Modo todas (B2B only)
      -- aplica el filtro NOT IN retail más abajo en b2b_subset.
      AND (NOT v_is_todas OR n.empresa NOT IN ('confecciones_boston', 'american_classic'))
      AND (v_is_todas OR n.empresa = p_empresa)
    ),
    ytd_actual AS (
      SELECT f.c_norm, f.empresa, SUM(f.subtotal) AS compras_ytd
      FROM filtered f
      WHERE f.anio = p_year AND f.mes <= v_max_mes
      GROUP BY f.c_norm, f.empresa
    ),
    prev_year AS (
      SELECT f.c_norm, f.empresa, SUM(f.subtotal) AS compras_prev
      FROM filtered f
      WHERE f.anio = p_year - 1 AND f.mes <= v_max_mes
      GROUP BY f.c_norm, f.empresa
    ),
    ultima AS (
      SELECT f.c_norm, f.empresa, MAX(f.fecha) AS ultima_compra
      FROM filtered f
      WHERE f.anio <= p_year
      GROUP BY f.c_norm, f.empresa
    ),
    -- Pares (cliente, empresa) que aparecen en el universo del año
    active_pairs AS (
      SELECT DISTINCT y.c_norm, y.empresa
      FROM ytd_actual y
    ),
    per_empresa_row AS (
      SELECT
        ap.c_norm                                                        AS cliente_norm,
        m.id                                                             AS cliente_id,
        COALESCE(m.nombre, ap.c_norm)                                    AS cliente_nombre,
        COALESCE(m.codigo, '—')                                          AS cliente_codigo,
        ap.empresa                                                       AS empresa,
        COALESCE(ya.compras_ytd, 0)::numeric                             AS compras_ytd,
        COALESCE(py.compras_prev, 0)::numeric                            AS compras_anio_anterior,
        CASE
          WHEN COALESCE(py.compras_prev, 0) > 0
            THEN ((COALESCE(ya.compras_ytd, 0) - py.compras_prev) / py.compras_prev)::numeric
          ELSE NULL
        END                                                              AS delta_vs_2025,
        u.ultima_compra                                                  AS ultima_compra,
        COALESCE(NULLIF(m.celular, ''), NULLIF(m.telefono, ''))          AS whatsapp
      FROM active_pairs ap
      LEFT JOIN ytd_actual ya ON ya.c_norm = ap.c_norm AND ya.empresa = ap.empresa
      LEFT JOIN prev_year  py ON py.c_norm = ap.c_norm AND py.empresa = ap.empresa
      LEFT JOIN ultima     u  ON u.c_norm  = ap.c_norm AND u.empresa  = ap.empresa
      LEFT JOIN clientes_master m ON m.nombre_normalized = ap.c_norm AND m.deleted = false
    )
  SELECT
    pe.cliente_norm,
    pe.cliente_id,
    pe.cliente_nombre,
    pe.cliente_codigo,
    pe.empresa,
    -- Modo per-empresa: devolver per fila; modo todas: agregado window per (cliente_id, cliente_nombre)
    CASE
      WHEN v_is_todas
        THEN SUM(pe.compras_ytd) OVER (PARTITION BY pe.cliente_id, pe.cliente_nombre)
      ELSE pe.compras_ytd
    END                                                                   AS compras_ytd,
    CASE
      WHEN v_is_todas
        THEN SUM(pe.compras_anio_anterior) OVER (PARTITION BY pe.cliente_id, pe.cliente_nombre)
      ELSE pe.compras_anio_anterior
    END                                                                   AS compras_anio_anterior,
    CASE
      WHEN v_is_todas THEN
        CASE
          WHEN SUM(pe.compras_anio_anterior) OVER (PARTITION BY pe.cliente_id, pe.cliente_nombre) > 0
            THEN (
              SUM(pe.compras_ytd) OVER (PARTITION BY pe.cliente_id, pe.cliente_nombre)
              - SUM(pe.compras_anio_anterior) OVER (PARTITION BY pe.cliente_id, pe.cliente_nombre)
            ) / SUM(pe.compras_anio_anterior) OVER (PARTITION BY pe.cliente_id, pe.cliente_nombre)
          ELSE NULL
        END
      ELSE pe.delta_vs_2025
    END                                                                   AS delta_vs_2025,
    CASE
      WHEN v_is_todas
        THEN MAX(pe.ultima_compra) OVER (PARTITION BY pe.cliente_id, pe.cliente_nombre)
      ELSE pe.ultima_compra
    END                                                                   AS ultima_compra,
    pe.whatsapp,
    CASE
      WHEN v_is_todas
        THEN COUNT(*) OVER (PARTITION BY pe.cliente_id, pe.cliente_nombre)
      ELSE 1::bigint
    END                                                                   AS empresas_count,
    CASE
      WHEN v_is_todas THEN (
        SELECT jsonb_agg(
          jsonb_build_object('empresa', e.empresa, 'monto', e.compras_ytd)
          ORDER BY e.compras_ytd DESC NULLS LAST
        )
        FROM per_empresa_row e
        WHERE e.cliente_id IS NOT DISTINCT FROM pe.cliente_id
          AND e.cliente_nombre = pe.cliente_nombre
      )
      ELSE NULL
    END                                                                   AS empresas_breakdown
  FROM per_empresa_row pe
  -- Modo todas: deduplicar por cliente (nos quedamos con la fila de mayor ytd)
  WHERE
    NOT v_is_todas
    OR pe.empresa = (
      SELECT e.empresa FROM per_empresa_row e
      WHERE e.cliente_id IS NOT DISTINCT FROM pe.cliente_id
        AND e.cliente_nombre = pe.cliente_nombre
      ORDER BY e.compras_ytd DESC NULLS LAST
      LIMIT 1
    )
  ORDER BY ultima_compra DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION clientes_anio(integer, text) TO service_role;

NOTIFY pgrst, 'reload schema';
