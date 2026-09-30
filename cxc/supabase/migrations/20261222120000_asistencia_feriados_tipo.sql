-- ─────────────────────────────────────────────────────────────────────────────
-- FERIADOS: «FERIADO · SE PAGA» O «DÍA LIBRE · EL COLABORADOR DEBE LAS HORAS»
-- (30-sep-2026)
--
-- Daniel y la contable: las fiestas judías estaban cargadas en Configuración ›
-- Feriados como feriado, y el sistema las pagaba SIN deuda. La regla de Daniel:
-- «es día libre pero los colaboradores deben» las horas (8 h × rata, que solo
-- pagan las horas extra; ver `src/lib/asistencia/dia-libre-empresa.ts`).
--
-- Qué hace:
--   1. `asistencia_feriados.tipo`: 'feriado' (lo de siempre) o 'dia_libre'.
--      Todas las filas que ya existen quedan 'feriado' por el DEFAULT.
--   2. Marca 'dia_libre' SOLO las fiestas judías ya cargadas, por LISTA DE
--      FECHAS (medidas el 30-sep-2026, 26 filas) Y por nombre: si una fecha de
--      la lista tuviera otro nombre, no se toca. Ningún feriado nacional se toca.
--
-- Sin esta migración el código se comporta EXACTAMENTE como antes: todo lo de
-- la tabla es feriado y nadie queda debiendo por esas fechas.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_feriados
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'feriado'
  CHECK (tipo IN ('feriado', 'dia_libre'));

COMMENT ON COLUMN asistencia_feriados.tipo IS
  'feriado = se paga y el trabajado va al recargo 1.50 · dia_libre = se paga, sin recargo, y quien no trabajó debe 8 h (dia-libre-empresa.ts). 30-sep-2026.';

UPDATE asistencia_feriados
   SET tipo = 'dia_libre'
 WHERE fecha IN (
         -- 2026
         '2026-09-12', '2026-09-21', '2026-10-03',
         -- 2027
         '2027-04-22', '2027-04-23', '2027-04-28', '2027-04-29',
         '2027-06-11', '2027-06-12',
         '2027-10-02', '2027-10-11', '2027-10-16', '2027-10-23',
         -- 2028
         '2028-04-11', '2028-04-12', '2028-04-17', '2028-04-18',
         '2028-05-31', '2028-06-01',
         '2028-09-21', '2028-09-22', '2028-09-30',
         '2028-10-05', '2028-10-06', '2028-10-12', '2028-10-13'
       )
   AND (nombre LIKE 'Rosh Hashaná%' OR nombre LIKE 'Yom Kipur%' OR nombre LIKE 'Sucot%'
        OR nombre LIKE 'Sheminí Atzeret%' OR nombre LIKE 'Simjat Torá%'
        OR nombre LIKE 'Pésaj%' OR nombre LIKE 'Shavuot%');
