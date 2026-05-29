-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_facturas
--
-- Tabla generalizada de facturas/tiquetes para las empresas del grupo
-- sincronizadas vía Switch API, EXCEPTO Multifashion (american_classic) que
-- mantiene su tabla legacy multifashion_tickets (sync intacto).
--
-- Empresas que escriben acá (empresa_key, ver empresa-mapping.ts):
--   vistana, fashion_wear, fashion_shoes, active_shoes, active_wear, joystep,
--   confecciones_boston   (= empresasConFacturas())
--
-- Cada instancia de Switch tiene su propio espacio de IDs de factura, por eso
-- la unicidad es (empresa_key, switch_factura_id), no switch_factura_id solo.
--
-- Mismo shape de montos que multifashion_tickets: Switch envía strings con
-- separador de miles (coma); el sync parsea con parse.ts/parseAmount.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS switch_facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  empresa_key text NOT NULL,

  -- Identidad en Switch (por empresa)
  switch_factura_id int NOT NULL,
  secuencial text NOT NULL,
  tipo_comprobante text NOT NULL,
  fecha timestamptz NOT NULL,

  -- Montos
  subtotal numeric(12,4) NOT NULL,
  descuento numeric(12,4) NOT NULL DEFAULT 0,
  subtotal_descuento numeric(12,4) NOT NULL,
  impuesto numeric(12,4) NOT NULL DEFAULT 0,
  total numeric(12,4) NOT NULL,
  saldo numeric(12,4) NOT NULL DEFAULT 0,

  condicion_venta text,

  -- Cliente / vendedor / sucursal (denormalizados desde Switch)
  cliente_switch_id int,
  cliente_nombre text,
  cliente_email text,
  vendedor_switch_id int,
  vendedor_nombre text,
  sucursal_switch_id int,
  sucursal_nombre text,

  raw_data jsonb,

  synced_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (empresa_key, switch_factura_id)
);

CREATE INDEX IF NOT EXISTS idx_sf_empresa_fecha
  ON switch_facturas (empresa_key, fecha);
CREATE INDEX IF NOT EXISTS idx_sf_empresa_cliente
  ON switch_facturas (empresa_key, cliente_switch_id);
CREATE INDEX IF NOT EXISTS idx_sf_empresa_vendedor
  ON switch_facturas (empresa_key, vendedor_switch_id);

ALTER TABLE switch_facturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON switch_facturas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
