-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Paso 5b (proyecto Fuente Única API) — ventas_status_summary a switch.
--
-- ventas_status_summary alimenta el indicador de estado de /ventas/reporte
-- (última fecha, última sincronización, conteo por empresa). Leía ventas_raw
-- (uploaded_at del CSV); ahora lee switch_facturas: last_uploaded = MAX(synced_at)
-- (última sync del API), last_fecha en hora-Panamá. Shape de salida idéntico.
--
-- NOTA DE ALCANCE: ventas_topclientes_summary y ventas_clientes_detalle_summary
-- (también en /ventas/reporte) devuelven total_utilidad = RENTABILIDAD, que
-- depende del COSTO. switch_facturas no trae costo. Bajo Opción A (el costo sigue
-- de ventas_raw hasta el sprint de costo), esos dos reportes de utilidad quedan
-- sobre ventas_raw hasta entonces — son parte de la cola de costo, no del sprint
-- de ventas. Se portan en el sprint de costo.
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_status_summary()
RETURNS TABLE (
  empresa text,
  last_fecha date,
  last_uploaded timestamptz,
  total_count bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    empresa_key AS empresa,
    MAX((fecha AT TIME ZONE 'America/Panama')::date) AS last_fecha,
    MAX(synced_at) AS last_uploaded,
    COUNT(*)::bigint AS total_count
  FROM switch_facturas
  GROUP BY empresa_key
$$;

GRANT EXECUTE ON FUNCTION ventas_status_summary() TO service_role;

NOTIFY pgrst, 'reload schema';
