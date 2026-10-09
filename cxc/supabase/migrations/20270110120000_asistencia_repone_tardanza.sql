-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA: «Compensación de tardanza» va en la ficha (9-oct-2026).
--
-- Daniel aprobó «Repone tardanza», por colaborador: quien la tiene prendida
-- repone la tardanza quedándose más tarde ESE MISMO DÍA, minuto por minuto, sin
-- descuento y sin cobrar extra por esos minutos. Lo que sobre sigue la regla de
-- siempre de la hora extra (mínimo 10, 1,25 / 1,50, Aprobaciones).
-- Regla en `src/lib/asistencia/repone-tardanza.ts`.
--
--   · `asistencia_personas.repone_tardanza` boolean NOT NULL DEFAULT false.
--   · DEFAULT false: nadie la tiene al aplicar y NINGÚN neto cambia. Daniel la
--     prende ficha por ficha.
--
-- Aditiva. Ninguna fila cambia de valor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_personas
  ADD COLUMN IF NOT EXISTS repone_tardanza boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN asistencia_personas.repone_tardanza IS
  'true = compensacion de tardanza: el tiempo despues de la hora de salida borra la tardanza del mismo dia, minuto por minuto, y esos minutos no son hora extra; lo que sobra sigue la regla normal de horas extra. false (default) = tardanza y extra separadas, como siempre. 9-oct-2026.';
