-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA: «Trabaja afuera» va en la ficha (14-sep-2026).
--
-- Daniel, textual: «a ellas cuando están afuera se les paga el día regular
-- como si hubiesen trabajado las 8 horas, en horario de 9-6, con una hora de
-- almuerzo» · «cuando marcan, que es cuando trabajan en la tienda, trabajan de
-- 10 a 7».
--
-- ── 🩸 EL AGUJERO ────────────────────────────────────────────────────────────
--
-- Ana Trejos (2) y Cindy De Gracia (3) son impulsadoras y no marcan el reloj
-- casi nunca (1 día de 22 hábiles, 16-ago → 15-sep). El sistema contaba cada
-- día sin marca como ausencia y se la descontaba; la contadora pagaba el mes
-- completo a mano. Rodrigo Miranda (13): $296,26 de diferencia en una quincena.
--
-- ── LO QUE CAMBIA, Y LO QUE NO ───────────────────────────────────────────────
--
--   · `asistencia_personas.trabaja_afuera` boolean NOT NULL DEFAULT false.
--     Con `true`, un día hábil sin marca y sin otra explicación se paga como un
--     día normal (es «Trabajo de vendedor» puesto solo); el día que SÍ marca se
--     mide del reloj exactamente como hoy. Feriados, fines de semana,
--     vacaciones y justificaciones cargadas mandan igual que siempre.
--   · NO es `no_marca_reloj` (esa apaga el reloj siempre); las dos conviven.
--   · DEFAULT false: nadie la tiene al aplicar y NINGÚN neto cambia. Daniel la
--     prende ficha por ficha (nombró a 2, 3 y 13; Yeisibeth no tiene ficha).
--
-- Aditiva. Ninguna fila cambia de valor. 🔴 SIN APLICAR al 14-sep-2026: el
-- código lee la columna aparte y, mientras no exista, se comporta como hoy.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_personas
  ADD COLUMN IF NOT EXISTS trabaja_afuera boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN asistencia_personas.trabaja_afuera IS
  'true = trabaja afuera (impulsadora/vendedor): un dia habil sin marca y sin otra explicacion se paga completo, como Trabajo de vendedor puesto solo; el dia que marca se mide del reloj como siempre. false (default) = el dia sin marca es ausencia. No es no_marca_reloj. 14-sep-2026.';
