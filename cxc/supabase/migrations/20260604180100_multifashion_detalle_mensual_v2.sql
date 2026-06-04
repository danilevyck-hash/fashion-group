-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_detalle_mensual_v1 → v2
--
-- FIX de comparativo en meses CERRADOS. v1 compara "mismo período" usando como
-- corte el ÚLTIMO DÍA CON VENTAS del mes actual (v_dia_actual). En un mes en
-- curso eso es correcto (justo: día-por-día). Pero en un mes YA CERRADO, si el
-- último día calendario no tuvo ventas, el corte se queda corto y recorta el mes
-- anterior/año anterior, inflando el %.
--
-- Caso real: mayo 2026 no tuvo ventas el 31 → corte = día 30 → YoY comparaba
-- may 1–30 → dejaba fuera el 31-may-2025 (~1,310 USD) → +21% en vez del +16.9% real
-- de mes completo (que es lo que muestran Overview y la card del bono).
--
-- v2: para meses CERRADOS el corte es el MES COMPLETO (compara mes vs mes). Para
-- el mes EN CURSO se mantiene el same-period día-por-día. Todo lo demás idéntico
-- a v1 (misma fuente _multifashion_sf_vw retail, mismo blend YoY switch∪ventas_raw).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS multifashion_detalle_mensual_v1(int, int);

CREATE OR REPLACE FUNCTION multifashion_detalle_mensual_v2(p_year int, p_mes int)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_mes_inicio date; v_mes_fin_full date; v_mes_fin_real date;
  v_dias_en_mes int; v_dia_actual int; v_dia_corte int; v_is_mes_actual boolean;
  v_prev_mes_inicio date; v_prev_mes_fin date;
  v_yoy_mes_inicio date;  v_yoy_mes_fin date;
  v_ventas_cur numeric; v_tickets_cur bigint;
  v_ticket_prom numeric; v_proyeccion numeric;
  v_mom_ventas numeric; v_mom_tickets bigint; v_mom_tiene_data boolean;
  v_yoy_ventas numeric; v_yoy_tickets bigint; v_yoy_tiene_data boolean;
  v_dias jsonb; v_mejor jsonb; v_peor jsonb; v_heatmap jsonb;
BEGIN
  v_mes_inicio    := make_date(p_year, p_mes, 1);
  v_mes_fin_full  := (v_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_dias_en_mes   := EXTRACT(DAY FROM v_mes_fin_full)::int;
  v_is_mes_actual := (p_year = EXTRACT(YEAR FROM CURRENT_DATE)::int
                      AND p_mes = EXTRACT(MONTH FROM CURRENT_DATE)::int);

  SELECT COALESCE(MAX(d), 0) INTO v_dia_actual
  FROM (
    SELECT EXTRACT(DAY FROM fecha)::int AS d
    FROM _multifashion_sf_vw
    WHERE is_wholesale = false AND fecha BETWEEN v_mes_inicio AND v_mes_fin_full
    GROUP BY EXTRACT(DAY FROM fecha)::int
    HAVING SUM(subtotal) > 0
  ) s;

  -- Día de corte para los comparativos (MoM/YoY):
  --   • mes EN CURSO  → último día con ventas (same-period justo).
  --   • mes CERRADO   → mes completo (compara mes vs mes; no recorta si el último
  --                     día calendario no tuvo ventas).
  v_dia_corte := CASE WHEN v_is_mes_actual THEN v_dia_actual ELSE v_dias_en_mes END;

  v_mes_fin_real := CASE
    WHEN NOT v_is_mes_actual THEN v_mes_fin_full
    WHEN v_dia_actual > 0     THEN make_date(p_year, p_mes, v_dia_actual)
    ELSE v_mes_inicio END;

  IF p_mes > 1 THEN v_prev_mes_inicio := make_date(p_year, p_mes - 1, 1);
  ELSE v_prev_mes_inicio := make_date(p_year - 1, 12, 1); END IF;
  v_prev_mes_fin := LEAST(
    v_prev_mes_inicio + (v_dia_corte - 1),
    (v_prev_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date
  );

  v_yoy_mes_inicio := make_date(p_year - 1, p_mes, 1);
  v_yoy_mes_fin := LEAST(
    v_yoy_mes_inicio + (v_dia_corte - 1),
    (v_yoy_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date
  );

  -- Totales mes corriente (retail) — costo/utilidad/margen NO disponibles → NULL.
  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_ventas_cur, v_tickets_cur
  FROM _multifashion_sf_vw
  WHERE is_wholesale = false AND fecha BETWEEN v_mes_inicio AND v_mes_fin_real;
  v_ticket_prom := CASE WHEN v_tickets_cur > 0 THEN v_ventas_cur / v_tickets_cur ELSE 0 END;
  v_proyeccion  := CASE WHEN v_is_mes_actual AND v_dia_actual > 0
                         THEN (v_ventas_cur / v_dia_actual) * v_dias_en_mes ELSE NULL END;

  -- MoM (mes anterior).
  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_mom_ventas, v_mom_tickets
  FROM _multifashion_sf_vw
  WHERE is_wholesale = false AND fecha BETWEEN v_prev_mes_inicio AND v_prev_mes_fin;
  v_mom_tiene_data := (v_mom_tickets > 0);

  -- YoY BLEND: switch_facturas (≥ 2025-05) + ventas_raw (< 2025-05), retail-only.
  SELECT
    COALESCE((SELECT SUM(subtotal) FROM _multifashion_sf_vw
              WHERE is_wholesale = false AND fecha BETWEEN v_yoy_mes_inicio AND v_yoy_mes_fin
                AND fecha >= DATE '2025-05-01'), 0)
    + COALESCE((SELECT SUM(subtotal) FROM ventas_raw
              WHERE empresa = 'american_classic' AND is_wholesale = false
                AND fecha BETWEEN v_yoy_mes_inicio AND v_yoy_mes_fin
                AND fecha < DATE '2025-05-01'), 0),
    COALESCE((SELECT COUNT(*) FROM _multifashion_sf_vw
              WHERE is_wholesale = false AND fecha BETWEEN v_yoy_mes_inicio AND v_yoy_mes_fin
                AND fecha >= DATE '2025-05-01'), 0)
    + COALESCE((SELECT COUNT(DISTINCT n_sistema) FROM ventas_raw
              WHERE empresa = 'american_classic' AND is_wholesale = false
                AND fecha BETWEEN v_yoy_mes_inicio AND v_yoy_mes_fin
                AND fecha < DATE '2025-05-01'), 0)
  INTO v_yoy_ventas, v_yoy_tickets;
  v_yoy_tiene_data := (v_yoy_tickets > 0);

  WITH dias AS (SELECT generate_series(1, v_dias_en_mes) AS d),
  cur AS (
    SELECT EXTRACT(DAY FROM fecha)::int AS d,
      SUM(subtotal)::numeric AS ventas,
      COUNT(*)::int AS tickets
    FROM _multifashion_sf_vw
    WHERE is_wholesale = false AND fecha BETWEEN v_mes_inicio AND v_mes_fin_full
    GROUP BY EXTRACT(DAY FROM fecha)::int
  ),
  prev AS (
    SELECT EXTRACT(DAY FROM fecha)::int AS d, SUM(subtotal)::numeric AS ventas_prev
    FROM _multifashion_sf_vw
    WHERE is_wholesale = false AND fecha BETWEEN v_prev_mes_inicio
                                            AND (v_prev_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date
    GROUP BY EXTRACT(DAY FROM fecha)::int
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'dia', d.d,
      'ventas',              COALESCE(cur.ventas, 0),
      'utilidad',            NULL,
      'n_tickets',           COALESCE(cur.tickets, 0),
      'ventas_mes_anterior', COALESCE(prev.ventas_prev, 0)
    ) ORDER BY d.d
  ) INTO v_dias
  FROM dias d
  LEFT JOIN cur  ON cur.d  = d.d
  LEFT JOIN prev ON prev.d = d.d;

  WITH d AS (
    SELECT fecha, SUM(subtotal) AS ventas
    FROM _multifashion_sf_vw
    WHERE is_wholesale = false AND fecha BETWEEN v_mes_inicio AND v_mes_fin_real
    GROUP BY fecha HAVING SUM(subtotal) > 0
  )
  SELECT
    (SELECT jsonb_build_object('fecha', to_char(fecha, 'YYYY-MM-DD'), 'ventas', ventas) FROM d ORDER BY ventas DESC LIMIT 1),
    (SELECT jsonb_build_object('fecha', to_char(fecha, 'YYYY-MM-DD'), 'ventas', ventas) FROM d ORDER BY ventas ASC  LIMIT 1)
  INTO v_mejor, v_peor;

  WITH dows AS (
    SELECT EXTRACT(DOW FROM fecha)::int AS dow, SUM(subtotal) AS ventas
    FROM _multifashion_sf_vw
    WHERE is_wholesale = false AND fecha BETWEEN v_mes_inicio AND v_mes_fin_real
    GROUP BY fecha, EXTRACT(DOW FROM fecha)::int
    HAVING SUM(subtotal) > 0
  ),
  agg AS (
    SELECT dow, AVG(ventas)::numeric AS ventas_promedio, COUNT(*)::int AS count_dias
    FROM dows GROUP BY dow
  ),
  dows_all AS (SELECT generate_series(0, 6) AS dow)
  SELECT jsonb_agg(
    jsonb_build_object(
      'dow', da.dow,
      'dow_label', CASE da.dow WHEN 0 THEN 'Dom' WHEN 1 THEN 'Lun' WHEN 2 THEN 'Mar'
                                WHEN 3 THEN 'Mié' WHEN 4 THEN 'Jue' WHEN 5 THEN 'Vie' ELSE 'Sáb' END,
      'ventas_promedio', COALESCE(agg.ventas_promedio, 0),
      'count_dias',      COALESCE(agg.count_dias, 0)
    ) ORDER BY da.dow
  )
  INTO v_heatmap
  FROM dows_all da LEFT JOIN agg ON agg.dow = da.dow;

  RETURN jsonb_build_object(
    'year', p_year, 'mes', p_mes,
    'mes_label', CASE p_mes WHEN 1 THEN 'Enero' WHEN 2 THEN 'Febrero' WHEN 3 THEN 'Marzo'
                            WHEN 4 THEN 'Abril' WHEN 5 THEN 'Mayo' WHEN 6 THEN 'Junio'
                            WHEN 7 THEN 'Julio' WHEN 8 THEN 'Agosto' WHEN 9 THEN 'Septiembre'
                            WHEN 10 THEN 'Octubre' WHEN 11 THEN 'Noviembre' ELSE 'Diciembre' END,
    'is_mes_actual', v_is_mes_actual,
    'dia_actual', v_dia_actual,
    'dias_en_mes', v_dias_en_mes,
    'dias', COALESCE(v_dias, '[]'::jsonb),
    'totales', jsonb_build_object(
      'ventas', v_ventas_cur,
      'utilidad', NULL,
      'n_tickets', v_tickets_cur,
      'ticket_promedio', v_ticket_prom,
      'margen', NULL,
      'proyeccion_cierre', v_proyeccion
    ),
    'mes_anterior', jsonb_build_object(
      'ventas', v_mom_ventas, 'utilidad', NULL, 'n_tickets', v_mom_tickets,
      'tiene_data', v_mom_tiene_data
    ),
    'yoy', jsonb_build_object(
      'ventas', v_yoy_ventas, 'utilidad', NULL, 'n_tickets', v_yoy_tickets,
      'tiene_data', v_yoy_tiene_data
    ),
    'mejor_dia', v_mejor, 'peor_dia', v_peor,
    'heatmap_dia_semana', COALESCE(v_heatmap, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_detalle_mensual_v2(int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
