-- ─────────────────────────────────────────────────────────────────────────────
-- LAS HORAS EXTRA SE APRUEBAN POR DÍA, NO POR PERÍODO.
--
-- Daniel, 27-ago-2026: *«debe de ser que el usuario entre y vea por dias
-- quienes y cuantas horas, y pueda aprobar seleccionando todos o
-- individualmente, por dia, por semana»*.
--
-- ── 🔴 POR QUÉ EL DÍA, Y NO ES UNA PREFERENCIA DE PANTALLA ───────────────────
--
-- La contadora mueve el corte del período de horas extra: cuenta del 13 al 27,
-- no del 16 al 31, y ella misma avisó que *«las fechas van a variar»*. Con la
-- aprobación guardada por (persona, período), la llave lleva las fechas adentro
-- — así que cada vez que ella corre el corte se vuelve a preguntar TODO desde
-- cero, y Julio aprueba dos veces lo mismo.
--
-- Guardado por DÍA, el corte deja de importar: Julio autoriza «el martes 5
-- Kevin se quedó hasta las 7», y el período que la contadora arme después
-- recoge los días que caen adentro, corte donde corte.
--
-- ⚠️ Aprobar «por semana» o «todo» es cómo se SELECCIONA en la pantalla. Lo que
-- se guarda es siempre una fila por persona y día: una selección cómoda no
-- puede volverse una unidad de datos, o vuelve el problema del período.
--
-- ── SE PUEDE RECREAR SIN PERDER NADA ─────────────────────────────────────────
--
-- La tabla vieja está VACÍA: se creó hoy (26-ago) y nadie llegó a aprobar —
-- medido antes de escribir esto, 0 filas. Por eso se recrea en vez de migrarse.
-- Si algún día tuviera filas, esto habría que hacerlo al revés: primero
-- repartir cada período en sus días y recién después cambiar la llave.
--
-- Idempotente. No toca ninguna otra tabla.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS asistencia_horas_extra_aprobadas;

CREATE TABLE asistencia_horas_extra_aprobadas (
  empleado_codigo   text NOT NULL,

  -- 🔑 EL DÍA. Un día es un hecho: «esta persona se quedó hasta las 7 el
  -- martes». No depende de dónde alguien decida cortar la quincena.
  fecha             date NOT NULL,

  aprobado          boolean NOT NULL DEFAULT true,

  -- El TESTIGO: cuántos minutos había medidos al aprobar. NO se paga con esto
  -- —los minutos los recalcula el motor con la base vigente—: sirve para poder
  -- decir «aprobaste 2,50 h y hoy son 3,10 h» si se corrige una marcación.
  minutos_vistos    integer NOT NULL DEFAULT 0 CHECK (minutos_vistos >= 0),

  marcado_por       text,
  marcado_en        timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (empleado_codigo, fecha)
);

-- La pantalla siempre pide un rango de días.
CREATE INDEX asistencia_horas_extra_aprobadas_fecha_idx
  ON asistencia_horas_extra_aprobadas (fecha);

-- RLS encendida SIN políticas: todo pasa por el servidor con service_role.
-- Esta fila decide si a alguien se le pagan sus horas extra.
ALTER TABLE asistencia_horas_extra_aprobadas ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asistencia_horas_extra_aprobadas IS
  'Un renglón por persona y DÍA: quién autorizó las horas extra de ese día. Guarda un PERMISO (sí/no), nunca una cantidad de horas — los minutos los recalcula el motor. Por día y no por período porque el corte de la quincena lo mueve la contadora.';
