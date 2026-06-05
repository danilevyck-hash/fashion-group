-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_wholesale_clientes / retail_recurrentes  ->  v2
--
-- El tab Clientes ya lee de switch_facturas (vista _multifashion_sf_vw) desde la
-- migracion 20260530000000. Lo unico que falta es excluir clientes internos /
-- intercompania que se cuelan en la lista. Hoy la unica fuga real es "Joystep"
-- (empresa del grupo, wholesale, netea cero), pero excluimos las 8 empresas del
-- grupo + el holding de forma defensiva y a prueba de futuro.
--
-- Exclusion por cliente_nombre con ILIKE sobre tokens DISTINTIVOS de cada empresa
-- del grupo (no atrapan clientes reales). Se confirmo que ningun cliente real de
-- american_classic matchea estos patrones (solo "Joystep").
--
--   Holding / propio:  multi fashion holding, multifashion, multi fashion,
--                      american classic
--   Empresas grupo:    vistana, fashion wear, fashion shoes, active shoes,
--                      active wear, joystep / joy step, confecciones boston
--
-- NO se excluyen (clientes reales confirmados por Daniel): VENTAS MAHER,
-- VENTAS COMERCIALES LUCCIA, VENTAS COMERCIALES LUCIA. Por eso NO se usa
-- ILIKE 'VENTAS%'. Boston usa el nombre completo 'confecciones boston' para no
-- arriesgar un cliente real "Boston X". CONTADO / CONSUMIDOR FINAL siguen
-- excluidos por nombre en retail (igual que antes).
--
-- TCKCTA queda FUERA de scope: no aparece como cliente en facturas de
-- american_classic (es codigo de recibos B2B) y cliente_codigo no existe en la
-- vista. Si algun dia aparece, se agrega con evidencia.
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1) multifashion_wholesale_clientes_v2 — clientes wholesale por rango
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION multifashion_wholesale_clientes_v2(
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
      -- Excluir intercompania / empresas del grupo (ver header)
      AND cliente NOT ILIKE '%multi fashion holding%'
      AND cliente NOT ILIKE '%multifashion%'
      AND cliente NOT ILIKE '%multi fashion%'
      AND cliente NOT ILIKE '%american classic%'
      AND cliente NOT ILIKE '%vistana%'
      AND cliente NOT ILIKE '%fashion wear%'
      AND cliente NOT ILIKE '%fashion shoes%'
      AND cliente NOT ILIKE '%active shoes%'
      AND cliente NOT ILIKE '%active wear%'
      AND cliente NOT ILIKE '%joystep%'
      AND cliente NOT ILIKE '%joy step%'
      AND cliente NOT ILIKE '%confecciones boston%'
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
GRANT EXECUTE ON FUNCTION multifashion_wholesale_clientes_v2(date, date) TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2) multifashion_retail_recurrentes_v2 — clientes retail con >= 2 visitas
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION multifashion_retail_recurrentes_v2(
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
      -- Excluir intercompania / empresas del grupo (ver header). NO se excluye
      -- VENTAS MAHER / VENTAS COMERCIALES LUCCIA / LUCIA (clientes reales).
      AND cliente NOT ILIKE '%multi fashion holding%'
      AND cliente NOT ILIKE '%multifashion%'
      AND cliente NOT ILIKE '%multi fashion%'
      AND cliente NOT ILIKE '%american classic%'
      AND cliente NOT ILIKE '%vistana%'
      AND cliente NOT ILIKE '%fashion wear%'
      AND cliente NOT ILIKE '%fashion shoes%'
      AND cliente NOT ILIKE '%active shoes%'
      AND cliente NOT ILIKE '%active wear%'
      AND cliente NOT ILIKE '%joystep%'
      AND cliente NOT ILIKE '%joy step%'
      AND cliente NOT ILIKE '%confecciones boston%'
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
GRANT EXECUTE ON FUNCTION multifashion_retail_recurrentes_v2(date, date, int) TO service_role;

-- Retirar las versiones sin exclusion (ya repuntadas a switch en 20260530000000).
DROP FUNCTION IF EXISTS multifashion_wholesale_clientes(date, date);
DROP FUNCTION IF EXISTS multifashion_retail_recurrentes(date, date, int);

NOTIFY pgrst, 'reload schema';
