-- ─────────────────────────────────────────────────────────────────────────────
-- Multifashion — TODO PORCENTAJE ES RETAIL CONTRA RETAIL (23-sep-2026).
--
-- Daniel, textual: «Quiero que se compare sin contar el mayoreo. Y abajo
-- chiquitito me pones tanto por el mayoreo para yo saber cuánta plata entró a
-- la tienda. Pero el número que en verdad me interesa es el real de ventas
-- retail.»
--
-- ── 🩸 EL BUG, medido el 23-sep-2026 contra producción ──────────────────────
--
-- Cuatro RPC del módulo leían enero–abril de 2025 de `ventas_raw` (la tabla
-- vieja del CSV) y de mayo en adelante de `_multifashion_sf_vw`. En
-- `ventas_raw` el mayoreo NO está marcado (0 de 25.727 filas con
-- `is_wholesale = true`), así que las cuatro facturas de LA FRONTERA DUTY FREE
-- del 30-abr-2025 ($23.917,00) entraban como venta de TIENDA del año pasado.
-- El lado 2026 iba sin mayoreo y el lado 2025 con abril adentro:
--
--   · Tarjeta «Año 2026»: «cierra en $731.169,97 ▲ +8,1 % vs 2025»
--                         → es $755.341,55 ▲ +15,8 % (tienda contra tienda).
--   · Tarjeta del mes en abril: «▼ 29,1 % vs abr 2025» ($47.375,17 vs
--     $66.778,36) → es ▲ +10,5 % ($47.375,17 vs $42.861,32).
--   · Bono de la gerente: abril 8,1 % → $50 (es 10,5 % → $100); junio 11,1 %
--     → $100 (es 8,8 % → $50). Ene–ago sigue sumando $600.
--
-- `switch_facturas` YA tiene 2024 y 2025 COMPLETOS, fila por fila igual que
-- `ventas_raw` (2025: 12.948 documentos en las dos; $686.044,05 vs
-- $686.043,69, centavos de redondeo). El pegado en el 1-may-2025 sobra.
--
-- ── QUÉ HACE ESTA MIGRACIÓN ────────────────────────────────────────────────
--
-- Versiones NUEVAS de las cuatro RPC, que leen SOLO `_multifashion_sf_vw` con
-- `is_wholesale = false`. Los cuerpos son los de las versiones anteriores con
-- la rama `ventas_raw` quitada y NADA MÁS: ningún otro número se mueve.
--
--   _multifashion_retail_blend_sum → _multifashion_retail_sum
--   multifashion_overview_serie_v1 → multifashion_overview_serie_v2
--   multifashion_proyeccion_cierre_v1 → multifashion_proyeccion_cierre_v2
--   multifashion_detalle_mensual_v2 → multifashion_detalle_mensual_v3
--   multifashion_bonos_v4 → multifashion_bonos_v5 (la base del bono de la
--     gerente pasa a retail contra retail; el ranking de vendedoras no cambia)
--
-- 🔴 Las versiones viejas NO se tocan ni se dropean: el código las llama
-- mientras esta migración no corra (patrón v4 → v3), y con el interruptor
-- `RETAIL_AL_FRENTE` en `false` vuelve a pedirlas.
--
-- Aplicar con `npm run migrar supabase/migrations/20261217140000_multifashion_retail_contra_retail.sql`.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper escalar: suma RETAIL de subtotal en [d_start, d_end]. Solo la vista.
CREATE OR REPLACE FUNCTION _multifashion_retail_sum(d_start date, d_end date)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT SUM(subtotal) FROM _multifashion_sf_vw
                   WHERE is_wholesale = false
                     AND fecha BETWEEN d_start AND d_end), 0);
$$;

-- ── serie diaria + rollup mensual para UN año (= v1 sin la rama vieja) ───────
CREATE OR REPLACE FUNCTION multifashion_overview_serie_v2(p_year int)
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

  WITH ventas_dia AS (
    SELECT fecha, SUM(subtotal)::numeric AS ventas
    FROM _multifashion_sf_vw
    WHERE is_wholesale = false
      AND fecha BETWEEN v_anio_inicio AND v_corte
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

  WITH ventas_mes AS (
    SELECT EXTRACT(MONTH FROM fecha)::int AS mes, SUM(subtotal)::numeric AS ventas
    FROM _multifashion_sf_vw
    WHERE is_wholesale = false
      AND fecha BETWEEN v_anio_inicio AND v_corte
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

-- ── proyección de cierre por temporada (= v1 con el helper nuevo) ────────────
CREATE OR REPLACE FUNCTION multifashion_proyeccion_cierre_v2(p_year int)
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
  v_corte_prev := v_prev_inicio + (v_corte - v_act_inicio);

  v_cierre_prev := _multifashion_retail_sum(v_prev_inicio, v_prev_fin);
  v_ytd_actual  := _multifashion_retail_sum(v_act_inicio, v_corte);
  v_ytd_prev    := _multifashion_retail_sum(v_prev_inicio, v_corte_prev);

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

-- ── detalle mensual (= v2 con el YoY leído SOLO de la vista) ─────────────────
CREATE OR REPLACE FUNCTION multifashion_detalle_mensual_v3(p_year int, p_mes int)
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
  v_is_mes_actual := (p_year = EXTRACT(YEAR FROM multifashion_hoy_panama())::int
                      AND p_mes = EXTRACT(MONTH FROM multifashion_hoy_panama())::int);

  v_dia_actual := CASE
    WHEN v_is_mes_actual
      THEN GREATEST(LEAST(EXTRACT(DAY FROM multifashion_hoy_panama())::int - 1, v_dias_en_mes), 0)
    ELSE (SELECT COALESCE(MAX(EXTRACT(DAY FROM fecha)::int), 0)
          FROM _multifashion_sf_vw
          WHERE is_wholesale = false AND fecha BETWEEN v_mes_inicio AND v_mes_fin_full)
  END;

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

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_ventas_cur, v_tickets_cur
  FROM _multifashion_sf_vw
  WHERE is_wholesale = false AND fecha BETWEEN v_mes_inicio AND v_mes_fin_real;
  v_ticket_prom := CASE WHEN v_tickets_cur > 0 THEN v_ventas_cur / v_tickets_cur ELSE 0 END;
  v_proyeccion  := CASE WHEN v_is_mes_actual AND v_dia_actual > 0
                         THEN (v_ventas_cur / v_dia_actual) * v_dias_en_mes ELSE NULL END;

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_mom_ventas, v_mom_tickets
  FROM _multifashion_sf_vw
  WHERE is_wholesale = false AND fecha BETWEEN v_prev_mes_inicio AND v_prev_mes_fin;
  v_mom_tiene_data := (v_mom_tickets > 0);

  -- 🔴 YoY: SOLO la vista, retail contra retail. (La v2 pegaba `ventas_raw`
  -- antes del 1-may-2025, donde el mayoreo no está marcado.)
  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_yoy_ventas, v_yoy_tickets
  FROM _multifashion_sf_vw
  WHERE is_wholesale = false AND fecha BETWEEN v_yoy_mes_inicio AND v_yoy_mes_fin;
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

-- ── bonos (= v4 con la base de la gerente en RETAIL contra RETAIL) ──────────
-- El ranking de vendedoras no cambia: sus CTE son los mismos de la v4. Solo la
-- venta de la tienda que decide el bono de la gerente deja de sumar el mayoreo,
-- en los DOS años.
CREATE OR REPLACE FUNCTION public.multifashion_bonos_v5(
  p_year integer, p_mes integer DEFAULT NULL::integer
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_managers  jsonb;
  v_fecha_max date;

  v_ult_mes_fin date;
  v_ult_year    int;
  v_ult_mes     int;

  v_year        int := p_year;
  v_mes         int;
  v_mes_inicio  date;
  v_mes_fin     date;
  v_prev_inicio date;
  v_prev_fin    date;
  v_elegible    boolean;

  v_ventas_tienda      numeric;
  v_ventas_tienda_prev numeric;
  v_tiene_comp_ger     boolean;
  v_delta_ger          numeric;
  v_bono_ger           int;
  v_gerente_nombre     text;

  v_vendedoras jsonb;
BEGIN
  v_managers := COALESCE(get_app_setting('multifashion_managers'), '[]'::jsonb);

  SELECT MAX(fecha) INTO v_fecha_max FROM _multifashion_sf_vw;

  IF v_fecha_max IS NULL THEN
    RETURN jsonb_build_object('sin_data', true);
  END IF;

  v_ult_mes_fin := (date_trunc('month', v_fecha_max) + INTERVAL '1 month' - INTERVAL '1 day')::date;
  IF v_ult_mes_fin > v_fecha_max OR v_ult_mes_fin >= CURRENT_DATE THEN
    v_ult_mes_fin := (date_trunc('month', v_fecha_max) - INTERVAL '1 day')::date;
  END IF;
  v_ult_year := EXTRACT(YEAR  FROM v_ult_mes_fin)::int;
  v_ult_mes  := EXTRACT(MONTH FROM v_ult_mes_fin)::int;

  IF p_mes IS NULL THEN
    IF    v_year = v_ult_year THEN v_mes := v_ult_mes;
    ELSIF v_year < v_ult_year THEN v_mes := 12;
    ELSE  v_mes := 1;
    END IF;
  ELSE
    IF p_mes < 1 OR p_mes > 12 THEN
      RAISE EXCEPTION 'p_mes inválido (1..12): %', p_mes;
    END IF;
    v_mes := p_mes;
  END IF;

  v_mes_inicio  := make_date(v_year,     v_mes, 1);
  v_mes_fin     := (v_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_prev_inicio := make_date(v_year - 1, v_mes, 1);
  v_prev_fin    := (v_prev_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

  v_elegible := (v_mes_fin < CURRENT_DATE) AND (v_mes_fin <= v_fecha_max);

  -- 🔴 RETAIL contra RETAIL: la venta de la tienda sin el mayoreo, en los dos años.
  SELECT COALESCE(SUM(subtotal), 0) INTO v_ventas_tienda
  FROM _multifashion_sf_vw
  WHERE is_wholesale = false AND fecha BETWEEN v_mes_inicio AND v_mes_fin;

  v_ventas_tienda_prev :=
      COALESCE((SELECT SUM(subtotal) FROM _multifashion_sf_vw
                WHERE is_wholesale = false AND fecha BETWEEN v_prev_inicio AND v_prev_fin), 0);

  v_tiene_comp_ger := (v_ventas_tienda_prev > 0);
  v_delta_ger := CASE WHEN v_tiene_comp_ger
                      THEN (v_ventas_tienda - v_ventas_tienda_prev) / v_ventas_tienda_prev
                      ELSE NULL END;

  v_bono_ger := 0;
  IF v_elegible AND v_tiene_comp_ger THEN
    IF    v_delta_ger >= 0.10 THEN v_bono_ger := 100;
    ELSIF v_delta_ger >= 0.05 THEN v_bono_ger := 50;
    END IF;
  END IF;

  v_gerente_nombre := NULLIF(v_managers->>0, '');

  WITH actual AS (
    SELECT vendedor_canonico AS vendedor,
           SUM(subtotal) AS ventas,
           COUNT(DISTINCT n_sistema) AS tickets
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_mes_inicio AND v_mes_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY vendedor_canonico
  ),
  prev AS (
    SELECT vendedor_canonico AS vendedor, SUM(subtotal) AS ventas
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_prev_inicio AND v_prev_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY vendedor_canonico
  ),
  joined AS (
    SELECT a.vendedor, a.ventas, a.tickets, p.ventas AS prev_ventas,
           (v_managers ? a.vendedor) AS is_mgr
    FROM actual a
    LEFT JOIN prev p ON p.vendedor = a.vendedor
  ),
  maxnm AS (
    SELECT MAX(ventas) AS m FROM joined WHERE NOT is_mgr
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre',            j.vendedor,
      'tickets',           j.tickets,
      'ventas',            j.ventas,
      'ticket_promedio',   CASE WHEN j.tickets > 0 THEN j.ventas / j.tickets ELSE 0 END,
      'manager',           j.is_mgr,
      'delta_ventas_pct',  CASE
                             WHEN COALESCE(j.prev_ventas, 0) > 0
                               THEN (j.ventas - j.prev_ventas) / j.prev_ventas
                             ELSE NULL
                           END,
      'tiene_comparacion', COALESCE(j.prev_ventas, 0) > 0,
      'bono_vendedora',    v_elegible
                             AND NOT j.is_mgr
                             AND mx.m IS NOT NULL
                             AND j.ventas = mx.m
    )
    ORDER BY j.ventas DESC
  )
  INTO v_vendedoras
  FROM joined j CROSS JOIN maxnm mx;

  RETURN jsonb_build_object(
    'mes_evaluado',        jsonb_build_object('year', v_year, 'mes', v_mes),
    'es_elegible',         v_elegible,
    'fecha_max_data',      to_char(v_fecha_max, 'YYYY-MM-DD'),
    'ultimo_mes_elegible', jsonb_build_object('year', v_ult_year, 'mes', v_ult_mes),
    'gerente', jsonb_build_object(
      'nombre',            v_gerente_nombre,
      'ventas_mes',        v_ventas_tienda,
      'ventas_mes_prev',   v_ventas_tienda_prev,
      'delta_pct',         v_delta_ger,
      'tiene_comparacion', v_tiene_comp_ger,
      'bono',              v_bono_ger
    ),
    'vendedoras', COALESCE(v_vendedoras, '[]'::jsonb)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION _multifashion_retail_sum(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION multifashion_overview_serie_v2(int) TO service_role;
GRANT EXECUTE ON FUNCTION multifashion_proyeccion_cierre_v2(int) TO service_role;
GRANT EXECUTE ON FUNCTION multifashion_detalle_mensual_v3(int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.multifashion_bonos_v5(integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
