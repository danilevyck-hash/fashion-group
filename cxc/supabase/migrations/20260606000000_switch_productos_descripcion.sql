-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: RPCs para el tab "Productos" del modulo Ventas (top por descripcion
-- + drill-down de codigos). Capa de lectura sobre switch_articulo_diario.
--
-- NIVEL 1 (switch_top_descripciones): agrupa por DESCRIPCION. Una fila por
--   descripcion con: num de codigos distintos, cantidad, venta, costo y margen.
--   Sin limite -> la suma de todas las filas = total del periodo (cuadra con
--   switch_articulo_margen_mensual, que es la fuente certificada del total).
--   El cliente hace el Top 20 + "Mostrar mas" y la busqueda.
--
-- NIVEL 2 (switch_articulos_por_descripcion): para UNA descripcion, devuelve sus
--   codigos con cantidad/venta/costo/margen. Lazy-load al expandir la fila.
--
-- SIGNO (gotcha de ventasucursal, igual que los RPCs previos): venta/costo se
--   guardan como magnitud; el signo contable lo aplica la lectura por tipo:
--   solo 'NC' resta; FA, 'CNF' (Transaccion) y demas suman. Sin Notas de Debito.
--
-- Margen = (venta - costo) / venta sobre el neto firmado del grupo.
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── NIVEL 1: top por descripcion (sin limite; el cliente pagina) ─────────────
CREATE OR REPLACE FUNCTION switch_top_descripciones(
  p_empresa_key text,
  p_desde       date,
  p_hasta       date
)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  WITH agg AS (
    SELECT
      COALESCE(descripcion, '(sin descripcion)') AS descripcion,
      COUNT(DISTINCT codigo) FILTER (WHERE codigo IS NOT NULL) AS num_codigos,
      SUM(CASE WHEN tipo = 'NC' THEN -cantidad_total ELSE cantidad_total END) AS cantidad,
      SUM(CASE WHEN tipo = 'NC' THEN -venta_total    ELSE venta_total    END) AS venta,
      SUM(CASE WHEN tipo = 'NC' THEN -costo_total    ELSE costo_total    END) AS costo
    FROM switch_articulo_diario
    WHERE empresa_key = p_empresa_key
      AND fecha BETWEEN p_desde AND p_hasta
    GROUP BY COALESCE(descripcion, '(sin descripcion)')
  )
  SELECT COALESCE(jsonb_agg(t ORDER BY t.venta DESC), '[]'::jsonb)
  FROM (
    SELECT
      descripcion, num_codigos, cantidad, venta, costo,
      CASE WHEN venta > 0 THEN (venta - costo) / venta ELSE NULL END AS margen
    FROM agg
    WHERE venta <> 0
  ) t;
$$;

GRANT EXECUTE ON FUNCTION switch_top_descripciones(text, date, date) TO service_role;

-- ─── NIVEL 2: codigos de UNA descripcion (drill-down) ─────────────────────────
CREATE OR REPLACE FUNCTION switch_articulos_por_descripcion(
  p_empresa_key text,
  p_desde       date,
  p_hasta       date,
  p_descripcion text
)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  WITH agg AS (
    SELECT
      codigo,
      MAX(descripcion) AS descripcion,
      SUM(CASE WHEN tipo = 'NC' THEN -cantidad_total ELSE cantidad_total END) AS cantidad,
      SUM(CASE WHEN tipo = 'NC' THEN -venta_total    ELSE venta_total    END) AS venta,
      SUM(CASE WHEN tipo = 'NC' THEN -costo_total    ELSE costo_total    END) AS costo
    FROM switch_articulo_diario
    WHERE empresa_key = p_empresa_key
      AND fecha BETWEEN p_desde AND p_hasta
      AND COALESCE(descripcion, '(sin descripcion)') = p_descripcion
      AND codigo IS NOT NULL
    GROUP BY codigo
  )
  SELECT COALESCE(jsonb_agg(t ORDER BY t.venta DESC), '[]'::jsonb)
  FROM (
    SELECT
      codigo, descripcion, cantidad, venta, costo,
      CASE WHEN venta > 0 THEN (venta - costo) / venta ELSE NULL END AS margen
    FROM agg
    WHERE venta <> 0
  ) t;
$$;

GRANT EXECUTE ON FUNCTION switch_articulos_por_descripcion(text, date, date, text) TO service_role;

NOTIFY pgrst, 'reload schema';
