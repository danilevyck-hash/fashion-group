-- ─────────────────────────────────────────────────────────────────────────────
-- Multifashion Overview: serie diaria acumulada + proyeccion de cierre ponderada.
--
-- Da soporte al rediseno del Overview:
--   1) Linea acumulada DIARIA (2026 hasta hoy vs 2025 ano completo).
--   2) Rollup MENSUAL para el tooltip (venta del mes + acumulado).
--   3) Proyeccion de cierre ponderada por temporada (reemplaza la Meta anual).
--
-- Fuente: vista retail _multifashion_sf_vw (is_wholesale=false, columnas
-- fecha/subtotal). BLEND en el boundary 2025-05-02: fechas < 2025-05-01 salen de
-- ventas_raw (empresa american_classic, retail); fechas >= 2025-05-01 salen de la
-- vista switch. Para 2026 la rama ventas_raw queda inerte (no hay fechas previas).
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper escalar: suma retail (blend) de subtotal en [d_start, d_end].
CREATE OR REPLACE FUNCTION _multifashion_retail_blend_sum(d_start date, d_end date)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE((SELECT SUM(subtotal) FROM _multifashion_sf_vw
              WHERE is_wholesale = false
                AND fecha BETWEEN GREATEST(d_start, DATE '2025-05-01') AND d_end), 0)
    + COALESCE((SELECT SUM(subtotal) FROM ventas_raw
              WHERE empresa = 'american_classic' AND is_wholesale = false
                AND fecha BETWEEN d_start AND LEAST(d_end, DATE '2025-04-30')), 0);
$$;

-- ── serie diaria + rollup mensual para UN ano ───────────────────────────────
CREATE OR REPLACE FUNCTION multifashion_overview_serie_v1(p_year int)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_anio_inicio date := make_date(p_year, 1, 1);
  v_anio_fin date := make_date(p_year, 12, 31);
  v_hoy date := (now() AT TIME ZONE 'America/Panama')::date;
  v_es_anio_actual boolean := (p_year = EXTRACT(YEAR FROM v_hoy)::int);
  v_corte date;
  v_dias jsonb;
  v_meses jsonb;
BEGIN
  v_corte := CASE WHEN v_es_anio_actual THEN LEAST(v_anio_fin, v_hoy) ELSE v_anio_fin END;

  -- Serie diaria (solo dias con ventas) + acumulado corriente.
  WITH ventas_dia AS (
    SELECT fecha, SUM(subtotal)::numeric AS ventas
    FROM (
      SELECT fecha, subtotal FROM _multifashion_sf_vw
      WHERE is_wholesale = false
        AND fecha BETWEEN GREATEST(v_anio_inicio, DATE '2025-05-01') AND v_corte
      UNION ALL
      SELECT fecha, subtotal FROM ventas_raw
      WHERE empresa = 'american_classic' AND is_wholesale = false
        AND fecha BETWEEN v_anio_inicio AND LEAST(v_corte, DATE '2025-04-30')
    ) src
    GROUP BY fecha
  ),
  dia_acum AS (
    SELECT fecha, ventas, SUM(ventas) OVER (ORDER BY fecha) AS acumulado
    FROM ventas_dia
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'fecha', to_char(fecha, 'YYYY-MM-DD'),
      'ventas', ventas,
      'acumulado', acumulado
    ) ORDER BY fecha
  ) INTO v_dias
  FROM dia_acum;

  -- Rollup mensual (venta del mes + acumulado al cierre del mes) para el tooltip.
  WITH ventas_mes AS (
    SELECT EXTRACT(MONTH FROM fecha)::int AS mes, SUM(subtotal)::numeric AS ventas
    FROM (
      SELECT fecha, subtotal FROM _multifashion_sf_vw
      WHERE is_wholesale = false
        AND fecha BETWEEN GREATEST(v_anio_inicio, DATE '2025-05-01') AND v_corte
      UNION ALL
      SELECT fecha, subtotal FROM ventas_raw
      WHERE empresa = 'american_classic' AND is_wholesale = false
        AND fecha BETWEEN v_anio_inicio AND LEAST(v_corte, DATE '2025-04-30')
    ) src
    GROUP BY EXTRACT(MONTH FROM fecha)::int
  ),
  mes_acum AS (
    SELECT mes, ventas, SUM(ventas) OVER (ORDER BY mes) AS acumulado
    FROM ventas_mes
  )
  SELECT jsonb_agg(
    jsonb_build_object('mes', mes, 'ventas', ventas, 'acumulado', acumulado) ORDER BY mes
  ) INTO v_meses
  FROM mes_acum;

  RETURN jsonb_build_object(
    'year', p_year,
    'corte', to_char(v_corte, 'YYYY-MM-DD'),
    'es_anio_actual', v_es_anio_actual,
    'dias', COALESCE(v_dias, '[]'::jsonb),
    'meses', COALESCE(v_meses, '[]'::jsonb)
  );
END;
$$;

-- ── proyeccion de cierre ponderada por temporada ────────────────────────────
-- Metodo: extrapola el YTD del ano actual segun el RITMO estacional del ano
-- previo. proyeccion = ytd_actual * (cierre_prev / ytd_prev), donde ytd_prev es
-- el acumulado del ano previo hasta el MISMO dia-del-ano que hoy. Si el ano
-- previo fue back-loaded, ytd_prev es chico y la proyeccion sube (y viceversa).
CREATE OR REPLACE FUNCTION multifashion_proyeccion_cierre_v1(p_year int)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Panama')::date;
  v_es_actual boolean := (p_year = EXTRACT(YEAR FROM v_hoy)::int);
  v_act_inicio date := make_date(p_year, 1, 1);
  v_prev_inicio date := make_date(p_year - 1, 1, 1);
  v_prev_fin date := make_date(p_year - 1, 12, 31);
  v_corte date;
  v_corte_prev date;
  v_cierre_prev numeric;
  v_ytd_actual numeric;
  v_ytd_prev numeric;
  v_proyeccion numeric;
  v_delta numeric;
  v_tiene boolean;
BEGIN
  v_corte := CASE WHEN v_es_actual THEN v_hoy ELSE make_date(p_year, 12, 31) END;
  -- Mismo offset de dias dentro del ano, aplicado al ano previo.
  v_corte_prev := v_prev_inicio + (v_corte - v_act_inicio);

  v_cierre_prev := _multifashion_retail_blend_sum(v_prev_inicio, v_prev_fin);
  v_ytd_actual  := _multifashion_retail_blend_sum(v_act_inicio, v_corte);
  v_ytd_prev    := _multifashion_retail_blend_sum(v_prev_inicio, v_corte_prev);

  -- Solo proyectamos para el ano EN CURSO y con base previa valida.
  v_tiene := v_es_actual AND v_ytd_prev > 0 AND v_cierre_prev > 0;
  v_proyeccion := CASE WHEN v_tiene THEN v_ytd_actual * (v_cierre_prev / v_ytd_prev) ELSE NULL END;
  v_delta := CASE WHEN v_tiene THEN (v_proyeccion - v_cierre_prev) / v_cierre_prev ELSE NULL END;

  RETURN jsonb_build_object(
    'year', p_year,
    'tiene_proyeccion', v_tiene,
    'proyeccion', v_proyeccion,
    'cierre_prev', v_cierre_prev,
    'delta_pct', v_delta,
    'ytd_actual', v_ytd_actual,
    'ytd_prev', v_ytd_prev
  );
END;
$$;

GRANT EXECUTE ON FUNCTION _multifashion_retail_blend_sum(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION multifashion_overview_serie_v1(int) TO service_role;
GRANT EXECUTE ON FUNCTION multifashion_proyeccion_cierre_v1(int) TO service_role;

NOTIFY pgrst, 'reload schema';
