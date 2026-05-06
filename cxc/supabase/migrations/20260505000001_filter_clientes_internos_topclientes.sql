-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: filtrar CLIENTES_INTERNOS y CLIENTES_GENERICOS en
--            ventas_topclientes_summary
--
-- CONTEXTO:
-- ventas_topclientes_summary devolvía clientes internos del grupo
-- (MULTI FASHION HOLDING, CONFECCIONES BOSTON, etc.) y genéricos
-- (CONTADO, VENTAS) en el top. Estos no son clientes externos reales:
-- los internos son tiendas propias del grupo y los genéricos son ventas
-- al mostrador sin nombre asociado.
--
-- Solo cambia el WHERE: agrega cliente_norm NOT IN (...).
-- Resto idéntico al original.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_topclientes_summary(
  p_anio int,
  p_top int DEFAULT 10
)
RETURNS TABLE (
  cliente text,
  total_subtotal numeric,
  total_utilidad numeric
)
LANGUAGE sql STABLE AS $$
  WITH normalized AS (
    SELECT
      COALESCE(
        NULLIF(
          TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(cliente), '[.,]', '', 'g'), '\s+', ' ', 'g')),
          ''
        ),
        '(Sin nombre)'
      ) AS cliente_norm,
      subtotal,
      utilidad
    FROM ventas_raw
    WHERE anio = p_anio
  )
  SELECT
    cliente_norm,
    SUM(subtotal)::numeric,
    SUM(utilidad)::numeric
  FROM normalized
  WHERE cliente_norm NOT IN (
    'CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON',
    'CONTADO', 'VENTAS'
  )
  GROUP BY cliente_norm
  ORDER BY SUM(subtotal) DESC
  LIMIT p_top
$$;

GRANT EXECUTE ON FUNCTION ventas_topclientes_summary(int, int) TO service_role;
