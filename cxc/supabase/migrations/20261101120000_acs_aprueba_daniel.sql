-- ─────────────────────────────────────────────────────────────────────────────
-- ACS: LAS HORAS EXTRA LAS APRUEBA DANIEL.
--
-- Daniel, textual: *«acs lo aprueba daniel»*.
--
-- 🔑 APROBAR ≠ CERRAR, y esta migración es justo esa distinción:
--   · APROBAR horas extra se reparte por empresa (`asistencia_aprobador_empresa`).
--     En ACS lo hace Daniel.
--   · CERRAR la quincena lo hace la contadora, en las CUATRO, y NO depende de
--     esta tabla desde el 10-sep-2026 (ver `alcanceDe`: quien cierra alcanza a
--     todas). Sacarla de acá NO le quita el cierre de ACS.
--
-- ⚠️ `admin` pasa siempre sin consultar esta tabla — la fila de `daniel` se
-- escribe igual, para que la tabla diga la verdad de quién aprueba qué en vez
-- de dejarlo implícito en un `if` del código.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO asistencia_aprobador_empresa (usuario, empresa)
VALUES ('daniel', 'american_classic')
ON CONFLICT DO NOTHING;

-- 🔴 La contadora NO aprueba las horas de ACS. Sigue cerrando su quincena.
DELETE FROM asistencia_aprobador_empresa
WHERE usuario = 'Contabilidad' AND empresa = 'american_classic';

-- ── LOS 30 MINUTOS AUTOMÁTICOS, CONGELADOS CON EL CUADRO ────────────────────
--
-- Daniel: *«ya by default allá trabajan hasta las 7pm, así que siempre sin
-- aprobación ganan 30 mins de horas extras»*.
--
-- 🔴 SE GUARDA CUÁNTO FUE AUTOMÁTICO. Sin esta columna, una quincena vieja de
-- ACS se reimprimiría con horas extra que nadie aprobó y sin nada que explique
-- por qué se pagaron — que es exactamente el susto que la regla tiene que
-- evitar. Es la misma razón por la que se guardan los minutos de tardanza y no
-- solo su monto.
--
-- ⚠️ ADITIVA: nace en 0, y en las otras tres empresas se queda en 0 para
-- siempre.
ALTER TABLE asistencia_planilla_guardada_linea
  ADD COLUMN IF NOT EXISTS extra_auto_min numeric(14,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN asistencia_planilla_guardada_linea.extra_auto_min IS
  'Minutos de hora extra que se pagaron SIN aprobación porque son el horario de '
  'la tienda (ACS cierra a las 7 p.m.). Ya están dentro de extra_diurno_min / '
  'extra_nocturno_min: es un DESGLOSE, no se suma.';
