-- ═════════════════════════════════════════════════════════════════════════════
-- switch_recibos.es_retencion — flag de retención de ITBMS (calculado en el sync)
-- ═════════════════════════════════════════════════════════════════════════════
-- Switch genera, justo después de facturar a clientes con retención, un recibo
-- por el 50% del campo `impuesto` (ITBMS) de la factura. Heurística determinista
-- (calculada UNA vez, en el sync): un recibo es retención si su total coincide
-- (±0.01) con impuesto/2 de alguna factura del mismo cliente con fecha ≤ fecha
-- del recibo (ventana ≤35 días). El flag se persiste acá para que TANTO el
-- último pago (v2) como la futura comisión-cobro lean el mismo criterio.
--
-- Último pago CXC = último COBRO REAL → la vista v2 excluye retenciones.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE switch_recibos ADD COLUMN IF NOT EXISTS es_retencion boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_recibos_empresa_ret ON switch_recibos (empresa_key, es_retencion);

-- v2: último pago = último recibo NO-retención (cobro real) por cliente.
CREATE OR REPLACE VIEW switch_ultimo_pago_cliente_v2 AS
SELECT DISTINCT ON (r.empresa_key, r.cliente_switch_id)
  r.empresa_key,
  r.cliente_switch_id,
  r.cliente_codigo,
  r.fecha              AS ultimo_pago_fecha,
  COALESCE(r.total, 0) AS ultimo_pago_monto
FROM switch_recibos r
WHERE r.fecha IS NOT NULL
  AND r.es_retencion = false   -- excluye retenciones de ITBMS (no son cobro real)
ORDER BY r.empresa_key, r.cliente_switch_id, r.fecha_creacion DESC NULLS LAST;

GRANT SELECT ON switch_ultimo_pago_cliente_v2 TO service_role;
GRANT SELECT ON switch_ultimo_pago_cliente_v2 TO authenticated;
GRANT SELECT ON switch_ultimo_pago_cliente_v2 TO anon;

NOTIFY pgrst, 'reload schema';
