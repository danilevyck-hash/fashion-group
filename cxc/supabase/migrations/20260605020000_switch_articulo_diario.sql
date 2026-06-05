-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_articulo_diario + RPCs de lectura (top productos + margen)
--
-- Capa de datos para "top productos" y margen historico por articulo. Fuente:
-- /apireporte/ventasucursal (por sucursal, por DIA, por articulo, con costo).
-- Grano = empresa x fecha x articulo x tipo (el endpoint no da id de fila).
--
-- SIGNO (gotcha de ventasucursal, distinto a facturas):
--   - venta_total / costo_total se guardan como MAGNITUD positiva tal como
--     vienen del endpoint.
--   - El signo contable lo aplica la LECTURA por tipo: solo 'NC' resta; FA,
--     'CNF' (= Transaccion) y cualquier otro tipo suman. (En este endpoint las
--     NC vienen POSITIVAS; aca se firman al leer.)
--   - ventasucursal NO incluye Notas de Debito.
--
-- Cobertura: las 6 empresas B2B + american_classic traen costo poblado.
-- Reconciliacion vs ventas certificadas: american_classic cuadra al centavo;
-- B2B tiene ~0.3 por ciento de diferencia de base estructural (ventatotal por
-- linea vs subtotal_descuento de cabecera) -> se valida por margen porcentual.
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS switch_articulo_diario (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_key       text NOT NULL,
  fecha             date NOT NULL,
  articulo_id       int  NOT NULL,
  codigo            text,
  descripcion       text,
  unidad_medida_id  int,
  tipo              text NOT NULL,             -- FA | NC | CNF | ...
  total_comprobantes int,
  cantidad_total    numeric(14,4) NOT NULL DEFAULT 0,
  venta_total       numeric(14,4) NOT NULL DEFAULT 0,  -- magnitud; signo en lectura por tipo
  costo_total       numeric(14,4) NOT NULL DEFAULT 0,  -- magnitud
  synced_at         timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_key, fecha, articulo_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_sad_empresa_fecha ON switch_articulo_diario (empresa_key, fecha);
CREATE INDEX IF NOT EXISTS idx_sad_empresa_codigo ON switch_articulo_diario (empresa_key, codigo);

ALTER TABLE switch_articulo_diario ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON switch_articulo_diario FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON switch_articulo_diario TO service_role;

-- ─── RPC: top N productos por empresa y rango (neto firmado por tipo) ─────────
CREATE OR REPLACE FUNCTION switch_top_articulos(
  p_empresa_key text,
  p_desde       date,
  p_hasta       date,
  p_limit       int DEFAULT 20
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
      AND codigo IS NOT NULL
    GROUP BY codigo
  )
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
  FROM (
    SELECT
      codigo, descripcion, cantidad, venta, costo,
      CASE WHEN venta > 0 THEN (venta - costo) / venta ELSE NULL END AS margen
    FROM agg
    WHERE venta <> 0
    ORDER BY venta DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 200))
  ) t;
$$;

GRANT EXECUTE ON FUNCTION switch_top_articulos(text, date, date, int) TO service_role;

-- ─── RPC: margen mensual por empresa y anio (neto firmado por tipo) ───────────
CREATE OR REPLACE FUNCTION switch_articulo_margen_mensual(
  p_empresa_key text,
  p_year        int
)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'mes',    mes,
      'venta',  venta,
      'costo',  costo,
      'margen', CASE WHEN venta > 0 THEN (venta - costo) / venta ELSE NULL END
    ) ORDER BY mes
  ), '[]'::jsonb)
  FROM (
    SELECT
      EXTRACT(MONTH FROM fecha)::int AS mes,
      SUM(CASE WHEN tipo = 'NC' THEN -venta_total ELSE venta_total END) AS venta,
      SUM(CASE WHEN tipo = 'NC' THEN -costo_total ELSE costo_total END) AS costo
    FROM switch_articulo_diario
    WHERE empresa_key = p_empresa_key
      AND EXTRACT(YEAR FROM fecha)::int = p_year
    GROUP BY EXTRACT(MONTH FROM fecha)::int
  ) m;
$$;

GRANT EXECUTE ON FUNCTION switch_articulo_margen_mensual(text, int) TO service_role;

NOTIFY pgrst, 'reload schema';
