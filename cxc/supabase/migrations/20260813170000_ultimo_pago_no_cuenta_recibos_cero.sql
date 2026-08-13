-- ═════════════════════════════════════════════════════════════════════════════
-- UN RECIBO DE $0,00 NO ES UN PAGO — switch_ultimo_pago_cliente_v2
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel, 13-ago-2026, textual: "me sale en city mall paso canoas en fashion
-- wear ultimo pago 0.00 hace 15 dias, no hace sentido".
--
-- QUÉ ES UN RECIBO DE $0,00 (medido, no supuesto):
--   * NO tiene efecto en la cuenta corriente. `switch_estadocuenta` tiene 672
--     filas de tipo 'Recibo' y CERO con total = 0: el propio estado de cuenta de
--     Switch nunca los lista como documento, porque no mueven un centavo.
--   * Son APLICACIONES / CRUCES (se aplica una NC o un saldo a favor contra
--     facturas, sin plata nueva) o recibos ANULADOS. Caso de Daniel, D-25 /
--     fashion_wear, 29-jul-2026: ese día la factura 11-000003154 ($770,40) se
--     anuló con la NC 13-000000913 ($770,40) y se reemitió como 11-000003155.
--     El recibo de $0,00 es el asiento de ese cruce.
--   * Ya estaba documentado como decisión de negocio en sync-recibos.ts
--     (Daniel, 23-jul-2026): se persisten tal cual y NO comisionan.
--
-- QUÉ ARREGLA: la vista tomaba el recibo más reciente que no fuera retención, y
-- para D-25/fashion_wear ese era el de $0,00 del 29-jul. El pago de verdad es el
-- de $187.651,51 del 22-jul. Medido sobre la vista COMPLETA (3.264 filas,
-- paginadas): 166 clientes muestran hoy como "último pago" algo que no es un
-- pago, algunos con fechas de 2024 y 2025.
--
--   confecciones_boston 138 · fashion_shoes 7 · fashion_wear 7 · vistana 7
--   active_shoes 3 · active_wear 2 · joystep 1 · american_classic 1
--
-- De esos 166, 40 no tienen NINGÚN recibo distinto de cero: quedan SIN última
-- fecha de pago (la fila desaparece de la vista) y la pantalla dice "Sin pagos
-- registrados". Es lo correcto: no hay pago que mostrar y no se inventa uno.
--
-- ⚠️ LA REGLA DE LAS RETENCIONES NO SE TOCA. `es_retencion = false` sigue igual
-- — Daniel: "pago es sin contar retenciones". Este cambio SUMA una condición, no
-- reemplaza ninguna.
--
-- ⚠️ NO MUEVE UN CENTAVO DE COMISIÓN. La base de cobro (comision_b2b_v5 /
-- comision_b2b_detalle) suma por `r.total`, así que un recibo de $0 aporta $0 y
-- seguirá haciéndolo: esas RPC NO se tocan acá. Lo único que cambia es qué
-- recibo se muestra como "último pago".
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW switch_ultimo_pago_cliente_v2 AS
SELECT DISTINCT ON (r.empresa_key, r.cliente_switch_id)
  r.empresa_key,
  r.cliente_switch_id,
  r.cliente_codigo,
  r.fecha              AS ultimo_pago_fecha,
  COALESCE(r.total, 0) AS ultimo_pago_monto
FROM switch_recibos r
WHERE r.fecha IS NOT NULL
  AND r.es_retencion = false        -- retención de ITBMS: no es cobro real
  AND COALESCE(r.total, 0) <> 0     -- $0,00 = aplicación/cruce o anulado: NO es un pago
ORDER BY r.empresa_key, r.cliente_switch_id, r.fecha_creacion DESC NULLS LAST;

GRANT SELECT ON switch_ultimo_pago_cliente_v2 TO service_role;

NOTIFY pgrst, 'reload schema';

-- Verificación (debe dar 0 filas):
--   SELECT count(*) FROM switch_ultimo_pago_cliente_v2 WHERE ultimo_pago_monto = 0;
-- Y el caso de Daniel (2026-07-22 · 187651.51):
--   SELECT ultimo_pago_fecha, ultimo_pago_monto FROM switch_ultimo_pago_cliente_v2
--   WHERE empresa_key = 'fashion_wear' AND cliente_codigo = 'D-25';
