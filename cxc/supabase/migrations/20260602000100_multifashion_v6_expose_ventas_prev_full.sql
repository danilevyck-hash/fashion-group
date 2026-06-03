-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_mensual_v6 — exponer ventas_prev (mes prev COMPLETO)
-- en cada retail.meses.
--
-- CONTEXTO: el hero de proyección del Overview de Multifashion necesita la serie
-- mensual del año anterior COMPLETA (12 meses, sin recorte) para:
--   - dibujar la línea ámbar (año anterior, full year), y
--   - calcular el cierre real del año anterior (total_prev) y la proyección
--     ponderada por temporada.
-- v6 ya calcula `ventas_prev` para el `vs2025`, pero (a) lo dropea del JSON y
-- (b) está recortado al día (same-period) en el mes en curso. Acá agregamos un
-- valor de MES COMPLETO (`ventas_prev_full`, bounds [prev_inicio, prev_fin_full],
-- sin recorte) y lo emitimos como `ventasPrev` (camelCase) en cada retail.meses.
--
-- CAMBIO ADITIVO Y SEGURO: misma firma multifashion_mensual_v6(int,int) (sin
-- rename), CREATE OR REPLACE in-place. NO cambia `ventas`, `tickets`,
-- `ticketProm`, `vs2025` ni ningún otro campo → la tabla "Detalle mensual" y la
-- columna VS 2025 quedan idénticas. Solo agrega la key `ventasPrev`.
--
-- Mismo blend que el `ventas_prev` recortado: switch (≥ 2025-05) ∪ ventas_raw
-- (< 2025-05), retail-only (is_wholesale=false). Para años prev ≤ 2024 todo cae
-- en la rama ventas_raw (fecha < 2025-05-01), igual que la lógica existente.
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
      -- Recortado al día (dia_corte_anio_anterior) — base del vs2025 same-period.
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
      )::numeric AS ventas_prev,
      -- ventas_prev_full (v6.1): MES PREV COMPLETO [prev_inicio, prev_fin_full],
      -- sin recorte al día. Mismo blend retail-only. Lo consume el hero de
      -- proyección (línea ámbar año completo + cierre real del año anterior).
      (
        COALESCE((SELECT SUM(subtotal) FROM _multifashion_sf_vw
                  WHERE is_wholesale = false
                    AND fecha BETWEEN mr.prev_inicio AND mr.prev_fin_full
                    AND fecha >= DATE '2025-05-01'), 0)
        + COALESCE((SELECT SUM(subtotal) FROM ventas_raw
                  WHERE empresa = 'american_classic' AND is_wholesale = false
                    AND fecha BETWEEN mr.prev_inicio AND mr.prev_fin_full
                    AND fecha < DATE '2025-05-01'), 0)
      )::numeric AS ventas_prev_full
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
      -- ventas del año anterior, MES COMPLETO (para el hero de proyección).
      -- camelCase como ticketProm — el frontend lo lee como m.ventasPrev.
      'ventasPrev', a.ventas_prev_full,
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
