-- ============================================================================
-- Marketing — Impulsadoras: catálogo con pago fijo mensual imputado a marca(s)
-- ============================================================================
-- Una impulsadora tiene un sueldo mensual fijo (default 800) que se reparte a
-- una o varias marcas por porcentaje (suma 100). Cada mes se registra el pago
-- con comprobante obligatorio; el pago cae en mk_facturas como gastos SUELTOS
-- (sin proyecto/tienda), UNA fila por marca según el split.
--
-- Encaje con el esquema actual (ver marketing.sql):
--   - mk_facturas.proyecto_id era NOT NULL → se relaja a NULLABLE. Las 72
--     facturas existentes conservan su proyecto (no se reescribe ninguna fila).
--   - mk_facturas gana impulsadora_id (FK) + impulsadora_mes (DATE día 1) para
--     identificar y agrupar los pagos de impulsadora sin depender del texto.
--   - El split de marcas del pago vive en mk_factura_marcas (tabla ya existente),
--     una fila por marca al 100% (la factura ya es la porción de esa marca).
--
-- ADITIVA e IDEMPOTENTE. NO destructiva (cero DELETE / DROP COLUMN / DROP TABLE).
-- Aplicar UNA vez en Supabase Dashboard → SQL Editor.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Catálogo de impulsadoras
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mk_impulsadoras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  monto_mensual NUMERIC(12,2) NOT NULL DEFAULT 800 CHECK (monto_mensual >= 0),
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. Split de marcas por impulsadora (suma debe dar 100)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mk_impulsadora_marcas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  impulsadora_id UUID NOT NULL REFERENCES mk_impulsadoras(id) ON DELETE CASCADE,
  marca_id UUID NOT NULL REFERENCES mk_marcas(id),
  porcentaje NUMERIC(5,2) NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 100),
  UNIQUE (impulsadora_id, marca_id)
);

CREATE INDEX IF NOT EXISTS idx_mk_impulsadora_marcas_imp
  ON mk_impulsadora_marcas(impulsadora_id);
CREATE INDEX IF NOT EXISTS idx_mk_impulsadora_marcas_marca
  ON mk_impulsadora_marcas(marca_id);

-- ----------------------------------------------------------------------------
-- 3. mk_facturas: soportar gastos sueltos de impulsadora
-- ----------------------------------------------------------------------------
-- proyecto_id pasa a NULLABLE. Todas las filas actuales tienen proyecto → el
-- cambio no toca datos. Los gastos de impulsadora nacen con proyecto_id NULL.
ALTER TABLE mk_facturas ALTER COLUMN proyecto_id DROP NOT NULL;

-- FK a la impulsadora (NULL para gastos normales de proyecto). Identifica las
-- filas de impulsadora en los reportes/Excel SIN mirar el texto del concepto.
ALTER TABLE mk_facturas
  ADD COLUMN IF NOT EXISTS impulsadora_id UUID REFERENCES mk_impulsadoras(id);

-- Mes cubierto por el pago (día 1). Permite chips ✓/⏳ por mes y evitar doble
-- pago del mismo mes. NULL para gastos normales.
ALTER TABLE mk_facturas
  ADD COLUMN IF NOT EXISTS impulsadora_mes DATE;

CREATE INDEX IF NOT EXISTS idx_mk_facturas_impulsadora
  ON mk_facturas(impulsadora_id) WHERE impulsadora_id IS NOT NULL;

-- Integridad: cada factura pertenece a un proyecto O a una impulsadora (nunca
-- ambos NULL). Todas las filas actuales tienen proyecto_id → el CHECK se cumple.
ALTER TABLE mk_facturas DROP CONSTRAINT IF EXISTS mk_facturas_origen_check;
ALTER TABLE mk_facturas
  ADD CONSTRAINT mk_facturas_origen_check
  CHECK (proyecto_id IS NOT NULL OR impulsadora_id IS NOT NULL);

-- ----------------------------------------------------------------------------
-- 4. Triggers
-- ----------------------------------------------------------------------------
-- 4a. updated_at en mk_impulsadoras (reusa mk_touch_updated_at de marketing.sql)
DROP TRIGGER IF EXISTS trg_mk_touch_impulsadoras ON mk_impulsadoras;
CREATE TRIGGER trg_mk_touch_impulsadoras BEFORE UPDATE ON mk_impulsadoras
FOR EACH ROW EXECUTE FUNCTION mk_touch_updated_at();

-- 4b. Tope 100% en el split de marcas de una impulsadora (espejo del trigger
--     de proyecto). El form valida "exactamente 100"; el trigger bloquea >100.
CREATE OR REPLACE FUNCTION mk_validar_porcentajes_impulsadora()
RETURNS TRIGGER AS $func$
DECLARE
  total_pct NUMERIC;
BEGIN
  SELECT COALESCE(SUM(porcentaje), 0) INTO total_pct
  FROM mk_impulsadora_marcas
  WHERE impulsadora_id = COALESCE(NEW.impulsadora_id, OLD.impulsadora_id);

  IF total_pct > 100 THEN
    RAISE EXCEPTION 'La suma de porcentajes de marcas excede 100%% (actual: %)', total_pct;
  END IF;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mk_validar_porcentajes_imp ON mk_impulsadora_marcas;
CREATE TRIGGER trg_mk_validar_porcentajes_imp
AFTER INSERT OR UPDATE ON mk_impulsadora_marcas
FOR EACH ROW EXECUTE FUNCTION mk_validar_porcentajes_impulsadora();

COMMIT;

-- Recargar el cache de esquema de PostgREST (Supabase REST).
NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- 5. Verificación (no modifica nada) — revisar output en el SQL Editor
-- ----------------------------------------------------------------------------
-- 5a. proyecto_id ya es nullable y las columnas nuevas existen.
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'mk_facturas'
  AND column_name IN ('proyecto_id', 'impulsadora_id', 'impulsadora_mes')
ORDER BY column_name;

-- 5b. Conteos intactos (esperado: facturas con proyecto = las 72 actuales, y
--     cero facturas de impulsadora todavía).
SELECT
  COUNT(*) FILTER (WHERE proyecto_id IS NOT NULL)   AS con_proyecto,
  COUNT(*) FILTER (WHERE impulsadora_id IS NOT NULL) AS de_impulsadora
FROM mk_facturas;
