-- ─────────────────────────────────────────────────────────────────────────────
-- Ventas › Productos (PRODUCTOS_FILTROS_2026_10): cada código vendido en la
-- ventana, MÁS cada código con existencia, con lo que la pantalla filtra.
--
--   c · d   código y su descripción MÁS RECIENTE (misma regla que el listado)
--   q · v · k   unidades, venta y costo de la ventana (las NC restan; 0 si no vendió)
--   m · r · s   marca · rubro · subrubro de su línea de factura más reciente
--   e   existencia en Switch (`switch_articulo_info`), NULL sin dato
--   n90 ¿vendió algo en los 90 días que terminan en p_hoy?
--
-- Solo lee. Aditiva: sin ella la ruta cae a un camino paginado (más lento).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_productos_articulos_v1(
  p_empresa_key text,
  p_desde       date,
  p_hasta       date,
  p_hoy         date
)
RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  WITH agg AS (
    SELECT
      d.codigo,
      SUM(CASE WHEN d.tipo = 'NC' THEN -d.cantidad_total ELSE d.cantidad_total END) AS q,
      SUM(CASE WHEN d.tipo = 'NC' THEN -d.venta_total    ELSE d.venta_total    END) AS v,
      SUM(CASE WHEN d.tipo = 'NC' THEN -d.costo_total    ELSE d.costo_total    END) AS k
    FROM switch_articulo_diario d
    WHERE d.empresa_key = p_empresa_key
      AND d.fecha BETWEEN p_desde AND p_hasta
      AND d.codigo IS NOT NULL
    GROUP BY d.codigo
  ),
  stock AS (
    SELECT codigo, existencia, descripcion
    FROM switch_articulo_info
    WHERE empresa_key = p_empresa_key
  ),
  base AS (
    SELECT codigo FROM agg WHERE v <> 0 OR q <> 0
    UNION
    SELECT codigo FROM stock WHERE existencia > 0
  ),
  vendio90 AS (
    SELECT DISTINCT codigo
    FROM switch_articulo_diario
    WHERE empresa_key = p_empresa_key
      AND fecha BETWEEN p_hoy - 89 AND p_hoy
      AND codigo IN (SELECT codigo FROM base)
  ),
  reciente AS (
    SELECT DISTINCT ON (codigo) codigo, descripcion
    FROM switch_articulo_diario
    WHERE empresa_key = p_empresa_key
      AND codigo IN (SELECT codigo FROM base)
      AND descripcion IS NOT NULL
    ORDER BY codigo, fecha DESC, id::text ASC
  ),
  clase AS (
    SELECT DISTINCT ON (codigo) codigo, marca, rubro, subrubro
    FROM switch_factura_lineas
    WHERE empresa_key = p_empresa_key
      AND codigo IN (SELECT codigo FROM base)
    ORDER BY codigo, fecha DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'c', b.codigo,
    'd', COALESCE(r.descripcion, st.descripcion, '(sin descripcion)'),
    'q', COALESCE(a.q, 0), 'v', COALESCE(a.v, 0), 'k', COALESCE(a.k, 0),
    'm', cl.marca, 'r', cl.rubro, 's', cl.subrubro,
    'e', st.existencia,
    'n90', (n.codigo IS NOT NULL)
  )), '[]'::jsonb)
  FROM base b
  LEFT JOIN agg a       ON a.codigo  = b.codigo
  LEFT JOIN stock st    ON st.codigo = b.codigo
  LEFT JOIN vendio90 n  ON n.codigo  = b.codigo
  LEFT JOIN reciente r  ON r.codigo  = b.codigo
  LEFT JOIN clase cl    ON cl.codigo = b.codigo;
$fn$;

GRANT EXECUTE ON FUNCTION ventas_productos_articulos_v1(text, date, date, date) TO service_role;

NOTIFY pgrst, 'reload schema';
