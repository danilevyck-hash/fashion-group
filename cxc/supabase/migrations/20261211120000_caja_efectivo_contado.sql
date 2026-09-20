-- ═════════════════════════════════════════════════════════════════════════════
-- CAJA MENUDA — CONTAR LA PLATA AL CERRAR (20-sep-2026). Migración ADITIVA.
-- ═════════════════════════════════════════════════════════════════════════════
-- 🩸 Por qué existe. El cierre sumaba los recibos, los restaba del fondo y
-- escribía «Queda en caja $36.72». NUNCA preguntaba cuánta plata hay de verdad.
-- Medido contra producción: los DOS cierres de toda la historia dieron
-- exactamente $0.00, y en los dos el último recibo cargado —7 y 10 segundos
-- antes de cerrar— es exactamente lo que faltaba para llegar a $200. El sistema
-- no tiene cómo distinguir «cuadró» de «le puse lo que faltaba».
--
-- 🔴 EL DESCUADRE NO FRENA EL CIERRE: se dice («Faltan $2.00» / «Sobran
-- $1.50»), se guarda acá y se sigue. Frenar el cierre por un faltante empuja a
-- inventar un recibo para cuadrar, que es justo lo que esto viene a cerrar.
--
-- 🔴 NI UN CENTAVO CAMBIA DE VALOR: esto solo AGREGA dos columnas. Los 3
-- períodos quedan en NULL, y NULL dice «no se contó», nunca «contó $0.00».
--
-- 🔴 El código FALLA ABIERTO: mientras esta DDL no corra, el cierre reintenta
-- sin estas columnas y funciona exactamente como hoy (mismo patrón que
-- `saldo_cierre`, 20260920120000). Se puede aplicar cuando Daniel diga.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE caja_periodos
  ADD COLUMN IF NOT EXISTS efectivo_contado numeric(12,2),
  ADD COLUMN IF NOT EXISTS diferencia_cierre numeric(12,2);

COMMENT ON COLUMN caja_periodos.efectivo_contado IS
  'Cuánta plata había DE VERDAD en la caja al cerrar, contada por quien cierra. NULL = no se contó (los 3 períodos anteriores al 20-sep-2026). Cero es un conteo válido: caja vacía.';

COMMENT ON COLUMN caja_periodos.diferencia_cierre IS
  'efectivo_contado - saldo_cierre, congelado al cerrar. Negativo = faltó plata; positivo = sobró. NULL = no se contó. Un descuadre NUNCA frena el cierre: se anota y se sigue.';
