-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_ultimo_pago_cliente VIEW (CXC — último pago por cliente)
--
-- Vista de SOLO LECTURA. Da, por (empresa_key, cliente_switch_id), el RECIBO
-- (pago) más reciente del cliente en esa empresa: su fecha y su monto.
--
-- Fuente: switch_estadocuenta (snapshot del API Switch, mismo origen que la
-- vista switch_estadocuenta_aging del panel CXC). NO toca sync, API ni los
-- RPCs de negocio del CXC. Solo deriva de data ya sincronizada.
--
-- DECISIONES (validadas con data real, 50 recibos):
--   - Pago = tipo_comprobante IN ('Recibo','Recibo Saldo Anterior').
--   - MONTO = columna `total` (poblada al 100% en recibos). `saldo` es el
--     remanente (descartado); `debito` siempre 0.
--   - Fecha = `fecha_creacion` (fecha del recibo).
--   - DISTINCT ON (empresa_key, cliente_switch_id) → el recibo más reciente.
--     Desempate por ccte_id DESC (doc más nuevo) si hay misma fecha.
--   - Se expone cliente_codigo (para el join del panel por empresa+codigo) y
--     cliente_switch_id (clave real; cubre a los ~9 huérfanos sin codigo, que
--     igual quedan como una fila propia).
--
-- COBERTURA PARCIAL (esperado): Switch solo trae recibos de documentos aún en
-- el estado de cuenta, no el historial completo. ~37/257 clientes tienen
-- recibo. Los demás no tendrán fila acá → la UI muestra "sin pago registrado".
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW switch_ultimo_pago_cliente AS
SELECT DISTINCT ON (s.empresa_key, s.cliente_switch_id)
  s.empresa_key,
  s.cliente_switch_id,
  s.cliente_codigo,
  s.fecha_creacion       AS ultimo_pago_fecha,
  COALESCE(s.total, 0)   AS ultimo_pago_monto
FROM switch_estadocuenta s
WHERE s.tipo_comprobante IN ('Recibo', 'Recibo Saldo Anterior')
  AND s.fecha_creacion IS NOT NULL
ORDER BY s.empresa_key, s.cliente_switch_id, s.fecha_creacion DESC, s.ccte_id DESC;

GRANT SELECT ON switch_ultimo_pago_cliente TO service_role;
GRANT SELECT ON switch_ultimo_pago_cliente TO authenticated;
GRANT SELECT ON switch_ultimo_pago_cliente TO anon;

NOTIFY pgrst, 'reload schema';

-- ─── Verificación (correr manual tras aplicar) ───────────────────────────────
--   SELECT empresa_key, COUNT(*) AS clientes_con_pago,
--          MIN(ultimo_pago_fecha), MAX(ultimo_pago_fecha)
--   FROM switch_ultimo_pago_cliente GROUP BY empresa_key ORDER BY empresa_key;
-- ─────────────────────────────────────────────────────────────────────────────
