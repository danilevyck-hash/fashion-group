-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ventas_meta_sugerida_v2 + ventas_proyeccion_cierre_v2
--
-- Cambios vs v1 (que se DROPEAN):
--
-- 1) ritmo_historico cappeado a [-0.30, +0.50] DESPUÉS del weighted 3-2-1.
--    Motivo: empresas con histórico ruidoso (Y-4 cerca de cero, outliers,
--    arranques tempranos de operación) generan crecimientos extremos
--    (+13568% en Active Wear, +827% en Confecciones Boston) que aunque el
--    clamp final [0.90, 1.25] los neutraliza, distorsionan el cálculo del
--    factor combinado de proyección donde se mezcla con ritmo_actual.
--    Cappear el histórico ANTES de mezclar mantiene la señal pero limita
--    el ruido. Rango -30%..+50% cubre el espacio de crecimientos creíbles
--    para una empresa establecida.
--
-- 2) Status de proyección considera ritmo_actual:
--    - rojo    si proyeccion < meta×0.95  O  ritmo_actual < 0.85
--    - amarillo si proyeccion entre meta×0.95 y meta  Y  ritmo_actual >= 0.85
--    - verde   si proyeccion >= meta  Y  ritmo_actual >= 0.85
--    - gris    si sin meta o sin historia
--    Motivo: una proyección que cumple la meta pero con ritmo actual cayendo
--    fuerte (ej. -40% YTD) no merece "verde tranquilizador". El ritmo actual
--    es señal de riesgo aún cuando la base permite proyección optimista.
--    Edge case: ritmo_actual NULL (sin prev YTD comparable) → ignora la
--    condición de ritmo y evalúa sólo con proyección vs meta (regla v1).
--
-- Escape hatch _v2: patron habitual del proyecto (multifashion_dia_a_dia_v4,
-- multifashion_vendedoras_v3, multifashion_mensual_v3) — renombrar fuerza
-- a PostgREST/Vercel a salir de caches stale.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS ventas_meta_sugerida_v1(int);
DROP FUNCTION IF EXISTS ventas_proyeccion_cierre_v1(int);
DROP FUNCTION IF EXISTS ventas_meta_sugerida_v2(int);
DROP FUNCTION IF EXISTS ventas_proyeccion_cierre_v2(int);

-- _empresa_nombre ya existe desde la migration anterior; no la tocamos.

-- ─── A1) ventas_meta_sugerida_v2 ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_meta_sugerida_v2(p_anio int)
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
  ritmo_raw AS (
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
      END AS ritmo_historico_raw,
      CASE
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL AND c3 IS NOT NULL THEN 3
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL THEN 2
        WHEN c1 IS NOT NULL THEN 1
        ELSE 0
      END AS historia_disponible
    FROM crec c
  ),
  -- Cap del ritmo histórico [-0.30, +0.50] ANTES de aplicar atenuación + factor.
  -- Limita el efecto de outliers en años de poca data sin descartar la señal.
  ritmo AS (
    SELECT
      r.empresa,
      r.v_prev,
      r.historia_disponible,
      CASE WHEN r.ritmo_historico_raw IS NULL THEN NULL
           ELSE LEAST(0.50, GREATEST(-0.30, r.ritmo_historico_raw))
      END AS ritmo_historico
    FROM ritmo_raw r
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

GRANT EXECUTE ON FUNCTION ventas_meta_sugerida_v2(int) TO service_role;

-- ─── A2) ventas_proyeccion_cierre_v2 ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_proyeccion_cierre_v2(p_anio int)
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
  ytd_cur AS (
    SELECT empresa, COALESCE(SUM(subtotal), 0)::numeric AS ventas_ytd
    FROM ventas_raw
    WHERE anio = p_anio AND fecha <= v_fecha_corte
    GROUP BY empresa
  ),
  ytd_prev AS (
    SELECT empresa, COALESCE(SUM(subtotal), 0)::numeric AS ventas_prev_ytd_sp
    FROM ventas_raw
    WHERE anio = p_anio - 1
      AND fecha <= (v_fecha_corte - INTERVAL '1 year')::date
    GROUP BY empresa
  ),
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
  ritmo_hist_raw AS (
    SELECT
      c.empresa, c.v_prev,
      CASE
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL AND c3 IS NOT NULL
          THEN (c1*3 + c2*2 + c3*1) / 6
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL
          THEN (c1*3 + c2*2) / 5
        WHEN c1 IS NOT NULL THEN c1
        ELSE NULL
      END AS ritmo_historico_raw,
      CASE
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL AND c3 IS NOT NULL THEN 3
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL THEN 2
        WHEN c1 IS NOT NULL THEN 1
        ELSE 0
      END AS historia_disponible
    FROM crec c
  ),
  -- Cap [-0.30, +0.50] del ritmo histórico antes de mezclar con ritmo_actual.
  ritmo_hist AS (
    SELECT
      r.empresa, r.v_prev, r.historia_disponible,
      CASE WHEN r.ritmo_historico_raw IS NULL THEN NULL
           ELSE LEAST(0.50, GREATEST(-0.30, r.ritmo_historico_raw))
      END AS ritmo_historico
    FROM ritmo_hist_raw r
  ),
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
  metas_manuales AS (
    SELECT empresa AS nombre_display, meta::numeric AS meta_anual
    FROM ventas_metas WHERE anio = p_anio
  ),
  proyectado AS (
    SELECT
      f.*,
      mm.meta_anual,
      CASE
        WHEN f.ritmo_historico IS NULL AND f.ritmo_actual IS NULL THEN NULL
        WHEN f.ritmo_historico IS NULL THEN
          LEAST(1.25, GREATEST(0.90, 1 + (f.ritmo_actual - 1) * 0.7))
        WHEN f.ritmo_actual IS NULL THEN
          LEAST(1.25, GREATEST(0.90, 1 + f.ritmo_historico * 0.7))
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
        -- Status v2: combina proyección vs meta + ritmo actual real.
        -- ritmo_actual NULL → fallback a regla v1 (solo proyección vs meta).
        'status', CASE
          -- Gris: sin meta válida o sin proyección válida o fallback lineal
          WHEN f.meta_anual IS NULL OR f.meta_anual <= 0
            OR f.proyeccion_cierre IS NULL OR f.proyeccion_cierre <= 0
            OR f.es_fallback_lineal
            THEN 'gris'
          -- Rojo: cae cualquiera de las dos condiciones (ritmo actual o proyección)
          WHEN f.proyeccion_cierre < f.meta_anual * 0.95
            OR (f.ritmo_actual IS NOT NULL AND f.ritmo_actual < 0.85)
            THEN 'rojo'
          -- A partir de acá proyeccion >= meta*0.95 Y (ritmo_actual NULL o >= 0.85).
          -- Verde: proyeccion >= meta. Si ritmo_actual NULL, lo permitimos
          -- (no podemos validar pero proyección sí cumple).
          WHEN f.proyeccion_cierre >= f.meta_anual THEN 'verde'
          -- Amarillo: el resto del rango entre meta*0.95 y meta.
          ELSE 'amarillo'
        END
      )
      ORDER BY f.empresa
    )
  INTO v_empresas
  FROM finales f;

  -- Totales del grupo. Para el status del grupo replicamos la nueva regla
  -- pero con el ritmo_actual ponderado por ventas_ytd (no un promedio simple).
  WITH g AS (
    SELECT
      SUM((e->>'ventas_ytd')::numeric)        AS ventas_ytd,
      SUM((e->>'proyeccion_cierre')::numeric) AS proyeccion_cierre,
      SUM(COALESCE((e->>'meta_anual')::numeric, 0)) AS meta_total,
      SUM((e->>'ventas_prev_ytd_sp')::numeric) AS ventas_prev_ytd_sp_total
    FROM jsonb_array_elements(COALESCE(v_empresas, '[]'::jsonb)) e
  ),
  g2 AS (
    SELECT g.*,
      CASE WHEN g.ventas_prev_ytd_sp_total > 0
        THEN g.ventas_ytd / g.ventas_prev_ytd_sp_total
        ELSE NULL
      END AS ritmo_actual_grupo
    FROM g
  )
  SELECT jsonb_build_object(
    'ventas_ytd',          COALESCE(g2.ventas_ytd, 0),
    'proyeccion_cierre',   COALESCE(g2.proyeccion_cierre, 0),
    'proyeccion_restante', GREATEST(0, COALESCE(g2.proyeccion_cierre, 0) - COALESCE(g2.ventas_ytd, 0)),
    'meta_total',          COALESCE(g2.meta_total, 0),
    'ritmo_actual_grupo',  g2.ritmo_actual_grupo,
    'gap_vs_meta',         CASE WHEN g2.meta_total > 0
                              THEN g2.proyeccion_cierre - g2.meta_total ELSE NULL END,
    'status', CASE
      WHEN COALESCE(g2.meta_total, 0) <= 0 THEN 'gris'
      WHEN g2.proyeccion_cierre < g2.meta_total * 0.95
        OR (g2.ritmo_actual_grupo IS NOT NULL AND g2.ritmo_actual_grupo < 0.85)
        THEN 'rojo'
      WHEN g2.proyeccion_cierre >= g2.meta_total THEN 'verde'
      ELSE 'amarillo'
    END
  )
  INTO v_grupo
  FROM g2;

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

GRANT EXECUTE ON FUNCTION ventas_proyeccion_cierre_v2(int) TO service_role;

NOTIFY pgrst, 'reload schema';
