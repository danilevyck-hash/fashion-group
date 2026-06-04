-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_bonos_v1
--
-- Feature: Bonos Multifashion (módulo Multifashion → subtab Vendedoras).
--
-- Dos bonos, ambos sobre ventas_raw (empresa='american_classic'):
--
--   1. BONO GERENTE — ventas TOTALES de la tienda del MES CERRADO vs el mismo
--      mes del AÑO ANTERIOR (año contra año, dinámico). "Total tienda" = SUM
--      de subtotal de TODAS las filas del mes (incluye ventas sin vendedor /
--      DEFAULT), porque es la venta real de la tienda que gerencia.
--        crecimiento >= 10%        → bono 100
--        crecimiento >= 5% y < 10% → bono  50
--        resto                     → bono   0
--
--   2. BONO VENDEDORAS — 50 a la de MAYOR venta del mes (excluye a la gerente).
--      Empate exacto en ventas → todas las empatadas lo reciben.
--
-- "Mes cerrado elegible" (sync-aware): un mes solo es evaluable si su último
-- día ya pasó (< CURRENT_DATE) Y la data está sincronizada hasta el cierre del
-- mes (último día <= MAX(fecha) en ventas_raw). Esto evita comparar un mes
-- parcial/incompleto contra un mes completo del año anterior. El mes en curso
-- nunca genera bono.
--
-- ⚠️ OJO: NO confundir con multifashion_vendedoras_v3, que para periodo='mes'
-- compara contra el MES ANTERIOR (MoM). Este RPC es año-contra-año (YoY) y es
-- independiente; v3 sigue alimentando el ranking MoM del subtab.
--
-- La gerente se identifica con app_settings['multifashion_managers'] (array
-- JSONB de nombres normalizados), el mismo flag que ya usa v3. No se hardcodea.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION multifashion_bonos_v1(
  p_year int,
  p_mes  int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_managers   jsonb;
  v_fecha_max  date;

  -- último mes elegible (global, sync-aware) — referencia para el default
  v_ult_mes_fin date;
  v_ult_year    int;
  v_ult_mes     int;

  -- mes evaluado
  v_year        int := p_year;
  v_mes         int;
  v_mes_inicio  date;
  v_mes_fin     date;
  v_prev_inicio date;
  v_prev_fin    date;
  v_elegible    boolean;

  -- bono gerente (total tienda, YoY)
  v_ventas_tienda      numeric;
  v_ventas_tienda_prev numeric;
  v_tiene_comp_ger     boolean;
  v_delta_ger          numeric;
  v_bono_ger           int;
  v_gerente_nombre     text;

  -- ranking vendedoras
  v_vendedoras jsonb;
BEGIN
  v_managers := COALESCE(get_app_setting('multifashion_managers'), '[]'::jsonb);

  -- Fecha máxima sincronizada de Multifashion (retail mostrador).
  SELECT MAX(fecha) INTO v_fecha_max
  FROM ventas_raw
  WHERE empresa = 'american_classic';

  IF v_fecha_max IS NULL THEN
    RETURN jsonb_build_object('sin_data', true);
  END IF;

  -- Último mes ELEGIBLE = mayor mes cuyo último día <= MAX(fecha) Y < hoy.
  -- Si el mes de v_fecha_max no está completo, retrocede al mes anterior.
  v_ult_mes_fin := (date_trunc('month', v_fecha_max) + INTERVAL '1 month' - INTERVAL '1 day')::date;
  IF v_ult_mes_fin > v_fecha_max OR v_ult_mes_fin >= CURRENT_DATE THEN
    v_ult_mes_fin := (date_trunc('month', v_fecha_max) - INTERVAL '1 day')::date;
  END IF;
  v_ult_year := EXTRACT(YEAR  FROM v_ult_mes_fin)::int;
  v_ult_mes  := EXTRACT(MONTH FROM v_ult_mes_fin)::int;

  -- Mes a evaluar: el pedido, o el default por año si no se pasó.
  IF p_mes IS NULL THEN
    IF v_year = v_ult_year THEN
      v_mes := v_ult_mes;                 -- año en curso → último mes elegible
    ELSIF v_year < v_ult_year THEN
      v_mes := 12;                        -- año ya cerrado → diciembre
    ELSE
      v_mes := 1;                         -- año futuro → enero (no elegible)
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

  -- Elegible: mes ya cerró en calendario Y la data cubre todo el mes.
  v_elegible := (v_mes_fin < CURRENT_DATE) AND (v_mes_fin <= v_fecha_max);

  -- ── BONO GERENTE: ventas TOTALES de la tienda (incluye sin vendedor/DEFAULT)
  SELECT COALESCE(SUM(subtotal), 0) INTO v_ventas_tienda
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND fecha BETWEEN v_mes_inicio AND v_mes_fin;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_ventas_tienda_prev
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND fecha BETWEEN v_prev_inicio AND v_prev_fin;

  v_tiene_comp_ger := (v_ventas_tienda_prev > 0);
  v_delta_ger := CASE WHEN v_tiene_comp_ger
                      THEN (v_ventas_tienda - v_ventas_tienda_prev) / v_ventas_tienda_prev
                      ELSE NULL END;

  v_bono_ger := 0;
  IF v_elegible AND v_tiene_comp_ger THEN
    IF    v_delta_ger >= 0.10 THEN v_bono_ger := 100;
    ELSIF v_delta_ger >= 0.05 THEN v_bono_ger := 50;
    ELSE  v_bono_ger := 0;
    END IF;
  END IF;

  -- Nombre de la gerente: primer manager configurado (recibe el bono de tienda).
  v_gerente_nombre := NULLIF(v_managers->>0, '');

  -- ── RANKING VENDEDORAS (YoY) + badge bono $50 ───────────────────────────────
  -- bono_vendedora: solo si el mes es elegible, no es la gerente, y empata con
  -- la venta máxima de NO-gerentes (empate exacto → todas reciben).
  WITH actual AS (
    SELECT
      REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor,
      SUM(subtotal) AS ventas,
      COUNT(DISTINCT n_sistema) AS tickets
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND fecha BETWEEN v_mes_inicio AND v_mes_fin
      AND vendedor IS NOT NULL
      AND TRIM(vendedor) <> ''
      AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  ),
  prev AS (
    SELECT
      REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor,
      SUM(subtotal) AS ventas,
      COUNT(DISTINCT n_sistema) AS tickets
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND fecha BETWEEN v_prev_inicio AND v_prev_fin
      AND vendedor IS NOT NULL
      AND TRIM(vendedor) <> ''
      AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  ),
  joined AS (
    SELECT
      a.vendedor,
      a.ventas,
      a.tickets,
      p.ventas AS prev_ventas,
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

GRANT EXECUTE ON FUNCTION multifashion_bonos_v1(int, int) TO service_role;

NOTIFY pgrst, 'reload schema';
