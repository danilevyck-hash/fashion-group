-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_bonos_v1 → v2
--
-- FIX de fuente de datos. v1 leía de `ventas_raw` (subida MANUAL por CSV, que
-- venía congelada al 23-may) mientras que el Overview de Multifashion lee de
-- `switch_facturas` (sync automático por cron, fresco al 3-jun) vía la vista
-- `_multifashion_sf_vw`. Resultado: el bono mostraba mayo 2026 = $24,803
-- (incompleto) vs Overview $42,446. Dos fuentes contando el mismo mes distinto.
--
-- v2 lee de la MISMA fuente que Overview y usa el MISMO blend año-anterior:
--   • Año actual (retail):  _multifashion_sf_vw, is_wholesale=false, mes completo.
--                           Idéntico a multifashion_mensual_v6 retail.meses[].ventas.
--   • Año anterior (blend): switch (fecha >= 2025-05-01) ∪ ventas_raw (< 2025-05-01),
--                           is_wholesale=false. Idéntico a ventas_prev_full de v6.
--   • fecha_max sync-aware ahora viene de la vista (3-jun), no de ventas_raw, así
--     que mayo 2026 SÍ está completo y se vuelve elegible.
--
-- Reglas de bono SIN cambio:
--   GERENTE: total tienda retail del mes cerrado vs mismo mes año anterior.
--            >= 10% → $100 · >= 5% y < 10% → $50 · resto → $0.
--   VENDEDORAS: $50 a la de mayor venta del mes (empate exacto → todas), excluye
--            a la gerente. Gerente identificada por app_settings['multifashion_managers'].
--
-- "Mes cerrado elegible": último día del mes < hoy Y <= MAX(fecha) de la fuente
-- fresca → nunca compara un mes parcial/incompleto contra uno completo.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS multifashion_bonos_v1(int, int);

CREATE OR REPLACE FUNCTION multifashion_bonos_v2(
  p_year int,
  p_mes  int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_managers  jsonb;
  v_fecha_max date;
  v_blend_cut date := DATE '2025-05-01';  -- switch arranca acá; antes va ventas_raw

  v_ult_mes_fin date;
  v_ult_year    int;
  v_ult_mes     int;

  v_year        int := p_year;
  v_mes         int;
  v_mes_inicio  date;
  v_mes_fin     date;
  v_prev_inicio date;
  v_prev_fin    date;
  v_elegible    boolean;

  v_ventas_tienda      numeric;
  v_ventas_tienda_prev numeric;
  v_tiene_comp_ger     boolean;
  v_delta_ger          numeric;
  v_bono_ger           int;
  v_gerente_nombre     text;

  v_vendedoras jsonb;
BEGIN
  v_managers := COALESCE(get_app_setting('multifashion_managers'), '[]'::jsonb);

  -- Fecha máxima sincronizada — MISMA fuente que Overview (switch_facturas).
  SELECT MAX(fecha) INTO v_fecha_max
  FROM _multifashion_sf_vw
  WHERE is_wholesale = false;

  IF v_fecha_max IS NULL THEN
    RETURN jsonb_build_object('sin_data', true);
  END IF;

  -- Último mes elegible (sync-aware): mayor mes cuyo último día <= MAX(fecha) y < hoy.
  v_ult_mes_fin := (date_trunc('month', v_fecha_max) + INTERVAL '1 month' - INTERVAL '1 day')::date;
  IF v_ult_mes_fin > v_fecha_max OR v_ult_mes_fin >= CURRENT_DATE THEN
    v_ult_mes_fin := (date_trunc('month', v_fecha_max) - INTERVAL '1 day')::date;
  END IF;
  v_ult_year := EXTRACT(YEAR  FROM v_ult_mes_fin)::int;
  v_ult_mes  := EXTRACT(MONTH FROM v_ult_mes_fin)::int;

  -- Mes a evaluar: el pedido, o el default por año si no se pasó.
  IF p_mes IS NULL THEN
    IF    v_year = v_ult_year THEN v_mes := v_ult_mes;  -- año en curso → último elegible
    ELSIF v_year < v_ult_year THEN v_mes := 12;          -- año cerrado  → diciembre
    ELSE  v_mes := 1;                                    -- año futuro   → enero (no elegible)
    END IF;
  ELSE
    IF p_mes < 1 OR p_mes > 12 THEN
      RAISE EXCEPTION 'p_mes inválido (1..12): %', p_mes;
    END IF;
    v_mes := p_mes;
  END IF;

  v_mes_inicio  := make_date(v_year,     v_mes, 1);
  v_mes_fin     := (v_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_prev_inicio := make_date(v_year - 1, v_mes, 1);
  v_prev_fin    := (v_prev_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

  v_elegible := (v_mes_fin < CURRENT_DATE) AND (v_mes_fin <= v_fecha_max);

  -- ── BONO GERENTE: total tienda retail (is_wholesale=false), mes completo ─────
  -- Año actual desde la vista. = Overview retail.meses[].ventas.
  SELECT COALESCE(SUM(subtotal), 0) INTO v_ventas_tienda
  FROM _multifashion_sf_vw
  WHERE is_wholesale = false
    AND fecha BETWEEN v_mes_inicio AND v_mes_fin;

  -- Año anterior con el MISMO blend que Overview (ventas_prev_full de v6).
  v_ventas_tienda_prev :=
      COALESCE((SELECT SUM(subtotal) FROM _multifashion_sf_vw
                WHERE is_wholesale = false
                  AND fecha BETWEEN v_prev_inicio AND v_prev_fin
                  AND fecha >= v_blend_cut), 0)
    + COALESCE((SELECT SUM(subtotal) FROM ventas_raw
                WHERE empresa = 'american_classic' AND is_wholesale = false
                  AND fecha BETWEEN v_prev_inicio AND v_prev_fin
                  AND fecha <  v_blend_cut), 0);

  v_tiene_comp_ger := (v_ventas_tienda_prev > 0);
  v_delta_ger := CASE WHEN v_tiene_comp_ger
                      THEN (v_ventas_tienda - v_ventas_tienda_prev) / v_ventas_tienda_prev
                      ELSE NULL END;

  v_bono_ger := 0;
  IF v_elegible AND v_tiene_comp_ger THEN
    IF    v_delta_ger >= 0.10 THEN v_bono_ger := 100;
    ELSIF v_delta_ger >= 0.05 THEN v_bono_ger := 50;
    END IF;
  END IF;

  v_gerente_nombre := NULLIF(v_managers->>0, '');

  -- ── RANKING VENDEDORAS (retail, YoY con blend) + badge bono $50 ──────────────
  WITH actual AS (
    SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor,
           SUM(subtotal) AS ventas,
           COUNT(DISTINCT n_sistema) AS tickets
    FROM _multifashion_sf_vw
    WHERE is_wholesale = false
      AND fecha BETWEEN v_mes_inicio AND v_mes_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  ),
  prev AS (
    SELECT vendedor, SUM(ventas) AS ventas FROM (
      SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor, subtotal AS ventas
      FROM _multifashion_sf_vw
      WHERE is_wholesale = false
        AND fecha BETWEEN v_prev_inicio AND v_prev_fin AND fecha >= v_blend_cut
        AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
      UNION ALL
      SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor, subtotal AS ventas
      FROM ventas_raw
      WHERE empresa = 'american_classic' AND is_wholesale = false
        AND fecha BETWEEN v_prev_inicio AND v_prev_fin AND fecha < v_blend_cut
        AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    ) u
    GROUP BY vendedor
  ),
  joined AS (
    SELECT a.vendedor, a.ventas, a.tickets, p.ventas AS prev_ventas,
           (v_managers ? a.vendedor) AS is_mgr
    FROM actual a
    LEFT JOIN prev p ON p.vendedor = a.vendedor
  ),
  maxnm AS (
    SELECT MAX(ventas) AS m FROM joined WHERE NOT is_mgr
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre',            j.vendedor,
      'tickets',           j.tickets,
      'ventas',            j.ventas,
      'ticket_promedio',   CASE WHEN j.tickets > 0 THEN j.ventas / j.tickets ELSE 0 END,
      'manager',           j.is_mgr,
      'delta_ventas_pct',  CASE
                             WHEN COALESCE(j.prev_ventas, 0) > 0
                               THEN (j.ventas - j.prev_ventas) / j.prev_ventas
                             ELSE NULL
                           END,
      'tiene_comparacion', COALESCE(j.prev_ventas, 0) > 0,
      'bono_vendedora',    v_elegible
                             AND NOT j.is_mgr
                             AND mx.m IS NOT NULL
                             AND j.ventas = mx.m
    )
    ORDER BY j.ventas DESC
  )
  INTO v_vendedoras
  FROM joined j CROSS JOIN maxnm mx;

  RETURN jsonb_build_object(
    'mes_evaluado',        jsonb_build_object('year', v_year, 'mes', v_mes),
    'es_elegible',         v_elegible,
    'fecha_max_data',      to_char(v_fecha_max, 'YYYY-MM-DD'),
    'ultimo_mes_elegible', jsonb_build_object('year', v_ult_year, 'mes', v_ult_mes),
    'gerente', jsonb_build_object(
      'nombre',            v_gerente_nombre,
      'ventas_mes',        v_ventas_tienda,
      'ventas_mes_prev',   v_ventas_tienda_prev,
      'delta_pct',         v_delta_ger,
      'tiene_comparacion', v_tiene_comp_ger,
      'bono',              v_bono_ger
    ),
    'vendedoras', COALESCE(v_vendedoras, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_bonos_v2(int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
