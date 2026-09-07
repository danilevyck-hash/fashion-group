-- ─────────────────────────────────────────────────────────────────────────────
-- TOM-001: el `total` GUARDADO ya no era el suyo (6-sep-2026)
--
-- 🩸 El pedido se guardó el 6-ago-2026 con **$1.584,00** — el bulto por defecto
-- de 12 aplicado a un estilo marcado en 8. El total real es **$1.472,00**.
-- Es herencia del mismo defecto de bultos de agosto (TOM-003).
--
-- MEDIDO el 6-sep-2026 con el código real (`scripts/_medir-excel-vs-pantalla-pedidos.ts`):
-- de los 56 pedidos vivos de las 4 marcas, TOM-001 es el ÚNICO cuyo `total`
-- guardado difiere del que calculan la pantalla y el Excel.
--
-- ⚠️ ESTO ES HIGIENE DEL DATO, NO UN CAMBIO DE CONDUCTA. Ninguna pantalla lee
-- el total guardado: todas lo RECALCULAN desde los renglones. Después de esta
-- migración se ve exactamente lo mismo que antes; lo que cambia es que el dato
-- de la base deja de mentir.
--
-- ⚠️ El envío a Switch de este pedido NO SE TOCA: ya salió, y lo que Switch
-- tenga es asunto de Switch, no de esta tabla.
--
-- FRENOS DE MANO:
--   · acotada al `order_number` EXACTO — nunca un LIKE, nunca un rango;
--   · exige el valor viejo (`total = 1584.00`): si alguien ya lo corrigió, esta
--     migración no hace nada en vez de pisar un dato bueno;
--   · UPDATE de UNA columna de UNA fila. Ni un DELETE.
--   · `updated_at` NO se toca: esto no es una edición del pedido.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE tommy_orders
   SET total = 1472.00
 WHERE order_number = 'TOM-001'
   AND deleted = false
   AND total = 1584.00;
