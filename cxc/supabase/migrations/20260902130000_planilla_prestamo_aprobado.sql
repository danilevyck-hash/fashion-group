-- ─────────────────────────────────────────────────────────────────────────────
-- EL DESCUENTO DE PRÉSTAMO SE APRUEBA — no se aplica solo.
--
-- La contadora, textual: *«El préstamo si debe ser por aprobarlo»*.
--
-- ── 🩸 QUÉ ESTABA PASANDO ────────────────────────────────────────────────────
--
-- La casilla Préstamo del cuadro quincenal la teclea una persona mirando el
-- módulo de Préstamos en otra pantalla. Medido contra producción en la quincena
-- **1 al 15 de agosto de 2026**:
--
--   · el módulo registró 9 deducciones por $360,00
--   · la casilla de la planilla decía 7 montos por $265,00
--   · KEVIN LUBO ($50), LUIS PARAJON ($45) y YULICAR CORONA ($50) tenían la
--     deducción registrada en el módulo y la casilla en CERO;
--   · LUIS ARROYO tenía $50 en la casilla y NINGÚN pago en el módulo.
--
-- No es descuido de nadie: es transcribir treinta números a mano cada quincena.
--
-- ── 🔴 QUÉ SE GUARDA ACÁ, Y QUÉ NO ───────────────────────────────────────────
--
-- Acá se guarda **la decisión**: quién autorizó descontarle el préstamo a esta
-- persona en esta quincena. El MONTO sigue viviendo donde siempre vivió —
-- `asistencia_planilla_manual.prestamo`— y sigue siendo editable a mano.
--
-- 🔑 NO SE LLEVA UNA SEGUNDA CUENTA DEL SALDO. El saldo lo sabe el módulo de
-- Préstamos (`prestado − pagado` sobre `prestamos_movimientos`) y la sugerencia
-- sale de ahí en el momento de mirar. Una copia del saldo acá sería una segunda
-- verdad, y el día que las dos se separen nadie sabría cuál se le está
-- descontando a la gente.
--
-- ── ⚠️ ESTA APROBACIÓN NO ESCONDE PLATA (la lección del #651) ────────────────
--
-- Hace tres semanas un préstamo de $700 se quedó en `pendiente_aprobacion`, y
-- como el saldo solo suma lo aprobado, la pantalla lo mostraba en CERO: el
-- freno no protegía, escondía, y se supo 22 días después. Acá la forma es la
-- opuesta y es la misma que la de las horas extra (#649/#652):
--
--   · lo que está sin aprobar **se ve igual**, con nombre y monto, en ámbar,
--     arriba del cuadro — «NO se descontó en esta planilla»;
--   · el saldo del módulo **no depende de esta tabla**: un préstamo sin aprobar
--     sigue apareciendo entero en Préstamos, como siempre.
--
-- Aprobar decide si el número entra a la casilla. No decide si la deuda existe.
--
-- ── 🔴 LA LLAVE ES LA QUINCENA, y acá sí corresponde ─────────────────────────
--
-- Las horas extra se aprueban por DÍA porque el corte del período lo mueve la
-- contadora (#652). Un descuento de préstamo no es un hecho de un día: es
-- «este cuadro le descuenta $50». Pertenece a la quincena, igual que el ISR, y
-- por eso comparte llave EXACTA con `asistencia_planilla_manual`.
--
-- ── ⚠️ LA APP FUNCIONA SIN ESTE ARCHIVO ──────────────────────────────────────
--
-- Sin la tabla no se puede aprobar nada, la casilla Préstamo sigue siendo el
-- número tecleado a mano de siempre, y la planilla da EXACTAMENTE lo de hoy
-- hasta el centavo. Se avisa en pantalla con el nombre de este archivo.
--
-- Aditiva e idempotente: no toca ninguna tabla existente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asistencia_prestamo_aprobado (
  -- "2026-08-2" = segunda quincena de agosto. MISMA forma y MISMO CHECK que
  -- `asistencia_planilla_manual`: son la misma llave y tienen que serlo.
  quincena          text NOT NULL
                    CHECK (quincena ~ '^[0-9]{4}-(0[1-9]|1[0-2])-[12]$'),

  -- El código del reloj. Es lo que ata esta fila con la ficha de préstamo,
  -- vía `prestamos_empleados.empleado_codigo`.
  empleado_codigo   text NOT NULL,

  -- 🔴 TODO EL CONTENIDO DE LA DECISIÓN. `false` = se desaprobó; la fila NO se
  -- borra, porque «lo desaprobó la contadora» y «nadie lo miró nunca» son dos
  -- estados distintos y solo uno de los dos es un pendiente.
  aprobado          boolean NOT NULL DEFAULT true,

  -- 🔑 EL TESTIGO. Cuánto sugería el módulo —y por lo tanto cuánto se escribió
  -- en la casilla— en el momento de aprobar. NO es el monto que se paga: ese
  -- vive en `asistencia_planilla_manual.prestamo` y se puede corregir a mano.
  -- Sirve para dos cosas, las dos de decir la verdad en pantalla:
  --   · «aprobaste $50 y hoy el módulo dice $25» (cambió el saldo);
  --   · «aprobaste $50 y la casilla dice $30» (alguien la corrigió).
  monto_visto       numeric(12,2) NOT NULL DEFAULT 0 CHECK (monto_visto >= 0),

  -- Quién y cuándo. Misma regla que las horas extra: queda registro.
  marcado_por       text,
  marcado_en        timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (quincena, empleado_codigo)
);

CREATE INDEX IF NOT EXISTS asistencia_prestamo_aprobado_quincena_idx
  ON asistencia_prestamo_aprobado (quincena);

-- RLS encendida SIN políticas: nadie entra con la llave pública. Todo pasa por
-- el servidor con service_role. Importa como en `asistencia_planilla_manual`:
-- esta fila decide si a alguien se le descuenta plata del sueldo.
ALTER TABLE asistencia_prestamo_aprobado ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asistencia_prestamo_aprobado IS
  'Quién autorizó descontarle el préstamo a cada persona en cada quincena. Guarda la DECISIÓN, no el monto: el monto vive en asistencia_planilla_manual.prestamo y sigue siendo editable. No lleva ninguna copia del saldo — el saldo lo sabe el módulo de Préstamos.';

COMMENT ON COLUMN asistencia_prestamo_aprobado.monto_visto IS
  'Testigo: cuánto sugería el módulo (y se escribió en la casilla) al aprobar. NO es lo que se paga. Se compara contra la sugerencia de hoy y contra la casilla para avisar si alguna de las dos se movió.';
