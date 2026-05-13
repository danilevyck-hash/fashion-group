-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ventas_meta_sugerida_v1 + ventas_proyeccion_cierre_v1
--
-- Dos RPCs para alimentar:
--   1) La página /ventas/metas (Configurar metas) con una meta sugerida
--      automática basada en histórico ponderado 3-2-1 (años recientes pesan
--      más). Atenuación 0.7 + clamp [0.90, 1.25] evita extrapolaciones
--      agresivas en ambas direcciones.
--   2) El tab Resumen con la proyección de cierre del grupo + por empresa.
--      Mezcla "ritmo actual" (YTD cur vs YTD prev same-period) con "ritmo
--      histórico" pesado por el avance del año (mes_corte/12). A más datos
--      del año actual, más peso al ritmo actual; al inicio del año domina
--      el histórico.
--
-- Convenciones:
--   - empresa = key snake_case canónica de ventas_raw (vistana, fashion_wear...).
--   - nombre  = display name ("Vistana International" etc.) — se usa para
--     joinear con ventas_metas que guarda el display name.
--   - ventas_raw.anio existe; lo usamos en vez de EXTRACT por performance.
--   - status del semáforo:
--       verde    → proyeccion >= meta
--       amarillo → proyeccion entre meta×0.95 y meta
--       rojo     → proyeccion <  meta×0.95
--       gris     → sin meta o sin historia (proyección lineal de fallback)
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS ventas_meta_sugerida_v1(int);
DROP FUNCTION IF EXISTS ventas_proyeccion_cierre_v1(int);
DROP FUNCTION IF EXISTS _empresa_nombre(text);

-- Helper: empresa key snake_case → display name. Necesario porque
-- ventas_metas guarda el display name; lookups requieren mapping bidireccional.
CREATE OR REPLACE FUNCTION _empresa_nombre(p_key text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_key
    WHEN 'vistana' THEN 'Vistana International'
    WHEN 'fashion_wear' THEN 'Fashion Wear'
    WHEN 'fashion_shoes' THEN 'Fashion Shoes'
    WHEN 'active_shoes' THEN 'Active Shoes'
    WHEN 'active_wear' THEN 'Active Wear'
    WHEN 'joystep' THEN 'Joystep'
    WHEN 'confecciones_boston' THEN 'Confecciones Boston'
    WHEN 'american_classic' THEN 'Multifashion'
    ELSE p_key
  END;
$$;

GRANT EXECUTE ON FUNCTION _empresa_nombre(text) TO service_role;

-- ─── A1) ventas_meta_sugerida_v1 ────────────────────────────────────────────
-- Por cada empresa:
--   - ventas_prev_year   = total ventas del año p_anio-1
--   - crecimientos       c1..c3 con pesos 3-2-1 (años más recientes pesan más)
--   - ritmo_historico    = weighted avg de los crecimientos disponibles
--   - factor             = 1 + ritmo_historico * 0.7  (atenuación)
--   - factor_final       = clamp(0.90, 1.25)
--   - meta_sugerida      = ventas_prev_year * factor_final
--   - meta_manual_actual = lookup en ventas_metas (NULL si no hay)
--   - historia_disponible= cantidad de crecimientos efectivos (0..3)
--
-- Si historia_disponible = 0 → meta_sugerida = NULL (requiere captura manual).
-- Si ventas_prev_year = 0   → meta_sugerida = NULL (no hay base sobre la cual
--                              proyectar; se considera "empresa nueva").

CREATE OR REPLACE FUNCTION ventas_meta_sugerida_v1(p_anio int)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH
  totales AS (
    SELECT empresa, anio, SUM(subtotal)::numeric AS total
    FROM ventas_raw
    WHERE anio < p_anio
    GROUP BY empresa, anio
    HAVING SUM(subtotal) > 0
  ),
  empresas_set AS (
    SELECT DISTINCT empresa FROM ventas_raw
    WHERE empresa IS NOT NULL
  ),
  -- t0=p_anio-1, t1=p_anio-2, t2=p_anio-3, t3=p_anio-4
  -- c1 = t0/t1 - 1 (peso 3)
  -- c2 = t1/t2 - 1 (peso 2)
  -- c3 = t2/t3 - 1 (peso 1)
  crec AS (
    SELECT
      e.empresa,
      t0.total AS v_prev,
      CASE WHEN t0.total IS NOT NULL AND t1.total > 0
        THEN t0.total / t1.total - 1 ELSE NULL END AS c1,
      CASE WHEN t1.total IS NOT NULL AND t2.total > 0
        THEN t1.total / t2.total - 1 ELSE NULL END AS c2,
      CASE WHEN t2.total IS NOT NULL AND t3.total > 0
        THEN t2.total / t3.total - 1 ELSE NULL END AS c3
    FROM empresas_set e
    LEFT JOIN totales t0 ON t0.empresa = e.empresa AND t0.anio = p_anio - 1
    LEFT JOIN totales t1 ON t1.empresa = e.empresa AND t1.anio = p_anio - 2
    LEFT JOIN totales t2 ON t2.empresa = e.empresa AND t2.anio = p_anio - 3
    LEFT JOIN totales t3 ON t3.empresa = e.empresa AND t3.anio = p_anio - 4
  ),
  ritmo AS (
    SELECT
      c.empresa,
      c.v_prev,
      CASE
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL AND c3 IS NOT NULL
          THEN (c1 * 3 + c2 * 2 + c3 * 1) / 6
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL
          THEN (c1 * 3 + c2 * 2) / 5
        WHEN c1 IS NOT NULL
          THEN c1
        ELSE NULL
      END AS ritmo_historico,
      CASE
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL AND c3 IS NOT NULL THEN 3
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL THEN 2
        WHEN c1 IS NOT NULL THEN 1
        ELSE 0
      END AS historia_disponible
    FROM crec c
  ),
  metas_manuales AS (
    SELECT empresa AS nombre_display, meta::numeric AS meta_manual
    FROM ventas_metas WHERE anio = p_anio
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'empresa', r.empresa,
      'nombre', _empresa_nombre(r.empresa),
      'ventas_prev_year',     COALESCE(r.v_prev, 0),
      'historia_disponible',  r.historia_disponible,
      'ritmo_historico',      r.ritmo_historico,
      'factor_final', CASE
        WHEN r.ritmo_historico IS NULL THEN NULL
        ELSE LEAST(1.25, GREATEST(0.90, 1 + r.ritmo_historico * 0.7))
      END,
      'meta_sugerida', CASE
        WHEN r.ritmo_historico IS NULL OR COALESCE(r.v_prev, 0) <= 0 THEN NULL
        ELSE r.v_prev * LEAST(1.25, GREATEST(0.90, 1 + r.ritmo_historico * 0.7))
      END,
      'meta_manual_actual', mm.meta_manual
    )
    ORDER BY r.empresa
  )
  INTO v_result
  FROM ritmo r
  LEFT JOIN metas_manuales mm ON mm.nombre_display = _empresa_nombre(r.empresa);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION ventas_meta_sugerida_v1(int) TO service_role;

-- ─── A2) ventas_proyeccion_cierre_v1 ─────────────────────────────────────────
-- Por cada empresa:
--   - ventas_ytd            = SUM(subtotal) p_anio hasta MAX(fecha)
--   - ventas_prev_ytd_sp    = SUM(subtotal) p_anio-1 con cap al mismo día (same-period)
--   - ritmo_actual          = ventas_ytd / ventas_prev_ytd_sp (NULL si denom=0)
--   - ritmo_historico       = weighted 3-2-1 (mismo cálculo que A1)
--   - peso_ritmo            = mes_corte / 12
--   - peso_historico        = 1 - peso_ritmo
--   - factor                = ritmo_actual*peso_ritmo + ritmo_historico*peso_historico
--   - factor_atenuado       = 1 + (factor - 1) * 0.7
--   - factor_final          = clamp(0.90, 1.25)
--   - proyeccion_cierre     = ventas_prev_year * factor_final
--   - meta_anual            = lookup ventas_metas
--   - gap_vs_meta           = proyeccion_cierre - meta_anual
--   - status                = verde/amarillo/rojo/gris según gap
--
-- Empresas sin historia: fallback lineal = ventas_ytd * 12 / mes_corte, status='gris'.
-- mes_corte = mes del MAX día con data del año actual del grupo (NO per-empresa
-- para que el peso del ritmo actual vs histórico sea coherente cross-empresa).

CREATE OR REPLACE FUNCTION ventas_proyeccion_cierre_v1(p_anio int)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_fecha_corte date;
  v_mes_corte   int;
  v_peso_ritmo      numeric;
  v_peso_historico  numeric;
  v_empresas        jsonb;
  v_grupo           jsonb;
BEGIN
  SELECT MAX(fecha) INTO v_fecha_corte
  FROM ventas_raw
  WHERE anio = p_anio;

  IF v_fecha_corte IS NULL THEN
    RETURN jsonb_build_object(
      'anio',         p_anio,
      'fecha_corte',  NULL,
      'mes_corte',    0,
      'empresas',     '[]'::jsonb,
      'totales_grupo', jsonb_build_object(
        'ventas_ytd', 0, 'proyeccion_cierre', 0, 'proyeccion_restante', 0,
        'meta_total', 0, 'gap_vs_meta', NULL, 'status', 'gris'
      )
    );
  END IF;

  v_mes_corte      := EXTRACT(MONTH FROM v_fecha_corte)::int;
  v_peso_ritmo     := v_mes_corte::numeric / 12;
  v_peso_historico := 1 - v_peso_ritmo;

  WITH
  -- Totales anuales históricos por empresa
  totales AS (
    SELECT empresa, anio, SUM(subtotal)::numeric AS total
    FROM ventas_raw
    WHERE anio < p_anio
    GROUP BY empresa, anio
    HAVING SUM(subtotal) > 0
  ),
  empresas_set AS (
    SELECT DISTINCT empresa FROM ventas_raw WHERE empresa IS NOT NULL
  ),
  -- YTD year actual
  ytd_cur AS (
    SELECT empresa, COALESCE(SUM(subtotal), 0)::numeric AS ventas_ytd
    FROM ventas_raw
    WHERE anio = p_anio AND fecha <= v_fecha_corte
    GROUP BY empresa
  ),
  -- YTD prev year, same-period (cap al mismo día)
  ytd_prev AS (
    SELECT empresa, COALESCE(SUM(subtotal), 0)::numeric AS ventas_prev_ytd_sp
    FROM ventas_raw
    WHERE anio = p_anio - 1
      AND fecha <= (v_fecha_corte - INTERVAL '1 year')::date
    GROUP BY empresa
  ),
  -- Crecimientos histórico 3-2-1
  crec AS (
    SELECT
      e.empresa,
      t0.total AS v_prev,
      CASE WHEN t0.total IS NOT NULL AND t1.total > 0
        THEN t0.total / t1.total - 1 ELSE NULL END AS c1,
      CASE WHEN t1.total IS NOT NULL AND t2.total > 0
        THEN t1.total / t2.total - 1 ELSE NULL END AS c2,
      CASE WHEN t2.total IS NOT NULL AND t3.total > 0
        THEN t2.total / t3.total - 1 ELSE NULL END AS c3
    FROM empresas_set e
    LEFT JOIN totales t0 ON t0.empresa = e.empresa AND t0.anio = p_anio - 1
    LEFT JOIN totales t1 ON t1.empresa = e.empresa AND t1.anio = p_anio - 2
    LEFT JOIN totales t2 ON t2.empresa = e.empresa AND t2.anio = p_anio - 3
    LEFT JOIN totales t3 ON t3.empresa = e.empresa AND t3.anio = p_anio - 4
  ),
  ritmo_hist AS (
    SELECT
      c.empresa, c.v_prev,
      CASE
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL AND c3 IS NOT NULL
          THEN (c1*3 + c2*2 + c3*1) / 6
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL
          THEN (c1*3 + c2*2) / 5
        WHEN c1 IS NOT NULL THEN c1
        ELSE NULL
      END AS ritmo_historico,
      CASE
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL AND c3 IS NOT NULL THEN 3
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL THEN 2
        WHEN c1 IS NOT NULL THEN 1
        ELSE 0
      END AS historia_disponible
    FROM crec c
  ),
  -- Ritmo actual + factor combinado
  factor_calc AS (
    SELECT
      e.empresa,
      COALESCE(yc.ventas_ytd, 0)         AS ventas_ytd,
      COALESCE(yp.ventas_prev_ytd_sp, 0) AS ventas_prev_ytd_sp,
      r.v_prev                            AS ventas_prev_year,
      r.ritmo_historico,
      r.historia_disponible,
      CASE
        WHEN COALESCE(yp.ventas_prev_ytd_sp, 0) > 0
          THEN yc.ventas_ytd / yp.ventas_prev_ytd_sp
        ELSE NULL
      END AS ritmo_actual
    FROM empresas_set e
    LEFT JOIN ytd_cur    yc ON yc.empresa = e.empresa
    LEFT JOIN ytd_prev   yp ON yp.empresa = e.empresa
    LEFT JOIN ritmo_hist r  ON r.empresa  = e.empresa
  ),
  -- Meta manual
  metas_manuales AS (
    SELECT empresa AS nombre_display, meta::numeric AS meta_anual
    FROM ventas_metas WHERE anio = p_anio
  ),
  -- Aplicar factor + clamp + proyección
  proyectado AS (
    SELECT
      f.*,
      mm.meta_anual,
      CASE
        -- Sin historia y sin ritmo actual → fallback lineal
        WHEN f.ritmo_historico IS NULL AND f.ritmo_actual IS NULL THEN NULL
        -- Sin historia: usar ritmo_actual con peso 100%
        WHEN f.ritmo_historico IS NULL THEN
          LEAST(1.25, GREATEST(0.90, 1 + (f.ritmo_actual - 1) * 0.7))
        -- Sin ritmo actual: usar histórico con peso 100%
        WHEN f.ritmo_actual IS NULL THEN
          LEAST(1.25, GREATEST(0.90, 1 + f.ritmo_historico * 0.7))
        -- Caso normal: mezcla ponderada
        ELSE
          LEAST(1.25, GREATEST(0.90, 1 + (
            (f.ritmo_actual * v_peso_ritmo + (1 + f.ritmo_historico) * v_peso_historico) - 1
          ) * 0.7))
      END AS factor_final
    FROM factor_calc f
    LEFT JOIN metas_manuales mm ON mm.nombre_display = _empresa_nombre(f.empresa)
  ),
  finales AS (
    SELECT
      p.*,
      CASE
        WHEN p.factor_final IS NOT NULL AND COALESCE(p.ventas_prev_year, 0) > 0
          THEN p.ventas_prev_year * p.factor_final
        -- Fallback lineal: extrapola lo del año actual
        WHEN v_mes_corte > 0 AND p.ventas_ytd > 0
          THEN p.ventas_ytd * 12.0 / v_mes_corte
        ELSE 0
      END AS proyeccion_cierre,
      (p.factor_final IS NULL) AS es_fallback_lineal
    FROM proyectado p
  )
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'empresa',              f.empresa,
        'nombre',               _empresa_nombre(f.empresa),
        'ventas_ytd',           f.ventas_ytd,
        'ventas_prev_ytd_sp',   f.ventas_prev_ytd_sp,
        'ventas_prev_year',     COALESCE(f.ventas_prev_year, 0),
        'ritmo_actual',         f.ritmo_actual,
        'ritmo_historico',      f.ritmo_historico,
        'historia_disponible',  f.historia_disponible,
        'factor_final',         f.factor_final,
        'proyeccion_cierre',    f.proyeccion_cierre,
        'proyeccion_restante',  GREATEST(0, f.proyeccion_cierre - f.ventas_ytd),
        'meta_anual',           f.meta_anual,
        'gap_vs_meta',          CASE WHEN f.meta_anual IS NOT NULL
                                  THEN f.proyeccion_cierre - f.meta_anual ELSE NULL END,
        'es_fallback_lineal',   f.es_fallback_lineal,
        'status', CASE
          WHEN f.meta_anual IS NULL OR f.meta_anual <= 0
            OR f.proyeccion_cierre IS NULL OR f.proyeccion_cierre <= 0
            OR f.es_fallback_lineal
            THEN 'gris'
          WHEN f.proyeccion_cierre >= f.meta_anual         THEN 'verde'
          WHEN f.proyeccion_cierre >= f.meta_anual * 0.95  THEN 'amarillo'
          ELSE 'rojo'
        END
      )
      ORDER BY f.empresa
    )
  INTO v_empresas
  FROM finales f;

  -- Totales del grupo (agregados)
  WITH g AS (
    SELECT
      SUM((e->>'ventas_ytd')::numeric)         AS ventas_ytd,
      SUM((e->>'proyeccion_cierre')::numeric)  AS proyeccion_cierre,
      SUM(COALESCE((e->>'meta_anual')::numeric, 0)) AS meta_total
    FROM jsonb_array_elements(COALESCE(v_empresas, '[]'::jsonb)) e
  )
  SELECT jsonb_build_object(
    'ventas_ytd',          COALESCE(g.ventas_ytd, 0),
    'proyeccion_cierre',   COALESCE(g.proyeccion_cierre, 0),
    'proyeccion_restante', GREATEST(0, COALESCE(g.proyeccion_cierre, 0) - COALESCE(g.ventas_ytd, 0)),
    'meta_total',          COALESCE(g.meta_total, 0),
    'gap_vs_meta',         CASE WHEN g.meta_total > 0
                              THEN g.proyeccion_cierre - g.meta_total ELSE NULL END,
    'status', CASE
      WHEN COALESCE(g.meta_total, 0) <= 0 THEN 'gris'
      WHEN g.proyeccion_cierre >= g.meta_total           THEN 'verde'
      WHEN g.proyeccion_cierre >= g.meta_total * 0.95    THEN 'amarillo'
      ELSE 'rojo'
    END
  )
  INTO v_grupo
  FROM g;

  RETURN jsonb_build_object(
    'anio',          p_anio,
    'fecha_corte',   to_char(v_fecha_corte, 'YYYY-MM-DD'),
    'mes_corte',     v_mes_corte,
    'peso_ritmo',    v_peso_ritmo,
    'peso_historico', v_peso_historico,
    'empresas',      COALESCE(v_empresas, '[]'::jsonb),
    'totales_grupo', v_grupo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ventas_proyeccion_cierre_v1(int) TO service_role;

NOTIFY pgrst, 'reload schema';
