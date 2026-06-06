-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: dia_costo de ventas_dashboard_prev_same_period a switch_articulo_diario
-- (sprint de costo, Paso 3). Retira la última lectura de ventas_raw.costo en esta
-- función. El CTE dia_costo (switch_costo_diario >= 2026-05 UNION ventas_raw.costo
-- < 2026-05) pasa a SOLO switch_articulo_diario (historia completa, costo neto
-- firmado por tipo, fecha DATE local). EXCLUYE ND (~0.1 por ciento, ver gate).
-- Resto de la funcion IDENTICO a la definicion vigente (Paso 4a).
-- ventas_proyeccion_cierre_v6 NO usa costo, no se toca.
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_dashboard_prev_same_period(p_year int)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_cur_year_now      int;
  v_prev_year         int;
  v_es_parcial        boolean;
  v_cur_mes           int;
  v_cur_inicio        date;
  v_cur_fin_full      date;
  v_prev_mes_inicio   date;
  v_prev_mes_fin_full date;
  v_fecha_corte       date;
  v_dia_corte_prev    date;
  v_mes_actual        int;
  v_rows_json         jsonb;
BEGIN
  v_cur_year_now := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_prev_year    := p_year - 1;

  -- mes_actual = último mes con data real del año p_year (cur side de la
  -- comparación). Fuente: switch_ventas_unificado_vw, idéntica a la que usa
  -- ventas_dashboard_summary → garantiza que el recorte del prev calce con el
  -- mesActual que el frontend deriva del cur. Para el año en curso esta vista
  -- es switch_facturas (fecha >= 2025-05-02). COALESCE 12: si p_year no tuviera
  -- data, no sobre-restringe (mismo fallback que el fix de Clientes).
  SELECT COALESCE(MAX(EXTRACT(MONTH FROM v.mes)::int), 12)
  INTO v_mes_actual
  FROM switch_ventas_unificado_vw v
  WHERE EXTRACT(YEAR FROM v.mes)::int = p_year;

  IF p_year = v_cur_year_now THEN
    v_cur_mes           := EXTRACT(MONTH FROM CURRENT_DATE)::int;
    v_cur_inicio        := date_trunc('month', CURRENT_DATE)::date;
    v_cur_fin_full      := (v_cur_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
    v_prev_mes_inicio   := make_date(v_prev_year, v_cur_mes, 1);
    v_prev_mes_fin_full := (v_prev_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- fecha_corte global = MAX(fecha) del mes en curso en switch_facturas
    SELECT MAX(fecha::date) INTO v_fecha_corte
    FROM switch_facturas
    WHERE fecha::date BETWEEN v_cur_inicio AND v_cur_fin_full;

    v_es_parcial := (v_fecha_corte IS NOT NULL);

    IF v_es_parcial THEN
      v_dia_corte_prev := LEAST(
        v_prev_mes_inicio + (v_fecha_corte - v_cur_inicio),
        v_prev_mes_fin_full
      );
    END IF;
  ELSE
    v_es_parcial     := false;
    v_cur_mes        := NULL;
    v_fecha_corte    := NULL;
    v_dia_corte_prev := NULL;
  END IF;

  IF v_es_parcial THEN
    WITH dia_ventas AS (
      -- Fuente única switch_facturas (historia completa backfilleada del API).
      SELECT
        empresa_key,
        fecha::date AS d,
        CASE
          WHEN tipo_comprobante IN ('Factura','Tiquete','Transacción','Nota de Débito') THEN subtotal_descuento
          WHEN tipo_comprobante = 'Nota de Crédito' THEN -subtotal_descuento
          ELSE 0
        END AS venta
      FROM switch_facturas
    ),
    dia_costo AS (
      -- Fuente única switch_articulo_diario (costo neto firmado por tipo; fecha es
      -- DATE local). Excluye ND (~0.1%, documentado en el gate del sprint de costo).
      SELECT
        empresa_key,
        fecha AS d,
        SUM(CASE WHEN tipo = 'NC' THEN -costo_total ELSE costo_total END) AS costo
      FROM switch_articulo_diario
      GROUP BY empresa_key, fecha
    ),
    empresa_cuts AS (
      SELECT empresa_key, MAX(d) AS e_cur_max
      FROM dia_ventas
      WHERE d BETWEEN v_cur_inicio AND v_cur_fin_full
      GROUP BY empresa_key
    ),
    v_closed AS (
      SELECT empresa_key, EXTRACT(MONTH FROM d)::int AS mes, SUM(venta)::numeric AS venta
      FROM dia_ventas
      WHERE EXTRACT(YEAR FROM d)::int = v_prev_year AND EXTRACT(MONTH FROM d)::int < v_cur_mes
      GROUP BY empresa_key, EXTRACT(MONTH FROM d)::int
    ),
    c_closed AS (
      SELECT empresa_key, EXTRACT(MONTH FROM d)::int AS mes, SUM(costo)::numeric AS costo
      FROM dia_costo
      WHERE EXTRACT(YEAR FROM d)::int = v_prev_year AND EXTRACT(MONTH FROM d)::int < v_cur_mes
      GROUP BY empresa_key, EXTRACT(MONTH FROM d)::int
    ),
    v_current AS (
      SELECT dv.empresa_key, v_cur_mes AS mes, SUM(dv.venta)::numeric AS venta
      FROM dia_ventas dv
      JOIN empresa_cuts ec ON ec.empresa_key = dv.empresa_key
      WHERE EXTRACT(YEAR FROM dv.d)::int = v_prev_year
        AND EXTRACT(MONTH FROM dv.d)::int = v_cur_mes
        AND dv.d BETWEEN v_prev_mes_inicio
                     AND LEAST(v_prev_mes_inicio + (ec.e_cur_max - v_cur_inicio), v_prev_mes_fin_full)
      GROUP BY dv.empresa_key
    ),
    c_current AS (
      SELECT dc.empresa_key, v_cur_mes AS mes, SUM(dc.costo)::numeric AS costo
      FROM dia_costo dc
      JOIN empresa_cuts ec ON ec.empresa_key = dc.empresa_key
      WHERE EXTRACT(YEAR FROM dc.d)::int = v_prev_year
        AND EXTRACT(MONTH FROM dc.d)::int = v_cur_mes
        AND dc.d BETWEEN v_prev_mes_inicio
                     AND LEAST(v_prev_mes_inicio + (ec.e_cur_max - v_cur_inicio), v_prev_mes_fin_full)
      GROUP BY dc.empresa_key
    ),
    merged_v AS (
      SELECT empresa_key, mes, venta FROM v_closed
      UNION ALL SELECT empresa_key, mes, venta FROM v_current
    ),
    merged_c AS (
      SELECT empresa_key, mes, costo FROM c_closed
      UNION ALL SELECT empresa_key, mes, costo FROM c_current
    ),
    final AS (
      SELECT mv.empresa_key, mv.mes, mv.venta, COALESCE(mc.costo, 0) AS costo
      FROM merged_v mv
      LEFT JOIN merged_c mc ON mc.empresa_key = mv.empresa_key AND mc.mes = mv.mes
    )
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'empresa', empresa_key, 'mes', mes,
        'total_subtotal', venta, 'total_costo', costo,
        'total_utilidad', venta - costo, 'total_facturado', venta, 'filas', 0
      ) ORDER BY empresa_key, mes
    ), '[]'::jsonb)
    INTO v_rows_json FROM final;

  ELSE
    -- Año previo full mes desde las vistas unificadas, CAPADO same-period a
    -- mes <= v_mes_actual (último mes con data del año p_year). Año en curso con
    -- mes calendario sin data → recorta al último mes real (corrige el delta).
    -- Año cerrado → v_mes_actual = 12 → no-op (full year vs full year).
    WITH final AS (
      SELECT
        v.empresa_key,
        EXTRACT(MONTH FROM v.mes)::int AS mes,
        v.ventas_netas AS venta,
        COALESCE(c.costo_total, 0) AS costo
      FROM switch_ventas_unificado_vw v
      LEFT JOIN switch_costo_unificado_vw c ON c.empresa_key = v.empresa_key AND c.mes = v.mes
      WHERE EXTRACT(YEAR FROM v.mes)::int = v_prev_year
        AND EXTRACT(MONTH FROM v.mes)::int <= v_mes_actual
    )
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'empresa', empresa_key, 'mes', mes,
        'total_subtotal', venta, 'total_costo', costo,
        'total_utilidad', venta - costo, 'total_facturado', venta, 'filas', 0
      ) ORDER BY empresa_key, mes
    ), '[]'::jsonb)
    INTO v_rows_json FROM final;
  END IF;

  RETURN jsonb_build_object(
    'rows',                    v_rows_json,
    'es_periodo_parcial',      v_es_parcial,
    'fecha_corte',             to_char(v_fecha_corte,    'YYYY-MM-DD'),
    'dia_corte_anio_anterior', to_char(v_dia_corte_prev, 'YYYY-MM-DD')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ventas_dashboard_prev_same_period(int) TO service_role;

NOTIFY pgrst, 'reload schema';
