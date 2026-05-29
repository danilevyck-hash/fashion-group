-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ventas_dashboard_prev_same_period → fuente Switch (fase 2.1)
--
-- FASE 2.1: migrado de ventas_raw a fuentes unificadas. Mismo nombre y shape de
-- salida (jsonb {rows[], es_periodo_parcial, fecha_corte, dia_corte_anio_anterior}).
-- Misma base contable que el summary: subtotal_descuento (pre-impuesto) de
-- switch_facturas para >= 2025-05, ventas_raw.subtotal para < 2025-05. Costo:
-- switch_costo_diario (>= 2026-05) / ventas_raw.costo (< 2026-05).
--
-- Preserva la lógica same-period day-by-day: el mes en curso se recorta al
-- mismo offset de días en el año anterior, por empresa.
--
-- fecha_corte ahora sale de switch_facturas (no ventas_raw) — refleja la data
-- realmente sincronizada del año en curso.
--
-- Aplicar junto con 300, 400, 600.
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
  v_rows_json         jsonb;
BEGIN
  v_cur_year_now := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_prev_year    := p_year - 1;

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
      -- pre-impuesto neto por empresa_key × día (switch >= 2025-05)
      SELECT
        empresa_key,
        fecha::date AS d,
        CASE
          WHEN tipo_comprobante IN ('Factura','Tiquete','Transacción','Nota de Débito') THEN subtotal_descuento
          WHEN tipo_comprobante = 'Nota de Crédito' THEN -subtotal_descuento
          ELSE 0
        END AS venta
      FROM switch_facturas
      WHERE fecha >= DATE '2025-05-01'
      UNION ALL
      SELECT
        CASE WHEN empresa IN ('vistana','vistana_international') THEN 'vistana'
             WHEN empresa IN ('boston','confecciones_boston') THEN 'confecciones_boston'
             ELSE empresa END,
        fecha,
        subtotal
      FROM ventas_raw
      WHERE fecha < DATE '2025-05-01'
    ),
    dia_costo AS (
      SELECT empresa_key, fecha AS d, costo_total AS costo
      FROM switch_costo_diario
      WHERE fecha >= DATE '2026-05-01'
      UNION ALL
      SELECT
        CASE WHEN empresa IN ('vistana','vistana_international') THEN 'vistana'
             WHEN empresa IN ('boston','confecciones_boston') THEN 'confecciones_boston'
             ELSE empresa END,
        fecha,
        costo
      FROM ventas_raw
      WHERE fecha < DATE '2026-05-01'
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
    -- Año cerrado: full mes desde las vistas unificadas
    WITH final AS (
      SELECT
        v.empresa_key,
        EXTRACT(MONTH FROM v.mes)::int AS mes,
        v.ventas_netas AS venta,
        COALESCE(c.costo_total, 0) AS costo
      FROM switch_ventas_unificado_vw v
      LEFT JOIN switch_costo_unificado_vw c ON c.empresa_key = v.empresa_key AND c.mes = v.mes
      WHERE EXTRACT(YEAR FROM v.mes)::int = v_prev_year
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
