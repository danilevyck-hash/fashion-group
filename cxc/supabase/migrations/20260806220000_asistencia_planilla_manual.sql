-- ─────────────────────────────────────────────────────────────────────────────
-- PLANILLA — lo que NO sale del reloj y la contable escribe a mano.
--
-- ── 🩸 POR QUÉ ESTA TABLA EXISTE ─────────────────────────────────────────────
--
-- Cinco columnas del cuadro quincenal no las sabe ningún sistema de acá: el
-- ISR, el préstamo, el descuento a terceros, la mercancía por cobrar y los
-- otros servicios. Daniel fue explícito: *"no las inventes ni las traigas de
-- otro módulo"*. O sea que las escribe una persona, una por una.
--
-- Sin esta tabla se escribirían en la pantalla y se perderían al recargar. Son
-- ~30 montos por quincena tecleados a mano: perderlos una sola vez alcanza para
-- que la contable vuelva a su Excel y no abra más esta pantalla.
--
-- ⚠️ NO se calculan, NO se arrastran de una quincena a la anterior y NO tienen
-- valor por defecto distinto de 0. Un préstamo que se "hereda" solo es un
-- descuento que alguien va a pagar dos veces.
--
-- La llave es (quincena, código). La quincena se guarda como TEXTO "2026-07-2"
-- —año-mes-número— y no como un rango de fechas: el rango se DERIVA de ahí en
-- `lib/asistencia/planilla.ts`, que es donde vive la regla de que la segunda
-- quincena llega hasta el 31. Guardar el rango sería tener la misma regla en
-- dos lados y que se separen.
--
-- Aditiva e idempotente: no toca ninguna tabla existente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asistencia_planilla_manual (
  -- "2026-07-2" = segunda quincena de julio de 2026.
  quincena          text NOT NULL
                    CHECK (quincena ~ '^[0-9]{4}-(0[1-9]|1[0-2])-[12]$'),

  -- El código del reloj, igual que en `asistencia_personas` y `asistencia_horarios`.
  empleado_codigo   text NOT NULL,

  -- 🔑 Todos son DESCUENTOS, por eso el CHECK exige >= 0. Un negativo acá no
  -- sería "un crédito": sería un préstamo tecleado con el signo al revés que
  -- le SUMARÍA al neto sin que nadie lo note hasta el día de pago.
  isr               numeric(12,2) NOT NULL DEFAULT 0 CHECK (isr >= 0),
  prestamo          numeric(12,2) NOT NULL DEFAULT 0 CHECK (prestamo >= 0),
  terceros          numeric(12,2) NOT NULL DEFAULT 0 CHECK (terceros >= 0),
  mercancia         numeric(12,2) NOT NULL DEFAULT 0 CHECK (mercancia >= 0),
  otros_servicios   numeric(12,2) NOT NULL DEFAULT 0 CHECK (otros_servicios >= 0),

  updated_at        timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (quincena, empleado_codigo)
);

CREATE INDEX IF NOT EXISTS asistencia_planilla_manual_quincena_idx
  ON asistencia_planilla_manual (quincena);

-- RLS encendida SIN políticas: nadie entra con la llave pública. Todo pasa por
-- el servidor con service_role. Acá importa como en `asistencia_personas`:
-- estos montos, cruzados con el salario, son el sueldo neto de la gente.
ALTER TABLE asistencia_planilla_manual ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asistencia_planilla_manual IS
  'Las cinco columnas de la planilla que NO salen del reloj y escribe la contable a mano (ISR, préstamo, terceros, mercancía, otros servicios). Una fila por quincena y persona. No se calculan ni se arrastran de una quincena a otra.';
