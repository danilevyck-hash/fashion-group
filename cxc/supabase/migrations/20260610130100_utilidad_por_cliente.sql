-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: utilidad_por_cliente(p_anio int) — utilidad real por cliente
--
-- Agrega switch_factura_utilidad (fuente: reporte web /reportesventa/facturas, la
-- ÚNICA con costo/utilidad por documento — la misma que usa Comisiones) por
-- cliente, para las 5 empresas B2B. Alcance del proyecto: 2026 + 5 B2B.
--
-- SIGNO: las NC se guardan NEGATIVAS (subtotal/costo/utilidad) y las ND positivas
-- → SUM() plano netea las devoluciones correctamente, sin CASE por tipo.
--
-- CLAVE DE AGRUPACIÓN: cliente_switch_id (id estable de Switch, por empresa), NO
-- el nombre. Fallback transitorio a nombre normalizado SOLO mientras las filas
-- previas al backfill tengan cliente_switch_id NULL (ver migración 130000). Tras
-- el backfill, todo agrupa por id. cliente_switch_id es por-empresa → la clave
-- real es (empresa_key, cliente_switch_id); un mismo cliente humano en dos
-- empresas B2B aparece como dos filas (consolidar cross-empresa por nombre sería
-- otro paso, fuera de alcance).
--
-- Salida: una fila por (empresa, cliente) con Σ subtotal/costo/utilidad, # docs y
-- pct de utilidad derivado (Σutil / Σsubtotal). Ordenado por utilidad desc.
--
-- REQUISITO: aplicar DESPUÉS de 20260610130000 (columna cliente_switch_id) y
-- correr el backfill para que las filas existentes tengan el id.
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION utilidad_por_cliente(p_anio int)
RETURNS TABLE (
  empresa_key text,
  cliente_switch_id int,
  cliente text,
  n_docs bigint,
  total_subtotal numeric,
  total_costo numeric,
  total_utilidad numeric,
  pct_utilidad numeric
)
LANGUAGE sql STABLE AS $$
  SELECT
    empresa_key,
    MAX(cliente_switch_id) AS cliente_switch_id,
    MAX(cliente)           AS cliente,
    COUNT(*)               AS n_docs,
    SUM(subtotal_con_descuento)::numeric AS total_subtotal,
    SUM(costo)::numeric                  AS total_costo,
    SUM(utilidad)::numeric               AS total_utilidad,
    CASE WHEN SUM(subtotal_con_descuento) <> 0
         THEN ROUND((SUM(utilidad) / SUM(subtotal_con_descuento) * 100)::numeric, 2)
         ELSE NULL END AS pct_utilidad
  FROM switch_factura_utilidad
  WHERE EXTRACT(YEAR FROM fecha)::int = p_anio
    AND empresa_key IN ('vistana','fashion_wear','fashion_shoes','active_shoes','active_wear')
  GROUP BY empresa_key, COALESCE(cliente_switch_id::text, 'nombre:' || upper(btrim(cliente)))
  ORDER BY SUM(utilidad) DESC
$$;

GRANT EXECUTE ON FUNCTION utilidad_por_cliente(int) TO service_role;

NOTIFY pgrst, 'reload schema';
