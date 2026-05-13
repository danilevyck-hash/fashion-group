-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_detalle_mensual_v1 — detalle de cualquier mes/año
--
-- Reemplaza al sub-tab "Mes en curso" del módulo Ventas → Multifashion.
-- Permite seleccionar cualquier mes histórico (no solo el mes en curso) y
-- agrega comparativo YoY (mismo mes año anterior) además del MoM existente.
--
-- Diferencias clave vs multifashion_dia_a_dia_v4 (que NO se modifica):
--   - p_year + p_mes son siempre obligatorios y libres (no obligan a CURRENT).
--   - dia_actual = MAX(día con SUM(subtotal) > 0) del mes seleccionado.
--     Funciona para mes en curso (corte parcial) Y para mes cerrado (full month).
--   - is_mes_actual flag: true sólo si p_year/p_mes = año/mes del calendario.
--   - Bloque YoY adicional: mismo mes año anterior, cap al mismo dia_actual.
--   - mes_anterior y yoy traen totales + tiene_data (false si tickets=0,
--     usado por la UI para mostrar "—" en lugar de delta % engañoso).
--   - proyeccion_cierre = NULL cuando !is_mes_actual (no aplica a meses cerrados).
--   - Mantiene heatmap_dia_semana, mejor_dia, peor_dia, dias[] con overlay
--     mes_anterior para preservar el chart día por día existente.
--
-- Naming: _v1 explícito desde el inicio para soportar el patrón de escape
-- hatch (_v2, _v3...) que ya hemos usado 5+ veces cuando PostgREST/Vercel
-- sirve versiones stale (multifashion_dia_a_dia v4, multifashion_vendedoras
-- v3, multifashion_mensual v2). NO sobreescribe a multifashion_dia_a_dia_v4
-- — esa sigue viva para no romper consumidores que aún la usen.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS multifashion_detalle_mensual_v1(int, int);

CREATE OR REPLACE FUNCTION multifashion_detalle_mensual_v1(p_year int, p_mes int)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_mes_inicio       date;
  v_mes_fin_full     date;
  v_mes_fin_real     date;
  v_dias_en_mes      int;
  v_dia_actual       int;
  v_is_mes_actual    boolean;

  v_prev_mes_inicio  date;
  v_prev_mes_fin     date;
  v_yoy_mes_inicio   date;
  v_yoy_mes_fin      date;

  v_ventas_cur       numeric;
  v_utilidad_cur     numeric;
  v_tickets_cur      bigint;
  v_ticket_prom      numeric;
  v_margen           numeric;
  v_proyeccion       numeric;

  v_mom_ventas       numeric;
  v_mom_utilidad     numeric;
  v_mom_tickets      bigint;
  v_mom_tiene_data   boolean;

  v_yoy_ventas       numeric;
  v_yoy_utilidad     numeric;
  v_yoy_tickets      bigint;
  v_yoy_tiene_data   boolean;

  v_dias    jsonb;
  v_mejor   jsonb;
  v_peor    jsonb;
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
  IF p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'p_year inválido: %', p_year;
  END IF;

  v_mes_inicio    := make_date(p_year, p_mes, 1);
  v_mes_fin_full  := (v_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_dias_en_mes   := EXTRACT(DAY FROM v_mes_fin_full)::int;
  v_is_mes_actual := (
    p_year = EXTRACT(YEAR FROM CURRENT_DATE)::int
    AND p_mes = EXTRACT(MONTH FROM CURRENT_DATE)::int
  );

  -- dia_actual = MAX(día con SUM(subtotal) > 0). Mes parcial → último día con
  -- ventas netas reales. Mes cerrado → 30/31. Mes futuro / sin data → 0.
  -- HAVING SUM > 0 evita que días con sólo NCs o netos 0 desplacen el corte
  -- (mismo guard que en multifashion_dia_a_dia v3+).
  SELECT COALESCE(MAX(d), 0) INTO v_dia_actual
  FROM (
    SELECT EXTRACT(DAY FROM fecha)::int AS d
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND is_wholesale = false
      AND fecha BETWEEN v_mes_inicio AND v_mes_fin_full
    GROUP BY EXTRACT(DAY FROM fecha)::int
    HAVING SUM(subtotal) > 0
  ) sub;

  IF v_dia_actual = 0 THEN
    v_mes_fin_real := v_mes_inicio;
  ELSE
    v_mes_fin_real := (v_mes_inicio + (v_dia_actual - 1) * INTERVAL '1 day')::date;
  END IF;

  -- Rangos same-period para MoM y YoY:
  --   prev_mes = mes inmediatamente anterior (rolling -1 month)
  --   yoy_mes  = mismo mes del año anterior
  -- Ambos cortados al mismo dia_actual (cap con LEAST por si el mes anterior
  -- es más corto, ej. feb 28 vs ene 31).
  v_prev_mes_inicio := (v_mes_inicio - INTERVAL '1 month')::date;
  v_yoy_mes_inicio  := (v_mes_inicio - INTERVAL '1 year')::date;
  IF v_dia_actual > 0 THEN
    v_prev_mes_fin := LEAST(
      (v_prev_mes_inicio + (v_dia_actual - 1) * INTERVAL '1 day')::date,
      (v_prev_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date
    );
    v_yoy_mes_fin := LEAST(
      (v_yoy_mes_inicio + (v_dia_actual - 1) * INTERVAL '1 day')::date,
      (v_yoy_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date
    );
  ELSE
    v_prev_mes_fin := (v_prev_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
    v_yoy_mes_fin  := (v_yoy_mes_inicio  + INTERVAL '1 month' - INTERVAL '1 day')::date;
  END IF;

  -- Totales mes corriente (retail)
  SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(subtotal - COALESCE(costo, 0)), 0),
    COUNT(DISTINCT n_sistema)
  INTO v_ventas_cur, v_utilidad_cur, v_tickets_cur
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND is_wholesale = false
    AND fecha BETWEEN v_mes_inicio AND v_mes_fin_real;

  v_ticket_prom := CASE WHEN v_tickets_cur > 0
                        THEN v_ventas_cur / v_tickets_cur ELSE 0 END;
  v_margen      := CASE WHEN v_ventas_cur > 0
                        THEN v_utilidad_cur / v_ventas_cur ELSE 0 END;
  v_proyeccion  := CASE WHEN v_is_mes_actual AND v_dia_actual > 0
                        THEN (v_ventas_cur / v_dia_actual) * v_dias_en_mes
                        ELSE NULL END;

  -- Totales mes anterior (same-period)
  SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(subtotal - COALESCE(costo, 0)), 0),
    COUNT(DISTINCT n_sistema)
  INTO v_mom_ventas, v_mom_utilidad, v_mom_tickets
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND is_wholesale = false
    AND fecha BETWEEN v_prev_mes_inicio AND v_prev_mes_fin;
  v_mom_tiene_data := (v_mom_tickets > 0);

  -- Totales YoY (mismo mes año anterior, mismo día de corte)
  SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(subtotal - COALESCE(costo, 0)), 0),
    COUNT(DISTINCT n_sistema)
  INTO v_yoy_ventas, v_yoy_utilidad, v_yoy_tickets
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND is_wholesale = false
    AND fecha BETWEEN v_yoy_mes_inicio AND v_yoy_mes_fin;
  v_yoy_tiene_data := (v_yoy_tickets > 0);

  -- Array día por día (1..dias_en_mes) con overlay del mes anterior.
  -- Conservamos el shape histórico para que el chart día-por-día no rompa.
  WITH dias AS (
    SELECT generate_series(1, v_dias_en_mes) AS d
  ),
  cur AS (
    SELECT
      EXTRACT(DAY FROM fecha)::int AS d,
      SUM(subtotal)::numeric                          AS ventas,
      SUM(subtotal - COALESCE(costo, 0))::numeric     AS utilidad,
      COUNT(DISTINCT n_sistema)::int                  AS tickets
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND is_wholesale = false
      AND fecha BETWEEN v_mes_inicio AND v_mes_fin_full
    GROUP BY EXTRACT(DAY FROM fecha)::int
  ),
  prev AS (
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
      'dia',                 d.d,
      'ventas',              COALESCE(cur.ventas, 0),
      'utilidad',            COALESCE(cur.utilidad, 0),
      'n_tickets',           COALESCE(cur.tickets, 0),
      'ventas_mes_anterior', COALESCE(prev.ventas_prev, 0)
    )
    ORDER BY d.d
  )
  INTO v_dias
  FROM dias d
  LEFT JOIN cur  ON cur.d  = d.d
  LEFT JOIN prev ON prev.d = d.d;

  -- Mejor / peor día (entre días con ventas netas > 0)
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
    (SELECT jsonb_build_object('fecha', to_char(fecha, 'YYYY-MM-DD'), 'ventas', ventas)
       FROM d ORDER BY ventas DESC LIMIT 1),
    (SELECT jsonb_build_object('fecha', to_char(fecha, 'YYYY-MM-DD'), 'ventas', ventas)
       FROM d ORDER BY ventas ASC  LIMIT 1)
  INTO v_mejor, v_peor;

  -- Heatmap día de semana (0=Dom..6=Sáb), promedio sobre días con SUM > 0
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
      'dow',             ad.dow,
      'dow_label',       v_dow_labels[ad.dow + 1],
      'ventas_promedio', COALESCE(agg.ventas_promedio, 0),
      'count_dias',      COALESCE(agg.count_dias, 0)
    )
    ORDER BY ad.dow
  )
  INTO v_heatmap
  FROM all_dows ad
  LEFT JOIN agg ON agg.dow = ad.dow;

  RETURN jsonb_build_object(
    'year',          p_year,
    'mes',           p_mes,
    'mes_label',     v_mes_labels[p_mes],
    'is_mes_actual', v_is_mes_actual,
    'dia_actual',    v_dia_actual,
    'dias_en_mes',   v_dias_en_mes,
    'dias',          COALESCE(v_dias, '[]'::jsonb),
    'totales', jsonb_build_object(
      'ventas',            v_ventas_cur,
      'utilidad',          v_utilidad_cur,
      'n_tickets',         v_tickets_cur,
      'ticket_promedio',   v_ticket_prom,
      'margen',            v_margen,
      'proyeccion_cierre', v_proyeccion
    ),
    'mes_anterior', jsonb_build_object(
      'ventas',     v_mom_ventas,
      'utilidad',   v_mom_utilidad,
      'n_tickets',  v_mom_tickets,
      'tiene_data', v_mom_tiene_data
    ),
    'yoy', jsonb_build_object(
      'ventas',     v_yoy_ventas,
      'utilidad',   v_yoy_utilidad,
      'n_tickets',  v_yoy_tickets,
      'tiene_data', v_yoy_tiene_data
    ),
    'mejor_dia',          v_mejor,
    'peor_dia',           v_peor,
    'heatmap_dia_semana', COALESCE(v_heatmap, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_detalle_mensual_v1(int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
