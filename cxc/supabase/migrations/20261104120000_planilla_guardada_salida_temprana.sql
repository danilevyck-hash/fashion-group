-- LA SALIDA TEMPRANA SE DESCUENTA Y EL PRORRATEO SE CONGELA (10-sep-2026).
--
-- Daniel, textual, sobre el backtest contra los Excel de la contable: «b, se
-- descuenta obvio» (salir antes de la hora; y sobre la tolerancia: «si salió
-- 20 minutos antes no debería de haber tolerancia») y «c, se paga días
-- trabajados» (quien entra o sale a mitad de la quincena). El cierre congela
-- las cifras de dinero y del reloj columna por columna (`COLUMNAS_DINERO` /
-- `COLUMNAS_HORAS`), así que las cifras nuevas necesitan su columna; y el
-- texto del prorrateo se guarda para poder explicar el número después.
-- Aditiva: ninguna fila cambia. (Aplicada en producción el 10-sep-2026.)

ALTER TABLE asistencia_planilla_guardada_linea
  ADD COLUMN IF NOT EXISTS salida_temprana_min numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salida_temprana numeric(14,2),
  ADD COLUMN IF NOT EXISTS prorrateo text;

COMMENT ON COLUMN asistencia_planilla_guardada_linea.salida_temprana_min IS
  'Minutos de salida antes de la hora, desde el primero (sin tolerancia). 10-sep-2026.';
COMMENT ON COLUMN asistencia_planilla_guardada_linea.salida_temprana IS
  'Lo descontado por salir antes de la hora (minutos x valor del minuto). 10-sep-2026.';
COMMENT ON COLUMN asistencia_planilla_guardada_linea.prorrateo IS
  'Texto del prorrateo de quien entro o salio a mitad del periodo. NULL = periodo entero.';
