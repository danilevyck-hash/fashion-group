-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Paso 4b (proyecto Fuente Única API) — multifashion_mensual_v6,
-- multifashion_detalle_mensual_v2 y multifashion_bonos_v3 dejan de leer ventas_raw.
-- Cambio quirúrgico: los blends de año-anterior (_multifashion_sf_vw >= 2025-05-01
-- UNION/+ ventas_raw american_classic < 2025-05-01) pasan a SOLO _multifashion_sf_vw
-- (switch_facturas american_classic, historia completa backfilleada).
-- El margen tienda (switch_costo_unificado_vw) NO se toca (Opcion A).
-- Cuerpos idénticos a sus definiciones vigentes salvo esos bloques.
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

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
      -- ventas_prev: fuente única _multifashion_sf_vw (switch_facturas, historia completa).
      COALESCE((SELECT SUM(subtotal) FROM _multifashion_sf_vw
                WHERE is_wholesale = false AND mr.dia_corte_anio_anterior IS NOT NULL
                  AND fecha BETWEEN mr.prev_inicio AND mr.dia_corte_anio_anterior), 0)::numeric AS ventas_prev
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


NOTIFY pgrst, 'reload schema';


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

  -- YoY: fuente única _multifashion_sf_vw (switch_facturas, historia completa).
  SELECT
    COALESCE((SELECT SUM(subtotal) FROM _multifashion_sf_vw
              WHERE is_wholesale = false AND fecha BETWEEN v_yoy_mes_inicio AND v_yoy_mes_fin), 0),
    COALESCE((SELECT COUNT(*) FROM _multifashion_sf_vw
              WHERE is_wholesale = false AND fecha BETWEEN v_yoy_mes_inicio AND v_yoy_mes_fin), 0)
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


-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_bonos_v2 → v3
--
-- Cambio de UNIVERSO: el bono ahora se calcula sobre TIENDA COMPLETA (retail +
-- mayoreo), no retail-only. La regla de negocio es tienda completa; v2 filtraba
-- is_wholesale=false, lo que subestimaba meses con mayoreo (ej. abril 2026 tiene
-- 24,807 de mayoreo). Se elimina el filtro is_wholesale en TODO el cálculo:
--   • Total tienda del bono gerente (año actual + blend año anterior).
--   • Ranking de vendedoras (consistente con el ranking MoM de v3, que tampoco
--     filtra is_wholesale).
--
-- Validado:
--   • Mayo 2026 TC 42,446.03 vs 36,302.49 → +16.9% → 100 (mayoreo 0, igual a v2).
--   • Abril 2026 TC 72,182.17 vs 66,778.36 → +8.1% → 50 (abril 2025 vía ventas_raw).
--
-- Resto SIN cambio vs v2: mismo blend año-anterior (switch >= 2025-05 ∪ ventas_raw
-- < 2025-05), elegibilidad sync-aware, reglas 50/100, gerente vía app_settings.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS multifashion_bonos_v2(int, int);

CREATE OR REPLACE FUNCTION multifashion_bonos_v3(
  p_year int,
  p_mes  int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_managers  jsonb;
  v_fecha_max date;
  v_blend_cut date := DATE '2025-05-01';  -- switch arranca acá; antes va ventas_raw

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

  -- Fecha máxima sincronizada (tienda completa) — misma fuente que Overview.
  SELECT MAX(fecha) INTO v_fecha_max
  FROM _multifashion_sf_vw;

  IF v_fecha_max IS NULL THEN
    RETURN jsonb_build_object('sin_data', true);
  END IF;

  -- Último mes elegible (sync-aware): mayor mes cuyo último día <= MAX(fecha) y < hoy.
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

  -- ── BONO GERENTE: TIENDA COMPLETA (retail + mayoreo), mes completo ───────────
  SELECT COALESCE(SUM(subtotal), 0) INTO v_ventas_tienda
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_mes_inicio AND v_mes_fin;

  -- Año anterior: fuente única _multifashion_sf_vw (switch_facturas, historia completa), TC.
  v_ventas_tienda_prev :=
      COALESCE((SELECT SUM(subtotal) FROM _multifashion_sf_vw
                WHERE fecha BETWEEN v_prev_inicio AND v_prev_fin), 0);

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

  -- ── RANKING VENDEDORAS (tienda completa, YoY con blend) + badge 50 ──────────
  WITH actual AS (
    SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor,
           SUM(subtotal) AS ventas,
           COUNT(DISTINCT n_sistema) AS tickets
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_mes_inicio AND v_mes_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  ),
  prev AS (
    -- Fuente única _multifashion_sf_vw (switch_facturas, historia completa).
    SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor, SUM(subtotal) AS ventas
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_prev_inicio AND v_prev_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
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
$$;

GRANT EXECUTE ON FUNCTION multifashion_bonos_v3(int, int) TO service_role;

NOTIFY pgrst, 'reload schema';


