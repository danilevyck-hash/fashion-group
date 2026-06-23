-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ventas_dashboard_prev_same_period_v2  →  rama AÑO EN CURSO acotada
-- por ventana de fechas (Causa 4 del audit de performance).
--
-- PROBLEMA: la versión vigente (ventas_dashboard_prev_same_period), en su rama
-- de año en curso (es_periodo_parcial=true), arma los CTE dia_ventas/dia_costo
-- escaneando TODA la historia de switch_facturas + ventas_raw + switch_costo_diario
-- y recién después filtra por EXTRACT(YEAR/MONTH) (no sargable). El blend del
-- período comparable tarda ~4-5s y a veces el fetch falla ("No se pudieron cargar
-- los datos de resumen").
--
-- FIX (sin tocar ni un centavo): MISMA matemática exacta — mismas fuentes, mismo
-- blend en 2025-05-01, mismo bucket por día (fecha::date) y mismos EXTRACT/cortes
-- day-grain — pero los CTE dia_ventas/dia_costo se PRE-FILTRAN a la ventana de
-- fechas que realmente se usa (solo el año previo hasta el mes en curso + el mes
-- en curso del año actual). Es un superset-prefilter SARGABLE sobre `fecha`: los
-- filtros downstream (EXTRACT(YEAR)=v_prev_year, BETWEEN del corte, etc.) siguen
-- recortando exactamente las mismas filas → resultado IDÉNTICO al de hoy, pero el
-- escaneo pasa de ~4 años a ~1 año vía índice de fecha.
--
-- POR QUÉ NO SE LEE DE LA MV: ventas_rollup_mensual_mv se construye sobre
-- switch_ventas_unificado_vw, que hoy usa SOLO switch_facturas + bucket
-- hora-Panamá. El CTE day-grain usa blend switch+ventas_raw (corte 2025-05-01) +
-- bucket UTC (fecha::date) — convención DISTINTA. Sustituir por la MV movería
-- centavos en meses frontera (la propia migración solo_switch admite maxΔ ~$30),
-- violando el DoD "ni un centavo". Por eso se conserva el day-grain, solo acotado.
--
-- RENAME (no CREATE OR REPLACE in-place): el cuerpo de función cambia y PostgREST/
-- Vercel cachea la resolución; el nombre nuevo (_v2) fuerza una resolución fresca
-- y evita servir la versión vieja. La función vieja queda intacta (rollback fácil).
--
-- La rama ELSE (años cerrados, ya lee de la MV) se conserva BYTE-IDÉNTICA.
-- Shape de salida idéntico (rows[] + es_periodo_parcial + fecha_corte +
-- dia_corte_anio_anterior). Sin cambios de frontend salvo el nombre del RPC.
--
-- REQUISITO: ventas_rollup_mensual_mv ya existe (no se crea ni amplía nada).
-- Aplicar manual en Supabase Dashboard → SQL Editor ANTES del deploy (el route
-- nuevo llama a _v2).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_dashboard_prev_same_period_v2(p_year int)
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
  -- Ventanas de fecha (superset sargable; padding ±1 día cubre cualquier offset TZ).
  v_w_prev_lo         timestamptz;  -- año previo desde el 1-ene
  v_w_prev_hi         timestamptz;  -- hasta fin del mes en curso (lado prev)
  v_w_cur_lo          timestamptz;  -- mes en curso (año actual)
  v_w_cur_hi          timestamptz;
BEGIN
  v_cur_year_now := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_prev_year    := p_year - 1;

  -- mes_actual = ultimo mes con data real del ano p_year (cur side). EN VIVO,
  -- misma fuente que el summary -> el recorte del prev calza con el mesActual del
  -- frontend. COALESCE 12: si p_year no tuviera data, no sobre-restringe.
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

    -- Ventanas: año previo [1-ene .. fin mes en curso] + mes en curso del año actual.
    v_w_prev_lo := (make_date(v_prev_year, 1, 1) - INTERVAL '1 day')::timestamptz;
    v_w_prev_hi := (v_prev_mes_fin_full + INTERVAL '2 day')::timestamptz;
    v_w_cur_lo  := (v_cur_inicio - INTERVAL '1 day')::timestamptz;
    v_w_cur_hi  := (v_cur_fin_full + INTERVAL '2 day')::timestamptz;
  ELSE
    v_es_parcial     := false;
    v_cur_mes        := NULL;
    v_fecha_corte    := NULL;
    v_dia_corte_prev := NULL;
  END IF;

  IF v_es_parcial THEN
    WITH dia_ventas AS (
      -- pre-impuesto neto por empresa_key × día (switch >= 2025-05).
      -- ACOTADO a la ventana usada (superset sargable sobre `fecha`); los EXTRACT
      -- downstream recortan exactamente las mismas filas que la versión sin acotar.
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
        AND ( (fecha >= v_w_prev_lo AND fecha < v_w_prev_hi)
           OR (fecha >= v_w_cur_lo  AND fecha < v_w_cur_hi) )
      UNION ALL
      SELECT
        CASE WHEN empresa IN ('vistana','vistana_international') THEN 'vistana'
             WHEN empresa IN ('boston','confecciones_boston') THEN 'confecciones_boston'
             ELSE empresa END,
        fecha,
        subtotal
      FROM ventas_raw
      WHERE fecha < DATE '2025-05-01'
        AND fecha >= (make_date(v_prev_year, 1, 1) - INTERVAL '1 day')
    ),
    dia_costo AS (
      -- Para el período comparable (año previo) el costo sale 100% de ventas_raw
      -- (switch_costo_diario arranca 2026-05-01 → nunca cae en v_prev_year).
      -- Igual se acota cada arm a la ventana del año previo.
      SELECT empresa_key, fecha AS d, costo_total AS costo
      FROM switch_costo_diario
      WHERE fecha >= DATE '2026-05-01'
        AND fecha >= (make_date(v_prev_year, 1, 1) - 1)
        AND fecha <= (v_prev_mes_fin_full + 1)
      UNION ALL
      SELECT
        CASE WHEN empresa IN ('vistana','vistana_international') THEN 'vistana'
             WHEN empresa IN ('boston','confecciones_boston') THEN 'confecciones_boston'
             ELSE empresa END,
        fecha,
        costo
      FROM ventas_raw
      WHERE fecha < DATE '2026-05-01'
        AND fecha >= (make_date(v_prev_year, 1, 1) - 1)
        AND fecha <= (v_prev_mes_fin_full + 1)
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
    -- Ano previo (CERRADO) desde la MV, capado same-period a mes <= v_mes_actual.
    -- (Rama idéntica a la versión vigente — ya es rápida.)
    WITH final AS (
      SELECT
        r.empresa_key,
        r.mes_num AS mes,
        r.ventas_netas AS venta,
        r.costo_total AS costo
      FROM ventas_rollup_mensual_mv r
      WHERE r.anio = v_prev_year
        AND r.mes_num <= v_mes_actual
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

GRANT EXECUTE ON FUNCTION ventas_dashboard_prev_same_period_v2(int) TO service_role;

NOTIFY pgrst, 'reload schema';
