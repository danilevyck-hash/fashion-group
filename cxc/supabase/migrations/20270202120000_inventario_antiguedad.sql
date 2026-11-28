-- Antigüedad del inventario (27-nov-2026, Vista general › Inventario, 90 días).
-- Aditiva: una función de SOLO LECTURA, no toca ninguna tabla.
--
-- Por artículo con existencia > 0 (la misma base que inventario_valorizado_v1):
--   · nuevo     = lo que ENTRÓ desde p_desde (cantidad > 0 en switch_ingresos_mercancia),
--                 tope la existencia de hoy; valorizado a costo_api.
--   · viejo     = el resto de la existencia.
--   · sin_fecha = artículos con stock que no tienen NINGUNA llegada registrada.
-- p_cortes = {"empresa_key": "inicio ISO de su última corrida buena"}: lo que no
-- vino en esa corrida (synced_at anterior) no suma, igual que la tarjeta.
-- Sin costo (NULL o 0) vale 0, igual que inventario_valorizado_v1.
CREATE OR REPLACE FUNCTION inventario_antiguedad_v1(p_desde date, p_cortes jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (e text, nuevo numeric, viejo numeric, sin_fecha numeric)
LANGUAGE sql
STABLE
AS $fn$
  WITH s AS (
    SELECT i.empresa_key, i.codigo, i.existencia AS ex, COALESCE(NULLIF(i.costo_api, 0), 0) AS c
    FROM switch_articulo_info i
    WHERE i.existencia > 0
      AND (p_cortes ->> i.empresa_key IS NULL OR i.synced_at >= (p_cortes ->> i.empresa_key)::timestamptz)
  ),
  l AS (
    SELECT m.empresa_key, m.codigo_articulo AS codigo,
           COALESCE(SUM(m.cantidad) FILTER (WHERE m.fecha >= p_desde AND m.cantidad > 0), 0) AS q
    FROM switch_ingresos_mercancia m
    GROUP BY 1, 2
  )
  SELECT s.empresa_key,
         COALESCE(SUM(LEAST(s.ex, l.q) * s.c) FILTER (WHERE l.codigo IS NOT NULL), 0),
         COALESCE(SUM((s.ex - LEAST(s.ex, l.q)) * s.c) FILTER (WHERE l.codigo IS NOT NULL), 0),
         COALESCE(SUM(s.ex * s.c) FILTER (WHERE l.codigo IS NULL), 0)
  FROM s LEFT JOIN l ON l.empresa_key = s.empresa_key AND l.codigo = s.codigo
  GROUP BY s.empresa_key;
$fn$;

GRANT EXECUTE ON FUNCTION inventario_antiguedad_v1(date, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
