-- ─────────────────────────────────────────────────────────────────────────────
-- PLANILLA — EL DAÑO DE MERCANCÍA ENTRA POR CUOTA, COMO EL PRÉSTAMO (14-sep-2026)
--
-- Daniel, textual: *«Si está en cuota, que se haga automático»*, *«Si alguien
-- tiene uno grande, igual debería ir por cuota, ¿no?»* y, cerrando: *«Tanto el
-- chico como el grande que sea por cuota, ¿no? Agregan el daño como se hace un
-- préstamo, se elige la cuota y listo»*.
--
-- ── 🩸 POR QUÉ ────────────────────────────────────────────────────────────────
--
-- Desde el 11-sep-2026 la cuota del préstamo y la de terceros entran SOLAS a su
-- casilla de la planilla, y la casilla tiene tres estados (migración
-- 20261115120000). El daño de mercancía quedó afuera de eso a propósito: la
-- contadora había pedido que *«permanezca en blanco y que nos permita colocar
-- quincenalmente la cantidad a descontar»*, así que `mercancia` siguió
-- `NOT NULL DEFAULT 0` y el 0 se leía como «vacío». Hoy Daniel decidió que el
-- daño se registra como un préstamo —monto y cuota— y desde ahí entra solo.
-- Para eso la casilla necesita los MISMOS tres estados que las otras dos:
-- con `NOT NULL DEFAULT 0` no hay forma de decir «esta quincena, nada».
--
-- ── 🔴 LOS TRES ESTADOS ──────────────────────────────────────────────────────
--
--     NULL   = no escrito: va la cuota de daño que propone Préstamos
--     0      = escrito a propósito: ESTA QUINCENA NO SE DESCUENTA
--     monto  = escrito a mano: se descuenta ESE monto
--
-- Solo cambia `mercancia`. `prestamo` y `terceros` ya son así desde
-- 20261115120000; `isr` y `otros_servicios` no proponen cuota y se quedan.
--
-- ── 🔴 BACKFILL: TODO 0 PASA A NULL, Y NADIE CAMBIA DE NETO ───────────────────
--
-- Medido el 14-sep-2026 antes de escribir esto: 0 de 31 fichas de Préstamos
-- tienen cuota de daño cargada (`deduccion_dano`), así que con la casilla en
-- NULL la planilla NO tiene ninguna cuota que meter y da lo de ayer al centavo.
-- Y hasta hoy un 0 en `mercancia` solo podía significar «vacío»: la casilla se
-- escribía a mano y 0 era «nada». Ningún 0 pudo significar «no descontar»,
-- porque ese significado nace con esta migración. Dejarlos en 0 no cambiaría
-- netos hoy (no hay cuota que saltar), pero el día que alguien cargue una cuota
-- un 0 viejo se leería como «no descontar» sin que nadie lo hubiera decidido.
--
-- Aditiva e idempotente: DROP NOT NULL / DROP DEFAULT no fallan si ya están, el
-- UPDATE está acotado al valor EXACTO 0 y no toca `updated_at` (no es una
-- edición de una persona). Sin `LIKE`, sin UPDATE amplio.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_planilla_manual
  ALTER COLUMN mercancia DROP NOT NULL,
  ALTER COLUMN mercancia DROP DEFAULT;

-- El CHECK (mercancia >= 0) se queda: NULL lo pasa, y un negativo sigue sin entrar.

UPDATE asistencia_planilla_manual SET mercancia = NULL WHERE mercancia = 0;

COMMENT ON COLUMN asistencia_planilla_manual.mercancia IS
  'Casilla «Mercancía» (daño de mercancía) de la planilla. NULL = no escrito, va la cuota de daño que propone Préstamos (deduccion_dano). 0 = escrito a propósito: esta quincena NO se descuenta. Monto > 0 = se descuenta ese monto. Desde 20261122120000; antes era NOT NULL DEFAULT 0 y el 0 se leía como vacío.';
