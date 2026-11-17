-- ─────────────────────────────────────────────────────────────────────────────
-- PRÉSTAMOS — el CHECK de `origen_pago` acepta «Abono» (16-nov-2026)
--
-- 🩸 El 8-sep-2026 la pantalla cambió «Efectivo» por «Abono» (plata que la
-- persona paga de su bolsillo; `ORIGENES_PAGO` en `src/lib/prestamos-conceptos.ts`)
-- y nadie amplió el CHECK que nació en `20260925120000`. Resultado: la ruta
-- aceptaba «Abono» y Postgres lo rechazaba. El pago de $200 de Roxana del
-- 15-nov-2026 quedó guardado como «Efectivo» por eso.
--
-- ADITIVA: se agrega «Abono» y NO se quita nada. «Efectivo» se queda en la
-- lista aunque el código ya no lo ofrezca: una fila vieja que lo tenga no
-- puede dejar de pasar el CHECK. Ningún número cambia: todo lector trata el
-- origen como «Quincena (o vacío)» contra «todo lo demás».
--
-- Candado: src/__tests__/lib/prestamos-origen-pago-check.test.ts
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE prestamos_movimientos
  DROP CONSTRAINT IF EXISTS prestamos_movimientos_origen_pago_chk;

ALTER TABLE prestamos_movimientos
  ADD CONSTRAINT prestamos_movimientos_origen_pago_chk
  CHECK (origen_pago IS NULL OR origen_pago IN ('Quincena', 'Décimo', 'Vacaciones', 'Liquidación', 'Abono', 'Efectivo'));

COMMENT ON COLUMN prestamos_movimientos.origen_pago IS
  'De dónde salió la plata de un pago: Quincena (lo escribe «Aplicar quincena» y lo que vale un NULL), Décimo, Vacaciones, Liquidación o Abono (de bolsillo). «Efectivo» quedó en el CHECK por compatibilidad; el código no lo ofrece desde el 8-sep-2026.';
