-- ─────────────────────────────────────────────────────────────────────────────
-- DESCUENTO A TERCEROS — la TERCERA cuenta, igual que un préstamo.
--
-- 🔴 ADITIVA. Ni una fila cambia de valor: la columna nueva nace en 0 y los dos
-- conceptos nuevos no existen todavía en ninguna fila. El saldo de las 14
-- personas que deben hoy da EXACTAMENTE lo mismo antes y después.
--
-- ── QUÉ PIDIÓ LA CONTADORA, TEXTUAL ─────────────────────────────────────────
--
--   «los descuentos a terceros debe ser manejado igual como un préstamo
--    permitiendo colocar un monto inicial y un monto a descontar quincenal.»
--
-- O sea: una cuenta más, con su cargo inicial y su cuota quincenal, que la
-- quincena descuenta sola hasta pagarla. Es la MISMA maquinaria del préstamo
-- —`min(cuota, saldo)`, se anota al cerrar, se revierte al reabrir— sobre una
-- tercera cuenta.
--
--   «no hacerlo manual, la información se le configura en el perfil y la debe
--    tomar de allí.»
--
-- Por eso la cuota vive en la FICHA (`deduccion_terceros`) y no se teclea cada
-- quincena. El monto inicial es un movimiento de cargo, como un préstamo.
--
-- ── ⚠️ EL DAÑO DE MERCANCÍA VA AL REVÉS, Y NO NECESITA DDL ──────────────────
--
--   «los daños de mercancía debe permanecer en blanco y que nos permita colocar
--    quincenalmente la cantidad a descontar.»
--
-- El daño NO propone cuota: su casilla queda vacía y la contadora escribe el
-- monto de esa quincena. `prestamos_empleados.deduccion_dano` queda SIN
-- LECTORES —no se dropea, patrón de la casa— y su cuenta sigue existiendo: ahí
-- se cargan los daños con su valor y ahí baja lo que ella descuente.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── LA CUOTA QUINCENAL DE TERCEROS, EN LA FICHA ─────────────────────────────
ALTER TABLE prestamos_empleados
  ADD COLUMN IF NOT EXISTS deduccion_terceros numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN prestamos_empleados.deduccion_terceros IS
  'Cuánto se le descuenta por quincena de la cuenta «Descuento a terceros». '
  'La quincena propone min(cuota, saldo) y el cierre lo anota. 0 = no se le '
  'descuenta nada.';

COMMENT ON COLUMN prestamos_empleados.deduccion_dano IS
  'RETIRADA de los cálculos el 10-sep-2026: el daño de mercancía NO propone '
  'cuota. La contadora escribe el monto de cada quincena en la casilla («debe '
  'permanecer en blanco»). La columna se conserva con su valor histórico; no '
  'la lee nadie.';

-- ── LOS DOS CONCEPTOS NUEVOS ────────────────────────────────────────────────
--
-- 🔴 NINGÚN CONCEPTO EXISTENTE SE RENOMBRA. Renombrar es el peor modo de fallo
-- de este módulo: el saldo no revienta ante un concepto desconocido, lo deja de
-- contar EN SILENCIO. Se agregan dos y no se toca ninguno de los cinco viejos.
ALTER TABLE prestamos_movimientos
  DROP CONSTRAINT IF EXISTS prestamos_movimientos_concepto_check;

ALTER TABLE prestamos_movimientos
  ADD CONSTRAINT prestamos_movimientos_concepto_check
  CHECK (concepto = ANY (ARRAY[
    'Préstamo'::text,
    'Pago'::text,
    'Abono extra'::text,
    'Responsabilidad por daño'::text,
    'Pago de responsabilidad'::text,
    -- Los dos nuevos (10-sep-2026): el cargo y su pago.
    'Descuento a terceros'::text,
    'Pago de terceros'::text
  ]));

-- ── LA TERCERA CUENTA ───────────────────────────────────────────────────────
ALTER TABLE prestamos_movimientos
  DROP CONSTRAINT IF EXISTS prestamos_movimientos_cuenta_chk;

ALTER TABLE prestamos_movimientos
  ADD CONSTRAINT prestamos_movimientos_cuenta_chk
  CHECK (cuenta IS NULL OR (cuenta = ANY (ARRAY[
    'prestamo'::text,
    'dano'::text,
    'terceros'::text
  ])));

COMMENT ON COLUMN prestamos_movimientos.cuenta IS
  'A cuál de las TRES cuentas va el movimiento: prestamo · dano · terceros. '
  'NULL en lo anterior al 5-sep-2026: ahí la cuenta se deriva del concepto '
  '(ver cuentaDeMovimiento en src/lib/prestamos-saldo.ts).';

-- ── 🩸 EL AMARRE DEL CIERRE TAMBIÉN CONOCE LA TERCERA CUENTA ────────────────
--
-- `asistencia_planilla_prestamo` nació el 28-oct con un CHECK de DOS cuentas
-- (`prestamo` · `dano`), porque ese día no había una tercera. Sin esto, cerrar
-- una quincena con un descuento a terceros REVIENTA a mitad de camino: el
-- movimiento del pago queda escrito y su amarre no, así que el próximo cierre
-- lo volvería a anotar. Lo cazó la prueba de punta a punta contra la base.
ALTER TABLE asistencia_planilla_prestamo
  DROP CONSTRAINT IF EXISTS asistencia_planilla_prestamo_cuenta_check;

ALTER TABLE asistencia_planilla_prestamo
  ADD CONSTRAINT asistencia_planilla_prestamo_cuenta_check
  CHECK (cuenta = ANY (ARRAY['prestamo'::text, 'dano'::text, 'terceros'::text]));
