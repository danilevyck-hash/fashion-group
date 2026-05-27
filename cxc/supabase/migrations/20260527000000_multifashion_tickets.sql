-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multifashion_tickets
--
-- Tablas para la sincronización de facturas/tiquetes de Multifashion desde
-- Switch Soft API. Foundation del Sprint Multifashion FASE 1 (Día 1).
--
--   - multifashion_tickets: una fila por factura/tiquete, deduplicada por
--     switch_factura_id. raw_data guarda el payload completo de Switch para
--     poder re-derivar campos sin volver a pegarle al API.
--   - multifashion_sync_log: histórico de corridas del sync (cron / manual /
--     backfill) para diagnosticar y medir.
--
-- No toca ventas_raw ni cxc_rows. Schema aislado.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── multifashion_tickets ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS multifashion_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identidad en Switch
  switch_factura_id int NOT NULL UNIQUE,
  secuencial text NOT NULL,
  tipo_comprobante text NOT NULL,  -- 'Factura' | 'Tiquete' (no constrained, Switch puede agregar tipos)
  fecha timestamptz NOT NULL,

  -- Montos (Switch envía strings con 4 decimales; guardamos numeric(12,4))
  subtotal numeric(12,4) NOT NULL,
  descuento numeric(12,4) NOT NULL DEFAULT 0,
  subtotal_descuento numeric(12,4) NOT NULL,
  impuesto numeric(12,4) NOT NULL DEFAULT 0,
  total numeric(12,4) NOT NULL,
  saldo numeric(12,4) NOT NULL DEFAULT 0,

  -- Metadata de venta
  condicion_venta text,

  -- Cliente (denormalizado desde Switch, no FK)
  cliente_switch_id int,
  cliente_nombre text,
  cliente_email text,

  -- Vendedor (denormalizado desde Switch, no FK)
  vendedor_switch_id int,
  vendedor_nombre text,

  -- Sucursal (denormalizado desde Switch, no FK)
  sucursal_switch_id int,
  sucursal_nombre text,

  -- Payload completo de Switch (para re-derivar sin re-pegarle al API)
  raw_data jsonb,

  -- Timestamps de sync
  synced_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
-- (switch_factura_id ya tiene UNIQUE → índice implícito)
CREATE INDEX IF NOT EXISTS idx_mft_fecha
  ON multifashion_tickets (fecha);
CREATE INDEX IF NOT EXISTS idx_mft_vendedor
  ON multifashion_tickets (vendedor_switch_id);
CREATE INDEX IF NOT EXISTS idx_mft_sucursal
  ON multifashion_tickets (sucursal_switch_id);

ALTER TABLE multifashion_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON multifashion_tickets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── multifashion_sync_log ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS multifashion_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'success', 'error')),
  range_from date,
  range_to date,
  records_inserted int DEFAULT 0,
  records_updated int DEFAULT 0,
  records_skipped int DEFAULT 0,
  error_message text,
  triggered_by text NOT NULL CHECK (triggered_by IN ('cron', 'manual', 'backfill'))
);

CREATE INDEX IF NOT EXISTS idx_msl_started_at
  ON multifashion_sync_log (started_at DESC);

ALTER TABLE multifashion_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON multifashion_sync_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Verificación post-creación:
--   SELECT count(*) FROM multifashion_tickets;
--   SELECT * FROM multifashion_sync_log ORDER BY started_at DESC LIMIT 5;
