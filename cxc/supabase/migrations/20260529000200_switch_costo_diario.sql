-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_costo_diario — costo/venta/utilidad diario forward
--
-- Fuente: /apireporte/totalventas?tipo=03 (reporte "Total de ventas" del mes en
-- curso, devuelve totales por día con costo). Es el ÚNICO endpoint que expone
-- costo COMPLETO (incluye B2B a crédito), validado contra el panel oficial.
-- Limitación: solo período en curso → costo es FORWARD (desde que arranca el
-- cron). El histórico cerrado no tiene costo recuperable del API (ver
-- investigación sprint 2.0). Para histórico, el módulo Ventas usa ventas_raw.csv.
--
-- Grano: empresa × día (no per-factura — el API no da costo per-factura). Agrega
-- a empresa×mes para el margen del módulo Ventas (fase 2.1).
--
-- Empresas que escriben acá: las de facturas=true (EMPRESA_SYNC_CAPABILITIES),
-- las 8 (6 B2B + Boston + Multifashion).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS switch_costo_diario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_key text NOT NULL,
  fecha date NOT NULL,
  venta_total numeric(14,2) NOT NULL DEFAULT 0,
  costo_total numeric(14,2) NOT NULL DEFAULT 0,
  utilidad_total numeric(14,2) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_key, fecha)
);

CREATE INDEX IF NOT EXISTS idx_scd_empresa_fecha
  ON switch_costo_diario (empresa_key, fecha);

ALTER TABLE switch_costo_diario ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON switch_costo_diario
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
