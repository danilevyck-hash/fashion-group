-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ventas_proyeccion_cierre_v4 — meta efectiva auto-aplicada.
--
-- Cambio vs v3:
--   meta_efectiva = COALESCE(meta_manual, meta_sugerida_inline)
--
--   El status del semáforo y gap_vs_meta usan meta_efectiva en lugar de
--   meta_anual (manual). Si el usuario no configuró manualmente la meta,
--   automáticamente se usa la sugerida histórica (cap [-0.30, +0.50], factor
--   atenuado 0.7, clamp final [0.90, 1.25]).
--
-- Campos nuevos en el JSON de cada empresa:
--   meta_anual_manual   — valor de ventas_metas (null si no hay override)
--   meta_sugerida       — calculado inline desde el histórico
--   meta_efectiva       — COALESCE(manual, sugerida) — la que usa el status
--   meta_anual          — alias = meta_efectiva (retrocompat con frontend v3)
--
-- Motivo: usuarios no quieren tener que "Aplicar" cada sugerencia para que
-- el sistema use baseline. Si no hay override, la sugerida es la baseline.
-- Para forzar baseline cero o un override explícito, el usuario edita
-- manualmente la meta en /ventas/metas.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS ventas_proyeccion_cierre_v4(int);

CREATE OR REPLACE FUNCTION ventas_proyeccion_cierre_v4(p_anio int)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_fecha_corte      date;
  v_fecha_corte_prev date;
  v_mes_corte        int;
  v_peso_ritmo       numeric;
  v_peso_historico   numeric;
  v_empresas         jsonb;
  v_grupo            jsonb;
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

  v_fecha_corte_prev := (v_fecha_corte - INTERVAL '1 year')::date;
  v_mes_corte        := EXTRACT(MONTH FROM v_fecha_corte)::int;
  v_peso_ritmo       := v_mes_corte::numeric / 12;
  v_peso_historico   := 1 - v_peso_ritmo;

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
  ytd_prev_sp AS (
    SELECT empresa, COALESCE(SUM(subtotal), 0)::numeric AS ventas_prev_ytd_sp
    FROM ventas_raw
    WHERE anio = p_anio - 1
      AND fecha <= v_fecha_corte_prev
    GROUP BY empresa
  ),
  total_prev AS (
    SELECT empresa, COALESCE(SUM(subtotal), 0)::numeric AS total_prev_year
    FROM ventas_raw
    WHERE anio = p_anio - 1
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
  ritmo_hist AS (
    SELECT
      r.empresa, r.v_prev, r.historia_disponible,
      CASE WHEN r.ritmo_historico_raw IS NULL THEN NULL
           ELSE LEAST(0.50, GREATEST(-0.30, r.ritmo_historico_raw))
      END AS ritmo_historico
    FROM ritmo_hist_raw r
  ),
  -- Sugerida inline (misma lógica que ventas_meta_sugerida_v2)
  sugerida_calc AS (
    SELECT
      r.empresa,
      r.v_prev,
      r.ritmo_historico,
      r.historia_disponible,
      CASE
        WHEN r.ritmo_historico IS NULL THEN NULL
        ELSE LEAST(1.25, GREATEST(0.90, 1 + r.ritmo_historico * 0.7))
      END AS factor_sugerida,
      CASE
        WHEN r.ritmo_historico IS NULL OR COALESCE(r.v_prev, 0) <= 0 THEN NULL
        ELSE r.v_prev * LEAST(1.25, GREATEST(0.90, 1 + r.ritmo_historico * 0.7))
      END AS meta_sugerida
    FROM ritmo_hist r
  ),
  base AS (
    SELECT
      e.empresa,
      COALESCE(yc.ventas_ytd, 0)         AS ventas_ytd,
      COALESCE(ys.ventas_prev_ytd_sp, 0) AS ventas_prev_ytd_sp,
      COALESCE(tp.total_prev_year, 0)    AS total_prev_year,
      s.v_prev                            AS ventas_prev_year,
      s.ritmo_historico,
      s.historia_disponible,
      s.meta_sugerida,
      CASE
        WHEN COALESCE(ys.ventas_prev_ytd_sp, 0) > 0
          THEN yc.ventas_ytd / ys.ventas_prev_ytd_sp
        ELSE NULL
      END AS ritmo_actual,
      CASE
        WHEN COALESCE(tp.total_prev_year, 0) > 0
          THEN ys.ventas_prev_ytd_sp / tp.total_prev_year
        ELSE NULL
      END AS frac_ytd
    FROM empresas_set e
    LEFT JOIN ytd_cur     yc ON yc.empresa = e.empresa
    LEFT JOIN ytd_prev_sp ys ON ys.empresa = e.empresa
    LEFT JOIN total_prev  tp ON tp.empresa = e.empresa
    LEFT JOIN sugerida_calc s ON s.empresa = e.empresa
  ),
  metas_manuales AS (
    SELECT empresa AS nombre_display, meta::numeric AS meta_anual_manual
    FROM ventas_metas WHERE anio = p_anio
  ),
  proyectado AS (
    SELECT
      b.*,
      mm.meta_anual_manual,
      -- Meta efectiva: si el usuario configuró manualmente, eso. Si no,
      -- la sugerida automática. NULL solo si tampoco hay sugerida (empresa
      -- sin historia).
      COALESCE(mm.meta_anual_manual, b.meta_sugerida) AS meta_efectiva,
      CASE
        WHEN v_mes_corte >= 3 AND b.frac_ytd IS NOT NULL AND b.frac_ytd >= 0.05
          THEN 'estacional'
        WHEN b.ritmo_historico IS NULL AND b.ritmo_actual IS NULL
          THEN 'fallback_lineal'
        ELSE 'mixto'
      END AS algoritmo,
      CASE
        WHEN v_mes_corte >= 3 AND b.frac_ytd IS NOT NULL AND b.frac_ytd >= 0.05
          THEN NULL
        WHEN b.ritmo_historico IS NULL AND b.ritmo_actual IS NULL
          THEN NULL
        WHEN b.ritmo_historico IS NULL THEN
          LEAST(1.25, GREATEST(0.90, 1 + (b.ritmo_actual - 1) * 0.7))
        WHEN b.ritmo_actual IS NULL THEN
          LEAST(1.25, GREATEST(0.90, 1 + b.ritmo_historico * 0.7))
        ELSE
          LEAST(1.25, GREATEST(0.90, 1 + (
            (b.ritmo_actual * v_peso_ritmo + (1 + b.ritmo_historico) * v_peso_historico) - 1
          ) * 0.7))
      END AS factor_final
    FROM base b
    LEFT JOIN metas_manuales mm ON mm.nombre_display = _empresa_nombre(b.empresa)
  ),
  finales AS (
    SELECT
      p.*,
      CASE
        WHEN p.algoritmo = 'estacional' AND p.ventas_ytd > 0
          THEN p.ventas_ytd / p.frac_ytd
        WHEN p.algoritmo = 'mixto' AND p.factor_final IS NOT NULL
          AND COALESCE(p.ventas_prev_year, 0) > 0
          THEN p.ventas_prev_year * p.factor_final
        WHEN v_mes_corte > 0 AND p.ventas_ytd > 0
          THEN p.ventas_ytd * 12.0 / v_mes_corte
        ELSE 0
      END AS proyeccion_cierre,
      (p.algoritmo = 'fallback_lineal' OR
       (p.algoritmo = 'mixto' AND p.factor_final IS NULL)) AS es_fallback_lineal
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
        'frac_ytd_estacional',  f.frac_ytd,
        'algoritmo',            f.algoritmo,
        'factor_final',         f.factor_final,
        'proyeccion_cierre',    f.proyeccion_cierre,
        'proyeccion_restante',  GREATEST(0, f.proyeccion_cierre - f.ventas_ytd),
        -- Tres campos de meta:
        --   meta_anual_manual: lo que está guardado en ventas_metas (override del user)
        --   meta_sugerida   : calculo automático, base histórica
        --   meta_efectiva   : la que el sistema considera vigente
        --   meta_anual      : alias = meta_efectiva (retrocompat frontend v3)
        'meta_anual_manual',    f.meta_anual_manual,
        'meta_sugerida',        f.meta_sugerida,
        'meta_efectiva',        f.meta_efectiva,
        'meta_anual',           f.meta_efectiva,
        'gap_vs_meta',          CASE WHEN f.meta_efectiva IS NOT NULL
                                  THEN f.proyeccion_cierre - f.meta_efectiva ELSE NULL END,
        'es_fallback_lineal',   f.es_fallback_lineal,
        'status', CASE
          WHEN f.meta_efectiva IS NULL OR f.meta_efectiva <= 0
            OR f.proyeccion_cierre IS NULL OR f.proyeccion_cierre <= 0
            OR f.es_fallback_lineal
            THEN 'gris'
          WHEN f.proyeccion_cierre < f.meta_efectiva * 0.95
            OR (f.ritmo_actual IS NOT NULL AND f.ritmo_actual < 0.85)
            THEN 'rojo'
          WHEN f.proyeccion_cierre >= f.meta_efectiva THEN 'verde'
          ELSE 'amarillo'
        END
      )
      ORDER BY f.empresa
    )
  INTO v_empresas
  FROM finales f;

  -- Totales del grupo — meta_total ahora suma metas_efectivas (no manuales)
  WITH g AS (
    SELECT
      SUM((e->>'ventas_ytd')::numeric)         AS ventas_ytd,
      SUM((e->>'proyeccion_cierre')::numeric)  AS proyeccion_cierre,
      SUM(COALESCE((e->>'meta_efectiva')::numeric, 0)) AS meta_total,
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

GRANT EXECUTE ON FUNCTION ventas_proyeccion_cierre_v4(int) TO service_role;

NOTIFY pgrst, 'reload schema';
