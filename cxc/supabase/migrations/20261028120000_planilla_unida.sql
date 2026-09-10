-- ─────────────────────────────────────────────────────────────────────────────
-- PLANILLA UNIDA — el comprobante de pago, el corte de horas y el pago del
-- préstamo que se escribe SOLO al cerrar.
--
-- 🔴 ADITIVA. Ni una fila cambia de valor. Todo lo que se agrega es NULLABLE o
-- trae DEFAULT, y el código tolera que esta migración no haya corrido: sin ella
-- el módulo se comporta EXACTAMENTE como hoy.
--
-- ── QUÉ RESUELVE, EN ORDEN ──────────────────────────────────────────────────
--
-- (1) El comprobante de pago necesita DOS datos que la ficha no tiene:
--     «POSICION DESEMPEÑADA» y la cédula. Hoy salen impresos en el papel que la
--     contadora arma a mano y el sistema no los conoce. Sin ellos el papel
--     saldría con dos renglones vacíos que nadie puede llenar desde la app.
--     Daniel: la foto de la cédula se carga UNA sola vez en la ficha.
--
-- (2) 🩸 EL PAGO DEL PRÉSTAMO. Medido en producción, quincena del 1 al 15 de
--     agosto de 2026: el módulo de Préstamos tenía 9 descuentos por $360,00 y
--     la casilla de la planilla decía 7 por $265,00. KEVIN LUBO ($50), LUIS
--     PARAJON ($45) y YULICAR CORONA ($50) tenían el descuento registrado en el
--     módulo y la casilla EN CERO — se les bajó la deuda por plata que nunca se
--     les quitó del sueldo. LUIS ARROYO al revés: $50 en la casilla y ningún
--     pago en el módulo. Pasa porque hoy alguien teclea el pago a mano en el
--     otro módulo, y teclear a mano dos veces la misma plata es cómo nacen los
--     dos números.
--
--     Desde acá lo escribe EL CIERRE. `asistencia_planilla_prestamo` es el
--     amarre entre el cuadro que se cerró y el movimiento que se escribió, y
--     existe por una sola razón: **para que cerrar dos veces no cobre dos
--     veces**. Sin el amarre, reabrir y volver a cerrar duplicaría el pago.
--
-- (3) EL CORTE. Se paga del 1 al 15, pero la quincena se cierra el 13 (o el 28)
--     para tener los pagos listos. Daniel, textual: *«hay que cerrarla un dia
--     por ejemplo 13 o 28 porque hay que tener los pagos listos para el
--     15-30/31, asi que se calcula los dias de la quincena restante sin horas
--     extra como un dia normal y se le paga, y si esos 2/3 dias llego tarde,
--     ausencia o tuvo horas extra, se recalcula en la proxima quincena»*.
--     `corte` guarda hasta qué día se leyó el reloj; `ajuste_anterior` guarda la
--     corrección que entra en la quincena siguiente COMO UN RENGLÓN APARTE.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (1) LA FICHA: cargo y cédula ────────────────────────────────────────────
ALTER TABLE asistencia_personas
  ADD COLUMN IF NOT EXISTS posicion          text,
  ADD COLUMN IF NOT EXISTS cedula            text,
  ADD COLUMN IF NOT EXISTS cedula_foto_path  text;

COMMENT ON COLUMN asistencia_personas.posicion IS
  'El cargo que sale impreso en «POSICION DESEMPEÑADA» del comprobante de pago. '
  'NULL = todavía no se cargó, y el papel lo dice con un guion: no se inventa un cargo.';
COMMENT ON COLUMN asistencia_personas.cedula IS
  'La cédula, para el pie del comprobante. NULL = la escribe a mano quien firma, como hoy.';
COMMENT ON COLUMN asistencia_personas.cedula_foto_path IS
  'La ruta en Storage de la foto de la cédula. Se carga UNA vez en la ficha y de ahí se usa siempre.';

-- El cargo y la cédula no pueden ser cadenas vacías disfrazadas de dato.
DO $$ BEGIN
  ALTER TABLE asistencia_personas
    ADD CONSTRAINT asistencia_personas_posicion_no_vacia
    CHECK (posicion IS NULL OR btrim(posicion) <> '');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE asistencia_personas
    ADD CONSTRAINT asistencia_personas_cedula_no_vacia
    CHECK (cedula IS NULL OR btrim(cedula) <> '');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── (3) EL CORTE Y EL AJUSTE ────────────────────────────────────────────────
ALTER TABLE asistencia_planilla_guardada
  ADD COLUMN IF NOT EXISTS corte date;

COMMENT ON COLUMN asistencia_planilla_guardada.corte IS
  'Hasta qué día se LEYÓ EL RELOJ. NULL = se leyó la quincena entera, que es el '
  'comportamiento de siempre. Con corte, los días de `corte`+1 a `hasta` se '
  'pagaron como días normales y su verdad se corrige en la quincena siguiente.';

DO $$ BEGIN
  ALTER TABLE asistencia_planilla_guardada
    ADD CONSTRAINT asistencia_planilla_guardada_corte_dentro
    CHECK (corte IS NULL OR (corte >= desde AND corte <= hasta));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE asistencia_planilla_guardada_linea
  ADD COLUMN IF NOT EXISTS ajuste_anterior numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS posicion        text;

COMMENT ON COLUMN asistencia_planilla_guardada_linea.ajuste_anterior IS
  'La corrección de los días que la quincena PASADA pagó sin medir. Positivo = se '
  'le descuenta; negativo = se le devuelve. 🔴 VA EN SU PROPIO RENGLÓN del '
  'comprobante («AJUSTE QUINCENA ANTERIOR») y NUNCA mezclado con AUSENCIA: son '
  'dos cosas distintas y sumarlas pierde para siempre la explicación de por qué '
  'el neto no da lo que la persona esperaba.';
COMMENT ON COLUMN asistencia_planilla_guardada_linea.posicion IS
  'El cargo TAL COMO ESTABA el día que se cerró. Congelado con el resto del '
  'cuadro: el comprobante de una quincena vieja tiene que salir igual aunque a '
  'la persona la hayan ascendido después.';

-- ── (2) EL AMARRE CUADRO ↔ PAGO DEL PRÉSTAMO ────────────────────────────────
--
-- 🔴 UNA FILA POR (cuadro, persona, cuenta). El índice único es el que impide
-- cobrar dos veces: si el cierre se repite, el insert choca y no se escribe un
-- segundo movimiento.
--
-- ⚠️ NO guarda montos. El monto vive en `prestamos_movimientos`, que es la
-- única cuenta del préstamo. Guardarlo también acá sería la SEGUNDA cuenta que
-- este repo lleva años evitando (`prestamos-saldo.ts`, un solo lugar).
CREATE TABLE IF NOT EXISTS asistencia_planilla_prestamo (
  id             bigserial PRIMARY KEY,
  planilla_id    uuid NOT NULL
                   REFERENCES asistencia_planilla_guardada(id) ON DELETE RESTRICT,
  empleado_codigo text NOT NULL,
  -- 'prestamo' | 'dano'. Las dos cuentas de `prestamos-saldo.ts`.
  cuenta         text NOT NULL CHECK (cuenta IN ('prestamo', 'dano')),
  movimiento_id  uuid NOT NULL
                   REFERENCES prestamos_movimientos(id) ON DELETE RESTRICT,
  -- 🔴 Al REABRIR, el pago se revierte: se marca acá y el movimiento queda con
  -- `deleted = true`. NUNCA un DELETE, ni de esta fila ni del movimiento: lo que
  -- se pagó una vez se tiene que poder leer después.
  revertido_en   timestamptz,
  revertido_por  text,
  creado_en      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS asistencia_planilla_prestamo_una_vez
  ON asistencia_planilla_prestamo (planilla_id, empleado_codigo, cuenta);

CREATE INDEX IF NOT EXISTS asistencia_planilla_prestamo_mov
  ON asistencia_planilla_prestamo (movimiento_id);

COMMENT ON TABLE asistencia_planilla_prestamo IS
  'El amarre entre un cuadro CERRADO y el pago de préstamo que ese cierre '
  'escribió. Existe para que cerrar dos veces no cobre dos veces, y para que '
  'reabrir sepa exactamente qué revertir.';

ALTER TABLE asistencia_planilla_prestamo ENABLE ROW LEVEL SECURITY;
