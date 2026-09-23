-- ─────────────────────────────────────────────────────────────────────────────
-- Multifashion › Clientes — MAHER ENTRA AL RANKING y LA FRONTERA QUEDA FUERA
-- POR CÓDIGO (23-sep-2026).
--
-- Decisión de Daniel (mockup «Multifashion mínimo», 23-sep-2026): «Maher entra;
-- La Frontera queda fuera (su plata, solo en la línea chiquita del Resumen)».
--
-- ── QUÉ CAMBIA ─────────────────────────────────────────────────────────────
--
-- 1. La vista `_multifashion_sf_vw` expone `cliente_codigo` (el
--    `cliente_switch_id` de la factura) AL FINAL de la lista de columnas — es lo
--    único que permite `CREATE OR REPLACE VIEW`. Ninguna columna existente se
--    mueve ni cambia de tipo; las RPC que ya la leen siguen igual.
--
-- 2. `multifashion_retail_recurrentes_v3` = la v2 con dos diferencias:
--      · se quita `cliente NOT ILIKE '%maher%'` (VENTAS MAHER, código 47, entra:
--        2024 $3.732,15 · 2025 $3.928,99 · 2026 $2.514,46, medido el 23-sep-2026);
--      · LA FRONTERA DUTY FREE sale POR CÓDIGO (`cliente_codigo NOT IN (324)`;
--        Switch la lista como código «34», `cliente_switch_id` 324), nunca por
--        nombre. Su plata es mayoreo y se dice en la línea chiquita del Resumen.
--    Las exclusiones de las empresas del grupo (intercompañía) se quedan.
--
-- 🔴 La v2 NO se toca ni se dropea: la ruta cae a ella mientras esta migración
-- no corra, y con `RETAIL_AL_FRENTE` en `false` la vuelve a pedir.
--
-- Aplicar con `npm run migrar supabase/migrations/20261217140100_multifashion_clientes_maher_entra_frontera_por_codigo.sql`.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public._multifashion_sf_vw AS
 SELECT 'american_classic'::text AS empresa,
    EXTRACT(year FROM mf_panama_date(fecha))::integer AS anio,
    EXTRACT(month FROM mf_panama_date(fecha))::integer AS mes,
    mf_panama_date(fecha) AS fecha,
    switch_factura_id::text AS n_sistema,
    vendedor_nombre AS vendedor,
    cliente_nombre AS cliente,
        CASE
            WHEN tipo_comprobante = ANY (ARRAY['Factura'::text, 'Tiquete'::text, 'Transacción'::text, 'Nota de Débito'::text]) THEN subtotal_descuento
            WHEN tipo_comprobante = 'Nota de Crédito'::text THEN - subtotal_descuento
            ELSE 0::numeric
        END AS subtotal,
    total::numeric AS total,
    is_wholesale,
    tipo_comprobante,
    1 AS _row,
    fecha AS fecha_ts,
        CASE
            WHEN (tipo_comprobante = ANY (ARRAY['Factura'::text, 'Tiquete'::text, 'Transacción'::text, 'Nota de Débito'::text])) AND condicion_venta = 'Contado'::text THEN subtotal_descuento
            WHEN tipo_comprobante = 'Nota de Crédito'::text THEN - subtotal_descuento
            ELSE 0::numeric
        END AS subtotal_comision,
    vendedor_switch_id AS vendedor_codigo,
    public.multifashion_vendedora_canonica(vendedor_switch_id, vendedor_nombre) AS vendedor_canonico,
    public.multifashion_vendedora_canal(vendedor_switch_id) AS vendedor_canal,
    -- 🔴 NUEVA, AL FINAL: la identidad del cliente es el CÓDIGO, nunca el nombre.
    cliente_switch_id AS cliente_codigo
   FROM switch_facturas
  WHERE empresa_key = 'american_classic'::text;

CREATE OR REPLACE FUNCTION multifashion_retail_recurrentes_v3(
  p_fecha_inicio date, p_fecha_fin date, p_limit int DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_clientes jsonb;
  v_clientes_identificados int;
  v_ventas_identificadas numeric; v_tickets_identificados bigint;
  v_ventas_anonimas numeric;      v_tickets_anonimos bigint;
  v_total_clientes int; v_total_ventas numeric; v_total_tickets bigint;
  v_mes_labels CONSTANT text[] := ARRAY['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 50; END IF;
  IF p_limit > 500 THEN p_limit := 500; END IF;

  -- Base retail identificada: excluye mayoreo, intercompañía y LA FRONTERA
  -- (por CÓDIGO). VENTAS MAHER entra (decisión de Daniel, 23-sep-2026).
  WITH base AS (
    SELECT
      REGEXP_REPLACE(TRIM(cliente), '\s+', ' ', 'g') AS cli_key,
      subtotal, fecha,
      EXTRACT(YEAR  FROM fecha)::int AS f_anio,
      EXTRACT(MONTH FROM fecha)::int AS f_mes
    FROM _multifashion_sf_vw
    WHERE is_wholesale = false
      AND fecha BETWEEN p_fecha_inicio AND p_fecha_fin
      AND cliente IS NOT NULL
      AND TRIM(UPPER(cliente)) NOT IN ('CONTADO', 'CONSUMIDOR FINAL', '')
      -- Intercompañía / empresas del grupo
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
      -- LA FRONTERA DUTY FREE, por CÓDIGO (Switch «34», cliente_switch_id 324)
      AND cliente_codigo NOT IN (324)
  ),
  cli AS (
    SELECT cli_key,
      SUM(subtotal)::numeric AS total_ytd,
      COUNT(*)::int          AS tickets_ytd,
      MAX(fecha)             AS ultima_compra
    FROM base
    GROUP BY cli_key
    HAVING SUM(subtotal) > 0
    ORDER BY SUM(subtotal) DESC
    LIMIT p_limit
  ),
  meses_lookup AS (
    SELECT EXTRACT(YEAR FROM gs)::int AS mes_anio, EXTRACT(MONTH FROM gs)::int AS mes_idx
    FROM generate_series(date_trunc('month', p_fecha_inicio), date_trunc('month', p_fecha_fin), INTERVAL '1 month') AS gs
  ),
  meses_por_cli AS (
    SELECT b.cli_key, b.f_anio AS mes_anio, b.f_mes AS mes_idx,
      SUM(b.subtotal)::numeric AS ventas, COUNT(*)::int AS tickets
    FROM base b JOIN cli ON cli.cli_key = b.cli_key
    GROUP BY b.cli_key, b.f_anio, b.f_mes
  ),
  cli_meses AS (
    SELECT c.cli_key, jsonb_agg(
      jsonb_build_object(
        'mes_anio', ml.mes_anio, 'mes_idx', ml.mes_idx,
        'mes_label', v_mes_labels[ml.mes_idx],
        'ventas', COALESCE(mp.ventas, 0),
        'tickets', COALESCE(mp.tickets, 0)
      ) ORDER BY ml.mes_anio, ml.mes_idx
    ) AS meses
    FROM cli c CROSS JOIN meses_lookup ml
    LEFT JOIN meses_por_cli mp ON mp.cli_key = c.cli_key AND mp.mes_anio = ml.mes_anio AND mp.mes_idx = ml.mes_idx
    GROUP BY c.cli_key
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre', c.cli_key, 'total_ytd', c.total_ytd, 'tickets_ytd', c.tickets_ytd,
      'ticket_prom', CASE WHEN c.tickets_ytd > 0 THEN c.total_ytd / c.tickets_ytd ELSE 0 END,
      'ultima_compra', to_char(c.ultima_compra, 'YYYY-MM-DD'),
      'meses', cm.meses
    ) ORDER BY c.total_ytd DESC
  )
  INTO v_clientes
  FROM cli c LEFT JOIN cli_meses cm ON cm.cli_key = c.cli_key;

  -- Totales de identificados (TODOS, no solo top N): mismas exclusiones que `base`.
  SELECT
    COUNT(DISTINCT REGEXP_REPLACE(TRIM(cliente), '\s+', ' ', 'g')),
    COALESCE(SUM(subtotal), 0),
    COALESCE(COUNT(*), 0)
  INTO v_clientes_identificados, v_ventas_identificadas, v_tickets_identificados
  FROM _multifashion_sf_vw
  WHERE is_wholesale = false
    AND fecha BETWEEN p_fecha_inicio AND p_fecha_fin
    AND cliente IS NOT NULL
    AND TRIM(UPPER(cliente)) NOT IN ('CONTADO', 'CONSUMIDOR FINAL', '')
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
    AND cliente_codigo NOT IN (324);

  -- Bucket anónimo (mostrador): CONTADO / CONSUMIDOR FINAL / vacío / NULL.
  SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(COUNT(*), 0)
  INTO v_ventas_anonimas, v_tickets_anonimos
  FROM _multifashion_sf_vw
  WHERE is_wholesale = false
    AND fecha BETWEEN p_fecha_inicio AND p_fecha_fin
    AND (cliente IS NULL OR TRIM(UPPER(cliente)) IN ('CONTADO', 'CONSUMIDOR FINAL', ''));

  SELECT jsonb_array_length(COALESCE(v_clientes, '[]'::jsonb))::int,
    COALESCE((SELECT SUM((elem->>'total_ytd')::numeric)  FROM jsonb_array_elements(COALESCE(v_clientes, '[]'::jsonb)) elem), 0),
    COALESCE((SELECT SUM((elem->>'tickets_ytd')::int)     FROM jsonb_array_elements(COALESCE(v_clientes, '[]'::jsonb)) elem), 0)
  INTO v_total_clientes, v_total_ventas, v_total_tickets;

  RETURN jsonb_build_object(
    'fecha_inicio', to_char(p_fecha_inicio, 'YYYY-MM-DD'),
    'fecha_fin',    to_char(p_fecha_fin,    'YYYY-MM-DD'),
    'limit', p_limit,
    'total_clientes', v_total_clientes,
    'total_ventas',   v_total_ventas,
    'total_tickets',  v_total_tickets,
    'clientes_identificados', v_clientes_identificados,
    'ventas_identificadas',   v_ventas_identificadas,
    'tickets_identificados',  v_tickets_identificados,
    'ventas_anonimas',        v_ventas_anonimas,
    'tickets_anonimos',       v_tickets_anonimos,
    'pct_identificado', CASE
      WHEN (v_ventas_identificadas + v_ventas_anonimas) > 0
      THEN ROUND(v_ventas_identificadas / (v_ventas_identificadas + v_ventas_anonimas) * 100, 1)
      ELSE 0 END,
    'clientes', COALESCE(v_clientes, '[]'::jsonb)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION multifashion_retail_recurrentes_v3(date, date, int) TO service_role;

NOTIFY pgrst, 'reload schema';
