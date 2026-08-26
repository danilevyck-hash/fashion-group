-- ─────────────────────────────────────────────────────────────────────────────
-- HORAS EXTRA APROBADAS — el permiso que el reloj no puede dar.
--
-- ── 🩸 POR QUÉ ESTA TABLA EXISTE ─────────────────────────────────────────────
--
-- La contadora, textual: *«Sólo se pagan las horas extras autorizadas y las
-- reportadas por Julio Garay. La tardanza que se perdona es hasta 10:00 minutos
-- solamente, que es período de gracia.»*
--
-- La tolerancia de los 10 minutos YA existía (`asistencia_reglas.tolerancia_
-- tardanza_min`) y coincide con lo que ella hace. Lo que faltaba es la otra
-- mitad: la planilla pagaba TODOS los minutos que midió el reloj. El reloj mide
-- bien; lo que no sabe es quién autorizó qué. Por eso el cuadro nunca cuadró
-- con el de ella.
--
-- ── 🔴 SE GUARDA UN PERMISO, NUNCA UN NÚMERO DE HORAS ────────────────────────
--
-- Ésta es la decisión que sostiene el diseño, y existe por un hallazgo medido
-- contra producción el 25-ago-2026: la contadora **no cuenta las horas extra
-- como el módulo**. Su base de salida son las 16:30 y no las 17:00 (con las
-- marcaciones reales de BRICEIDA MONTERO, contando desde 16:30 da 5:32:45 —su
-- número al segundo—), su período va del 13 al 27 de julio y no del 16 al 31, y
-- redondea a cuartos de hora. Nada de eso está confirmado por Daniel todavía.
--
-- Si mañana cualquiera de las tres cambia, los minutos de todo el mundo cambian.
-- Una fila que dijera «Briceida: 5,5 h autorizadas» quedaría atada al número
-- viejo y pagaría lo de ayer sin que nadie lo note. Por eso la fila dice
-- **SÍ/NO sobre (persona, período)** y nada más: los minutos los vuelve a
-- calcular el motor de siempre con la base vigente ese día.
--
-- `minutos_vistos` es un TESTIGO, no el pago: cuántos minutos había medidos
-- cuando alguien apretó el botón. Sirve para que la pantalla pueda decir
-- «aprobaste 5,50 h y hoy son 6,20 h». Nunca se multiplica por una rata.
--
-- ── 🔴 LA LLAVE LLEVA LAS FECHAS, NO LA CLAVE DE QUINCENA ────────────────────
--
-- `asistencia_planilla_manual` guarda por quincena ("2026-07-2") porque un ISR
-- pertenece a una quincena. Una aprobación NO: el período de horas extra de la
-- contadora está corrido respecto de la quincena. Con las fechas en la llave,
-- otro período es otra aprobación y se vuelve a preguntar — que es lo correcto
-- cuando cambió lo que se está aprobando.
--
-- ── ⚠️ LA APP FUNCIONA SIN ESTE ARCHIVO ──────────────────────────────────────
--
-- Sin la tabla, `leerAprobaciones` devuelve cero filas y la planilla NO exige
-- aprobación: paga todo lo que midió el reloj, igual que hasta hoy, y lo avisa
-- en pantalla. Cerrar por falta de un SQL dejaría a treinta personas sin sus
-- extras el día de pago.
--
-- Aditiva e idempotente: no toca ninguna tabla existente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asistencia_horas_extra_aprobadas (
  -- El código del reloj, igual que en `asistencia_personas` y `asistencia_horarios`.
  empleado_codigo   text NOT NULL,

  -- El período EXACTO que se aprobó. Los dos días inclusive.
  periodo_desde     date NOT NULL,
  periodo_hasta     date NOT NULL,

  -- 🔴 TODO EL CONTENIDO DE LA DECISIÓN. `false` = se desaprobó; la fila NO se
  -- borra, porque «desaprobado por daniel» y «nadie lo miró nunca» son dos
  -- estados distintos y solo uno de los dos es un pendiente.
  aprobado          boolean NOT NULL DEFAULT true,

  -- 🔑 EL TESTIGO. Cuántos minutos de hora extra había medidos al tocar el
  -- botón. NO se paga con esto: se compara contra lo que el motor mide hoy, y
  -- si difieren la pantalla lo dice con los dos números a la vista.
  minutos_vistos    integer NOT NULL DEFAULT 0 CHECK (minutos_vistos >= 0),

  -- Quién y cuándo. Daniel lo pidió explícitamente: *"queda registro de quién
  -- aprobó qué"*. Es el usuario de `fg_users.name` que venía en la sesión.
  marcado_por       text,
  marcado_en        timestamptz NOT NULL DEFAULT now(),

  -- El rango tiene que ser un rango.
  CONSTRAINT asistencia_horas_extra_aprobadas_rango_ok
    CHECK (periodo_hasta >= periodo_desde),

  PRIMARY KEY (empleado_codigo, periodo_desde, periodo_hasta)
);

-- La pantalla siempre pregunta por un período completo, nunca por una persona
-- suelta: el índice va por las fechas.
CREATE INDEX IF NOT EXISTS asistencia_horas_extra_aprobadas_periodo_idx
  ON asistencia_horas_extra_aprobadas (periodo_desde, periodo_hasta);

-- RLS encendida SIN políticas: nadie entra con la llave pública. Todo pasa por
-- el servidor con service_role. Importa como en `asistencia_planilla_manual`:
-- esta fila decide si a alguien se le pagan sus horas extra.
ALTER TABLE asistencia_horas_extra_aprobadas ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asistencia_horas_extra_aprobadas IS
  'Quién autorizó las horas extra de cada persona en cada período. Guarda un PERMISO (sí/no), nunca una cantidad de horas: los minutos los recalcula el motor con la base de cálculo vigente. minutos_vistos es solo el testigo de cuánto había al aprobar.';

COMMENT ON COLUMN asistencia_horas_extra_aprobadas.minutos_vistos IS
  'Testigo: minutos de hora extra medidos en el momento de aprobar. NO se paga con este número, se compara contra el medido de hoy para avisar si cambió.';
