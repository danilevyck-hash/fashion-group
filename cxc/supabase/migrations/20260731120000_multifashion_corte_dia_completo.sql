-- ─────────────────────────────────────────────────────────────────────────────
-- Multifashion: el mes en curso corta en el último día COMPLETO (Panamá) — en
-- el card Y en la tabla, con la MISMA definición.
--
-- ── 🩸 EL BUG, medido el 31-jul-2026 contra switch_facturas ─────────────────
--
-- La tabla "Mes a mes vs 2025" decía "Jul d30" y prometía "mismo corte", pero
-- sumaba los movimientos de HOY día 31: +USD 20.00 +USD 102.85 y una NC de -USD 300.73
-- (neto -USD 177.88). Card: USD 39,031.23 (cortaba en d30). Tabla: USD 38,853.36 =
-- 39,031.23 - 177.88, al centavo.
--
-- Y LAS BASES 2025 DIFERÍAN: el card comparaba contra USD 32,467.21 (jul-2025
-- días 1-30, mismo corte) y la tabla contra USD 33,544.16 (jul-2025 COMPLETO,
-- días 1-31). USD 1,076.95 de diferencia = las ventas del 31-jul-2025. Por eso
-- 20.2 pct vs 15.8 pct. NO es el blend (jul-2025 es post-frontera 2025-05-02 y las
-- dos leen _multifashion_sf_vw): son dos definiciones de corte conviviendo.
--
-- LA CORRECTA ES LA DEL CARD — same-period día a día, días 1..corte en los DOS
-- años — pero acertaba POR ACCIDENTE: su corte era "último día con
-- SUM(subtotal) > 0", y el 31-jul dio d30 solo porque el día 31 neteaba
-- negativo. Un día en curso con ventas positivas se habría colado igual.
--
-- ── LA DEFINICIÓN, una sola ────────────────────────────────────────────────
--
-- Mes en curso → corta en (hoy Panamá - 1), el último día COMPLETO; el año
-- anterior corta en el MISMO día. Mes cerrado → mes completo en los dos años.
-- Calendario, no datos: el corte ya no depende de si hoy vendió o devolvió.
--
-- Panamá = UTC-5 fijo (sin DST), misma conversión que ya usa la vista
-- _multifashion_sf_vw. CURRENT_DATE (UTC) resolvía mal de 7pm a medianoche.
--
-- Se reemplazan multifashion_mensual_v7 (tabla) y multifashion_detalle_mensual_v2
-- (card). ⚠️ multifashion_mensual_v6 queda con el corte viejo A PROPÓSITO: es el
-- fallback del frontend solo si v7 no existe, y v7 existe en prod — replicar el
-- cuerpo ahí triplicaría la superficie de SQL sin cambiar lo que corre.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- El día de hoy en Panamá: LA fuente del corte, compartida por las dos RPCs.
CREATE OR REPLACE FUNCTION multifashion_hoy_panama()
RETURNS date LANGUAGE sql STABLE AS
$fn$ SELECT (now() AT TIME ZONE 'America/Panama')::date $fn$;

GRANT EXECUTE ON FUNCTION multifashion_hoy_panama() TO service_role;

CREATE OR REPLACE FUNCTION multifashion_mensual_v7(p_year int, p_mes int)
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
  -- Margen TIENDA COMPLETA
  v_tienda_ventas      numeric;
  v_tienda_costo       numeric;
  v_tienda_margen      numeric;
  v_tienda_ventas_prev numeric;
  v_tienda_costo_prev  numeric;
  v_tienda_margen_prev numeric;
  -- Día de HOY en Panamá (UTC-5). CURRENT_DATE es UTC: de 7pm a medianoche
  -- Panamá ya es "mañana" en UTC y el mes en curso se resolvía mal.
  v_hoy_pma date := multifashion_hoy_panama();
BEGIN
  v_meta_anual := COALESCE((get_app_setting('multifashion_meta_anual_2026'))::numeric, 800000);
  v_growth_pct := COALESCE((get_app_setting('multifashion_growth_target_pct'))::numeric, 5);
  v_tienda     := COALESCE(get_app_setting('multifashion_tienda')    #>> '{}', 'American Classics');
  v_ubicacion  := COALESCE(get_app_setting('multifashion_ubicacion') #>> '{}', 'Chiriquí');
  v_manager    := COALESCE(get_app_setting('multifashion_manager')   #>> '{}', '');

  -- ═══ VENTAS / TICKETS (idéntico a v6) ══════════════════════════════════════
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

  -- retail.meses[12] con same-period day-by-day (idéntico a v6)
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
      (v_hoy_pma BETWEEN mm.inicio AND mm.fin_full) AS es_parcial,
      -- 🩸 EL MES EN CURSO CORTA EN EL ÚLTIMO DÍA COMPLETO (Panamá), no en
      -- MAX(fecha) con datos. MAX(fecha) incluía los movimientos de HOY: el
      -- 31-jul-2026 la tabla decía "Jul d30" pero sumaba el día 31 a medias
      -- (neto -USD 177.88 por una NC), y quedaba USD 38,853.36 contra los USD 39,031.23
      -- del card. La etiqueta y el corte tienen que decir lo mismo.
      -- El día -1 puede caer antes del inicio del mes (día 1): NULL = sin datos.
      CASE
        WHEN (v_hoy_pma BETWEEN mm.inicio AND mm.fin_full)
          THEN CASE WHEN v_hoy_pma - 1 >= mm.inicio THEN v_hoy_pma - 1 ELSE NULL END
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

  -- wholesale.meses[12] simple (idéntico a v6)
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

  -- ═══ MARGEN TIENDA COMPLETA — HÍBRIDO desde la MV (Parte C) ════════════════
  -- Antes: 2 agregaciones EN VIVO de switch_ventas_unificado_vw (~2.2s c/u).
  -- Ahora: helper híbrido (cerrados=MV, mes en curso=vivo). Mismo número exacto.
  SELECT h.ventas, h.costo INTO v_tienda_ventas, v_tienda_costo
  FROM multifashion_tienda_vc_hibrido(p_year, 1, p_mes) h;
  v_tienda_margen := CASE WHEN v_tienda_ventas > 0
                          THEN (v_tienda_ventas - v_tienda_costo) / v_tienda_ventas
                          ELSE NULL END;

  SELECT h.ventas, h.costo INTO v_tienda_ventas_prev, v_tienda_costo_prev
  FROM multifashion_tienda_vc_hibrido(p_year - 1, 1, p_mes) h;
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

GRANT EXECUTE ON FUNCTION multifashion_mensual_v7(int, int) TO service_role;

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
  -- Mes en curso por día PANAMÁ (UTC-5), no CURRENT_DATE (UTC): de 7pm a
  -- medianoche Panamá, UTC ya está en mañana y el mes se resolvía mal de noche.
  v_is_mes_actual := (p_year = EXTRACT(YEAR FROM multifashion_hoy_panama())::int
                      AND p_mes = EXTRACT(MONTH FROM multifashion_hoy_panama())::int);

  -- 🩸 EL MES EN CURSO CORTA EN EL ÚLTIMO DÍA COMPLETO (Panamá). Antes era
  -- MAX(día con SUM(subtotal) > 0), que acertaba el d30 el 31-jul-2026 SOLO
  -- porque el día 31 neteaba NEGATIVO (una NC de -USD 300.73 superaba las ventas):
  -- con un día 31 positivo habría sumado el día a medias, igual que la tabla.
  -- Calendario, no datos: así el corte no depende de si hoy vendió o devolvió.
  v_dia_actual := CASE
    WHEN v_is_mes_actual
      THEN GREATEST(LEAST(EXTRACT(DAY FROM multifashion_hoy_panama())::int - 1, v_dias_en_mes), 0)
    ELSE (SELECT COALESCE(MAX(EXTRACT(DAY FROM fecha)::int), 0)
          FROM _multifashion_sf_vw
          WHERE is_wholesale = false AND fecha BETWEEN v_mes_inicio AND v_mes_fin_full)
  END;

  -- Día de corte para los comparativos (MoM/YoY):
  --   • mes EN CURSO  → último día COMPLETO (same-period justo, mismo día en
  --                     el año anterior).
  --   • mes CERRADO   → mes completo (compara mes vs mes).
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
