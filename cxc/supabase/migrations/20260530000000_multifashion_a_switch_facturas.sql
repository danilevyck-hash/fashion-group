-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: tab Multifashion a fuente única switch_facturas (fase 2.1b)
--
-- Antes: las 5 RPCs multifashion_* leían ventas_raw WHERE empresa='american_classic'.
-- Ahora: leen switch_facturas WHERE empresa_key='american_classic' vía una vista
-- helper que normaliza columnas para que el swap sea quirúrgico.
--
-- Base contable: subtotal_descuento (pre-impuesto), fórmula contable
-- (positivos − NC). Igual que fase 2.1.
--
-- Costo NO existe en switch_facturas → utilidad/margen devuelven NULL.
-- El frontend renderiza '—' cuando viene null (no rompe el render).
--
-- multifashion_tickets queda como legacy (NO se borra; retirar en fase 3).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Vista helper: switch_facturas american_classic con shape de ventas_raw ──
CREATE OR REPLACE VIEW _multifashion_sf_vw AS
SELECT
  'american_classic'::text                AS empresa,
  EXTRACT(YEAR  FROM fecha)::int          AS anio,
  EXTRACT(MONTH FROM fecha)::int          AS mes,
  fecha::date                             AS fecha,
  switch_factura_id::text                 AS n_sistema,
  vendedor_nombre                         AS vendedor,
  cliente_nombre                          AS cliente,
  -- Neto pre-impuesto: positivos − NC (NC pasa con subtotal negativo).
  CASE
    WHEN tipo_comprobante IN ('Factura','Tiquete','Transacción','Nota de Débito') THEN subtotal_descuento
    WHEN tipo_comprobante = 'Nota de Crédito' THEN -subtotal_descuento
    ELSE 0
  END                                     AS subtotal,
  total::numeric                          AS total,
  is_wholesale,
  tipo_comprobante,
  -- COUNT(DISTINCT n_sistema) en el RPC viejo = COUNT(*) acá (cada switch_factura_id único).
  -- Incluye NC/ND a propósito (= "factura-level count" pedido en la spec).
  1::int                                  AS _row
FROM switch_facturas
WHERE empresa_key = 'american_classic';

GRANT SELECT ON _multifashion_sf_vw TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1) multifashion_mensual_v3 — overview (KPIs YTD + meses)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION multifashion_mensual_v3(p_year int, p_mes int)
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
BEGIN
  v_meta_anual := COALESCE((get_app_setting('multifashion_meta_anual_2026'))::numeric, 800000);
  v_growth_pct := COALESCE((get_app_setting('multifashion_growth_target_pct'))::numeric, 5);
  v_tienda     := COALESCE(get_app_setting('multifashion_tienda')    #>> '{}', 'American Classics');
  v_ubicacion  := COALESCE(get_app_setting('multifashion_ubicacion') #>> '{}', 'Chiriquí');
  v_manager    := COALESCE(get_app_setting('multifashion_manager')   #>> '{}', '');

  -- Retail YTD (is_wholesale=false)
  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_retail_ventas, v_retail_tickets
  FROM _multifashion_sf_vw
  WHERE is_wholesale = false AND anio = p_year AND mes <= p_mes;
  v_retail_ticket_prom := CASE WHEN v_retail_tickets > 0 THEN v_retail_ventas / v_retail_tickets ELSE 0 END;

  -- Wholesale YTD
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

  -- expectedTodayPct: contra TOTAL, calendario. Prev year 2025 desde switch
  -- (cobertura desde 2025-05); meses Jan-Abr 2025 cuentan como 0 → trade-off
  -- conocido del single-source switch_facturas.
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
      -- costo no disponible en switch_facturas → margen NULL (frontend → '—').
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
      'ytdTickets', v_total_tickets
    )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION multifashion_mensual_v3(int, int) TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2) multifashion_vendedoras_v3 — ranking
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION multifashion_vendedoras_v3(
  p_year int, p_periodo text, p_mes int DEFAULT NULL, p_trimestre int DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_managers jsonb;
  v_actual_inicio date; v_actual_fin_full date;
  v_prev_inicio date;   v_prev_fin_full date;
  v_actual_fin date;    v_prev_fin date;
  v_dia_offset int;
  v_es_parcial boolean;
  v_top_vendedor text;
  v_vendedoras jsonb;
  v_ventas_total numeric; v_tickets_total bigint;
  v_ventas_total_prev numeric; v_tickets_total_prev bigint;
  v_prev_year int; v_prev_month int; v_prev_trim int;
BEGIN
  v_managers := COALESCE(get_app_setting('multifashion_managers'), '[]'::jsonb);

  IF p_periodo = 'mes' THEN
    IF p_mes IS NULL OR p_mes < 1 OR p_mes > 12 THEN RAISE EXCEPTION 'p_mes requerido (1..12)'; END IF;
    v_actual_inicio := make_date(p_year, p_mes, 1);
    v_actual_fin_full := (v_actual_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
    IF p_mes > 1 THEN v_prev_year := p_year; v_prev_month := p_mes - 1;
    ELSE v_prev_year := p_year - 1; v_prev_month := 12; END IF;
    v_prev_inicio := make_date(v_prev_year, v_prev_month, 1);
    v_prev_fin_full := (v_prev_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
  ELSIF p_periodo = 'trimestre' THEN
    IF p_trimestre IS NULL OR p_trimestre < 1 OR p_trimestre > 4 THEN RAISE EXCEPTION 'p_trimestre requerido (1..4)'; END IF;
    v_actual_inicio := make_date(p_year, (p_trimestre - 1) * 3 + 1, 1);
    v_actual_fin_full := (v_actual_inicio + INTERVAL '3 months' - INTERVAL '1 day')::date;
    IF p_trimestre > 1 THEN v_prev_year := p_year; v_prev_trim := p_trimestre - 1;
    ELSE v_prev_year := p_year - 1; v_prev_trim := 4; END IF;
    v_prev_inicio := make_date(v_prev_year, (v_prev_trim - 1) * 3 + 1, 1);
    v_prev_fin_full := (v_prev_inicio + INTERVAL '3 months' - INTERVAL '1 day')::date;
  ELSIF p_periodo = 'ytd' THEN
    v_actual_inicio := make_date(p_year, 1, 1);     v_actual_fin_full := make_date(p_year, 12, 31);
    v_prev_inicio   := make_date(p_year - 1, 1, 1); v_prev_fin_full   := make_date(p_year - 1, 12, 31);
  ELSE RAISE EXCEPTION 'p_periodo inválido: % (esperado mes|trimestre|ytd)', p_periodo;
  END IF;

  SELECT MAX(fecha) INTO v_actual_fin FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin_full;

  v_es_parcial := (CURRENT_DATE BETWEEN v_actual_inicio AND v_actual_fin_full);

  IF v_actual_fin IS NULL THEN
    RETURN jsonb_build_object(
      'vendedoras', '[]'::jsonb, 'total_vendedoras_periodo', 0,
      'ventas_total', 0, 'tickets_total', 0, 'ventas_total_prev', 0, 'tickets_total_prev', 0,
      'fecha_corte', NULL, 'es_periodo_parcial', v_es_parcial,
      'dia_corte_periodo_anterior', NULL, 'dia_corte_anio_anterior', NULL
    );
  END IF;

  IF v_es_parcial THEN v_dia_offset := v_actual_fin - v_actual_inicio;
    v_prev_fin := LEAST(v_prev_inicio + v_dia_offset, v_prev_fin_full);
  ELSE v_actual_fin := v_actual_fin_full; v_prev_fin := v_prev_fin_full; END IF;

  SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') INTO v_top_vendedor
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
  GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  ORDER BY SUM(subtotal) DESC LIMIT 1;

  WITH actual AS (
    SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor,
      SUM(subtotal) AS ventas, COUNT(*) AS tickets
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  ),
  prev AS (
    SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor,
      SUM(subtotal) AS ventas, COUNT(*) AS tickets
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_prev_inicio AND v_prev_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre', a.vendedor, 'tickets', a.tickets, 'ventas', a.ventas,
      'ticket_promedio', CASE WHEN a.tickets > 0 THEN a.ventas / a.tickets ELSE 0 END,
      'comision', a.ventas * 0.005,
      'manager', v_managers ? a.vendedor,
      'top', (a.vendedor = v_top_vendedor),
      'delta_ventas_pct',  CASE WHEN COALESCE(p.ventas, 0) > 0 THEN (a.ventas - p.ventas) / p.ventas ELSE NULL END,
      'delta_tickets_pct', CASE WHEN COALESCE(p.tickets, 0) > 0 THEN (a.tickets - p.tickets)::numeric / p.tickets ELSE NULL END
    ) ORDER BY a.ventas DESC
  )
  INTO v_vendedoras
  FROM actual a LEFT JOIN prev p ON p.vendedor = a.vendedor;

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_ventas_total, v_tickets_total
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT';

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_ventas_total_prev, v_tickets_total_prev
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_prev_inicio AND v_prev_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT';

  RETURN jsonb_build_object(
    'vendedoras', COALESCE(v_vendedoras, '[]'::jsonb),
    'total_vendedoras_periodo', jsonb_array_length(COALESCE(v_vendedoras, '[]'::jsonb)),
    'ventas_total', v_ventas_total, 'tickets_total', v_tickets_total,
    'ventas_total_prev', v_ventas_total_prev, 'tickets_total_prev', v_tickets_total_prev,
    'fecha_corte', to_char(v_actual_fin, 'YYYY-MM-DD'),
    'es_periodo_parcial', v_es_parcial,
    'dia_corte_periodo_anterior', to_char(v_prev_fin, 'YYYY-MM-DD'),
    'dia_corte_anio_anterior',    to_char(v_prev_fin, 'YYYY-MM-DD')
  );
END;
$$;
GRANT EXECUTE ON FUNCTION multifashion_vendedoras_v3(int, text, int, int) TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3) multifashion_detalle_mensual_v1 — día-por-día + heatmap
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

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_mom_ventas, v_mom_tickets
  FROM _multifashion_sf_vw
  WHERE is_wholesale = false AND fecha BETWEEN v_prev_mes_inicio AND v_prev_mes_fin;
  v_mom_tiene_data := (v_mom_tickets > 0);

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
      'utilidad', NULL,        -- costo no disponible
      'n_tickets', v_tickets_cur,
      'ticket_promedio', v_ticket_prom,
      'margen', NULL,          -- frontend renderiza '—'
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

-- ═════════════════════════════════════════════════════════════════════════════
-- 4) multifashion_wholesale_clientes — clientes wholesale por rango
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION multifashion_wholesale_clientes(
  p_fecha_inicio date, p_fecha_fin date
)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_clientes jsonb; v_total_clientes int; v_total_ventas numeric; v_total_tickets bigint;
  v_mes_labels CONSTANT text[] := ARRAY['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
BEGIN
  WITH base AS (
    SELECT cliente, subtotal, fecha, n_sistema,
      EXTRACT(YEAR FROM fecha)::int AS f_anio,
      EXTRACT(MONTH FROM fecha)::int AS f_mes
    FROM _multifashion_sf_vw
    WHERE is_wholesale = true
      AND fecha BETWEEN p_fecha_inicio AND p_fecha_fin
      AND cliente IS NOT NULL AND TRIM(cliente) <> ''
  ),
  cli AS (
    SELECT cliente, SUM(subtotal)::numeric AS total_ytd,
      COUNT(*)::int AS tickets_ytd, MAX(fecha) AS ultima_compra
    FROM base GROUP BY cliente
  ),
  meses_lookup AS (
    SELECT EXTRACT(YEAR FROM gs)::int AS mes_anio, EXTRACT(MONTH FROM gs)::int AS mes_idx
    FROM generate_series(date_trunc('month', p_fecha_inicio), date_trunc('month', p_fecha_fin), INTERVAL '1 month') AS gs
  ),
  meses_por_cli AS (
    SELECT cliente, f_anio AS mes_anio, f_mes AS mes_idx,
      SUM(subtotal)::numeric AS ventas, COUNT(*)::int AS tickets
    FROM base GROUP BY cliente, f_anio, f_mes
  ),
  cli_meses AS (
    SELECT c.cliente, jsonb_agg(
      jsonb_build_object(
        'mes_anio',  ml.mes_anio, 'mes_idx', ml.mes_idx,
        'mes_label', v_mes_labels[ml.mes_idx],
        'ventas',    COALESCE(mp.ventas, 0),
        'tickets',   COALESCE(mp.tickets, 0)
      ) ORDER BY ml.mes_anio, ml.mes_idx
    ) AS meses
    FROM cli c CROSS JOIN meses_lookup ml
    LEFT JOIN meses_por_cli mp ON mp.cliente = c.cliente AND mp.mes_anio = ml.mes_anio AND mp.mes_idx = ml.mes_idx
    GROUP BY c.cliente
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre', c.cliente, 'total_ytd', c.total_ytd, 'tickets_ytd', c.tickets_ytd,
      'ticket_prom', CASE WHEN c.tickets_ytd > 0 THEN c.total_ytd / c.tickets_ytd ELSE 0 END,
      'ultima_compra', to_char(c.ultima_compra, 'YYYY-MM-DD'),
      'meses', cm.meses
    ) ORDER BY c.total_ytd DESC
  )
  INTO v_clientes
  FROM cli c LEFT JOIN cli_meses cm ON cm.cliente = c.cliente;

  SELECT jsonb_array_length(COALESCE(v_clientes, '[]'::jsonb))::int,
    COALESCE((SELECT SUM((elem->>'total_ytd')::numeric) FROM jsonb_array_elements(COALESCE(v_clientes, '[]'::jsonb)) elem), 0),
    COALESCE((SELECT SUM((elem->>'tickets_ytd')::int) FROM jsonb_array_elements(COALESCE(v_clientes, '[]'::jsonb)) elem), 0)
  INTO v_total_clientes, v_total_ventas, v_total_tickets;

  RETURN jsonb_build_object(
    'fecha_inicio', to_char(p_fecha_inicio, 'YYYY-MM-DD'),
    'fecha_fin',    to_char(p_fecha_fin,    'YYYY-MM-DD'),
    'total_clientes', v_total_clientes,
    'total_ventas',   v_total_ventas,
    'total_tickets',  v_total_tickets,
    'clientes',       COALESCE(v_clientes, '[]'::jsonb)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION multifashion_wholesale_clientes(date, date) TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5) multifashion_retail_recurrentes — clientes retail con ≥ 2 visitas
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION multifashion_retail_recurrentes(
  p_fecha_inicio date, p_fecha_fin date, p_limit int DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_clientes jsonb; v_total_clientes int; v_total_ventas numeric; v_total_tickets bigint;
  v_mes_labels CONSTANT text[] := ARRAY['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 50; END IF;
  IF p_limit > 500 THEN p_limit := 500; END IF;

  WITH base AS (
    SELECT cliente, subtotal, fecha, n_sistema,
      EXTRACT(YEAR  FROM fecha)::int AS f_anio,
      EXTRACT(MONTH FROM fecha)::int AS f_mes
    FROM _multifashion_sf_vw
    WHERE is_wholesale = false
      AND fecha BETWEEN p_fecha_inicio AND p_fecha_fin
      AND cliente IS NOT NULL
      AND TRIM(UPPER(cliente)) NOT IN ('CONTADO', 'CONSUMIDOR FINAL', '')
  ),
  cli AS (
    SELECT cliente, SUM(subtotal)::numeric AS total_ytd,
      COUNT(*)::int AS tickets_ytd, MAX(fecha) AS ultima_compra
    FROM base
    GROUP BY cliente
    HAVING COUNT(*) >= 2 AND SUM(subtotal) > 0
    ORDER BY SUM(subtotal) DESC
    LIMIT p_limit
  ),
  meses_lookup AS (
    SELECT EXTRACT(YEAR FROM gs)::int AS mes_anio, EXTRACT(MONTH FROM gs)::int AS mes_idx
    FROM generate_series(date_trunc('month', p_fecha_inicio), date_trunc('month', p_fecha_fin), INTERVAL '1 month') AS gs
  ),
  meses_por_cli AS (
    SELECT b.cliente, b.f_anio AS mes_anio, b.f_mes AS mes_idx,
      SUM(b.subtotal)::numeric AS ventas, COUNT(*)::int AS tickets
    FROM base b JOIN cli ON cli.cliente = b.cliente
    GROUP BY b.cliente, b.f_anio, b.f_mes
  ),
  cli_meses AS (
    SELECT c.cliente, jsonb_agg(
      jsonb_build_object(
        'mes_anio', ml.mes_anio, 'mes_idx', ml.mes_idx,
        'mes_label', v_mes_labels[ml.mes_idx],
        'ventas', COALESCE(mp.ventas, 0),
        'tickets', COALESCE(mp.tickets, 0)
      ) ORDER BY ml.mes_anio, ml.mes_idx
    ) AS meses
    FROM cli c CROSS JOIN meses_lookup ml
    LEFT JOIN meses_por_cli mp ON mp.cliente = c.cliente AND mp.mes_anio = ml.mes_anio AND mp.mes_idx = ml.mes_idx
    GROUP BY c.cliente
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre', c.cliente, 'total_ytd', c.total_ytd, 'tickets_ytd', c.tickets_ytd,
      'ticket_prom', CASE WHEN c.tickets_ytd > 0 THEN c.total_ytd / c.tickets_ytd ELSE 0 END,
      'ultima_compra', to_char(c.ultima_compra, 'YYYY-MM-DD'),
      'meses', cm.meses
    ) ORDER BY c.total_ytd DESC
  )
  INTO v_clientes
  FROM cli c LEFT JOIN cli_meses cm ON cm.cliente = c.cliente;

  SELECT jsonb_array_length(COALESCE(v_clientes, '[]'::jsonb))::int,
    COALESCE((SELECT SUM((elem->>'total_ytd')::numeric) FROM jsonb_array_elements(COALESCE(v_clientes, '[]'::jsonb)) elem), 0),
    COALESCE((SELECT SUM((elem->>'tickets_ytd')::int) FROM jsonb_array_elements(COALESCE(v_clientes, '[]'::jsonb)) elem), 0)
  INTO v_total_clientes, v_total_ventas, v_total_tickets;

  RETURN jsonb_build_object(
    'fecha_inicio', to_char(p_fecha_inicio, 'YYYY-MM-DD'),
    'fecha_fin',    to_char(p_fecha_fin,    'YYYY-MM-DD'),
    'limit', p_limit,
    'total_clientes', v_total_clientes,
    'total_ventas',   v_total_ventas,
    'total_tickets',  v_total_tickets,
    'clientes',       COALESCE(v_clientes, '[]'::jsonb)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION multifashion_retail_recurrentes(date, date, int) TO service_role;

NOTIFY pgrst, 'reload schema';
