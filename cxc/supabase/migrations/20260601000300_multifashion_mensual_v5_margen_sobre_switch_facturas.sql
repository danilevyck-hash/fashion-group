-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_mensual_v4 → v5 (fix regresión de ventas)
--
-- REGRESIÓN QUE CORRIGE: v4 (migration 200) se construyó por error sobre la
-- definición VIEJA de v3 (migration 20260512100100, que leía ventas_raw). Pero
-- el v3 desplegado era el de FASE 2.1b (migration 20260530000000) que lee
-- ventas/tickets de switch_facturas vía _multifashion_sf_vw. Resultado: v4
-- revirtió silenciosamente la fuente de ventas retail switch_facturas →
-- ventas_raw (incompleto), bajando Ventas Retail YTD de $199,770.97 a
-- $182,158.18 (mayo $42,446 → $24,803, 876 → 530 tickets).
--
-- QUÉ HACE v5:
--   - VENTAS y TICKETS: idénticos a v3 fase 2.1b — fuente _multifashion_sf_vw
--     (switch_facturas). NO se toca la fuente de ventas. Esto restaura
--     Ventas Retail YTD = $199,770.97 (mayo $42,446 / 876 tickets).
--   - MARGEN: agrega SOLO total.margen y total.margenPrev a nivel TIENDA
--     COMPLETA (retail + mayoreo), con costo real de switch_costo_diario vía
--     switch_costo_unificado_vw. Misma metodología/fuentes que el margenYTD del
--     tab Resumen (ya en prod). Solo meses con costo>0 entran al ratio (FILTER).
--   - retail.margen / retail.margenPrev quedan NULL (igual que v3 2.1b): la API
--     tipo=03 da costo AGREGADO total-tienda, NO separa retail puro — meter ese
--     costo contra ventas retail-only daría un margen falso. El margen solo es
--     honesto a nivel total.* (lo consume el card "MARGEN BRUTO · TIENDA COMPLETA").
--
-- DEPENDENCIAS (todas ya en prod):
--   _multifashion_sf_vw          (migration 20260530000000, fase 2.1b)
--   switch_ventas_unificado_vw   (migration 20260529000300)
--   switch_costo_unificado_vw    (migration 20260529000300; usa switch_costo_diario)
--
-- RECONCILIACIÓN (validada read-only contra prod antes de escribir):
--   Ventas (de v3 2.1b desplegado): retail YTD 199,770.97 | mayo 42,446.03 / 876
--   Margen (de vistas unificadas):  total.margen 2026 = 34.46%.
--     total.margenPrev depende del período (same-period ≤ p_mes): ≤ mayo 31.47%,
--     ≤ junio (mes en curso) 32.53%. Delta directional ~+2 a +3 pts vs 2025.
--   v5 = combinación verbatim de ambas mitades → reproduce ambos números.
--
-- RENAME v4→v5: nombre nuevo para bustear cache PostgREST/Vercel. NO dropea v3
-- ni v4 acá — quedan vivos durante validación. Dropear manual DESPUÉS de validar v5:
--   DROP FUNCTION IF EXISTS multifashion_mensual_v4(int, int);
--   DROP FUNCTION IF EXISTS multifashion_mensual_v3(int, int);
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION multifashion_mensual_v5(p_year int, p_mes int)
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
  -- Margen TIENDA COMPLETA (v5): costo real switch_costo_diario vs ventas totales
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

  -- ═══ VENTAS / TICKETS: idéntico a v3 fase 2.1b (switch_facturas) ═══════════

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

  -- ═══ MARGEN TIENDA COMPLETA (v5): ÚNICO añadido sobre v3 fase 2.1b ═════════
  -- Ventas (switch_ventas_unificado_vw) y costo (switch_costo_unificado_vw,
  -- = switch_costo_diario para el período en curso) a nivel empresa-mes. Solo
  -- meses con costo>0 entran al ratio (FILTER) para no inflarlo. NO toca la
  -- fuente de ventas/tickets del tab (arriba, switch_facturas).
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

  -- Prev year, mismo período (≤ p_mes)
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
      -- retail puro no tiene costo separable (tipo=03 es agregado) → NULL.
      -- El margen real vive en total.margen (tienda completa).
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

GRANT EXECUTE ON FUNCTION multifashion_mensual_v5(int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
