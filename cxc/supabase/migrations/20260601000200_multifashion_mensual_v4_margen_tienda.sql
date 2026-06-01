-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_mensual_v3 → v4 (margen REAL a nivel tienda completa)
--
-- PROBLEMA (v3): el card "MARGEN BRUTO RETAIL" del tab Multifashion mostraba
-- "—" porque v3 calculaba el margen retail-only desde ventas_raw
-- (is_wholesale=false), y esas filas retail NO traen costo.
--
-- FUENTE REAL: switch_costo_diario tiene el costo real de american_classic
-- (endpoint Switch tipo=03, sincronizado a diario por el cron switch-costo-diario;
-- mayo 2026 = $28,121.57). Ese costo ya alimenta el tab Resumen vía
-- switch_costo_unificado_vw.
--
-- LÍMITE CONFIRMADO: tipo=03 da costo AGREGADO total-tienda (retail + mayoreo
-- juntos). La API NO separa costo retail puro. Por eso el margen SOLO se calcula
-- a nivel TIENDA COMPLETA — comparar costo agregado contra ventas retail-only
-- daría un margen falso, así que NO se hace.
--
-- QUÉ AGREGA v4 (todo lo demás idéntico a v3):
--   bloque total += { margen, margenPrev }
--     margen     = (ventas_tienda − costo_tienda) / ventas_tienda  (YTD, año en curso)
--     margenPrev = mismo cálculo para el año anterior, mismo período (≤ p_mes)
--   Fuentes (idénticas al margenYTD del tab Resumen, ya en prod):
--     ventas → switch_ventas_unificado_vw (switch_facturas ≥ 2025-05 + ventas_raw antes)
--     costo  → switch_costo_unificado_vw  (switch_costo_diario ≥ 2026-05 + ventas_raw antes)
--   Solo meses con costo>0 entran al ratio (FILTER) para no inflarlo con meses
--   sin costo — misma metodología que sumFiltered() del Resumen.
--
-- RECONCILIACIÓN (validada antes de implementar, read-only):
--   May 2026:        ventas 42,446.03 / costo 28,121.57 → margen 33.75%
--   2026 YTD Ene–May: ventas 224,607.87 / costo 147,201.56 → margen 34.46%
--   2025 YTD Ene–May: ventas 203,348.21 / costo 139,346.48 → margen 31.47%
--   (rango retail esperado ✓; ventas switch_facturas pre-impuesto = venta_total
--    de switch_costo_diario al centavo → mismo universo)
--
-- RENAME v3→v4: nombre nuevo para bustear cache PostgREST/Vercel (mismo patrón
-- v2→v3). NO se hace DROP de v3 acá a propósito: deja v3 vivo durante la ventana
-- de deploy (SQL aplicado → push frontend) para no romper el tab si el frontend
-- viejo aún llama v3. Dropear v3 manualmente DESPUÉS de confirmar que v4 sirve:
--   DROP FUNCTION IF EXISTS multifashion_mensual_v3(int, int);
--
-- Aplicar manual en Supabase Dashboard → SQL Editor (después de las vistas
-- unificadas — migration 300 — que ya están en prod).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION multifashion_mensual_v4(p_year int, p_mes int)
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

  -- Margen TIENDA COMPLETA (v4): costo real switch_costo_diario vs ventas totales
  v_tienda_ventas      numeric;
  v_tienda_costo       numeric;
  v_tienda_margen      numeric;
  v_tienda_ventas_prev numeric;
  v_tienda_costo_prev  numeric;
  v_tienda_margen_prev numeric;

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

  -- ── Margen TIENDA COMPLETA (v4) ──────────────────────────────────────────
  -- Ventas (switch_ventas_unificado_vw) y costo (switch_costo_unificado_vw)
  -- a nivel empresa-mes. Solo meses con costo>0 entran al ratio (FILTER) para
  -- no inflarlo. Año en curso, YTD ≤ p_mes.
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

  -- ── expectedTodayPct (contra TOTAL, calendario — meta histórica incluye todo) ─
  SELECT COALESCE(SUM(subtotal), 0) INTO v_ventas_2025_ytd
  FROM ventas_raw
  WHERE empresa = 'american_classic' AND anio = p_year - 1 AND mes <= p_mes;
  v_expected_today_pct := CASE
    WHEN v_meta_anual > 0
      THEN LEAST(1, (v_ventas_2025_ytd * (1 + v_growth_pct / 100.0)) / v_meta_anual)
    ELSE 0
  END;

  -- ── Retail meses[12] con same-period day-by-day (igual que v3 + is_wholesale=false) ─
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
      'ytdTickets', v_total_tickets,
      'margen',     v_tienda_margen,
      'margenPrev', v_tienda_margen_prev
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_mensual_v4(int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
