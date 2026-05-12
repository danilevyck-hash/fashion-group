-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ventas_dashboard_prev_same_period(p_year int)
--
-- Mismo patrón same-period que ya aplicamos a:
--   - multifashion_mensual_v2     (Overview retail)
--   - multifashion_vendedoras_v3  (Ranking vendedoras)
--   - clientes_empresa_12m_vw     (mes-granular, fix de mayo 2026)
--
-- Problema: el tab Resumen del módulo Ventas comparaba mes/Q parcial del
-- año en curso contra mes/Q completo del año anterior, generando deltas
-- falsos (-74% en Multifashion Mayo siendo realmente +5%).
--
-- Diseño: una RPC paralela a `ventas_dashboard_summary` que devuelve la
-- data del año anterior (p_year - 1) con el mismo shape per-empresa-per-mes
-- pero con dos ajustes basados en CURRENT_DATE:
--
--   1. Para el mes que está en curso en p_year (CURRENT_DATE adentro):
--      el rango de prev se recorta day-by-day PER EMPRESA. Para empresa E,
--      el cutoff prev = inicio_mes_prev + (MAX(fecha) de E en cur month
--      - inicio_mes_cur). Esto matchea exactamente la semántica de
--      multifashion_mensual_v2 (cutoff data-based per empresa) y mantiene
--      la comparación apples-to-apples a nivel de cada celda del heatmap.
--
--   2. Para los meses POSTERIORES al mes en curso: se excluyen del
--      response (rows ausentes) para que la suma de un trimestre que
--      contiene el mes en curso quede apples-to-apples cuando el
--      frontend agrega.
--
-- Decisión "mes en curso" por CALENDARIO (CURRENT_DATE adentro del mes),
-- NO por data — evita falsos positivos por uploads atrasados. Pero el
-- CUTOFF dentro de ese mes es data-based (MAX(fecha) per empresa) para
-- no inventar comparativos a fechas que no tienen data cargada todavía.
--
-- Si p_year != año calendario actual (consulta de año pasado/futuro),
-- la función NO aplica recorte: devuelve full-mes-vs-full-mes como la
-- original `ventas_dashboard_summary` para p_year - 1.
--
-- Empresas sin data en el mes en curso del año actual: no se emite su
-- fila prev para ese mes (la celda del heatmap queda "—" en el frontend),
-- evitando comparativos engañosos cuando no hay base para comparar.
--
-- Header global de la respuesta:
--   - fecha_corte             = MAX(fecha) GLOBAL en cur month (cualquier empresa)
--   - es_periodo_parcial      = CURRENT_DATE adentro del mes Y hay data
--   - dia_corte_anio_anterior = inicio_prev + (fecha_corte - inicio_cur),
--                                clampado al fin del mes prev (leap year)
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_dashboard_prev_same_period(p_year int)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_cur_year_now    int;
  v_prev_year       int;
  v_es_parcial      boolean;
  v_cur_mes         int;
  v_cur_inicio      date;
  v_cur_fin_full    date;
  v_prev_mes_inicio date;
  v_prev_mes_fin_full date;
  v_fecha_corte     date;
  v_dia_corte_prev  date;
  v_rows_json       jsonb;
BEGIN
  v_cur_year_now := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_prev_year    := p_year - 1;

  -- ── Detectar si p_year coincide con el calendario actual ───────────────────
  IF p_year = v_cur_year_now THEN
    v_cur_mes           := EXTRACT(MONTH FROM CURRENT_DATE)::int;
    v_cur_inicio        := date_trunc('month', CURRENT_DATE)::date;
    v_cur_fin_full      := (v_cur_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
    v_prev_mes_inicio   := make_date(v_prev_year, v_cur_mes, 1);
    v_prev_mes_fin_full := (v_prev_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- fecha_corte global = MAX(fecha) en cur month, cualquier empresa
    SELECT MAX(fecha) INTO v_fecha_corte
    FROM ventas_raw
    WHERE anio = p_year AND mes = v_cur_mes;

    -- es_periodo_parcial: calendario adentro del mes + hay data
    v_es_parcial := (v_fecha_corte IS NOT NULL);

    IF v_es_parcial THEN
      v_dia_corte_prev := LEAST(
        v_prev_mes_inicio + (v_fecha_corte - v_cur_inicio),
        v_prev_mes_fin_full
      );
    END IF;
  ELSE
    -- p_year != año calendario actual → no aplica recorte
    v_es_parcial      := false;
    v_cur_mes         := NULL;
    v_fecha_corte     := NULL;
    v_dia_corte_prev  := NULL;
  END IF;

  -- ── Agregación per-empresa-per-mes ─────────────────────────────────────────
  -- Caso 1: año cerrado (NOT v_es_parcial)
  --   → todas las filas full-mes, sin filtros de fecha.
  -- Caso 2: año en curso (v_es_parcial)
  --   → meses < v_cur_mes: full-mes para todas las empresas con data.
  --   → mes = v_cur_mes:   por cada empresa con MAX(fecha) en cur month,
  --                        usar su propio cutoff prev = inicio + offset
  --                        clampado al fin del mes prev.
  --   → meses > v_cur_mes: filas no emitidas.
  IF v_es_parcial THEN
    WITH empresa_cuts AS (
      SELECT
        empresa,
        MAX(fecha) AS e_cur_max
      FROM ventas_raw
      WHERE anio = p_year AND mes = v_cur_mes
      GROUP BY empresa
    ),
    prev_closed AS (
      -- Meses cerrados: full sum por (empresa, mes)
      SELECT
        empresa,
        mes,
        SUM(subtotal)::numeric  AS total_subtotal,
        SUM(costo)::numeric     AS total_costo,
        SUM(utilidad)::numeric  AS total_utilidad,
        SUM(total)::numeric     AS total_facturado,
        COUNT(*)::bigint        AS filas
      FROM ventas_raw
      WHERE anio = v_prev_year AND mes < v_cur_mes
      GROUP BY empresa, mes
    ),
    prev_current AS (
      -- Mes en curso: cutoff per-empresa derivado de MAX(fecha) de esa
      -- empresa en cur year cur month. Si la empresa no tiene data en
      -- cur month, no aparece en empresa_cuts y por lo tanto no se emite
      -- su fila prev (la celda del heatmap queda "—").
      SELECT
        vr.empresa,
        vr.mes,
        SUM(vr.subtotal)::numeric  AS total_subtotal,
        SUM(vr.costo)::numeric     AS total_costo,
        SUM(vr.utilidad)::numeric  AS total_utilidad,
        SUM(vr.total)::numeric     AS total_facturado,
        COUNT(*)::bigint           AS filas
      FROM ventas_raw vr
      JOIN empresa_cuts ec ON ec.empresa = vr.empresa
      WHERE vr.anio = v_prev_year
        AND vr.mes = v_cur_mes
        AND vr.fecha BETWEEN v_prev_mes_inicio
                         AND LEAST(
                               v_prev_mes_inicio + (ec.e_cur_max - v_cur_inicio),
                               v_prev_mes_fin_full
                             )
      GROUP BY vr.empresa, vr.mes
    ),
    all_prev AS (
      SELECT * FROM prev_closed
      UNION ALL
      SELECT * FROM prev_current
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'empresa',         empresa,
          'mes',             mes,
          'total_subtotal',  total_subtotal,
          'total_costo',     total_costo,
          'total_utilidad',  total_utilidad,
          'total_facturado', total_facturado,
          'filas',           filas
        )
        ORDER BY empresa, mes
      ),
      '[]'::jsonb
    )
    INTO v_rows_json
    FROM all_prev;

  ELSE
    -- Año cerrado → comportamiento original
    WITH prev_rows AS (
      SELECT
        empresa,
        mes,
        SUM(subtotal)::numeric  AS total_subtotal,
        SUM(costo)::numeric     AS total_costo,
        SUM(utilidad)::numeric  AS total_utilidad,
        SUM(total)::numeric     AS total_facturado,
        COUNT(*)::bigint        AS filas
      FROM ventas_raw
      WHERE anio = v_prev_year
      GROUP BY empresa, mes
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'empresa',         empresa,
          'mes',             mes,
          'total_subtotal',  total_subtotal,
          'total_costo',     total_costo,
          'total_utilidad',  total_utilidad,
          'total_facturado', total_facturado,
          'filas',           filas
        )
        ORDER BY empresa, mes
      ),
      '[]'::jsonb
    )
    INTO v_rows_json
    FROM prev_rows;
  END IF;

  -- ── Build response con header global ───────────────────────────────────────
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
