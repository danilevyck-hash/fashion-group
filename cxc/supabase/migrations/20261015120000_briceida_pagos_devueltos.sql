-- ─────────────────────────────────────────────────────────────────────────────
-- BRICEIDA MONTERO — se devuelven los DOS pagos que se borraron por error.
--
-- 🩸 QUÉ PASÓ. El 30-abr-2026 a las 17:10 UTC (12:10 p.m. de Panamá) se
-- borraron, con 26 segundos de diferencia, sus dos «Deducción quincenal» de
-- noviembre de 2025 ($50 cada una). La bitácora los tiene los dos
-- (`activity_logs`, action `prestamo_mov_delete`, user_role `admin`, user_name
-- `daniel`).
--
-- Sin esos dos pagos su saldo quedó en $100,00; con ellos da $0,00 EXACTO
-- (préstamos $1.300,00 − pagos $1.300,00). Y no eran duplicados: pagaba $50
-- cada quincena sin fallar, y borrarlos dejó a NOVIEMBRE sin un solo pago
-- mientras octubre y diciembre conservan los suyos —el único hueco de toda su
-- historia—.
--
--   oct 15  $50 ✓      dic 15  $50 ✓
--   oct 30  $50 ✓      dic 30  $50 ✓
--   nov 15  $50 ← borrado por error
--   nov 30  $50 ← borrado por error
--
-- Daniel, 8-sep-2026: «si devuelve briceida para que quede en 0».
--
-- 🔴 POR ID, NUNCA POR UN `WHERE` DESCRIPTIVO. Son dos filas nombradas una por
-- una. Un `where empleado_id = … and deleted` habría devuelto también lo que se
-- borró a propósito.
--
-- ⚠️ NO se toca `estado`, ni `monto`, ni `fecha`, ni `notas`: solo se apaga la
-- marca de borrado, que es exactamente lo que se prendió por error.
-- ─────────────────────────────────────────────────────────────────────────────

update prestamos_movimientos
   set deleted = false
 where id in (
   'da8975f5-d73f-4db1-a9e1-da72a2bc879a',  -- 15-nov-2025 · Pago · $50,00
   '0ef291f1-1648-455d-badd-1b37da861469'   -- 30-nov-2025 · Pago · $50,00
 )
   and deleted = true;
