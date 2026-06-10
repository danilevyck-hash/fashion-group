-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ventas_dashboard_summary  →  Opcion A (hibrido MV + mes en curso vivo)
--
-- Tier 2 perf. Mismo nombre y shape de salida (empresa, mes, total_subtotal,
-- total_costo, total_utilidad, total_facturado, filas) -> el frontend
-- (src/lib/ventas/queries.ts) NO cambia.
--
-- QUE CAMBIA:
--   - Meses CERRADOS (mes < mes en curso): se leen de ventas_rollup_mensual_mv
--     (precomputado, rapido). Aca esta la agregacion historica que era el cuello.
--   - Mes EN CURSO: se agrega EN VIVO de las vistas (un solo mes, barato y
--     sargable) -> NO pierde frescura vs hoy (sigue sync-fresh).
--
-- BOUNDARY EN HORA-PANAMA: el corte del mes en curso usa
--   date_trunc('month', now() AT TIME ZONE America/Panama) para igualar EXACTO
--   los valores 'mes' de la MV (que se bucketean en hora-Panama). Asi la
--   particion cerrado/en-curso es exacta: sin solape (la rama MV excluye el mes
--   en curso con mes < cur.m) y sin hueco.
--
-- EQUIVALENCIA: la MV es, por construccion, el mismo join que esta funcion hacia
--   en vivo; recien refrescada, MV(cerrados) UNION ALL vivo(mes en curso) == todo
--   en vivo, al centavo. Unico desfase posible: un documento con fecha retroactiva
--   a un mes cerrado aparece tras el refresh nocturno (<=24h) -> tradeoff aceptado
--   (igual que el tab Clientes). El mes en curso nunca tiene ese desfase.
--
-- REQUISITO: aplicar DESPUES de 20260609120000_ventas_rollup_mensual_mv.sql.
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_dashboard_summary(p_anio int)
RETURNS TABLE (
  empresa text,
  mes int,
  total_subtotal numeric,
  total_costo numeric,
  total_utilidad numeric,
  total_facturado numeric,
  filas bigint
)
LANGUAGE sql STABLE AS $$
  WITH cur AS (
    SELECT date_trunc('month', (now() AT TIME ZONE 'America/Panama'))::date AS m
  )
  -- Meses CERRADOS: desde la MV (precomputado).
  SELECT
    r.empresa_key  AS empresa,
    r.mes_num      AS mes,
    r.ventas_netas AS total_subtotal,
    r.costo_total  AS total_costo,
    r.utilidad     AS total_utilidad,
    r.ventas_netas AS total_facturado,
    0::bigint      AS filas
  FROM ventas_rollup_mensual_mv r
  CROSS JOIN cur
  WHERE r.anio = p_anio
    AND r.mes < cur.m
  UNION ALL
  -- Mes EN CURSO: en vivo. Solo aporta filas cuando p_anio es el ano del mes en
  -- curso; para anos pasados no matchea (v.mes = cur.m es del ano corriente).
  SELECT
    v.empresa_key AS empresa,
    EXTRACT(MONTH FROM v.mes)::int AS mes,
    v.ventas_netas::numeric AS total_subtotal,
    COALESCE(c.costo_total, 0)::numeric AS total_costo,
    (v.ventas_netas - COALESCE(c.costo_total, 0))::numeric AS total_utilidad,
    v.ventas_netas::numeric AS total_facturado,
    0::bigint AS filas
  FROM switch_ventas_unificado_vw v
  LEFT JOIN switch_costo_unificado_vw c
    ON c.empresa_key = v.empresa_key AND c.mes = v.mes
  CROSS JOIN cur
  WHERE v.mes = cur.m
    AND EXTRACT(YEAR FROM v.mes)::int = p_anio
  ORDER BY 1, 2
$$;

GRANT EXECUTE ON FUNCTION ventas_dashboard_summary(int) TO service_role;

NOTIFY pgrst, 'reload schema';
