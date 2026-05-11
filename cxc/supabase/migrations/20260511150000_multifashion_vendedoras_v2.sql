-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_vendedoras → v2 (escape hatch nuclear)
--
-- Contexto: el endpoint /api/multifashion/vendedoras deployado en Vercel
-- estaba devolviendo respuestas SIN las llaves nuevas (fecha_corte,
-- es_periodo_parcial, dia_corte_anio_anterior) y con ventas_total_prev
-- igual al mes COMPLETO del año anterior, a pesar de que:
--
--   1. pg_get_functiondef(oid) mostraba el body nuevo (con day-by-day).
--   2. pg_proc mostraba una sola función con firma (int, text, int, int).
--   3. NOTIFY pgrst, 'reload schema' fue ejecutado.
--   4. Vercel redeploy sin cache, ventana incógnita, force rebuild commit.
--   5. Llamada idéntica con `supabaseServer.rpc('multifashion_vendedoras', ...)`
--      desde un script local con el mismo service_role devolvía data
--      CORRECTA con todas las llaves.
--
-- Diagnóstico: el bug no se reproduce desde supabase-js directo contra la
-- Supabase URL de prod (verificado con scripts/repro-vendedoras-rpc.mjs).
-- La data en Postgres está correcta; el problema vive en el runtime
-- serverless de Vercel (warm container con build viejo, edge cache,
-- pooler con prepared statement stale — no logramos identificarlo).
--
-- Solución: renombrar la función a v2 y dropear la vieja. Forzar a TODO
-- el stack a partir de cero con un identificador nuevo. PostgREST refresca
-- su schema cache cuando aparece una función nueva, Vercel debe recompilar
-- al cambiar el nombre del RPC en route.ts, y cualquier prepared statement
-- viejo queda muerto al desaparecer la función original.
--
-- Body de la función: IDÉNTICO a 20260511140000_multifashion_vendedoras_same_period.
-- Solo cambia el nombre. Si en el futuro queremos volver a `multifashion_vendedoras`,
-- hacer otro CREATE OR REPLACE + DROP de v2 cuando el caché se invalide.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Drop the old function (signature explícita por seguridad) ─────────────
DROP FUNCTION IF EXISTS multifashion_vendedoras(int, text, int, int);

-- ── 2. Create v2 with the same body ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION multifashion_vendedoras_v2(
  p_year      int,
  p_periodo   text,
  p_mes       int DEFAULT NULL,
  p_trimestre int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_managers       jsonb;

  v_actual_inicio   date;
  v_actual_fin_full date;
  v_prev_inicio     date;
  v_prev_fin_full   date;

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

  -- Resolver el rango calendario completo del período
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

  -- fecha_corte = MAX(fecha) con data del período actual
  SELECT MAX(fecha) INTO v_actual_fin
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND fecha BETWEEN v_actual_inicio AND v_actual_fin_full;

  -- ¿Período en curso por calendario?
  v_es_parcial := (CURRENT_DATE BETWEEN v_actual_inicio AND v_actual_fin_full);

  -- Sin data en período actual → return early para evitar división por cero.
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

  -- Aplicar mismo offset de días al período del año anterior
  IF v_es_parcial THEN
    v_dia_offset := v_actual_fin - v_actual_inicio;
    v_prev_fin   := LEAST(v_prev_inicio + v_dia_offset, v_prev_fin_full);
  ELSE
    v_actual_fin := v_actual_fin_full;
    v_prev_fin   := v_prev_fin_full;
  END IF;

  -- TOP vendedor del período actual
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

  -- Ranking + delta same-period
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

  -- Totales del período actual
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

  -- Totales del período prev (mismo corte day-by-day)
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

GRANT EXECUTE ON FUNCTION multifashion_vendedoras_v2(int, text, int, int) TO service_role;

-- ── 3. Notify PostgREST que hay un schema nuevo ──────────────────────────────
NOTIFY pgrst, 'reload schema';
