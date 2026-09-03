-- ─────────────────────────────────────────────────────────────────────────────
-- ventas_dashboard_prev_same_period_v3 — el corte del año anterior en el DÍA DE
-- PANAMÁ, no en UTC. (Lugar #6 de la auditoría de «mismos días», 3-sep-2026.)
--
-- LA REGLA DE LA CASA: un período empezado se compara contra los MISMOS DÍAS
-- del año pasado, con la fecha de Panamá. Definición única en
-- `src/lib/ventas/clientes-corte-comparativo.ts` (corte = último día cargado,
-- topado en HOY de Panamá; un año antes, 29-feb → 28-feb).
--
-- 🩸 QUÉ HACÍA MAL `_v2`: `CURRENT_DATE` y `fecha::date` son UTC. Panamá es
-- UTC−5 fijo, así que una factura después de las 7 p.m. cae en el día UTC
-- SIGUIENTE: el corte por empresa (`e_cur_max`) saltaba un día hasta la
-- mañana, y el año anterior sumaba un día entero de más contra unas horas del
-- actual. Medido contra producción: Fashion Wear la noche del 12-may-2026
-- (una factura nocturna de $11.972) comparaba 1–12 may + esa factura contra
-- 1–13 may 2025 en UTC → +1,3% en pantalla; los mismos días en Panamá dan
-- +45,1%. En 2026 hubo 30 pares empresa-noche así (joystep 10 · ACS 10 ·
-- vistana 5 · fashion_wear 4 · active_shoes 1). Y el lado ACTUAL de la
-- comparación (`ventas_dashboard_summary`, `switch_ventas_unificado_vw`) ya
-- agrupaba en Panamá: las dos puntas medían con relojes distintos.
--
-- QUÉ CAMBIA (y nada más):
--   · `CURRENT_DATE`          → `multifashion_hoy_panama()` (la fuente del «hoy»
--                               que ya usan Multifashion y Clientes).
--   · `fecha::date`           → `mf_panama_date(fecha)` (IMMUTABLE, la misma
--                               expresión de `_multifashion_sf_vw`).
--   · El corte por empresa se TOPA en hoy (`LEAST(MAX(d), hoy)`): una factura
--     con fecha futura no corre el corte.
--   · Una empresa SIN filas en el mes en curso ya no queda fuera del mes (antes
--     el JOIN la omitía y su año anterior sumaba 0 para ese mes): se corta en
--     el corte GLOBAL, como manda la definición única («sin dato cargado → el
--     corte del sistema»). Medido: active_wear, sep-2026 sin ventas, pasa de
--     comparar contra $0 a comparar contra los $503 de los mismos días de 2025.
--   · Los `EXTRACT(YEAR/MONTH)` redundantes con el BETWEEN del mes previo se
--     quitan (el BETWEEN ya acota ese mes); las ventanas sargables sobre
--     `fecha` se conservan tal cual.
--   · La rama ELSE (años cerrados, desde la MV) queda BYTE-IDÉNTICA.
--
-- RENAME (no CREATE OR REPLACE in-place): mismo motivo que `_v2` — PostgREST
-- cachea la resolución y el nombre nuevo fuerza una fresca. `_v2` queda intacta
-- (rollback trivial). El código llama `_v3` y cae a `_v2` mientras esta DDL no
-- corra (`rpcConFallbackDeVersion`), así que el deploy no exige orden.
--
-- Shape de salida IDÉNTICO: rows[] + es_periodo_parcial + fecha_corte +
-- dia_corte_anio_anterior.
--
-- Aplicar: `npm run migrar supabase/migrations/20260910120000_ventas_dashboard_prev_same_period_v3_panama.sql`
-- ⚠️ MIENTRAS NO SE CORRA, Resumen › Anual, Mes×año y Vista General siguen
-- cortando en UTC (el resto del arreglo —mismos días en vez de mes entero—
-- ya vale con `_v2`).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_dashboard_prev_same_period_v3(p_year int)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_hoy               date;
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
  -- 🩸 HOY es el de Panamá. Entre las 7 p.m. y la medianoche el reloj UTC ya
  -- está en mañana; con CURRENT_DATE el mes en curso podía ser el que viene.
  v_hoy          := multifashion_hoy_panama();
  v_cur_year_now := EXTRACT(YEAR FROM v_hoy)::int;
  v_prev_year    := p_year - 1;

  -- mes_actual = ultimo mes con data real del ano p_year (cur side). EN VIVO,
  -- misma fuente que el summary -> el recorte del prev calza con el mesActual del
  -- frontend. COALESCE 12: si p_year no tuviera data, no sobre-restringe.
  -- (`switch_ventas_unificado_vw` ya agrupa en hora de Panamá.)
  SELECT COALESCE(MAX(EXTRACT(MONTH FROM v.mes)::int), 12)
  INTO v_mes_actual
  FROM switch_ventas_unificado_vw v
  WHERE EXTRACT(YEAR FROM v.mes)::int = p_year;

  IF p_year = v_cur_year_now THEN
    v_cur_mes           := EXTRACT(MONTH FROM v_hoy)::int;
    v_cur_inicio        := date_trunc('month', v_hoy::timestamp)::date;
    v_cur_fin_full      := (v_cur_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
    v_prev_mes_inicio   := make_date(v_prev_year, v_cur_mes, 1);
    v_prev_mes_fin_full := (v_prev_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- fecha_corte global = último día CARGADO del mes en curso (día de Panamá),
    -- topado en hoy. Los límites van como timestamptz de Panamá para que la
    -- condición siga siendo sargable sobre `fecha`.
    SELECT LEAST(MAX(mf_panama_date(fecha)), v_hoy) INTO v_fecha_corte
    FROM switch_facturas
    WHERE fecha >= (v_cur_inicio::timestamp AT TIME ZONE 'America/Panama')
      AND fecha <  ((v_cur_fin_full + 1)::timestamp AT TIME ZONE 'America/Panama');

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
      -- pre-impuesto neto por empresa_key × DÍA DE PANAMÁ (switch >= 2025-05).
      -- ACOTADO a la ventana usada (superset sargable sobre `fecha`).
      SELECT
        empresa_key,
        mf_panama_date(fecha) AS d,
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
      -- El corte POR EMPRESA: su último día cargado del mes en curso, topado
      -- en hoy de Panamá. Una empresa sin filas no aparece acá y cae al corte
      -- global (COALESCE de abajo).
      SELECT empresa_key, LEAST(MAX(d), v_hoy) AS e_cur_max
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
      -- El mes en curso del año previo, recortado a los MISMOS DÍAS de esa
      -- empresa (o del sistema, si la empresa no cargó nada este mes).
      SELECT dv.empresa_key, v_cur_mes AS mes, SUM(dv.venta)::numeric AS venta
      FROM dia_ventas dv
      LEFT JOIN empresa_cuts ec ON ec.empresa_key = dv.empresa_key
      WHERE dv.d BETWEEN v_prev_mes_inicio
                     AND LEAST(v_prev_mes_inicio + (COALESCE(ec.e_cur_max, v_fecha_corte) - v_cur_inicio), v_prev_mes_fin_full)
      GROUP BY dv.empresa_key
    ),
    c_current AS (
      SELECT dc.empresa_key, v_cur_mes AS mes, SUM(dc.costo)::numeric AS costo
      FROM dia_costo dc
      LEFT JOIN empresa_cuts ec ON ec.empresa_key = dc.empresa_key
      WHERE dc.d BETWEEN v_prev_mes_inicio
                     AND LEAST(v_prev_mes_inicio + (COALESCE(ec.e_cur_max, v_fecha_corte) - v_cur_inicio), v_prev_mes_fin_full)
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

GRANT EXECUTE ON FUNCTION ventas_dashboard_prev_same_period_v3(int) TO service_role;

NOTIFY pgrst, 'reload schema';
