-- ─────────────────────────────────────────────────────────────────────────────
-- multifashion_vendedoras_range — ranking de vendedoras por VENTANA ROLLING de N
-- meses (3/6/12), para los botones "Últimos 3/6/12 meses" del tab Vendedoras.
--
-- Calca el shape de multifashion_vendedoras_v3 (mismas columnas por vendedor y
-- mismos totales) para que el endpoint/subtab lo consuma igual. Diferencias:
--   • La ventana es N meses terminando en (p_year, p_fin_mes), puede cruzar año.
--   • El comparativo Δ es vs la MISMA ventana del AÑO ANTERIOR (YoY), recortada al
--     mismo offset de días si la ventana incluye el mes en curso (justo día-a-día).
--   • SIN bono (el bono es por mes; no aplica a una ventana rolling).
--   • Misma base que v3 (todas las ventas con vendedor, normaliza nombre, excluye
--     DEFAULT; comisión = 0.5% sobre subtotal_comision = base de contado).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION multifashion_vendedoras_range(
  p_year int, p_fin_mes int, p_n_meses int
)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_managers jsonb;
  v_fin_mes_inicio date; v_actual_fin_full date; v_actual_inicio date; v_actual_fin date;
  v_prev_inicio date; v_prev_fin date; v_prev_fin_full date;
  v_es_parcial boolean; v_dia_offset int;
  v_top_vendedor text;
  v_vendedoras jsonb;
  v_ventas_total numeric; v_tickets_total bigint;
  v_ventas_total_prev numeric; v_tickets_total_prev bigint;
BEGIN
  IF p_n_meses NOT IN (3, 6, 12) THEN RAISE EXCEPTION 'p_n_meses debe ser 3, 6 o 12'; END IF;
  IF p_fin_mes < 1 OR p_fin_mes > 12 THEN RAISE EXCEPTION 'p_fin_mes requerido (1..12)'; END IF;

  -- Ventana actual: N meses terminando en (p_year, p_fin_mes).
  v_fin_mes_inicio  := make_date(p_year, p_fin_mes, 1);
  v_actual_fin_full := (v_fin_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_actual_inicio   := (v_fin_mes_inicio - ((p_n_meses - 1) || ' months')::interval)::date;

  -- ¿Incluye el mes en curso? → parcial, corte al último día con ventas.
  v_es_parcial := (CURRENT_DATE BETWEEN v_fin_mes_inicio AND v_actual_fin_full);
  IF v_es_parcial THEN
    SELECT COALESCE(MAX(fecha), v_fin_mes_inicio) INTO v_actual_fin
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_actual_inicio AND LEAST(v_actual_fin_full, CURRENT_DATE);
  ELSE
    v_actual_fin := v_actual_fin_full;
  END IF;

  -- Ventana del año anterior: misma, shift -1 año. Si la actual es parcial, recortar
  -- al mismo offset de días (comparación justo, mismo corte).
  v_prev_inicio   := (v_actual_inicio - INTERVAL '1 year')::date;
  v_prev_fin_full := (v_fin_mes_inicio - INTERVAL '1 year' + INTERVAL '1 month' - INTERVAL '1 day')::date;
  IF v_es_parcial THEN
    v_dia_offset := v_actual_fin - v_actual_inicio;
    v_prev_fin := LEAST(v_prev_inicio + v_dia_offset, v_prev_fin_full);
  ELSE
    v_prev_fin := v_prev_fin_full;
  END IF;

  v_managers := COALESCE(get_app_setting('multifashion_managers'), '[]'::jsonb);

  SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') INTO v_top_vendedor
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
  GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  ORDER BY SUM(subtotal) DESC LIMIT 1;

  WITH actual AS (
    SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor,
      SUM(subtotal) AS ventas, COUNT(*) AS tickets, SUM(subtotal_comision) AS base_comision
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  ),
  prev AS (
    SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor,
      SUM(subtotal) AS ventas, COUNT(*) AS tickets
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_prev_inicio AND v_prev_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre', a.vendedor, 'tickets', a.tickets, 'ventas', a.ventas,
      'ticket_promedio', CASE WHEN a.tickets > 0 THEN a.ventas / a.tickets ELSE 0 END,
      'comision', a.base_comision * 0.005,
      'manager', v_managers ? a.vendedor,
      'top', (a.vendedor = v_top_vendedor),
      'delta_ventas_pct',  CASE WHEN COALESCE(p.ventas, 0) > 0 THEN (a.ventas - p.ventas) / p.ventas ELSE NULL END,
      'delta_tickets_pct', CASE WHEN COALESCE(p.tickets, 0) > 0 THEN (a.tickets - p.tickets)::numeric / p.tickets ELSE NULL END
    ) ORDER BY a.ventas DESC
  )
  INTO v_vendedoras
  FROM actual a LEFT JOIN prev p ON p.vendedor = a.vendedor;

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*) INTO v_ventas_total, v_tickets_total
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT';

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*) INTO v_ventas_total_prev, v_tickets_total_prev
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_prev_inicio AND v_prev_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT';

  RETURN jsonb_build_object(
    'vendedoras', COALESCE(v_vendedoras, '[]'::jsonb),
    'total_vendedoras_periodo', jsonb_array_length(COALESCE(v_vendedoras, '[]'::jsonb)),
    'ventas_total', v_ventas_total, 'tickets_total', v_tickets_total,
    'ventas_total_prev', v_ventas_total_prev, 'tickets_total_prev', v_tickets_total_prev,
    'fecha_corte', to_char(v_actual_fin, 'YYYY-MM-DD'),
    'es_periodo_parcial', v_es_parcial,
    'dia_corte_periodo_anterior', to_char(v_prev_fin, 'YYYY-MM-DD'),
    'dia_corte_anio_anterior',    to_char(v_prev_fin, 'YYYY-MM-DD'),
    'ventana_inicio', to_char(v_actual_inicio, 'YYYY-MM-DD'),
    'n_meses', p_n_meses
  );
END;
$$;
GRANT EXECUTE ON FUNCTION multifashion_vendedoras_range(int, int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
