-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_retail_recurrentes — default 30 → 50
--
-- Único cambio: p_limit DEFAULT 50 (era 30). Mismo body que la versión
-- previa (20260515000100). El frontend mostraba "Top 30" — ahora "Top 50".
--
-- Idempotente: CREATE OR REPLACE.
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION multifashion_retail_recurrentes(
  p_year  int,
  p_limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_clientes       jsonb;
  v_total_clientes int;
  v_total_ventas   numeric;
  v_total_tickets  bigint;
  v_mes_labels CONSTANT text[] := ARRAY[
    'Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'
  ];
BEGIN
  WITH base AS (
    SELECT
      cliente,
      subtotal,
      mes,
      fecha,
      n_sistema
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND is_wholesale = false
      AND anio = p_year
      AND cliente IS NOT NULL
      AND TRIM(UPPER(cliente)) NOT IN ('CONTADO', 'CONSUMIDOR FINAL', '')
  ),
  cli AS (
    SELECT
      cliente,
      SUM(subtotal)::numeric  AS total_ytd,
      COUNT(DISTINCT n_sistema)::int AS tickets_ytd,
      MAX(fecha)              AS ultima_compra
    FROM base
    GROUP BY cliente
    HAVING COUNT(DISTINCT n_sistema) >= 2
    ORDER BY SUM(subtotal) DESC
    LIMIT p_limit
  ),
  meses_por_cli AS (
    SELECT
      b.cliente,
      b.mes,
      SUM(b.subtotal)::numeric AS ventas,
      COUNT(DISTINCT b.n_sistema)::int AS tickets
    FROM base b
    JOIN cli ON cli.cliente = b.cliente
    GROUP BY b.cliente, b.mes
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
      'ticket_prom',    CASE WHEN c.tickets_ytd > 0
                              THEN c.total_ytd / c.tickets_ytd
                              ELSE 0 END,
      'ultima_compra',  to_char(c.ultima_compra, 'YYYY-MM-DD'),
      'meses',          cm.meses
    )
    ORDER BY c.total_ytd DESC
  )
  INTO v_clientes
  FROM cli c
  LEFT JOIN cli_meses cm ON cm.cliente = c.cliente;

  SELECT
    jsonb_array_length(COALESCE(v_clientes, '[]'::jsonb))::int,
    COALESCE((
      SELECT SUM((elem->>'total_ytd')::numeric)
      FROM jsonb_array_elements(COALESCE(v_clientes, '[]'::jsonb)) elem
    ), 0)::numeric,
    COALESCE((
      SELECT SUM((elem->>'tickets_ytd')::int)::bigint
      FROM jsonb_array_elements(COALESCE(v_clientes, '[]'::jsonb)) elem
    ), 0)::bigint
  INTO v_total_clientes, v_total_ventas, v_total_tickets;

  RETURN jsonb_build_object(
    'anio',           p_year,
    'limit',          p_limit,
    'total_clientes', v_total_clientes,
    'total_ventas',   v_total_ventas,
    'total_tickets',  v_total_tickets,
    'clientes',       COALESCE(v_clientes, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_retail_recurrentes(int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
