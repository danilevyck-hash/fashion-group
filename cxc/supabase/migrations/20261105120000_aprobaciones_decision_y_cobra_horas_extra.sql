-- ─────────────────────────────────────────────────────────────────────────────
-- APROBACIONES: «No se paga» es una DECISIÓN, y «cobra horas extra» va en la
-- ficha (10-sep-2026).
--
-- Daniel, textual: «Aprobaciones es una sola lista de decisiones. Cada renglón
-- es una persona en la quincena, con sus horas extra sumadas. Dos botones: Sí
-- y No. Se decide, y el renglón se va» · «Cobra horas extra por default a
-- todos sí».
--
-- ── 🩸 EL AGUJERO ────────────────────────────────────────────────────────────
--
-- `aprobado` era true/false, y `false` significaba PENDIENTE: no existía la
-- forma de decir «lo miré y NO se paga». Lo que nadie marcaba quedaba
-- pendiente para siempre —en el aviso ámbar, frenando el cierre— aunque la
-- decisión ya estuviera tomada.
--
-- ── LO QUE CAMBIA, Y LO QUE NO ───────────────────────────────────────────────
--
--   · `decision` text: 'si' | 'no' | NULL. NULL = pendiente (sin fila también).
--   · `aprobado` SE CONSERVA y se sigue escribiendo: `decision = 'si'` ⇔
--     `aprobado = true`. El motor de planilla paga con `aprobado`, exactamente
--     como hoy; un 'no' y un pendiente NO se pagan (los dos). Lo único que un
--     'no' cambia es que deja de contar como pendiente.
--   · Backfill: lo aprobado pasa a 'si'. Lo `false` queda NULL: hoy `false` ES
--     pendiente, y convertirlo en 'no' sería decidir por quien no decidió.
--   · `asistencia_personas.cobra_horas_extra` DEFAULT true: nadie cambia.
--     Con `false`, la persona no aparece en Aprobaciones ni en el aviso, y el
--     motor no le paga extra/excedente/domingo/feriado (tardanzas, ausencias y
--     salida temprana se siguen contando). Mismo trato que el servicio
--     profesional para las horas con recargo, sin sacarla de la planilla.
--
-- Aditiva: ninguna fila cambia de valor salvo el backfill de `decision`, que
-- solo ESCRIBE donde `aprobado = true` y `decision IS NULL`. (Aplicada en
-- producción el 10-sep-2026.)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_horas_extra_aprobadas
  ADD COLUMN IF NOT EXISTS decision text
    CHECK (decision IS NULL OR decision IN ('si', 'no'));

COMMENT ON COLUMN asistencia_horas_extra_aprobadas.decision IS
  'si = se paga (equivale a aprobado = true) · no = se decidio que NO se paga · NULL = pendiente. 10-sep-2026.';

-- Acotado: solo lo que hoy esta aprobado, y solo si todavia no tiene decision.
UPDATE asistencia_horas_extra_aprobadas
   SET decision = 'si'
 WHERE aprobado = true
   AND decision IS NULL;

ALTER TABLE asistencia_personas
  ADD COLUMN IF NOT EXISTS cobra_horas_extra boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN asistencia_personas.cobra_horas_extra IS
  'true (default) = sus horas extra pasan por Aprobaciones y se pagan si se aprueban. false = no cobra horas extra: no sale en Aprobaciones ni en el aviso, y el motor no le paga extra, excedente, domingo ni feriado (tardanzas y ausencias siguen). 10-sep-2026.';
