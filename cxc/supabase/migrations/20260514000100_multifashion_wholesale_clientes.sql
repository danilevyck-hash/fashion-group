-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_wholesale_clientes(p_year int)
--
-- Sirve al sub-tab "Clientes" de Multifashion (Sesión 4 del sprint).
-- Devuelve lista de clientes wholesale activos en p_year con histórico
-- mensual + última compra + total YTD + tickets.
--
-- Scope: solo wholesale (is_wholesale = true) y empresa = 'american_classic'.
-- Hoy en producción hay 1 cliente típico (LA FRONTERA DUTY FREE); futuros
-- clientes aparecen automáticos al agregarse a clientes_master + uploads
-- con DEFAULT vendedor (el trigger refresh_wholesale_flag_on_master_change
-- mantiene is_wholesale al día).
--
-- Estructura del response:
--   {
--     anio,
--     total_clientes, total_ventas, total_tickets,
--     clientes: [
--       {
--         nombre, total_ytd, tickets_ytd, ultima_compra,
--         meses: [{ mes_idx, mes_label, ventas, tickets }]   -- 12 entries siempre
--       }
--     ]
--   }
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION multifashion_wholesale_clientes(p_year int)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_clientes      jsonb;
  v_total_clientes int;
  v_total_ventas   numeric;
  v_total_tickets  bigint;
  v_mes_labels CONSTANT text[] := ARRAY[
    'Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'
  ];
BEGIN
  -- Universo de clientes wholesale con ventas en p_year, agregados.
  -- Para cada cliente: total YTD + tickets + última compra + array de 12
  -- meses (relleno con 0 si el mes no tuvo actividad para ese cliente).
  WITH cli AS (
    SELECT
      cliente,
      SUM(subtotal)::numeric  AS total_ytd,
      COUNT(DISTINCT n_sistema)::int AS tickets_ytd,
      MAX(fecha)              AS ultima_compra
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND is_wholesale = true
      AND anio = p_year
      AND cliente IS NOT NULL
      AND TRIM(cliente) <> ''
    GROUP BY cliente
  ),
  meses_por_cli AS (
    SELECT
      cliente,
      mes,
      SUM(subtotal)::numeric AS ventas,
      COUNT(DISTINCT n_sistema)::int AS tickets
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND is_wholesale = true
      AND anio = p_year
      AND cliente IS NOT NULL
      AND TRIM(cliente) <> ''
    GROUP BY cliente, mes
  ),
  meses_lookup AS (
    SELECT generate_series(1, 12) AS mes_idx
  ),
  cli_meses AS (
    SELECT
      c.cliente,
      jsonb_agg(
        jsonb_build_object(
          'mes_idx',   ml.mes_idx,
          'mes_label', v_mes_labels[ml.mes_idx],
          'ventas',    COALESCE(mp.ventas, 0),
          'tickets',   COALESCE(mp.tickets, 0)
        )
        ORDER BY ml.mes_idx
      ) AS meses
    FROM cli c
    CROSS JOIN meses_lookup ml
    LEFT JOIN meses_por_cli mp ON mp.cliente = c.cliente AND mp.mes = ml.mes_idx
    GROUP BY c.cliente
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre',         c.cliente,
      'total_ytd',      c.total_ytd,
      'tickets_ytd',    c.tickets_ytd,
      'ultima_compra',  to_char(c.ultima_compra, 'YYYY-MM-DD'),
      'meses',          cm.meses
    )
    ORDER BY c.total_ytd DESC
  )
  INTO v_clientes
  FROM cli c
  LEFT JOIN cli_meses cm ON cm.cliente = c.cliente;

  -- Totales agregados (header del sub-tab)
  SELECT
    COUNT(DISTINCT cliente)::int,
    COALESCE(SUM(subtotal), 0)::numeric,
    COUNT(DISTINCT n_sistema)::bigint
  INTO v_total_clientes, v_total_ventas, v_total_tickets
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND is_wholesale = true
    AND anio = p_year
    AND cliente IS NOT NULL
    AND TRIM(cliente) <> '';

  RETURN jsonb_build_object(
    'anio',            p_year,
    'total_clientes',  v_total_clientes,
    'total_ventas',    v_total_ventas,
    'total_tickets',   v_total_tickets,
    'clientes',        COALESCE(v_clientes, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_wholesale_clientes(int) TO service_role;

NOTIFY pgrst, 'reload schema';
