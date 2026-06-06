-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Paso 5a (proyecto Fuente Única API) — clientes_anio a switch_facturas
-- + drop de get_ultima_compra (muerta, cero callers).
--
-- clientes_anio sirve al tab Clientes (años cerrados). Leía ventas_raw y joineaba
-- clientes_master POR NOMBRE. Ahora usa la MISMA estructura del Paso 3
-- (clientes_empresa_12m_vw), adaptada al caso año-específico:
--   • Rama B2B: switch_facturas todas las fechas, atribución por ID
--     (cliente_switch_id → switch_clientes.codigo) + fallback por nombre.
--   • Rama no-B2B (boston, american_classic): switch_facturas por nombre.
--   • Grano cliente_key = codigo D-XXX (o '~'||nombre para huérfanos).
--   • Bucket hora-Panamá. Shape de salida (RETURNS TABLE) idéntico.
--
-- INVARIANTE: SUM(compras_ytd/prev) por empresa se conserva; la distribución por
--   cliente del histórico mejora (igual que Paso 3). El costo no aplica acá.
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS get_ultima_compra();

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

  IF p_year = v_year_now THEN
    SELECT COALESCE(MAX(EXTRACT(MONTH FROM (fecha AT TIME ZONE 'America/Panama'))::int), 12)
    INTO v_max_mes
    FROM switch_facturas
    WHERE EXTRACT(YEAR FROM (fecha AT TIME ZONE 'America/Panama'))::int = p_year;
  ELSE
    v_max_mes := 12;
  END IF;

  RETURN QUERY
  WITH
    -- ── Rama A: B2B switch, ID primario + fallback nombre ──────────────────────
    a_raw AS (
      SELECT
        sf.empresa_key AS empresa,
        sf.empresa_key AS empresa_key,
        sf.cliente_switch_id,
        COALESCE(
          NULLIF(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(sf.cliente_nombre), '[.,]', '', 'g'), '\s+', ' ', 'g')), ''),
          '(Sin nombre)'
        ) AS c_norm,
        (sf.fecha AT TIME ZONE 'America/Panama')::date              AS fecha,
        EXTRACT(YEAR  FROM (sf.fecha AT TIME ZONE 'America/Panama'))::int AS anio,
        EXTRACT(MONTH FROM (sf.fecha AT TIME ZONE 'America/Panama'))::int AS mes,
        CASE
          WHEN sf.tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN sf.subtotal_descuento
          WHEN sf.tipo_comprobante = 'Nota de Crédito' THEN -sf.subtotal_descuento
          ELSE 0
        END AS subtotal
      FROM switch_facturas sf
      WHERE sf.empresa_key IN ('vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes', 'active_wear', 'joystep')
        AND sf.cliente_nombre IS NOT NULL
    ),
    src_a AS (
      SELECT
        a.empresa,
        COALESCE(sc.codigo, mc.codigo) AS cliente_codigo,
        a.c_norm, a.fecha, a.anio, a.mes, a.subtotal
      FROM a_raw a
      LEFT JOIN switch_clientes sc
        ON sc.empresa_key = a.empresa_key AND sc.cliente_switch_id = a.cliente_switch_id
      LEFT JOIN clientes_master mc
        ON mc.nombre_normalized = a.c_norm AND mc.deleted = false
    ),
    -- ── Rama B: NO-B2B (boston, american_classic) switch por nombre ────────────
    src_b AS (
      SELECT
        nb.empresa,
        m.codigo AS cliente_codigo,
        nb.c_norm, nb.fecha, nb.anio, nb.mes, nb.subtotal
      FROM (
        SELECT
          sf.empresa_key AS empresa,
          COALESCE(
            NULLIF(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(sf.cliente_nombre), '[.,]', '', 'g'), '\s+', ' ', 'g')), ''),
            '(Sin nombre)'
          ) AS c_norm,
          (sf.fecha AT TIME ZONE 'America/Panama')::date              AS fecha,
          EXTRACT(YEAR  FROM (sf.fecha AT TIME ZONE 'America/Panama'))::int AS anio,
          EXTRACT(MONTH FROM (sf.fecha AT TIME ZONE 'America/Panama'))::int AS mes,
          CASE
            WHEN sf.tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN sf.subtotal_descuento
            WHEN sf.tipo_comprobante = 'Nota de Crédito' THEN -sf.subtotal_descuento
            ELSE 0
          END AS subtotal
        FROM switch_facturas sf
        WHERE sf.empresa_key NOT IN ('vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes', 'active_wear', 'joystep')
          AND sf.cliente_nombre IS NOT NULL
      ) nb
      LEFT JOIN clientes_master m
        ON m.nombre_normalized = nb.c_norm AND m.deleted = false
    ),
    src AS (
      SELECT * FROM src_a
      UNION ALL
      SELECT * FROM src_b
    ),
    filtered AS (
      SELECT *
      FROM src s
      WHERE s.c_norm NOT IN (
        'CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON',
        'CONTADO', 'VENTAS', 'VENTAS LOCALES', '(Sin nombre)'
      )
      AND (NOT v_is_todas OR s.empresa NOT IN ('confecciones_boston', 'american_classic'))
      AND (v_is_todas OR s.empresa = p_empresa)
    ),
    keyed AS (
      SELECT
        f.empresa,
        COALESCE(f.cliente_codigo, '~' || f.c_norm) AS cliente_key,
        f.cliente_codigo,
        f.c_norm,
        f.fecha, f.anio, f.mes, f.subtotal
      FROM filtered f
    ),
    ytd_actual AS (
      SELECT k.cliente_key, k.empresa, SUM(k.subtotal) AS compras_ytd
      FROM keyed k
      WHERE k.anio = p_year AND k.mes <= v_max_mes
      GROUP BY k.cliente_key, k.empresa
    ),
    prev_year AS (
      SELECT k.cliente_key, k.empresa, SUM(k.subtotal) AS compras_prev
      FROM keyed k
      WHERE k.anio = p_year - 1 AND k.mes <= v_max_mes
      GROUP BY k.cliente_key, k.empresa
    ),
    ultima AS (
      SELECT k.cliente_key, k.empresa, MAX(k.fecha) AS ultima_compra
      FROM keyed k
      WHERE k.anio <= p_year
      GROUP BY k.cliente_key, k.empresa
    ),
    ident AS (
      SELECT k.cliente_key, k.empresa,
             MAX(k.cliente_codigo) AS cliente_codigo,
             MIN(k.c_norm)         AS c_norm
      FROM keyed k
      GROUP BY k.cliente_key, k.empresa
    ),
    active_pairs AS (
      SELECT DISTINCT y.cliente_key, y.empresa
      FROM ytd_actual y
    ),
    per_empresa_row AS (
      SELECT
        ap.cliente_key                                                   AS cliente_norm,
        m.id                                                             AS cliente_id,
        COALESCE(m.nombre, id2.c_norm)                                   AS cliente_nombre,
        COALESCE(m.codigo, id2.cliente_codigo, '—')                      AS cliente_codigo,
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
      JOIN      ident      id2 ON id2.cliente_key = ap.cliente_key AND id2.empresa = ap.empresa
      LEFT JOIN ytd_actual ya  ON ya.cliente_key  = ap.cliente_key AND ya.empresa  = ap.empresa
      LEFT JOIN prev_year  py  ON py.cliente_key  = ap.cliente_key AND py.empresa  = ap.empresa
      LEFT JOIN ultima     u   ON u.cliente_key   = ap.cliente_key AND u.empresa   = ap.empresa
      LEFT JOIN clientes_master m ON m.codigo = id2.cliente_codigo AND m.deleted = false
    )
  SELECT
    pe.cliente_norm,
    pe.cliente_id,
    pe.cliente_nombre,
    pe.cliente_codigo,
    pe.empresa,
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
