-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_clientes — marca de clientes AUSENTES en Switch (audit
-- de sincronizacion jul-2026).
--
-- PROBLEMA: switch_clientes es un directorio ACUMULATIVO (puente id→codigo para
-- facturas historicas, ver 20260601000000). Nunca borra, y eso es correcto —
-- pero un cliente BORRADO en Switch (ej. vistana id193 D-135, active_shoes
-- id180 D-30, detectados en el audit) quedaba indistinguible de uno vivo.
--
-- SOLUCION: columna activo (default true) + ausente_desde. El sync de
-- estadocuenta (persistClientesDirectorio → marcarClientesAusentes) marca
-- activo=false a los que ya no vienen en /apicliente/lista y revive a los que
-- reaparecen. NO se borra ninguna fila: el mapeo historico id→codigo se
-- preserva para las vistas de clientes.
--
-- El codigo ya esta deployado y es TOLERANTE a la ausencia de estas columnas
-- (solo loguea warning) — correr esta DDL cuando se pueda, sin urgencia de
-- coordinar con el deploy.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE switch_clientes
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

ALTER TABLE switch_clientes
  ADD COLUMN IF NOT EXISTS ausente_desde timestamptz;

COMMENT ON COLUMN switch_clientes.activo IS
  'false = el cliente ya no aparece en /apicliente/lista de Switch (borrado alla). La fila se conserva como puente id→codigo para facturas historicas.';
COMMENT ON COLUMN switch_clientes.ausente_desde IS
  'Timestamp del sync que detecto la ausencia (null si activo).';

-- Consultas de listado que quieran solo vivos: WHERE activo = true.
CREATE INDEX IF NOT EXISTS idx_switch_clientes_activo
  ON switch_clientes (empresa_key, activo);
