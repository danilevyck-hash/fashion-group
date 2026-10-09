-- «TIEMPO NO LABORADO» EN SU PROPIA COLUMNA (9-oct-2026).
--
-- Daniel: el tiempo fuera durante la jornada que pasa del almuerzo permitido
-- (con su gracia de 5 min) se descuenta en SU columna, separada de «Salida
-- temprana», para que la contable no lo confunda con alguien que se fue
-- temprano. El cierre congela columna por columna (`COLUMNAS_DINERO` /
-- `COLUMNAS_HORAS`), así que la cifra nueva necesita su columna.
-- Aditiva: ninguna fila cambia. Las planillas ya cerradas quedan con
-- `tiempo_no_laborado` en NULL (no existía) y los minutos en 0.

ALTER TABLE asistencia_planilla_guardada_linea
  ADD COLUMN IF NOT EXISTS tiempo_no_laborado_min numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tiempo_no_laborado numeric(14,2);

COMMENT ON COLUMN asistencia_planilla_guardada_linea.tiempo_no_laborado_min IS
  'Minutos fuera durante la jornada que pasan del almuerzo permitido (con su gracia). 9-oct-2026.';
COMMENT ON COLUMN asistencia_planilla_guardada_linea.tiempo_no_laborado IS
  'Lo descontado por tiempo no laborado (minutos x valor del minuto). NULL = cierre de antes del 9-oct-2026.';
