-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_vendedoras → comparativo same-period day-by-day
--
-- La versión previa (20260511130000) comparaba el período actual contra
-- el período completo del año anterior. Eso sobreestima la caída cuando
-- el período en curso aún no termina: "Mayo 1–11 2026" vs "Mayo completo
-- 2025" arroja un delta negativo artificial.
--
-- Fix: cuando el período seleccionado está en curso (la fecha de hoy
-- cae dentro del rango calendario del período), cortamos el período del
-- año anterior al MISMO offset de días desde el inicio del período. Así
-- la comparación queda apples-to-apples (Mayo 1–11 2026 vs Mayo 1–11 2025).
--
-- Para períodos cerrados (mes/trim/year completo en el pasado), el corte
-- llega al fin natural del período → comparativo full-vs-full como antes.
--
-- Devuelve además metadata para que el frontend muestre disclaimer:
--   - fecha_corte (date)              : MAX(fecha) con data del período actual
--   - es_periodo_parcial (boolean)    : true si CURRENT_DATE está dentro
--                                       del rango calendario del período
--   - dia_corte_anio_anterior (date)  : corte aplicado al período del año
--                                       anterior (mismo offset en días)
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
  v_managers       jsonb;

  -- Rango calendario completo del período
  v_actual_inicio   date;
  v_actual_fin_full date;
  v_prev_inicio     date;
  v_prev_fin_full   date;

  -- Corte real aplicado (fin de los rangos para la query)
  v_actual_fin      date;
  v_prev_fin        date;
  v_dia_offset      int;

  v_es_parcial      boolean;
  v_top_vendedor    text;
  v_vendedoras      jsonb;

  v_ventas_total       numeric;
  v_tickets_total      bigint;
  v_ventas_total_prev  numeric;
  v_tickets_total_prev bigint;
BEGIN
  v_managers := COALESCE(get_app_setting('multifashion_managers'), '[]'::jsonb);

  -- ── 1. Resolver el rango calendario del período según p_periodo ──────────
  IF p_periodo = 'mes' THEN
    IF p_mes IS NULL OR p_mes < 1 OR p_mes > 12 THEN
      RAISE EXCEPTION 'p_mes requerido (1..12) cuando periodo=mes';
    END IF;
    v_actual_inicio   := make_date(p_year,     p_mes, 1);
    v_actual_fin_full := (v_actual_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
    v_prev_inicio     := make_date(p_year - 1, p_mes, 1);
    v_prev_fin_full   := (v_prev_inicio   + INTERVAL '1 month' - INTERVAL '1 day')::date;

  ELSIF p_periodo = 'trimestre' THEN
    IF p_trimestre IS NULL OR p_trimestre < 1 OR p_trimestre > 4 THEN
      RAISE EXCEPTION 'p_trimestre requerido (1..4) cuando periodo=trimestre';
    END IF;
    v_actual_inicio   := make_date(p_year,     (p_trimestre - 1) * 3 + 1, 1);
    v_actual_fin_full := (v_actual_inicio + INTERVAL '3 months' - INTERVAL '1 day')::date;
    v_prev_inicio     := make_date(p_year - 1, (p_trimestre - 1) * 3 + 1, 1);
    v_prev_fin_full   := (v_prev_inicio   + INTERVAL '3 months' - INTERVAL '1 day')::date;

  ELSIF p_periodo = 'ytd' THEN
    v_actual_inicio   := make_date(p_year,     1, 1);
    v_actual_fin_full := make_date(p_year,     12, 31);
    v_prev_inicio     := make_date(p_year - 1, 1, 1);
    v_prev_fin_full   := make_date(p_year - 1, 12, 31);

  ELSE
    RAISE EXCEPTION 'p_periodo inválido: % (esperado mes|trimestre|ytd)', p_periodo;
  END IF;

  -- ── 2. fecha_corte = MAX(fecha) con data del período actual ──────────────
  SELECT MAX(fecha) INTO v_actual_fin
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND fecha BETWEEN v_actual_inicio AND v_actual_fin_full;

  -- ── 3. ¿El período está en curso? (calendario, no data) ──────────────────
  v_es_parcial := (CURRENT_DATE BETWEEN v_actual_inicio AND v_actual_fin_full);

  -- ── 4. Corner case: sin data en el período actual ────────────────────────
  --     dia_max sería NULL → división por cero más abajo. Salimos early.
  --     fecha_corte = NULL, dia_corte_anio_anterior = NULL para que el
  --     frontend muestre el disclaimer apropiado o estado vacío.
  IF v_actual_fin IS NULL THEN
    RETURN jsonb_build_object(
      'vendedoras',                '[]'::jsonb,
      'total_vendedoras_periodo',  0,
      'ventas_total',              0,
      'tickets_total',             0,
      'ventas_total_prev',         0,
      'tickets_total_prev',        0,
      'fecha_corte',               NULL,
      'es_periodo_parcial',        v_es_parcial,
      'dia_corte_anio_anterior',   NULL
    );
  END IF;

  -- ── 5. Aplicar mismo offset de días al período del año anterior ──────────
  --     Si el período en el año actual está cerrado (no parcial), el corte
  --     debe ser el fin del período completo prev (full-vs-full).
  --     Si el período está parcial, el corte prev es inicio_prev + offset,
  --     clampado al fin natural del período prev (cubre el corner case
  --     leap year: Feb 29 → clampea a Feb 28 del prev no-leap).
  IF v_es_parcial THEN
    v_dia_offset := v_actual_fin - v_actual_inicio;
    v_prev_fin   := LEAST(v_prev_inicio + v_dia_offset, v_prev_fin_full);
  ELSE
    v_actual_fin := v_actual_fin_full;
    v_prev_fin   := v_prev_fin_full;
  END IF;

  -- ── 6. TOP vendedor del período actual ───────────────────────────────────
  SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') INTO v_top_vendedor
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND fecha BETWEEN v_actual_inicio AND v_actual_fin
    AND vendedor IS NOT NULL
    AND TRIM(vendedor) <> ''
    AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
  GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  ORDER BY SUM(subtotal) DESC
  LIMIT 1;

  -- ── 7. Ranking + delta same-period ───────────────────────────────────────
  WITH actual AS (
    SELECT
      REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor,
      SUM(subtotal) AS ventas,
      COUNT(DISTINCT n_sistema) AS tickets
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND fecha BETWEEN v_actual_inicio AND v_actual_fin
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

  -- ── 8. Totales del período actual (para subtitle) ────────────────────────
  SELECT
    COALESCE(SUM(subtotal), 0),
    COUNT(DISTINCT n_sistema)
  INTO v_ventas_total, v_tickets_total
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND fecha BETWEEN v_actual_inicio AND v_actual_fin
    AND vendedor IS NOT NULL
    AND TRIM(vendedor) <> ''
    AND UPPER(TRIM(vendedor)) <> 'DEFAULT';

  -- ── 9. Totales del período prev (mismo corte day-by-day) ─────────────────
  SELECT
    COALESCE(SUM(subtotal), 0),
    COUNT(DISTINCT n_sistema)
  INTO v_ventas_total_prev, v_tickets_total_prev
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND fecha BETWEEN v_prev_inicio AND v_prev_fin
    AND vendedor IS NOT NULL
    AND TRIM(vendedor) <> ''
    AND UPPER(TRIM(vendedor)) <> 'DEFAULT';

  RETURN jsonb_build_object(
    'vendedoras',                COALESCE(v_vendedoras, '[]'::jsonb),
    'total_vendedoras_periodo',  jsonb_array_length(COALESCE(v_vendedoras, '[]'::jsonb)),
    'ventas_total',              v_ventas_total,
    'tickets_total',             v_tickets_total,
    'ventas_total_prev',         v_ventas_total_prev,
    'tickets_total_prev',        v_tickets_total_prev,
    'fecha_corte',               to_char(v_actual_fin, 'YYYY-MM-DD'),
    'es_periodo_parcial',        v_es_parcial,
    'dia_corte_anio_anterior',   to_char(v_prev_fin,   'YYYY-MM-DD')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_vendedoras(int, text, int, int) TO service_role;
