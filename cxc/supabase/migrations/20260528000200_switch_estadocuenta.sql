-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_estadocuenta (CXC)
--
-- Estado de cuenta (cuentas por cobrar) por documento, sincronizado desde
-- /apicliente/estadocuenta?clienteId=X de cada empresa.
--
-- Empresas que escriben acá (= empresasConCxc()):
--   vistana, fashion_wear, fashion_shoes, active_shoes, active_wear, joystep,
--   american_classic   (Multifashion: LA FRONTERA, etc.)
-- EXCLUYE confecciones_boston (su CXC se maneja por otro lado — Brand It).
--
-- Es un SNAPSHOT de saldos actuales, no histórico. Unicidad por
-- (empresa_key, ccte_id) — ccteId es el id del documento en cuenta corriente.
--
-- Reconciliación: el sync sella synced_at en cada upsert; los documentos que
-- dejan de aparecer (pagados/cerrados) quedan con synced_at viejo y el sync
-- los pone saldo=0 al final del run de su empresa (ver sync-empresa.ts).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS switch_estadocuenta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  empresa_key text NOT NULL,
  ccte_id int NOT NULL,

  -- Cliente (de la iteración del sync, no del element)
  cliente_switch_id int,
  cliente_nombre text,
  cliente_codigo text,

  -- Documento
  secuencial text,
  numero_fiscal text,
  tipo_comprobante text,
  abrev text,

  -- Montos
  total numeric(12,4),
  saldo numeric(12,4),
  debito numeric(12,4),
  credito numeric(12,4),
  saldo_original numeric(12,4),
  total_original numeric(12,4),

  -- Crédito / aging
  plazo_credito numeric(8,2),
  dias int,
  fecha_creacion date,

  raw_data jsonb,

  synced_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (empresa_key, ccte_id)
);

CREATE INDEX IF NOT EXISTS idx_sec_empresa_cliente
  ON switch_estadocuenta (empresa_key, cliente_switch_id);
-- Saldos abiertos: el filtro más común del dashboard CXC.
CREATE INDEX IF NOT EXISTS idx_sec_empresa_saldo_abierto
  ON switch_estadocuenta (empresa_key, saldo)
  WHERE saldo > 0;

ALTER TABLE switch_estadocuenta ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON switch_estadocuenta
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
