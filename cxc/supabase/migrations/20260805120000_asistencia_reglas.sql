-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — las tres tablas que definen las REGLAS del reporte.
--
-- El reporte no se puede calcular solo con las marcaciones: hace falta saber a
-- qué hora sale cada persona, qué días no cuentan como ausencia, y qué faltas
-- estaban justificadas. Eso vive acá, lo pone Daniel, y MANDA sobre iVMS.
--
-- ── 🩸 POR QUÉ `asistencia_horarios` NO ES OPCIONAL ──────────────────────────
-- El export de iVMS trae una columna `Turno` ("8 A 430" / "8 A 5"), y **está
-- mal en 12 de 31 personas** (medido el 5-ago-2026 contra los 3 archivos
-- reales): Ángela García figura "8 a 4:30" y sale 17:04 casi todos los días;
-- Carlos Noé figura "8 a 5" y sale 16:34. Peor: la columna `Horario` de iVMS
-- dice 08:00-17:00 para TODOS, así que sus propios cálculos de salida temprana
-- y horas extra están mal para 2.732 días de jornada.
--
-- Con el turno de iVMS, a Ángela le salían **584 minutos de horas extra en 11
-- días** — que en realidad es "salir a su hora normal". Descontar o pagar sobre
-- ese dato habría cobrado mal a un tercio de la gente. Por eso la hora de
-- salida la fija Daniel acá y el archivo solo sirve de punto de partida.
--
-- Aditiva e idempotente. No toca ninguna tabla existente.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Horario por persona ──────────────────────────────────────────────────────
-- La llave es el CÓDIGO del empleado en el reloj (`employeeNoString` /
-- "ID de persona"), no el nombre: los nombres cambian de grafía entre exportes
-- ("Roxana Hernandez" vs "ROXANA HERNANDEZ") y el código no.
CREATE TABLE IF NOT EXISTS asistencia_horarios (
  empleado_codigo   text PRIMARY KEY,
  -- Solo para leer la pantalla; el nombre bueno sale de las marcaciones.
  empleado_nombre   text,

  -- Entrada. Hoy todos a las 8:00, pero se guarda por si mañana no.
  entrada           time NOT NULL DEFAULT '08:00',
  -- Salida: es LO QUE SE ESTABA CALCULANDO MAL. 16:30 o 17:00 en la práctica.
  salida            time NOT NULL DEFAULT '17:00',
  -- Minutos de almuerzo. 30 por defecto; los datos reales lo confirman (la
  -- mayoría toma entre 23 y 30). Los de 60 se ponen por excepción.
  almuerzo_minutos  smallint NOT NULL DEFAULT 30 CHECK (almuerzo_minutos BETWEEN 0 AND 240),

  activo            boolean NOT NULL DEFAULT true,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE asistencia_horarios ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE asistencia_horarios IS
  'Hora de salida y almuerzo por persona. MANDA sobre el Turno de iVMS, que está mal en 12 de 31 personas.';

-- ── Justificaciones ──────────────────────────────────────────────────────────
-- 🩸 La idea es de Daniel y es la que más trabajo ahorra: *"se puede hacer que
-- en el día a día se mande al sistema quien tiene justificación, así al final
-- de la quincena no hay que estar acordándose"*. Al cerrar la quincena nadie
-- recuerda quién fue al doctor el día 14.
--
-- Es un RANGO, no un día suelto: unas vacaciones son una fila, no diez.
-- Se pueden cargar retroactivas (Daniel lo pidió explícito).
CREATE TABLE IF NOT EXISTS asistencia_justificaciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_codigo   text NOT NULL,
  desde             date NOT NULL,
  hasta             date NOT NULL,
  motivo            text NOT NULL,
  nota              text,
  registrado_por    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- Un rango al revés convertiría la ausencia en "justificada" sin cubrir
  -- ningún día — silenciosamente inútil.
  CONSTRAINT asistencia_justif_rango CHECK (hasta >= desde)
);
CREATE INDEX IF NOT EXISTS asistencia_justif_emp_idx
  ON asistencia_justificaciones (empleado_codigo, desde);
ALTER TABLE asistencia_justificaciones ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE asistencia_justificaciones IS
  'Faltas justificadas por rango de fechas. Se cargan el día que pasan o retroactivas.';

-- ── Feriados ─────────────────────────────────────────────────────────────────
-- Van APARTE de las justificaciones y no persona por persona: si el 3 de
-- noviembre hubiera que justificarlo uno a uno, aparecerían 32 ausencias.
CREATE TABLE IF NOT EXISTS asistencia_feriados (
  fecha       date PRIMARY KEY,
  nombre      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE asistencia_feriados ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE asistencia_feriados IS
  'Días que no cuentan como ausencia para nadie. Feriados de Panamá + cierres propios.';

-- Feriados nacionales de Panamá 2026 y 2027. `ON CONFLICT DO NOTHING` para que
-- correr la migración dos veces no falle ni pise un nombre editado a mano.
INSERT INTO asistencia_feriados (fecha, nombre) VALUES
  ('2026-01-01','Año Nuevo'),
  ('2026-01-09','Día de los Mártires'),
  ('2026-02-17','Carnaval'),
  ('2026-04-03','Viernes Santo'),
  ('2026-05-01','Día del Trabajador'),
  ('2026-11-03','Separación de Colombia'),
  ('2026-11-05','Día de Colón'),
  ('2026-11-10','Primer Grito de Independencia'),
  ('2026-11-28','Independencia de España'),
  ('2026-12-08','Día de la Madre'),
  ('2026-12-25','Navidad'),
  ('2027-01-01','Año Nuevo'),
  ('2027-01-09','Día de los Mártires'),
  ('2027-02-09','Carnaval'),
  ('2027-03-26','Viernes Santo'),
  ('2027-05-01','Día del Trabajador'),
  ('2027-11-03','Separación de Colombia'),
  ('2027-11-05','Día de Colón'),
  ('2027-11-10','Primer Grito de Independencia'),
  ('2027-11-28','Independencia de España'),
  ('2027-12-08','Día de la Madre'),
  ('2027-12-25','Navidad')
ON CONFLICT (fecha) DO NOTHING;
