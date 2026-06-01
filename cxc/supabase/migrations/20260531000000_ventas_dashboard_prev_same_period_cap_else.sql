-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ventas_dashboard_prev_same_period → cap same-period en la rama ELSE
--
-- BUG (audit 2026-05-31): el delta "vs 2025" de la columna TOTAL y de la fila
-- TOTAL GRUPO del tab Resumen salía -62%/-64% (falso). El frontend hace
-- sumYtd() sobre TODO el array prev del año anterior; cuando ese array trae los
-- 12 meses, compara YTD parcial de 2026 (Ene-Abr) contra AÑO COMPLETO de 2025.
-- Los KPIs superiores no se afectan porque recortan con sumSlice(_, mesActual).
--
-- CAUSA: la rama ELSE (no parcial) de ventas_dashboard_prev_same_period emite
-- los 12 meses del año previo. Esa rama se activa cuando p_year = año calendario
-- pero el MES CALENDARIO en curso (Mayo) todavía no tiene data en switch_facturas
-- → es_periodo_parcial = false (la detección es por calendario, no por data) →
-- cae a ELSE → 12 meses de 2025. Verificado: hoy el RPC devuelve mes 1-12 de
-- 2025 con es_periodo_parcial=false.
--
-- FIX (mismo patrón que 20260510040000_fix_clientes_delta_same_period.sql, ya
-- validado en prod para el tab Clientes): cap same-period a mes <= mes_actual,
-- donde mes_actual = último mes con data REAL del año en curso (p_year), no el
-- mes calendario. Se deriva de switch_ventas_unificado_vw — la MISMA fuente que
-- ventas_dashboard_summary (cur year), así el recorte del prev calza exacto con
-- el mesActual que el frontend calcula del lado cur. Para el año en curso esa
-- vista es 100% switch_facturas (fecha >= 2025-05-02), o sea: el último mes con
-- data real en switch_facturas. Mayo sin data → mes_actual = Abril = 4.
--
-- El cap se aplica UNIFORME y es seguro en ambos casos:
--   - p_year = año en curso (2026): mes_actual = 4 (Abr) → prev (2025) capado a
--     Ene-Abr. Mismo número de meses que el cur. ✅ corrige el delta.
--   - p_year = año cerrado (ej. ver 2025 estando en 2026): mes_actual = 12 (data
--     completa) → prev (2024) capado a 12 = año completo. ✅ no-op, preserva el
--     comparativo full-vs-full de años cerrados.
--
-- La rama PARCIAL (es_periodo_parcial = true) NO se toca: ya emite solo meses
-- 1..mes_en_curso con el mes en curso recortado day-by-day por empresa, y ese
-- mes en curso es por definición un mes con data (= mes_actual). Sigue igual.
--
-- Se PRESERVA todo: shape de salida (rows[] con empresa, mes, total_subtotal,
-- total_costo, total_utilidad, total_facturado, filas) y wrapper jsonb
-- (es_periodo_parcial, fecha_corte, dia_corte_anio_anterior). Sin cambios de
-- frontend. Sin cambios de datos. Único delta vs migration 500: variable
-- v_mes_actual + filtro de mes en la rama ELSE.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
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
