-- ============================================================================
-- Comisiones — descuentos fijos por vendedor+empresa que se RESTAN del total a
-- pagar del mes (subtotal comisión − descuentos = total a pagar).
-- ============================================================================
-- Caso inicial: REINALDO ESPINOSA en fashion_shoes tiene 2 descuentos fijos que
-- aplican TODOS los meses por defecto, indefinidamente:
--   - "Descuento"              $1,400.00
--   - "Descuento de adelanto"  $  173.08
-- Secretaria/admin pueden DESACTIVAR cada uno POR MES (persistente).
--
-- Diseño data-driven (NO hardcode en el front):
--   - comision_descuentos_fijos: catálogo (vendedor, empresa, concepto, monto,
--     activo). Agregar otros descuentos = insertar filas, sin tocar código.
--   - comision_descuento_excepciones: override POR MES. Sin fila => activo
--     (default). Fila activo=false => ese descuento NO aplica ese mes.
--
-- El vendedor se identifica por NOMBRE, igual que comision_vendedor_tasa /
-- vendedores (la comisión viva de fashion_shoes usa "REINALDO ESPINOSA").
--
-- ADITIVA, NO destructiva, idempotente. Correr UNA vez en Supabase SQL Editor.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Catálogo de descuentos fijos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comision_descuentos_fijos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_nombre TEXT NOT NULL,
  empresa_key TEXT NOT NULL,
  concepto TEXT NOT NULL,
  monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  -- activo global: FALSE deshabilita el descuento en todos los meses (baja lógica).
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendedor_nombre, empresa_key, concepto)
);

CREATE INDEX IF NOT EXISTS idx_comision_descuentos_fijos_lookup
  ON comision_descuentos_fijos (empresa_key, vendedor_nombre)
  WHERE activo = TRUE;

-- ----------------------------------------------------------------------------
-- 2. Excepciones POR MES (toggle on/off de un descuento en un mes concreto)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comision_descuento_excepciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descuento_id UUID NOT NULL REFERENCES comision_descuentos_fijos(id) ON DELETE CASCADE,
  mes DATE NOT NULL, -- día 1 del mes ("YYYY-MM-01")
  activo BOOLEAN NOT NULL, -- FALSE = desactivado ese mes; TRUE = reactivado
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (descuento_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_comision_descuento_excepciones_desc
  ON comision_descuento_excepciones (descuento_id);

-- ----------------------------------------------------------------------------
-- 3. updated_at trigger (reusable)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION comision_descuentos_touch_updated_at()
RETURNS TRIGGER AS $fn$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comision_descuentos_fijos_touch ON comision_descuentos_fijos;
CREATE TRIGGER trg_comision_descuentos_fijos_touch BEFORE UPDATE ON comision_descuentos_fijos
FOR EACH ROW EXECUTE FUNCTION comision_descuentos_touch_updated_at();

DROP TRIGGER IF EXISTS trg_comision_descuento_excepciones_touch ON comision_descuento_excepciones;
CREATE TRIGGER trg_comision_descuento_excepciones_touch BEFORE UPDATE ON comision_descuento_excepciones
FOR EACH ROW EXECUTE FUNCTION comision_descuentos_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Seed: los 2 descuentos fijos de Reinaldo Espinosa (fashion_shoes)
-- ----------------------------------------------------------------------------
-- ON CONFLICT DO NOTHING → re-correr no duplica ni pisa montos ya editados.
INSERT INTO comision_descuentos_fijos (vendedor_nombre, empresa_key, concepto, monto)
VALUES
  ('REINALDO ESPINOSA', 'fashion_shoes', 'Descuento',             1400.00),
  ('REINALDO ESPINOSA', 'fashion_shoes', 'Descuento de adelanto',  173.08)
ON CONFLICT (vendedor_nombre, empresa_key, concepto) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- 5. Verificación
-- ----------------------------------------------------------------------------
SELECT vendedor_nombre, empresa_key, concepto, monto, activo
FROM comision_descuentos_fijos
ORDER BY vendedor_nombre, concepto;
