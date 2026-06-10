-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ventas_rollup_mensual_mv  →  rollup mensual MATERIALIZADO de /ventas
-- (Tier 2 perf). Precompute empresa_key x mes de ventas netas + costo + utilidad
-- para que los 3 RPC del dashboard (summary, prev_same_period, proyeccion_cierre)
-- dejen de re-agregar TODA la historia en cada llamada (el cuello de ~2s en frio).
--
-- POR QUE ESTO ES RAPIDO:
--   - Hoy summary hace EXTRACT(YEAR FROM mes) = p_anio sobre una vista NO
--     materializada que ya agrego ~100K filas de switch_facturas. Predicado
--     no-sargable + re-agregacion en cada llamada.
--   - Aca el GROUP BY se materializa 1x/dia (cron de medianoche). Los RPC leen
--     filas precomputadas y filtran por la columna int 'anio' (indexada, sargable).
--
-- CONSTRUIDA SOBRE LAS VISTAS, NO SOBRE switch_facturas CRUDO:
--   Hereda gratis el bucket mensual en hora-Panama de switch_ventas_unificado_vw
--   (date_trunc('month', fecha AT TIME ZONE America/Panama)). El lado costo
--   (switch_costo_unificado_vw) ya viene en fecha DATE local. Cero manejo de
--   timestamptz aca: la columna 'mes' es un date limpio (primer dia de mes).
--
-- GRANO: empresa_key x mes (1 fila por empresa por mes con ventas).
-- COBERTURA DE COSTO: identica a switch_costo_unificado_vw de hoy (excluye Notas
--   de Debito, ~0.1%, documentado en su gate). LEFT JOIN + COALESCE preservan las
--   empresas/meses sin costo igual que hoy. No cambia ninguna cifra.
--
-- ORDEN DE APLICACION:
--   1) ESTA migracion PRIMERO (crea la MV; los RPC la referencian).
--   2) Luego las 3 migraciones de RPC del PR (summary/prev/proyeccion _mv).
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS ventas_rollup_mensual_mv;

CREATE MATERIALIZED VIEW ventas_rollup_mensual_mv AS
SELECT
  v.empresa_key,
  v.mes,
  EXTRACT(YEAR  FROM v.mes)::int AS anio,
  EXTRACT(MONTH FROM v.mes)::int AS mes_num,
  v.ventas_netas::numeric                                AS ventas_netas,
  COALESCE(c.costo_total, 0)::numeric                    AS costo_total,
  (v.ventas_netas - COALESCE(c.costo_total, 0))::numeric AS utilidad
FROM switch_ventas_unificado_vw v
LEFT JOIN switch_costo_unificado_vw c
  ON c.empresa_key = v.empresa_key AND c.mes = v.mes
WITH DATA;

-- UNIQUE index: requisito de REFRESH ... CONCURRENTLY (no bloquea lecturas).
CREATE UNIQUE INDEX ventas_rollup_mensual_mv_pk
  ON ventas_rollup_mensual_mv (empresa_key, mes);

-- Sirve el filtro por anio de los 3 RPC (lo historico desde la MV).
CREATE INDEX ventas_rollup_mensual_mv_anio
  ON ventas_rollup_mensual_mv (empresa_key, anio);

GRANT SELECT ON ventas_rollup_mensual_mv TO service_role;

-- Wrapper RPC: supabase-js no expone SQL raw. El cron refresh-clientes-views
-- llama esta funcion (SECURITY DEFINER) para refrescar sin bloquear lecturas.
CREATE OR REPLACE FUNCTION refresh_ventas_rollup_mensual_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY ventas_rollup_mensual_mv;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_ventas_rollup_mensual_mv() TO service_role;

NOTIFY pgrst, 'reload schema';
