-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ventas_topclientes_summary + ventas_clientes_detalle_summary a
-- switch_facturas (sprint de costo, Paso 3 — Opción 3: SIN utilidad por cliente).
--
-- Estos 2 reportes de /ventas/reporte devolvían utilidad POR CLIENTE desde
-- ventas_raw. El costo por cliente NO existe en el API sincronizado
-- (switch_facturas no trae costo; switch_articulo_diario no trae cliente). Por
-- decisión del usuario (Opción 3): se QUITA la columna utilidad y el ranking
-- queda por VENTAS (exacto desde switch_facturas). La utilidad por línea de
-- factura (apifactura/info) queda en BACKLOG (Opción 4) por si se quiere a futuro.
--
-- Fuente: switch_facturas, cliente por nombre normalizado, subtotal_descuento
-- neto firmado por tipo, fecha en hora-Panamá. Retira la última lectura de
-- ventas_raw para VENTAS (solo el backup la dumpea ya).
--
-- Cambia el RETURNS TABLE (se quitan columnas) → DROP + CREATE (no REPLACE).
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Top clientes por ventas (sin utilidad) ───────────────────────────────────
DROP FUNCTION IF EXISTS ventas_topclientes_summary(int, int);
CREATE FUNCTION ventas_topclientes_summary(p_anio int, p_top int DEFAULT 10)
RETURNS TABLE (cliente text, total_subtotal numeric)
LANGUAGE sql STABLE AS $$
  WITH normalized AS (
    SELECT
      COALESCE(NULLIF(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(cliente_nombre), '[.,]', '', 'g'), '\s+', ' ', 'g')), ''), '(Sin nombre)') AS cliente_norm,
      CASE
        WHEN tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN subtotal_descuento
        WHEN tipo_comprobante = 'Nota de Crédito' THEN -subtotal_descuento
        ELSE 0
      END AS subtotal
    FROM switch_facturas
    WHERE EXTRACT(YEAR FROM (fecha AT TIME ZONE 'America/Panama'))::int = p_anio
      AND cliente_nombre IS NOT NULL
  )
  SELECT cliente_norm, SUM(subtotal)::numeric
  FROM normalized
  WHERE cliente_norm NOT IN (
    'CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON',
    'CONTADO', 'VENTAS', 'VENTAS LOCALES'
  )
  GROUP BY cliente_norm
  HAVING SUM(subtotal) > 0
  ORDER BY SUM(subtotal) DESC
  LIMIT p_top;
$$;
GRANT EXECUTE ON FUNCTION ventas_topclientes_summary(int, int) TO service_role;

-- ── Detalle de clientes (sin utilidad) ────────────────────────────────────────
DROP FUNCTION IF EXISTS ventas_clientes_detalle_summary(int, date, date, date);
CREATE FUNCTION ventas_clientes_detalle_summary(
  p_anio int,
  p_desde date,
  p_twelve_months_ago date,
  p_sixty_days_ago date
)
RETURNS TABLE (
  cliente text,
  subtotal_actual numeric,
  prev_subtotal numeric,
  last_fecha date,
  last12m_total numeric,
  is_inactive boolean,
  empresas jsonb
)
LANGUAGE sql STABLE AS $$
  WITH
  sf AS (
    SELECT
      COALESCE(NULLIF(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(cliente_nombre), '[.,]', '', 'g'), '\s+', ' ', 'g')), ''), '(Sin nombre)') AS cliente_norm,
      empresa_key AS empresa,
      (fecha AT TIME ZONE 'America/Panama')::date AS fecha,
      EXTRACT(YEAR FROM (fecha AT TIME ZONE 'America/Panama'))::int AS anio,
      CASE
        WHEN tipo_comprobante IN ('Factura', 'Tiquete', 'Transacción', 'Nota de Débito') THEN subtotal_descuento
        WHEN tipo_comprobante = 'Nota de Crédito' THEN -subtotal_descuento
        ELSE 0
      END AS subtotal
    FROM switch_facturas
    WHERE cliente_nombre IS NOT NULL
  ),
  current_filtered AS (
    SELECT * FROM sf
    WHERE anio = p_anio
      AND (p_desde IS NULL OR fecha >= p_desde)
      AND empresa NOT IN ('confecciones_boston', 'american_classic')
      AND cliente_norm NOT IN ('CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON')
  ),
  current_agg AS (
    SELECT cliente_norm, SUM(subtotal)::numeric AS subtotal_actual
    FROM current_filtered GROUP BY cliente_norm
  ),
  current_empresas AS (
    SELECT cliente_norm,
      jsonb_agg(jsonb_build_object('empresa', empresa, 'subtotal', emp_sub) ORDER BY emp_sub DESC) AS empresas
    FROM (
      SELECT cliente_norm, empresa, SUM(subtotal)::numeric AS emp_sub
      FROM current_filtered GROUP BY cliente_norm, empresa
    ) e
    GROUP BY cliente_norm
  ),
  prev_filtered AS (
    SELECT cliente_norm, SUM(subtotal)::numeric AS prev_subtotal
    FROM sf
    WHERE anio = p_anio - 1
      AND cliente_norm NOT IN ('CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON')
    GROUP BY cliente_norm
  ),
  last12m_filtered AS (
    SELECT cliente_norm, MAX(fecha)::date AS last_fecha, SUM(subtotal)::numeric AS last12m_total
    FROM sf
    WHERE fecha >= p_twelve_months_ago
      AND empresa NOT IN ('confecciones_boston', 'american_classic')
      AND cliente_norm NOT IN ('CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON', 'CONTADO', 'VENTAS', 'VENTAS LOCALES', '(Sin nombre)')
    GROUP BY cliente_norm
  )
  SELECT
    COALESCE(c.cliente_norm, l.cliente_norm) AS cliente,
    COALESCE(c.subtotal_actual, 0)::numeric AS subtotal_actual,
    COALESCE(p.prev_subtotal, 0)::numeric AS prev_subtotal,
    l.last_fecha,
    COALESCE(l.last12m_total, 0)::numeric AS last12m_total,
    (
      l.last_fecha IS NOT NULL
      AND l.last_fecha < p_sixty_days_ago
      AND COALESCE(l.last12m_total, 0) >= 5000
      AND COALESCE(c.cliente_norm, l.cliente_norm) NOT IN ('CONTADO', 'VENTAS', 'VENTAS LOCALES', '(Sin nombre)')
    ) AS is_inactive,
    COALESCE(ce.empresas, '[]'::jsonb) AS empresas
  FROM current_agg c
  FULL OUTER JOIN last12m_filtered l ON c.cliente_norm = l.cliente_norm
  LEFT JOIN prev_filtered p ON COALESCE(c.cliente_norm, l.cliente_norm) = p.cliente_norm
  LEFT JOIN current_empresas ce ON c.cliente_norm = ce.cliente_norm
  WHERE COALESCE(c.cliente_norm, l.cliente_norm) NOT IN ('CONTADO', 'VENTAS', 'VENTAS LOCALES', '(Sin nombre)')
     OR COALESCE(c.subtotal_actual, 0) > 0
  ORDER BY COALESCE(c.subtotal_actual, 0) DESC;
$$;
GRANT EXECUTE ON FUNCTION ventas_clientes_detalle_summary(int, date, date, date) TO service_role;

NOTIFY pgrst, 'reload schema';
