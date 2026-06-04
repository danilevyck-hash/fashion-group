-- ═════════════════════════════════════════════════════════════════════════════
-- Sprint 2 — switch_recibos (cache de cobros) + último pago CXC v2
-- ═════════════════════════════════════════════════════════════════════════════
-- Fuente: /apireporte/recibos (API JSON de Switch). Un row por recibo:
--   fechaCreacion, clienteId/Codigo/Nombre, vendedor (quien registró), total.
-- El endpoint NO da id/secuencial de recibo → el sync hace delete+insert por
-- (empresa_key, mes). Guarda TODOS los campos útiles para que la comisión-cobro
-- (cuando se resuelva el filtro de tipo) pueda aplicarse sin re-migrar.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS switch_recibos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_key       text NOT NULL,
  fecha             date,                  -- de fechaCreacion (día)
  fecha_creacion    timestamptz,           -- crudo con hora (orden/desempate)
  cliente_switch_id int,                   -- clienteId (join a cartera/maestro)
  cliente_codigo    text,                  -- clienteCodigo (join al panel CXC)
  cliente_nombre    text,
  vendedor_registro text,                  -- vendedor que registró el recibo
  total             numeric(14,4) NOT NULL DEFAULT 0,
  synced_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recibos_empresa_fecha   ON switch_recibos (empresa_key, fecha);
CREATE INDEX IF NOT EXISTS idx_recibos_empresa_codigo  ON switch_recibos (empresa_key, cliente_codigo);
CREATE INDEX IF NOT EXISTS idx_recibos_empresa_cliente ON switch_recibos (empresa_key, cliente_switch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON switch_recibos TO service_role;

-- Permite sync_type='recibos' en el log (mismo patrón que 'costo'/'utilidad').
ALTER TABLE switch_sync_log DROP CONSTRAINT IF EXISTS switch_sync_log_sync_type_check;
ALTER TABLE switch_sync_log
  ADD CONSTRAINT switch_sync_log_sync_type_check
  CHECK (sync_type IN ('facturas', 'estadocuenta', 'costo', 'utilidad', 'recibos'));

-- ─── Último pago por cliente — v2 (lee de switch_recibos, NO estadocuenta) ────
-- v1 (switch_ultimo_pago_cliente) leía de switch_estadocuenta, que solo trae
-- recibos ABIERTOS → la mayoría de pagos no aparecían ("sin recibo activo").
-- v2 lee de switch_recibos (historial completo del reporte). Mismo shape que v1
-- para el consumidor del CXC. NUEVA vista (no reemplaza v1) por el caching de
-- PostgREST/Vercel: renombrar evita servir definición vieja cacheada.
CREATE OR REPLACE VIEW switch_ultimo_pago_cliente_v2 AS
SELECT DISTINCT ON (r.empresa_key, r.cliente_switch_id)
  r.empresa_key,
  r.cliente_switch_id,
  r.cliente_codigo,
  r.fecha              AS ultimo_pago_fecha,
  COALESCE(r.total, 0) AS ultimo_pago_monto
FROM switch_recibos r
WHERE r.fecha IS NOT NULL
ORDER BY r.empresa_key, r.cliente_switch_id, r.fecha_creacion DESC NULLS LAST;

GRANT SELECT ON switch_ultimo_pago_cliente_v2 TO service_role;
GRANT SELECT ON switch_ultimo_pago_cliente_v2 TO authenticated;
GRANT SELECT ON switch_ultimo_pago_cliente_v2 TO anon;

NOTIFY pgrst, 'reload schema';
