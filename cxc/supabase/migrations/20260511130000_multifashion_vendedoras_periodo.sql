-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: RPC multifashion_vendedoras — ranking de vendedoras flexible
--
-- Sirve al sub-tab Vendedoras del módulo /ventas → tab Multifashion.
-- Permite tres ventanas de tiempo (mes / trimestre / ytd) sin tener que
-- pre-agregar nada en la app. La RPC multifashion_mensual existente queda
-- intacta — esta es paralela.
--
-- Reglas:
--   - empresa = 'american_classic'
--   - excluye vendedor NULL, vacío o 'DEFAULT' (no es persona)
--   - normaliza vendedor con REGEXP_REPLACE(TRIM(...), '\s+', ' ', 'g')
--     para colapsar dobles espacios del CSV de Switch Soft antes de
--     agrupar y comparar contra app_settings.multifashion_managers
--   - manager = true cuando el nombre normalizado está en la lista
--     app_settings.multifashion_managers
--   - top = true para el vendedor con mayor SUM(subtotal) del período actual
--   - delta_*_pct = ratio (decimal); NULL cuando no hubo actividad en el
--     mismo período del año anterior (vendedora nueva o primer año)
--   - solo vendedoras con actividad en el período actual (no listamos
--     vendedoras que existieron antes pero no ahora)
--
-- Períodos:
--   p_periodo='mes'       → usa p_mes (1..12), ignora p_trimestre
--   p_periodo='trimestre' → usa p_trimestre (1..4), ignora p_mes
--   p_periodo='ytd'       → ignora ambos; toma Ene..max(mes) con data en
--                           el año actual para que la comparación contra
--                           el año previo sea simétrica (apples-to-apples)
--
-- Idempotente: CREATE OR REPLACE.
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION multifashion_vendedoras(
  p_year      int,
  p_periodo   text,
  p_mes       int DEFAULT NULL,
  p_trimestre int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_managers      jsonb;
  v_mes_max       int;
  v_meses_actual  int[];
  v_meses_prev    int[];
  v_top_vendedor  text;
  v_vendedoras    jsonb;
  v_ventas_total       numeric;
  v_tickets_total      bigint;
  v_ventas_total_prev  numeric;
  v_tickets_total_prev bigint;
BEGIN
  v_managers := COALESCE(get_app_setting('multifashion_managers'), '[]'::jsonb);

  -- ── Resolver rango de meses según período ────────────────────────────────
  IF p_periodo = 'mes' THEN
    IF p_mes IS NULL OR p_mes < 1 OR p_mes > 12 THEN
      RAISE EXCEPTION 'p_mes requerido (1..12) cuando periodo=mes';
    END IF;
    v_meses_actual := ARRAY[p_mes];
    v_meses_prev   := ARRAY[p_mes];

  ELSIF p_periodo = 'trimestre' THEN
    IF p_trimestre IS NULL OR p_trimestre < 1 OR p_trimestre > 4 THEN
      RAISE EXCEPTION 'p_trimestre requerido (1..4) cuando periodo=trimestre';
    END IF;
    v_meses_actual := ARRAY[
      (p_trimestre - 1) * 3 + 1,
      (p_trimestre - 1) * 3 + 2,
      (p_trimestre - 1) * 3 + 3
    ];
    v_meses_prev := v_meses_actual;

  ELSIF p_periodo = 'ytd' THEN
    SELECT COALESCE(MAX(mes), 0) INTO v_mes_max
    FROM ventas_raw
    WHERE empresa = 'american_classic' AND anio = p_year;
    IF v_mes_max = 0 THEN
      RETURN jsonb_build_object(
        'vendedoras',                '[]'::jsonb,
        'total_vendedoras_periodo',  0,
        'ventas_total',              0,
        'tickets_total',             0,
        'ventas_total_prev',         0,
        'tickets_total_prev',        0
      );
    END IF;
    v_meses_actual := ARRAY(SELECT generate_series(1, v_mes_max));
    v_meses_prev   := v_meses_actual;

  ELSE
    RAISE EXCEPTION 'p_periodo inválido: % (esperado mes|trimestre|ytd)', p_periodo;
  END IF;

  -- ── TOP vendedor del período actual (primero, para flag por fila) ────────
  SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') INTO v_top_vendedor
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND anio = p_year
    AND mes = ANY(v_meses_actual)
    AND vendedor IS NOT NULL
    AND TRIM(vendedor) <> ''
    AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
  GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  ORDER BY SUM(subtotal) DESC
  LIMIT 1;

  -- ── Ranking de vendedoras + delta vs mismo período año anterior ──────────
  WITH actual AS (
    SELECT
      REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor,
      SUM(subtotal) AS ventas,
      COUNT(DISTINCT n_sistema) AS tickets
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND anio = p_year
      AND mes = ANY(v_meses_actual)
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
      AND anio = p_year - 1
      AND mes = ANY(v_meses_prev)
      AND vendedor IS NOT NULL
      AND TRIM(vendedor) <> ''
      AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre',            a.vendedor,
      'tickets',           a.tickets,
      'ventas',            a.ventas,
      'ticket_promedio',   CASE WHEN a.tickets > 0 THEN a.ventas / a.tickets ELSE 0 END,
      'comision',          a.ventas * 0.005,
      'manager',           v_managers ? a.vendedor,
      'top',               (a.vendedor = v_top_vendedor),
      'delta_ventas_pct',  CASE
                             WHEN COALESCE(p.ventas, 0) > 0
                               THEN (a.ventas - p.ventas) / p.ventas
                             ELSE NULL
                           END,
      'delta_tickets_pct', CASE
                             WHEN COALESCE(p.tickets, 0) > 0
                               THEN (a.tickets - p.tickets)::numeric / p.tickets
                             ELSE NULL
                           END
    )
    ORDER BY a.ventas DESC
  )
  INTO v_vendedoras
  FROM actual a
  LEFT JOIN prev p ON p.vendedor = a.vendedor;

  -- ── Totales del período actual (para el subtitle) ────────────────────────
  SELECT
    COALESCE(SUM(subtotal), 0),
    COUNT(DISTINCT n_sistema)
  INTO v_ventas_total, v_tickets_total
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND anio = p_year
    AND mes = ANY(v_meses_actual)
    AND vendedor IS NOT NULL
    AND TRIM(vendedor) <> ''
    AND UPPER(TRIM(vendedor)) <> 'DEFAULT';

  -- ── Totales del período anterior (para delta total del subtitle) ─────────
  SELECT
    COALESCE(SUM(subtotal), 0),
    COUNT(DISTINCT n_sistema)
  INTO v_ventas_total_prev, v_tickets_total_prev
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND anio = p_year - 1
    AND mes = ANY(v_meses_prev)
    AND vendedor IS NOT NULL
    AND TRIM(vendedor) <> ''
    AND UPPER(TRIM(vendedor)) <> 'DEFAULT';

  RETURN jsonb_build_object(
    'vendedoras',                COALESCE(v_vendedoras, '[]'::jsonb),
    'total_vendedoras_periodo',  jsonb_array_length(COALESCE(v_vendedoras, '[]'::jsonb)),
    'ventas_total',              v_ventas_total,
    'tickets_total',             v_tickets_total,
    'ventas_total_prev',         v_ventas_total_prev,
    'tickets_total_prev',        v_tickets_total_prev
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_vendedoras(int, text, int, int) TO service_role;
