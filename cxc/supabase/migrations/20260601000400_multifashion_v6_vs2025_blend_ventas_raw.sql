-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_mensual_v5 → v6 + fix YoY de multifashion_detalle_mensual_v1
--
-- PROBLEMA: la columna "VS 2025" del tab Multifashion (tabla Detalle mensual ·
-- retail del Overview, y el YoY del subtab Detalle mensual) mostraba % SOLO en
-- mayo; Ene-Abr daban "—". Causa: el comparativo prev-year leía solo
-- _multifashion_sf_vw (switch_facturas), que arranca 2025-05-02. Ene-Abr 2025
-- no existen en switch → ventas_prev=0 → vs2025 NULL → "—". El dato SÍ existe
-- en ventas_raw (Ene 21,996.83 / Feb 42,046.32 / Mar 36,224.21 / Abr 66,778.36
-- total; retail-only: 21,996.83 / 42,046.32 / 36,224.21 / 42,861.36).
--
-- FIX: rellenar el ventas_prev de los meses pre-2025-05 desde ventas_raw,
-- manteniendo switch-vs-switch para mayo+. Mismo blend que el tab Resumen
-- (switch_ventas_unificado_vw: switch ≥ 2025-05 ∪ ventas_raw < 2025-05).
--
-- BASE CONTABLE (idéntica a switch_ventas_unificado_vw):
--   switch:     SUM(subtotal) de _multifashion_sf_vw — subtotal_descuento de
--               F/T/Tr/ND menos NC (la vista ya guarda NC en negativo).
--   ventas_raw: SUM(subtotal) — ventas_raw ya guarda NC en negativo, así netea.
--   + filtro is_wholesale=false que la serie RETAIL requiere (la vista unificada
--     es empresa-level y no separa wholesale; acá comparamos retail-vs-retail).
--   El guard de fecha (≥ / < 2025-05-01) selecciona la fuente por cobertura, igual
--   que la vista unificada. Ningún mes cruza el límite → sin doble conteo.
--
-- RECONCILIACIÓN (simulada read-only del blend, antes de aplicar):
--   Ene +51.3% · Feb −8.8% · Mar +5.8% · Abr +10.5% · May +16.9% (sin cambio).
--   DoD: Ene-Abr 2026 muestran % (no "—"); mayo mantiene su +17%.
--
-- DOS FUNCIONES:
--   1) multifashion_mensual_v6  — RENAME v5→v6 (cache-bust PostgREST/Vercel,
--      mismo patrón v3→v4→v5). Único cambio vs v5: ventas_prev de retail.meses
--      ahora es BLEND. Frontend (fetchMultifashion) pasa a llamar v6.
--   2) multifashion_detalle_mensual_v1 — CREATE OR REPLACE IN-PLACE. El shape de
--      salida NO cambia (yoy.{ventas,n_tickets,tiene_data} idéntico), solo los
--      VALORES del YoY pasan a BLEND. Por eso NO se renombra: misma firma, mismo
--      shape, PostgREST ejecuta el cuerpo nuevo al instante (+ NOTIFY reload). El
--      API route y el componente no cambian.
--
-- NO dropea v3/v4/v5 — quedan vivos durante validación. Dropear manual luego:
--   DROP FUNCTION IF EXISTS multifashion_mensual_v5(int, int);
--   DROP FUNCTION IF EXISTS multifashion_mensual_v4(int, int);
--   DROP FUNCTION IF EXISTS multifashion_mensual_v3(int, int);
--
-- DEPENDENCIAS (todas en prod): _multifashion_sf_vw, switch_ventas_unificado_vw,
--   switch_costo_unificado_vw, ventas_raw.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1) multifashion_mensual_v6 (= v5 + ventas_prev BLEND en retail.meses)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION multifashion_mensual_v6(p_year int, p_mes int)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_meta_anual numeric;
  v_growth_pct numeric;
  v_tienda     text;
  v_ubicacion  text;
  v_manager    text;
  v_retail_ventas      numeric;
  v_retail_tickets     bigint;
  v_retail_ticket_prom numeric;
  v_wholesale_ventas        numeric;
  v_wholesale_tickets       bigint;
  v_wholesale_top_cliente   text;
  v_wholesale_total_clientes int;
  v_total_ventas  numeric;
  v_total_tickets bigint;
  v_ventas_2025_ytd    numeric;
  v_expected_today_pct numeric;
  v_retail_meses    jsonb;
  v_wholesale_meses jsonb;
  -- Margen TIENDA COMPLETA (de v5): costo real switch_costo_diario vs ventas totales
  v_tienda_ventas      numeric;
  v_tienda_costo       numeric;
  v_tienda_margen      numeric;
  v_tienda_ventas_prev numeric;
  v_tienda_costo_prev  numeric;
  v_tienda_margen_prev numeric;
BEGIN
  v_meta_anual := COALESCE((get_app_setting('multifashion_meta_anual_2026'))::numeric, 800000);
  v_growth_pct := COALESCE((get_app_setting('multifashion_growth_target_pct'))::numeric, 5);
  v_tienda     := COALESCE(get_app_setting('multifashion_tienda')    #>> '{}', 'American Classics');
  v_ubicacion  := COALESCE(get_app_setting('multifashion_ubicacion') #>> '{}', 'Chiriquí');
  v_manager    := COALESCE(get_app_setting('multifashion_manager')   #>> '{}', '');

  -- ═══ VENTAS / TICKETS: idéntico a v5 / v3 fase 2.1b (switch_facturas) ══════

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_retail_ventas, v_retail_tickets
  FROM _multifashion_sf_vw
  WHERE is_wholesale = false AND anio = p_year AND mes <= p_mes;
  v_retail_ticket_prom := CASE WHEN v_retail_tickets > 0 THEN v_retail_ventas / v_retail_tickets ELSE 0 END;

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_wholesale_ventas, v_wholesale_tickets
  FROM _multifashion_sf_vw
  WHERE is_wholesale = true AND anio = p_year AND mes <= p_mes;

  WITH cli AS (
    SELECT cliente, SUM(subtotal) AS s
    FROM _multifashion_sf_vw
    WHERE is_wholesale = true AND anio = p_year AND mes <= p_mes
      AND cliente IS NOT NULL AND TRIM(cliente) <> ''
    GROUP BY cliente
  )
  SELECT cliente, (SELECT COUNT(*) FROM cli)
  INTO v_wholesale_top_cliente, v_wholesale_total_clientes
  FROM cli ORDER BY s DESC LIMIT 1;

  v_total_ventas  := v_retail_ventas  + v_wholesale_ventas;
  v_total_tickets := v_retail_tickets + v_wholesale_tickets;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_ventas_2025_ytd
  FROM _multifashion_sf_vw
  WHERE anio = p_year - 1 AND mes <= p_mes;
  v_expected_today_pct := CASE
    WHEN v_meta_anual > 0 THEN LEAST(1, (v_ventas_2025_ytd * (1 + v_growth_pct / 100.0)) / v_meta_anual)
    ELSE 0
  END;

  -- retail.meses[12] con same-period day-by-day
  WITH mes_meta AS (
    SELECT m.mes,
      make_date(p_year, m.mes, 1) AS inicio,
      (make_date(p_year, m.mes, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date AS fin_full,
      make_date(p_year - 1, m.mes, 1) AS prev_inicio,
      (make_date(p_year - 1, m.mes, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date AS prev_fin_full
    FROM generate_series(1, 12) AS m(mes)
  ),
  mes_corte AS (
    SELECT mm.*,
      (CURRENT_DATE BETWEEN mm.inicio AND mm.fin_full) AS es_parcial,
      CASE
        WHEN (CURRENT_DATE BETWEEN mm.inicio AND mm.fin_full)
          THEN (SELECT MAX(fecha) FROM _multifashion_sf_vw
                WHERE is_wholesale = false AND fecha BETWEEN mm.inicio AND mm.fin_full)
        ELSE mm.fin_full
      END AS fecha_corte
    FROM mes_meta mm
  ),
  mes_resuelto AS (
    SELECT mc.*,
      CASE
        WHEN mc.es_parcial AND mc.fecha_corte IS NOT NULL
          THEN LEAST(mc.prev_inicio + (mc.fecha_corte - mc.inicio), mc.prev_fin_full)
        WHEN NOT mc.es_parcial THEN mc.prev_fin_full
        ELSE NULL
      END AS dia_corte_anio_anterior
    FROM mes_corte mc
  ),
  mes_agg AS (
    SELECT mr.mes, mr.es_parcial, mr.fecha_corte, mr.dia_corte_anio_anterior,
      COALESCE((SELECT SUM(subtotal) FROM _multifashion_sf_vw
                WHERE is_wholesale = false AND mr.fecha_corte IS NOT NULL
                  AND fecha BETWEEN mr.inicio AND mr.fecha_corte), 0)::numeric AS ventas,
      COALESCE((SELECT COUNT(*) FROM _multifashion_sf_vw
                WHERE is_wholesale = false AND mr.fecha_corte IS NOT NULL
                  AND fecha BETWEEN mr.inicio AND mr.fecha_corte), 0)::int AS tickets,
      -- ventas_prev BLEND (v6): switch (≥ 2025-05) + ventas_raw (< 2025-05).
      -- Misma base que switch_ventas_unificado_vw, retail-only (is_wholesale=false).
      -- Ningún mes prev cruza el límite → las dos ramas no se solapan.
      (
        COALESCE((SELECT SUM(subtotal) FROM _multifashion_sf_vw
                  WHERE is_wholesale = false AND mr.dia_corte_anio_anterior IS NOT NULL
                    AND fecha BETWEEN mr.prev_inicio AND mr.dia_corte_anio_anterior
                    AND fecha >= DATE '2025-05-01'), 0)
        + COALESCE((SELECT SUM(subtotal) FROM ventas_raw
                  WHERE empresa = 'american_classic' AND is_wholesale = false
                    AND mr.dia_corte_anio_anterior IS NOT NULL
                    AND fecha BETWEEN mr.prev_inicio AND mr.dia_corte_anio_anterior
                    AND fecha < DATE '2025-05-01'), 0)
      )::numeric AS ventas_prev
    FROM mes_resuelto mr
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'mes', CASE a.mes WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
                       WHEN 4 THEN 'Abr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
                       WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago' WHEN 9 THEN 'Sep'
                       WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' ELSE 'Dic' END,
      'ventas', a.ventas, 'tickets', a.tickets,
      'ticketProm', CASE WHEN a.tickets > 0 THEN a.ventas / a.tickets ELSE 0 END,
      'vs2025', CASE
                  WHEN a.tickets = 0 AND a.ventas = 0 THEN NULL
                  WHEN a.ventas_prev > 0 THEN (a.ventas - a.ventas_prev) / a.ventas_prev
                  ELSE NULL
                END,
      'es_periodo_parcial', a.es_parcial,
      'fecha_corte', CASE WHEN a.es_parcial AND a.fecha_corte IS NOT NULL
                          THEN to_char(a.fecha_corte, 'YYYY-MM-DD') ELSE NULL END,
      'dia_corte_anio_anterior', CASE WHEN a.es_parcial AND a.dia_corte_anio_anterior IS NOT NULL
                                       THEN to_char(a.dia_corte_anio_anterior, 'YYYY-MM-DD') ELSE NULL END
    ) ORDER BY a.mes
  )
  INTO v_retail_meses
  FROM mes_agg a;

  -- wholesale.meses[12] simple
  WITH ws AS (
    SELECT mes, SUM(subtotal)::numeric AS ventas, COUNT(*)::int AS tickets
    FROM _multifashion_sf_vw
    WHERE is_wholesale = true AND anio = p_year
    GROUP BY mes
  ),
  m AS (SELECT generate_series(1, 12) AS mes)
  SELECT jsonb_agg(
    jsonb_build_object(
      'mes', CASE m.mes WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
                       WHEN 4 THEN 'Abr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
                       WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago' WHEN 9 THEN 'Sep'
                       WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' ELSE 'Dic' END,
      'ventas', COALESCE(ws.ventas, 0),
      'tickets', COALESCE(ws.tickets, 0)
    ) ORDER BY m.mes
  )
  INTO v_wholesale_meses
  FROM m LEFT JOIN ws ON ws.mes = m.mes;

  -- ═══ MARGEN TIENDA COMPLETA (idéntico a v5) ═══════════════════════════════
  SELECT
    COALESCE(SUM(v.ventas_netas) FILTER (WHERE COALESCE(c.costo_total, 0) > 0), 0),
    COALESCE(SUM(c.costo_total)  FILTER (WHERE COALESCE(c.costo_total, 0) > 0), 0)
  INTO v_tienda_ventas, v_tienda_costo
  FROM switch_ventas_unificado_vw v
  LEFT JOIN switch_costo_unificado_vw c
    ON c.empresa_key = v.empresa_key AND c.mes = v.mes
  WHERE v.empresa_key = 'american_classic'
    AND EXTRACT(YEAR FROM v.mes)::int = p_year
    AND EXTRACT(MONTH FROM v.mes)::int <= p_mes;
  v_tienda_margen := CASE WHEN v_tienda_ventas > 0
                          THEN (v_tienda_ventas - v_tienda_costo) / v_tienda_ventas
                          ELSE NULL END;

  SELECT
    COALESCE(SUM(v.ventas_netas) FILTER (WHERE COALESCE(c.costo_total, 0) > 0), 0),
    COALESCE(SUM(c.costo_total)  FILTER (WHERE COALESCE(c.costo_total, 0) > 0), 0)
  INTO v_tienda_ventas_prev, v_tienda_costo_prev
  FROM switch_ventas_unificado_vw v
  LEFT JOIN switch_costo_unificado_vw c
    ON c.empresa_key = v.empresa_key AND c.mes = v.mes
  WHERE v.empresa_key = 'american_classic'
    AND EXTRACT(YEAR FROM v.mes)::int = p_year - 1
    AND EXTRACT(MONTH FROM v.mes)::int <= p_mes;
  v_tienda_margen_prev := CASE WHEN v_tienda_ventas_prev > 0
                               THEN (v_tienda_ventas_prev - v_tienda_costo_prev) / v_tienda_ventas_prev
                               ELSE NULL END;

  RETURN jsonb_build_object(
    'tienda',            v_tienda,
    'ubicacion',         v_ubicacion,
    'manager',           v_manager,
    'metaAnual',         v_meta_anual,
    'expectedTodayPct',  v_expected_today_pct,
    'retail', jsonb_build_object(
      'ytdVentas',  v_retail_ventas,
      'ytdTickets', v_retail_tickets,
      'ticketProm', v_retail_ticket_prom,
      'margen',     NULL,
      'margenPrev', NULL,
      'meses',      COALESCE(v_retail_meses, '[]'::jsonb)
    ),
    'wholesale', jsonb_build_object(
      'ytdVentas',      v_wholesale_ventas,
      'ytdTickets',     v_wholesale_tickets,
      'topClienteName', v_wholesale_top_cliente,
      'totalClientes',  COALESCE(v_wholesale_total_clientes, 0),
      'meses',          COALESCE(v_wholesale_meses, '[]'::jsonb)
    ),
    'total', jsonb_build_object(
      'ytdVentas',  v_total_ventas,
      'ytdTickets', v_total_tickets,
      'margen',     v_tienda_margen,
      'margenPrev', v_tienda_margen_prev
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_mensual_v6(int, int) TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2) multifashion_detalle_mensual_v1 — CREATE OR REPLACE in-place
--    Único cambio vs fase 2.1b: el bloque YoY (v_yoy_ventas / v_yoy_tickets) pasa
--    a BLEND switch (≥ 2025-05) + ventas_raw (< 2025-05). Shape de salida idéntico.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION multifashion_detalle_mensual_v1(p_year int, p_mes int)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_mes_inicio date; v_mes_fin_full date; v_mes_fin_real date;
  v_dias_en_mes int; v_dia_actual int; v_is_mes_actual boolean;
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

  v_mes_fin_real := CASE WHEN v_dia_actual > 0
                          THEN make_date(p_year, p_mes, v_dia_actual) ELSE v_mes_inicio END;

  IF p_mes > 1 THEN v_prev_mes_inicio := make_date(p_year, p_mes - 1, 1);
  ELSE v_prev_mes_inicio := make_date(p_year - 1, 12, 1); END IF;
  v_prev_mes_fin := LEAST(
    v_prev_mes_inicio + (v_dia_actual - 1),
    (v_prev_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date
  );

  v_yoy_mes_inicio := make_date(p_year - 1, p_mes, 1);
  v_yoy_mes_fin := LEAST(
    v_yoy_mes_inicio + (v_dia_actual - 1),
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

  -- MoM (mes anterior) — sin cambios: el mes anterior de cualquier mes 2026 está
  -- dentro de la cobertura switch (Dic 2025+), no toca el hueco pre-may-2025.
  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_mom_ventas, v_mom_tickets
  FROM _multifashion_sf_vw
  WHERE is_wholesale = false AND fecha BETWEEN v_prev_mes_inicio AND v_prev_mes_fin;
  v_mom_tiene_data := (v_mom_tickets > 0);

  -- YoY BLEND (v6 fix): switch_facturas (≥ 2025-05) + ventas_raw (< 2025-05),
  -- misma base que switch_ventas_unificado_vw, retail-only. Antes solo leía switch
  -- → Ene-Abr 2025 (sin cobertura) daban 0 → tiene_data=false → "—".
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

GRANT EXECUTE ON FUNCTION multifashion_detalle_mensual_v1(int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
