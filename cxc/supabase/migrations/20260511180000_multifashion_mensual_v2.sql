-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_mensual → v2 (same-period day-by-day para mes en curso)
--
-- Problema: la tabla "Detalle mensual retail" del sub-tab Overview de
-- Multifashion mostraba Mayo 2026 con -74% vs Mayo 2025, porque la RPC
-- comparaba la suma de Mayo COMPLETO 2025 contra Mayo 1–9 2026 (parcial).
--
-- Fix: en el rango del mes en curso (decidido por CALENDARIO, NO por data
-- — mismo criterio que multifashion_vendedoras_v3 para evitar falsos
-- positivos por uploads atrasados), recortar el rango del año anterior al
-- mismo offset de días desde el inicio del mes. Para los meses cerrados
-- (Enero–Abril 2026 en este caso) y los futuros (Junio–Diciembre 2026),
-- la comparación sigue siendo full mes vs full mes, idéntica al
-- comportamiento previo.
--
-- Cambio de nombre v1 → v2: el bug del runtime stale en Vercel/PostgREST
-- ya nos forzó dos rondas de rename con multifashion_vendedoras
-- (v1 → v2 → v3). En vez de esperar a chocar con él otra vez, salimos
-- directo con un nombre nuevo.
--
-- Scope acotado: SOLO la CTE v_meses cambia. Resto del cuerpo de la
-- función (YTD acumulado, TOP vendedor, vendedoras del mes, abrVentas/
-- abrTicketProm/abrComisiones, expectedTodayPct, jsonb_build_object
-- final) es IDÉNTICO a la versión actual (migration
-- 20260511120100_multifashion_normalize_vendedor.sql).
--
-- Response: cada fila de `meses` ahora incluye además:
--   - es_periodo_parcial  (boolean)        — true sólo en el mes que
--                                            contiene CURRENT_DATE
--   - fecha_corte         (text|null)      — YYYY-MM-DD; sólo cuando
--                                            es_periodo_parcial = true
--   - dia_corte_anio_anterior (text|null)  — YYYY-MM-DD; sólo cuando
--                                            es_periodo_parcial = true
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Drop la función original con firma explícita ──────────────────────────
DROP FUNCTION IF EXISTS multifashion_mensual(int, int);

-- ── 2. Create v2 ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION multifashion_mensual_v2(p_year int, p_mes int)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_meta_anual numeric;
  v_growth_pct numeric;
  v_tienda text;
  v_ubicacion text;
  v_manager text;
  v_bono_top numeric;
  v_managers jsonb;

  v_ytd_ventas numeric;
  v_ytd_tickets bigint;
  v_ytd_ticket_prom numeric;
  v_ytd_costo numeric;
  v_ytd_utilidad numeric;
  v_ytd_margen numeric;

  v_meses jsonb;
  v_vendedoras jsonb;

  v_abr_ventas numeric;
  v_abr_ticket_prom numeric;
  v_abr_comisiones numeric;

  v_ventas_2025_ytd numeric;
  v_expected_today_pct numeric;

  v_top_vendedor text;
BEGIN
  v_meta_anual := COALESCE((get_app_setting('multifashion_meta_anual_2026'))::numeric, 800000);
  v_growth_pct := COALESCE((get_app_setting('multifashion_growth_target_pct'))::numeric, 5);
  v_tienda     := COALESCE(get_app_setting('multifashion_tienda')    #>> '{}', 'American Classics');
  v_ubicacion  := COALESCE(get_app_setting('multifashion_ubicacion') #>> '{}', 'Chiriquí');
  v_manager    := COALESCE(get_app_setting('multifashion_manager')   #>> '{}', '');
  v_bono_top   := COALESCE((get_app_setting('multifashion_bono_top'))::numeric, 50);
  v_managers   := COALESCE(get_app_setting('multifashion_managers'), '[]'::jsonb);

  -- YTD acumulado (incluye DEFAULT — es venta real, sin recortar)
  SELECT
    COALESCE(SUM(subtotal), 0),
    COUNT(DISTINCT n_sistema),
    COALESCE(SUM(costo), 0),
    COALESCE(SUM(utilidad), 0)
  INTO v_ytd_ventas, v_ytd_tickets, v_ytd_costo, v_ytd_utilidad
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND anio = p_year
    AND mes <= p_mes;

  v_ytd_ticket_prom := CASE WHEN v_ytd_tickets > 0 THEN v_ytd_ventas / v_ytd_tickets ELSE 0 END;
  v_ytd_margen      := CASE WHEN v_ytd_ventas  > 0 THEN v_ytd_utilidad / v_ytd_ventas ELSE 0 END;

  -- ── Serie 12 meses con vs 2025 ─────────────────────────────────────────────
  -- Para el mes en curso (CURRENT_DATE entre inicio y fin del mes), el
  -- comparativo se recorta day-by-day: prev range = [prev_inicio,
  -- prev_inicio + (fecha_corte − inicio)] clampado al fin natural del mes
  -- prev. Para meses cerrados/futuros, comparativo full vs full.
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
        ELSE NULL  -- mes parcial sin data → sin rango prev definido
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
          AND mr.fecha_corte IS NOT NULL
          AND fecha BETWEEN mr.inicio AND mr.fecha_corte
      ), 0)::numeric AS ventas,
      COALESCE((
        SELECT COUNT(DISTINCT n_sistema) FROM ventas_raw
        WHERE empresa = 'american_classic'
          AND mr.fecha_corte IS NOT NULL
          AND fecha BETWEEN mr.inicio AND mr.fecha_corte
      ), 0)::int AS tickets,
      COALESCE((
        SELECT SUM(subtotal) FROM ventas_raw
        WHERE empresa = 'american_classic'
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
                      -- Sin data del año actual → no hay comparativo
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
  INTO v_meses
  FROM mes_agg a;

  -- TOP vendedor del mes — EXCLUYE DEFAULT
  SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') INTO v_top_vendedor
  FROM ventas_raw
  WHERE empresa = 'american_classic' AND anio = p_year AND mes = p_mes
    AND vendedor IS NOT NULL
    AND TRIM(vendedor) <> ''
    AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
  GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  ORDER BY SUM(subtotal) DESC
  LIMIT 1;

  -- Vendedoras del mes — EXCLUYE DEFAULT (delta vs mes inmediato anterior,
  -- comportamiento legacy del Overview; el sub-tab Vendedoras tiene su
  -- propia RPC con semántica configurable).
  WITH this_mes AS (
    SELECT
      REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor,
      SUM(subtotal) AS ventas,
      COUNT(DISTINCT n_sistema) AS tickets
    FROM ventas_raw
    WHERE empresa = 'american_classic' AND anio = p_year AND mes = p_mes
      AND vendedor IS NOT NULL
      AND TRIM(vendedor) <> ''
      AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  ),
  prev_mes AS (
    SELECT
      REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor,
      SUM(subtotal) AS ventas
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND ((p_mes > 1  AND anio = p_year     AND mes = p_mes - 1)
        OR (p_mes = 1  AND anio = p_year - 1 AND mes = 12))
      AND vendedor IS NOT NULL
      AND TRIM(vendedor) <> ''
      AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre',     t.vendedor,
      'tickets',    t.tickets,
      'ventas',     t.ventas,
      'deltaMarzo', CASE
                      WHEN COALESCE(p.ventas, 0) > 0 THEN (t.ventas - p.ventas) / p.ventas
                      ELSE NULL
                    END,
      'ticketProm', CASE WHEN t.tickets > 0 THEN t.ventas / t.tickets ELSE 0 END,
      'comision',   t.ventas * 0.005,
      'manager',    v_managers ? t.vendedor,
      'top',        (t.vendedor = v_top_vendedor)
    )
    ORDER BY t.ventas DESC
  )
  INTO v_vendedoras
  FROM this_mes t
  LEFT JOIN prev_mes p ON p.vendedor = t.vendedor;

  -- KPIs del mes p_mes (incluye DEFAULT — son ventas reales)
  SELECT
    COALESCE(SUM(subtotal), 0),
    COUNT(DISTINCT n_sistema),
    COALESCE(SUM(subtotal) * 0.005, 0)
  INTO v_abr_ventas, v_ytd_tickets, v_abr_comisiones
  FROM ventas_raw
  WHERE empresa = 'american_classic' AND anio = p_year AND mes = p_mes;

  v_abr_ticket_prom := CASE WHEN v_ytd_tickets > 0 THEN v_abr_ventas / v_ytd_tickets ELSE 0 END;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_ventas_2025_ytd
  FROM ventas_raw
  WHERE empresa = 'american_classic' AND anio = p_year - 1 AND mes <= p_mes;

  v_expected_today_pct := CASE
    WHEN v_meta_anual > 0
      THEN LEAST(1, (v_ventas_2025_ytd * (1 + v_growth_pct / 100.0)) / v_meta_anual)
    ELSE 0
  END;

  SELECT COUNT(DISTINCT n_sistema) INTO v_ytd_tickets
  FROM ventas_raw
  WHERE empresa = 'american_classic' AND anio = p_year AND mes <= p_mes;

  v_ytd_ticket_prom := CASE WHEN v_ytd_tickets > 0 THEN v_ytd_ventas / v_ytd_tickets ELSE 0 END;

  RETURN jsonb_build_object(
    'tienda',           v_tienda,
    'ubicacion',        v_ubicacion,
    'manager',          v_manager,
    'metaAnual',        v_meta_anual,
    'ytdVentas',        v_ytd_ventas,
    'ytdTickets',       v_ytd_tickets,
    'ticketProm',       v_ytd_ticket_prom,
    'margen',           v_ytd_margen,
    'expectedTodayPct', v_expected_today_pct,
    'meses',            COALESCE(v_meses, '[]'::jsonb),
    'vendedoras',       COALESCE(v_vendedoras, '[]'::jsonb),
    'abrVentas',        v_abr_ventas,
    'abrTicketProm',    v_abr_ticket_prom,
    'abrComisiones',    v_abr_comisiones,
    'bonoTop',          v_bono_top
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_mensual_v2(int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
