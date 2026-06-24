-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Multifashion — bloque de MARGEN tienda-completa desde la MV (Parte C
-- del audit de performance). SIN tocar force-dynamic, SIN mover un centavo.
--
-- PROBLEMA: el margen tienda-completa (en multifashion_mensual_v6 y en
-- multifashion_margen_tienda_mensual) se calcula agregando EN VIVO
-- switch_ventas_unificado_vw LEFT JOIN switch_costo_unificado_vw con
-- EXTRACT(YEAR FROM v.mes)=p_year (no-sargable). switch_ventas_unificado_vw es un
-- GROUP BY sobre TODO switch_facturas (todas las empresas) → ~2.2s por agregación,
-- y el bloque de margen hace DOS (año actual + año previo). Es un trozo grande de
-- los ~4.5–5.7s de v6.
--
-- FIX: ventas_rollup_mensual_mv YA materializa EXACTAMENTE ese join
-- (switch_ventas_unificado_vw LEFT JOIN switch_costo_unificado_vw por empresa_key×mes,
-- con costo_total = COALESCE(c.costo_total,0)) — misma convención (Panamá, switch-only,
-- tienda-completa retail+mayoreo sumados). El FILTER (costo>0) se replica 1:1 desde
-- la MV (costo_total>0). Validado al centavo (Δ≈1e-16) para 2024/2025/2026 contra
-- la agregación en vivo (scripts/_validate_margen_mv.mjs).
--
-- HÍBRIDO (igual que Ventas): meses CERRADOS desde la MV; el mes EN CURSO (calendario)
-- en VIVO. Razón: switch-sync american_classic y el refresh de la MV corren ambos a
-- las 06:30 UTC → la MV puede ir hasta ~1 día atrasada en el mes en curso. Leer
-- cerrados de la MV + mes en curso en vivo garantiza Δ=0 SIEMPRE (no solo al validar).
-- Como el FILTER es por-mes y SUM distribuye sobre la partición de meses, partir el
-- rango y re-sumar da el MISMO resultado que la agregación en un solo SELECT.
--
-- RENAME (regla del proyecto: PostgREST/Vercel cachea cuerpos de función):
--   multifashion_mensual_v6            → multifashion_mensual_v7
--   multifashion_margen_tienda_mensual → multifashion_margen_tienda_mensual_v2
--   Las viejas quedan intactas (rollback). El frontend pasa a llamar las nuevas
--   (con fallback a las viejas si la migración aún no se aplicó).
--
-- Los bloques de retail/wholesale/meses de v7 son IDÉNTICOS a v6 (solo cambia el
-- bloque de margen). Shape de salida idéntico. Sin cambios de frontend salvo el
-- nombre del RPC.
--
-- DEPENDENCIAS (en prod): ventas_rollup_mensual_mv, switch_ventas_unificado_vw,
--   switch_costo_unificado_vw, _multifashion_sf_vw, get_app_setting.
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- Helper: ventas/costo tienda-completa HÍBRIDO (cerrados=MV, mes en curso=vivo).
-- Devuelve la suma con FILTER(costo>0) sobre los meses [p_mes_lo, p_mes_hi] de p_year.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION multifashion_tienda_vc_hibrido(
  p_year int, p_mes_lo int, p_mes_hi int
) RETURNS TABLE(ventas numeric, costo numeric)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_now_year  int := EXTRACT(YEAR  FROM CURRENT_DATE)::int;
  v_now_month int := EXTRACT(MONTH FROM CURRENT_DATE)::int;
  v_cur_in_range boolean;
  v_mv_v numeric := 0; v_mv_c numeric := 0;
  v_lv_v numeric := 0; v_lv_c numeric := 0;
BEGIN
  -- ¿el mes EN CURSO del calendario cae dentro del rango pedido para p_year?
  v_cur_in_range := (p_year = v_now_year AND v_now_month BETWEEN p_mes_lo AND p_mes_hi);

  -- Meses CERRADOS desde la MV (excluye el mes en curso si aplica).
  SELECT COALESCE(SUM(r.ventas_netas) FILTER (WHERE r.costo_total > 0), 0),
         COALESCE(SUM(r.costo_total)  FILTER (WHERE r.costo_total > 0), 0)
  INTO v_mv_v, v_mv_c
  FROM ventas_rollup_mensual_mv r
  WHERE r.empresa_key = 'american_classic'
    AND r.anio = p_year
    AND r.mes_num BETWEEN p_mes_lo AND p_mes_hi
    AND NOT (v_cur_in_range AND r.mes_num = v_now_month);

  -- Mes EN CURSO en VIVO (la MV puede ir 1 día atrasada → exactitud).
  IF v_cur_in_range THEN
    SELECT COALESCE(SUM(v.ventas_netas) FILTER (WHERE COALESCE(c.costo_total, 0) > 0), 0),
           COALESCE(SUM(c.costo_total)  FILTER (WHERE COALESCE(c.costo_total, 0) > 0), 0)
    INTO v_lv_v, v_lv_c
    FROM switch_ventas_unificado_vw v
    LEFT JOIN switch_costo_unificado_vw c
      ON c.empresa_key = v.empresa_key AND c.mes = v.mes
    WHERE v.empresa_key = 'american_classic'
      AND EXTRACT(YEAR  FROM v.mes)::int = p_year
      AND EXTRACT(MONTH FROM v.mes)::int = v_now_month;
  END IF;

  ventas := v_mv_v + v_lv_v;
  costo  := v_mv_c + v_lv_c;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_tienda_vc_hibrido(int, int, int) TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- multifashion_mensual_v7 = v6 con el bloque de MARGEN leyendo el helper (MV híbrido).
-- TODO lo demás (retail/wholesale/meses) es BYTE-IDÉNTICO a v6.
-- ═════════════════════════════════════════════════════════════════════════════
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

-- ═════════════════════════════════════════════════════════════════════════════
-- multifashion_margen_tienda_mensual_v2 = single-month vía helper (MV híbrido).
-- Mismo guard de margen [-1,1] y mismo shape que la v1.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION multifashion_margen_tienda_mensual_v2(p_year int, p_mes int)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_ventas numeric;
  v_costo  numeric;
  v_margen numeric;
BEGIN
  SELECT h.ventas, h.costo INTO v_ventas, v_costo
  FROM multifashion_tienda_vc_hibrido(p_year, p_mes, p_mes) h;

  v_margen := CASE
    WHEN v_ventas > 0 AND (v_ventas - v_costo) / v_ventas BETWEEN -1 AND 1
      THEN (v_ventas - v_costo) / v_ventas
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'year',   p_year,
    'mes',    p_mes,
    'ventas', v_ventas,
    'costo',  v_costo,
    'margen', v_margen
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_margen_tienda_mensual_v2(int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
