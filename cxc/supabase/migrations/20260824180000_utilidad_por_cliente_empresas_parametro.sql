-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: utilidad_por_cliente_v2(p_anio int, p_empresas text[])
--
-- 🔴 POR QUÉ EXISTE: la v1 (20260610130100) lleva la lista de empresas ESCRITA
-- A MANO en su WHERE:
--
--     AND empresa_key IN ('vistana','fashion_wear','fashion_shoes',
--                         'active_shoes','active_wear')
--
-- Son CINCO. Fashion Group son SEIS: falta `joystep`. Su utilidad se sincroniza
-- desde el 27-jul-2026 (`switch_factura_utilidad` tiene sus filas) y ya entró a
-- Comisiones el 14-ago-2026, pero el tab Ventas > Utilidad no la dibuja porque
-- esta función la descarta. La plata está en la base y la pantalla no la
-- muestra — es EXACTAMENTE el mismo olvido que costó 15.262,00 de cobros de
-- julio invisibles. Lo que no se dibuja, no se cuenta.
--
-- 🔑 LA LISTA SE DERIVA, NUNCA SE ESCRIBE. Por eso la v2 NO tiene la lista
-- adentro: la RECIBE. Quien llama es la app, y la app la saca de
-- `empresasConUtilidad()` (src/lib/switch-api/empresas.ts), la MISMA fuente
-- única de la que salen el sync de utilidad (`B2B_COMISION_KEYS`) y el
-- cronograma de crons. Una empresa que se encienda mañana en
-- `EMPRESA_SYNC_CAPABILITIES` aparece acá sola, sin tocar SQL, y una lista
-- copiada no puede volver a apartarse en silencio porque ya no hay copia.
--
-- ⚠️ ADITIVA: `utilidad_por_cliente(int)` NO SE TOCA y sigue viva. La app llama
-- a la v2 y, si esta migración todavía no corrió, cae sola a la v1 (el mismo
-- patrón de `rpcConFallbackDeVersion` que ya usa la proyección de cierre). O
-- sea: la pantalla funciona antes y después de correr esto — antes muestra 5
-- empresas como hoy, después las 6. Nada queda roto en el medio.
--
-- SIGNO: sin cambios. Las NC se guardan NEGATIVAS (subtotal/costo/utilidad) y
-- las ND positivas, asi que SUM() plano netea las devoluciones sin CASE por
-- tipo. NO se rehace esa logica.
--
-- CLAVE DE AGRUPACIÓN: sin cambios. cliente_switch_id (id estable de Switch,
-- por empresa), con fallback a nombre normalizado para las filas previas al
-- backfill. Cuerpo IDÉNTICO al de la v1 salvo el WHERE de empresas.
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION utilidad_por_cliente_v2(p_anio int, p_empresas text[])
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
LANGUAGE sql STABLE AS $fn$
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
    -- La lista llega POR PARÁMETRO. Un array vacío o NULL no devuelve nada:
    -- preferible una pantalla vacía y visible a un total silenciosamente
    -- cambiado por un llamador que se olvidó de mandar las empresas.
    AND empresa_key = ANY(COALESCE(p_empresas, ARRAY[]::text[]))
  GROUP BY empresa_key, COALESCE(cliente_switch_id::text, 'nombre:' || upper(btrim(cliente)))
  ORDER BY SUM(utilidad) DESC
$fn$;

GRANT EXECUTE ON FUNCTION utilidad_por_cliente_v2(int, text[]) TO service_role;

NOTIFY pgrst, 'reload schema';
