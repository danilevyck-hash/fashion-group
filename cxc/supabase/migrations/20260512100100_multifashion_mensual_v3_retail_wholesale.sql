-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_mensual_v2 → v3 (split retail / wholesale)
--
-- Requiere: 20260512100000_ventas_raw_is_wholesale.sql aplicada antes
-- (la columna ventas_raw.is_wholesale debe existir).
--
-- Cambios respecto a v2:
--   1. Shape del response reestructurado en bloques:
--        retail:    { ytdVentas, ytdTickets, ticketProm, margen, margenPrev, meses[12] }
--        wholesale: { ytdVentas, ytdTickets, topClienteName, totalClientes, meses[12] }
--        total:     { ytdVentas, ytdTickets }   -- retail + wholesale
--      Header global (tienda, ubicacion, manager, metaAnual, expectedTodayPct)
--      queda en top-level.
--
--   2. KPIs retail (ytdVentas/Tickets/ticketProm/margen) filtran is_wholesale=false.
--
--   3. retail.meses[12] sigue siendo el detalle mensual con same-period
--      day-by-day para el mes en curso (lógica de v2 preservada, solo
--      agregando filtro is_wholesale=false en cur y prev queries).
--
--   4. retail.margenPrev = margen retail same-period prev year. Usado por
--      la UI para "Δ X pts vs prev year" en el card de Margen Bruto.
--
--   5. wholesale.meses[12] = simples sum + count per mes. Sin vs2025
--      (wholesale es esporádico, comparativos no son significativos).
--
--   6. expectedTodayPct sigue siendo total-vs-meta (calendario): no se
--      separa por retail/wholesale porque la meta histórica del negocio
--      se mide sobre TOTAL.
--
--   7. Campos no usados de v2 (abrVentas/abrTicketProm/abrComisiones/
--      vendedoras/bonoTop) se ELIMINAN del response. Confirmado via grep
--      que ningún componente los consume (Vendedoras subtab usa su propia
--      RPC multifashion_vendedoras_v3).
--
-- Rename v2→v3 sigue el patrón runtime-stale Vercel/PostgREST documentado
-- en PRs anteriores (v1→v2→v3 con multifashion_vendedoras y otros).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Drop v2 con firma explícita ───────────────────────────────────────────
DROP FUNCTION IF EXISTS multifashion_mensual_v2(int, int);

-- ── 2. Create v3 ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION multifashion_mensual_v3(p_year int, p_mes int)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  -- Header (app_settings)
  v_meta_anual numeric;
  v_growth_pct numeric;
  v_tienda     text;
  v_ubicacion  text;
  v_manager    text;

  -- Retail YTD
  v_retail_ventas        numeric;
  v_retail_tickets       bigint;
  v_retail_costo         numeric;
  v_retail_utilidad      numeric;
  v_retail_ticket_prom   numeric;
  v_retail_margen        numeric;
  v_retail_ventas_prev   numeric;
  v_retail_utilidad_prev numeric;
  v_retail_margen_prev   numeric;

  -- Wholesale YTD
  v_wholesale_ventas        numeric;
  v_wholesale_tickets       bigint;
  v_wholesale_top_cliente   text;
  v_wholesale_total_clientes int;

  -- Total YTD
  v_total_ventas  numeric;
  v_total_tickets bigint;

  -- expectedTodayPct
  v_ventas_2025_ytd    numeric;
  v_expected_today_pct numeric;

  -- Series mensuales
  v_retail_meses    jsonb;
  v_wholesale_meses jsonb;
BEGIN
  v_meta_anual := COALESCE((get_app_setting('multifashion_meta_anual_2026'))::numeric, 800000);
  v_growth_pct := COALESCE((get_app_setting('multifashion_growth_target_pct'))::numeric, 5);
  v_tienda     := COALESCE(get_app_setting('multifashion_tienda')    #>> '{}', 'American Classics');
  v_ubicacion  := COALESCE(get_app_setting('multifashion_ubicacion') #>> '{}', 'Chiriquí');
  v_manager    := COALESCE(get_app_setting('multifashion_manager')   #>> '{}', '');

  -- ── Retail YTD (is_wholesale = false) ────────────────────────────────────
  SELECT
    COALESCE(SUM(subtotal), 0),
    COUNT(DISTINCT n_sistema),
    COALESCE(SUM(costo), 0),
    COALESCE(SUM(utilidad), 0)
  INTO v_retail_ventas, v_retail_tickets, v_retail_costo, v_retail_utilidad
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND is_wholesale = false
    AND anio = p_year
    AND mes <= p_mes;
  v_retail_ticket_prom := CASE WHEN v_retail_tickets > 0 THEN v_retail_ventas / v_retail_tickets ELSE 0 END;
  v_retail_margen      := CASE WHEN v_retail_ventas  > 0 THEN v_retail_utilidad / v_retail_ventas ELSE 0 END;

  -- ── Retail prev YTD (same period, month-level) para margenPrev ───────────
  SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(utilidad), 0)
  INTO v_retail_ventas_prev, v_retail_utilidad_prev
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND is_wholesale = false
    AND anio = p_year - 1
    AND mes <= p_mes;
  v_retail_margen_prev := CASE WHEN v_retail_ventas_prev > 0 THEN v_retail_utilidad_prev / v_retail_ventas_prev ELSE 0 END;

  -- ── Wholesale YTD (is_wholesale = true) ──────────────────────────────────
  SELECT
    COALESCE(SUM(subtotal), 0),
    COUNT(DISTINCT n_sistema)
  INTO v_wholesale_ventas, v_wholesale_tickets
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND is_wholesale = true
    AND anio = p_year
    AND mes <= p_mes;

  -- Top cliente wholesale del año + distinct clientes count
  WITH cli AS (
    SELECT cliente, SUM(subtotal) AS s
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND is_wholesale = true
      AND anio = p_year
      AND mes <= p_mes
      AND cliente IS NOT NULL
      AND TRIM(cliente) <> ''
    GROUP BY cliente
  )
  SELECT cliente, (SELECT COUNT(*) FROM cli)
  INTO v_wholesale_top_cliente, v_wholesale_total_clientes
  FROM cli
  ORDER BY s DESC
  LIMIT 1;

  -- ── Total YTD (retail + wholesale) ───────────────────────────────────────
  v_total_ventas  := v_retail_ventas  + v_wholesale_ventas;
  v_total_tickets := v_retail_tickets + v_wholesale_tickets;

  -- ── expectedTodayPct (contra TOTAL, calendario — meta histórica incluye todo) ─
  SELECT COALESCE(SUM(subtotal), 0) INTO v_ventas_2025_ytd
  FROM ventas_raw
  WHERE empresa = 'american_classic' AND anio = p_year - 1 AND mes <= p_mes;
  v_expected_today_pct := CASE
    WHEN v_meta_anual > 0
      THEN LEAST(1, (v_ventas_2025_ytd * (1 + v_growth_pct / 100.0)) / v_meta_anual)
    ELSE 0
  END;

  -- ── Retail meses[12] con same-period day-by-day (igual que v2 + is_wholesale=false) ─
  WITH mes_meta AS (
    SELECT
      m.mes,
      make_date(p_year, m.mes, 1) AS inicio,
      (make_date(p_year, m.mes, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date AS fin_full,
      make_date(p_year - 1, m.mes, 1) AS prev_inicio,
      (make_date(p_year - 1, m.mes, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date AS prev_fin_full
    FROM generate_series(1, 12) AS m(mes)
  ),
  mes_corte AS (
    SELECT
      mm.*,
      (CURRENT_DATE BETWEEN mm.inicio AND mm.fin_full) AS es_parcial,
      CASE
        WHEN (CURRENT_DATE BETWEEN mm.inicio AND mm.fin_full)
          THEN (SELECT MAX(fecha) FROM ventas_raw
                WHERE empresa = 'american_classic'
                  AND is_wholesale = false
                  AND fecha BETWEEN mm.inicio AND mm.fin_full)
        ELSE mm.fin_full
      END AS fecha_corte
    FROM mes_meta mm
  ),
  mes_resuelto AS (
    SELECT
      mc.*,
      CASE
        WHEN mc.es_parcial AND mc.fecha_corte IS NOT NULL
          THEN LEAST(mc.prev_inicio + (mc.fecha_corte - mc.inicio), mc.prev_fin_full)
        WHEN NOT mc.es_parcial
          THEN mc.prev_fin_full
        ELSE NULL
      END AS dia_corte_anio_anterior
    FROM mes_corte mc
  ),
  mes_agg AS (
    SELECT
      mr.mes,
      mr.es_parcial,
      mr.fecha_corte,
      mr.dia_corte_anio_anterior,
      COALESCE((
        SELECT SUM(subtotal) FROM ventas_raw
        WHERE empresa = 'american_classic'
          AND is_wholesale = false
          AND mr.fecha_corte IS NOT NULL
          AND fecha BETWEEN mr.inicio AND mr.fecha_corte
      ), 0)::numeric AS ventas,
      COALESCE((
        SELECT COUNT(DISTINCT n_sistema) FROM ventas_raw
        WHERE empresa = 'american_classic'
          AND is_wholesale = false
          AND mr.fecha_corte IS NOT NULL
          AND fecha BETWEEN mr.inicio AND mr.fecha_corte
      ), 0)::int AS tickets,
      COALESCE((
        SELECT SUM(subtotal) FROM ventas_raw
        WHERE empresa = 'american_classic'
          AND is_wholesale = false
          AND mr.dia_corte_anio_anterior IS NOT NULL
          AND fecha BETWEEN mr.prev_inicio AND mr.dia_corte_anio_anterior
      ), 0)::numeric AS ventas_prev
    FROM mes_resuelto mr
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'mes',        CASE a.mes WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
                                WHEN 4 THEN 'Abr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
                                WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago' WHEN 9 THEN 'Sep'
                                WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' ELSE 'Dic' END,
      'ventas',     a.ventas,
      'tickets',    a.tickets,
      'ticketProm', CASE WHEN a.tickets > 0 THEN a.ventas / a.tickets ELSE 0 END,
      'vs2025',     CASE
                      WHEN a.tickets = 0 AND a.ventas = 0 THEN NULL
                      WHEN a.ventas_prev > 0 THEN (a.ventas - a.ventas_prev) / a.ventas_prev
                      ELSE NULL
                    END,
      'es_periodo_parcial',      a.es_parcial,
      'fecha_corte',             CASE WHEN a.es_parcial AND a.fecha_corte IS NOT NULL
                                      THEN to_char(a.fecha_corte, 'YYYY-MM-DD')
                                      ELSE NULL END,
      'dia_corte_anio_anterior', CASE WHEN a.es_parcial AND a.dia_corte_anio_anterior IS NOT NULL
                                      THEN to_char(a.dia_corte_anio_anterior, 'YYYY-MM-DD')
                                      ELSE NULL END
    )
    ORDER BY a.mes
  )
  INTO v_retail_meses
  FROM mes_agg a;

  -- ── Wholesale meses[12] (simple sum + count, sin vs2025) ─────────────────
  WITH ws AS (
    SELECT mes,
      SUM(subtotal)::numeric AS ventas,
      COUNT(DISTINCT n_sistema)::int AS tickets
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND is_wholesale = true
      AND anio = p_year
    GROUP BY mes
  ),
  m AS (SELECT generate_series(1, 12) AS mes)
  SELECT jsonb_agg(
    jsonb_build_object(
      'mes', CASE m.mes WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
              WHEN 4 THEN 'Abr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
              WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago' WHEN 9 THEN 'Sep'
              WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' ELSE 'Dic' END,
      'ventas',  COALESCE(ws.ventas, 0),
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
      'margen',     v_retail_margen,
      'margenPrev', v_retail_margen_prev,
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

NOTIFY pgrst, 'reload schema';
