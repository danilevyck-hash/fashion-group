-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_dia_a_dia(p_year int, p_mes int)
--
-- Sirve al sub-tab "Mes en curso" de Multifashion (Sesión 3 del sprint).
-- Devuelve series y agregados para 5 KPIs + bar chart día por día +
-- mejor/peor día + heatmap día de semana + proyección de cierre.
--
-- Scope: solo retail (is_wholesale = false). El wholesale tiene su propia
-- sub-tab y semántica distinta.
--
-- Nota: ventas_raw.fecha es DATE (no timestamp). La sección "hora pico"
-- del brief NO aplica — el RPC devuelve hora_pico=NULL para que el
-- frontend muestre mensaje "no disponible".
--
-- Estructura del response:
--   {
--     anio, mes, mes_label, hoy,
--     dia_actual,                  -- día del mes hoy (1..31), o último si pasado
--     dias_transcurridos,          -- días con CURRENT_DATE o fin de mes
--     dias_en_mes,                 -- total días del mes
--     dias: [{ dia, ventas, tickets, ticket_prom, ventas_mes_anterior }],
--     totales: {
--       ventas_mes_corriente, tickets_mes_corriente, ticket_prom_corriente,
--       ventas_mismo_periodo_anterior, delta_pct,
--       proyeccion_cierre
--     },
--     mejor_dia: { fecha, ventas } | NULL,
--     peor_dia:  { fecha, ventas } | NULL,
--     heatmap_dia_semana: [{ dow, dow_label, ventas_promedio, count_dias }],
--     hora_pico: NULL  -- no aplica (fecha es date, no timestamp)
--   }
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION multifashion_dia_a_dia(p_year int, p_mes int)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_mes_inicio       date;
  v_mes_fin_full     date;
  v_mes_fin_real     date;  -- min(fin_mes, today) cuando es mes actual
  v_dias_en_mes      int;
  v_dias_transcurridos int;
  v_dia_actual       int;

  v_prev_mes_inicio  date;
  v_prev_mes_fin     date;  -- mismo offset de días en mes anterior

  v_ventas_corriente numeric;
  v_tickets_corriente bigint;
  v_ticket_prom_corriente numeric;
  v_ventas_prev_periodo numeric;
  v_delta_pct numeric;
  v_proyeccion numeric;

  v_dias jsonb;
  v_mejor jsonb;
  v_peor jsonb;
  v_heatmap jsonb;

  v_mes_labels CONSTANT text[] := ARRAY[
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
  ];
  v_dow_labels CONSTANT text[] := ARRAY['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
BEGIN
  IF p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'p_mes inválido: % (esperado 1..12)', p_mes;
  END IF;

  v_mes_inicio   := make_date(p_year, p_mes, 1);
  v_mes_fin_full := (v_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_dias_en_mes  := EXTRACT(DAY FROM v_mes_fin_full)::int;

  -- Si el mes contiene CURRENT_DATE, recortamos a hoy. Sino, mes cerrado/futuro.
  IF CURRENT_DATE BETWEEN v_mes_inicio AND v_mes_fin_full THEN
    v_mes_fin_real       := CURRENT_DATE;
    v_dias_transcurridos := EXTRACT(DAY FROM CURRENT_DATE)::int;
    v_dia_actual         := v_dias_transcurridos;
  ELSIF CURRENT_DATE > v_mes_fin_full THEN
    -- Mes pasado completo
    v_mes_fin_real       := v_mes_fin_full;
    v_dias_transcurridos := v_dias_en_mes;
    v_dia_actual         := v_dias_en_mes;
  ELSE
    -- Mes futuro — sin data
    v_mes_fin_real       := v_mes_inicio;
    v_dias_transcurridos := 0;
    v_dia_actual         := 0;
  END IF;

  -- Mes anterior: mismo rango de días (1..dia_actual) o full si dia_actual=0
  v_prev_mes_inicio := (v_mes_inicio - INTERVAL '1 month')::date;
  IF v_dia_actual > 0 THEN
    v_prev_mes_fin := LEAST(
      (v_prev_mes_inicio + (v_dia_actual - 1) * INTERVAL '1 day')::date,
      (v_prev_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date
    );
  ELSE
    v_prev_mes_fin := (v_prev_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
  END IF;

  -- ── Totales del mes corriente (retail only) ─────────────────────────────
  SELECT
    COALESCE(SUM(subtotal), 0),
    COUNT(DISTINCT n_sistema)
  INTO v_ventas_corriente, v_tickets_corriente
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND is_wholesale = false
    AND fecha BETWEEN v_mes_inicio AND v_mes_fin_real;
  v_ticket_prom_corriente := CASE WHEN v_tickets_corriente > 0
    THEN v_ventas_corriente / v_tickets_corriente ELSE 0 END;

  -- ── Totales mes anterior mismo período ──────────────────────────────────
  SELECT COALESCE(SUM(subtotal), 0)
  INTO v_ventas_prev_periodo
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND is_wholesale = false
    AND fecha BETWEEN v_prev_mes_inicio AND v_prev_mes_fin;

  -- Δ% — n/a cuando prev es 0 o muy chico (consistente con bug-fix #2)
  v_delta_pct := CASE
    WHEN v_ventas_prev_periodo >= 100
      THEN (v_ventas_corriente - v_ventas_prev_periodo) / v_ventas_prev_periodo
    ELSE NULL
  END;

  -- ── Proyección cierre: (corriente / días_transcurridos) * días_en_mes ─
  v_proyeccion := CASE
    WHEN v_dias_transcurridos > 0
      THEN (v_ventas_corriente / v_dias_transcurridos) * v_dias_en_mes
    ELSE 0
  END;

  -- ── Serie diaria con comparativa día anterior ──────────────────────────
  WITH dias AS (
    SELECT generate_series(1, v_dias_en_mes) AS d
  ),
  cur AS (
    SELECT
      EXTRACT(DAY FROM fecha)::int AS d,
      SUM(subtotal)::numeric AS ventas,
      COUNT(DISTINCT n_sistema)::int AS tickets
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND is_wholesale = false
      AND fecha BETWEEN v_mes_inicio AND v_mes_fin_full
    GROUP BY EXTRACT(DAY FROM fecha)::int
  ),
  prev AS (
    -- Mismo día del mes anterior
    SELECT
      EXTRACT(DAY FROM fecha)::int AS d,
      SUM(subtotal)::numeric AS ventas_prev
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND is_wholesale = false
      AND fecha BETWEEN v_prev_mes_inicio
                    AND (v_prev_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date
    GROUP BY EXTRACT(DAY FROM fecha)::int
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'dia', d.d,
      'ventas', COALESCE(cur.ventas, 0),
      'tickets', COALESCE(cur.tickets, 0),
      'ticket_prom', CASE WHEN COALESCE(cur.tickets, 0) > 0 THEN cur.ventas / cur.tickets ELSE 0 END,
      'ventas_mes_anterior', COALESCE(prev.ventas_prev, 0)
    )
    ORDER BY d.d
  )
  INTO v_dias
  FROM dias d
  LEFT JOIN cur  ON cur.d  = d.d
  LEFT JOIN prev ON prev.d = d.d;

  -- ── Mejor / peor día del mes (con ventas > 0) ──────────────────────────
  WITH d AS (
    SELECT fecha, SUM(subtotal) AS ventas
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND is_wholesale = false
      AND fecha BETWEEN v_mes_inicio AND v_mes_fin_real
    GROUP BY fecha
    HAVING SUM(subtotal) > 0
  )
  SELECT
    (SELECT jsonb_build_object('fecha', fecha, 'ventas', ventas) FROM d ORDER BY ventas DESC LIMIT 1),
    (SELECT jsonb_build_object('fecha', fecha, 'ventas', ventas) FROM d ORDER BY ventas ASC  LIMIT 1)
  INTO v_mejor, v_peor;

  -- ── Heatmap día de semana ──────────────────────────────────────────────
  -- Promedio de ventas por día de la semana (0=Dom..6=Sáb). Solo días con
  -- ventas > 0 cuentan en el promedio para no inflar artificialmente.
  WITH dows AS (
    SELECT
      EXTRACT(DOW FROM fecha)::int AS dow,
      SUM(subtotal) AS ventas
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND is_wholesale = false
      AND fecha BETWEEN v_mes_inicio AND v_mes_fin_real
    GROUP BY fecha, EXTRACT(DOW FROM fecha)::int
    HAVING SUM(subtotal) > 0
  ),
  agg AS (
    SELECT
      dow,
      AVG(ventas)::numeric AS ventas_promedio,
      COUNT(*)::int        AS count_dias
    FROM dows
    GROUP BY dow
  ),
  all_dows AS (
    SELECT generate_series(0, 6) AS dow
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'dow', ad.dow,
      'dow_label', v_dow_labels[ad.dow + 1],
      'ventas_promedio', COALESCE(agg.ventas_promedio, 0),
      'count_dias', COALESCE(agg.count_dias, 0)
    )
    ORDER BY ad.dow
  )
  INTO v_heatmap
  FROM all_dows ad
  LEFT JOIN agg ON agg.dow = ad.dow;

  RETURN jsonb_build_object(
    'anio',                p_year,
    'mes',                 p_mes,
    'mes_label',           v_mes_labels[p_mes],
    'hoy',                 to_char(CURRENT_DATE, 'YYYY-MM-DD'),
    'dia_actual',          v_dia_actual,
    'dias_transcurridos',  v_dias_transcurridos,
    'dias_en_mes',         v_dias_en_mes,
    'dias',                COALESCE(v_dias, '[]'::jsonb),
    'totales', jsonb_build_object(
      'ventas_mes_corriente',          v_ventas_corriente,
      'tickets_mes_corriente',         v_tickets_corriente,
      'ticket_prom_corriente',         v_ticket_prom_corriente,
      'ventas_mismo_periodo_anterior', v_ventas_prev_periodo,
      'delta_pct',                     v_delta_pct,
      'proyeccion_cierre',             v_proyeccion
    ),
    'mejor_dia', v_mejor,
    'peor_dia',  v_peor,
    'heatmap_dia_semana', COALESCE(v_heatmap, '[]'::jsonb),
    -- ventas_raw.fecha es DATE sin componente horario; no podemos derivar hora pico.
    'hora_pico', NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_dia_a_dia(int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
