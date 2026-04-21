-- ============================================================================
-- Marketing — Fase 1 del refactor: % de marcas a nivel FACTURA
-- ============================================================================
-- Hoy el % vive a nivel proyecto (mk_proyecto_marcas). Este paso crea la
-- tabla nueva mk_factura_marcas y copia la data existente.
--
-- IMPORTANTE: NO se toca mk_proyecto_marcas en esta migración — queda como
-- backup. Será deprecada en Fase 4 del refactor.
--
-- Corre esta migración UNA SOLA VEZ en Supabase SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabla nueva mk_factura_marcas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mk_factura_marcas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id UUID NOT NULL REFERENCES mk_facturas(id) ON DELETE CASCADE,
  marca_id UUID NOT NULL REFERENCES mk_marcas(id),
  porcentaje NUMERIC(5,2) NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (factura_id, marca_id)
);

CREATE INDEX IF NOT EXISTS idx_mk_factura_marcas_factura
  ON mk_factura_marcas(factura_id);
CREATE INDEX IF NOT EXISTS idx_mk_factura_marcas_marca
  ON mk_factura_marcas(marca_id);

-- ----------------------------------------------------------------------------
-- 2. Copiar data existente desde mk_proyecto_marcas
--    Para cada factura vigente (no anulada), copia los % del proyecto padre.
--    ON CONFLICT DO NOTHING permite re-correr la migración sin duplicar.
-- ----------------------------------------------------------------------------
INSERT INTO mk_factura_marcas (factura_id, marca_id, porcentaje)
SELECT f.id, pm.marca_id, pm.porcentaje
  FROM mk_facturas f
  JOIN mk_proyecto_marcas pm ON pm.proyecto_id = f.proyecto_id
 WHERE f.anulado_en IS NULL
ON CONFLICT (factura_id, marca_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Validación — ambos conteos deben coincidir
-- ----------------------------------------------------------------------------
-- Filas insertadas en mk_factura_marcas
SELECT COUNT(*) AS mk_factura_marcas_count FROM mk_factura_marcas;

-- Filas esperadas (facturas vigentes × marcas del proyecto padre)
SELECT COUNT(*) AS esperadas_count
  FROM mk_facturas f
  JOIN mk_proyecto_marcas pm ON pm.proyecto_id = f.proyecto_id
 WHERE f.anulado_en IS NULL;

-- Verificación por factura: cada factura vigente debe tener al menos 1 marca
SELECT f.id AS factura_id, f.numero_factura, COUNT(fm.id) AS marcas_count
  FROM mk_facturas f
  LEFT JOIN mk_factura_marcas fm ON fm.factura_id = f.id
 WHERE f.anulado_en IS NULL
 GROUP BY f.id, f.numero_factura
HAVING COUNT(fm.id) = 0;
-- Si esta última query devuelve filas = facturas huérfanas (proyecto sin
-- marcas en mk_proyecto_marcas). Revisar manualmente.
