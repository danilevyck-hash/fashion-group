-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — los días y los dos horarios, configurables por persona
-- (18-sep-2026). ⚠️ SIN APLICAR: la corre Daniel.
--
-- Daniel, textual:
--   *«todo eso de horario que sea configurable por si hay cambios en un futuro»*
--   *«multifashion sus dias laborales es de lunes a sabado»*
--   *«Ana · Cindy · Yeisibeth su horario es de 9-18 cuando estan afuera. cuando
--   estan afuera marcan por el sistema marcaciones. al igual rodrigo, su
--   horario cambia cuando esta afuera y usa el celular de 10-1830»*
--   *«que se fije por la primera marcacion pues»*
--
-- 🔴 ADITIVA Y ACOTADA. Tres columnas nuevas en `asistencia_horarios`, todas
-- NULL por defecto, y NO se toca `entrada`, `salida` ni `almuerzo_minutos`.
--
--   · dias_laborables  — los días que trabaja (1 = lunes … 6 = sábado).
--                        NULL = manda la EMPRESA de la ficha: Multifashion
--                        lunes a sábado, las otras lunes a viernes (el mapa
--                        vive en `lib/asistencia/horario-configurable.ts`).
--                        🔴 El domingo (0) no entra: sigue libre y con su
--                        recargo. El CHECK lo prohíbe.
--   · entrada_afuera   — el horario de cuando marca por el TELÉFONO.
--   · salida_afuera      NULL = el mismo de adentro, campo por campo.
--
-- 🔴 FALLA ABIERTA: mientras esto no corra, la app lee las columnas, ve que
-- no existen y se comporta EXACTAMENTE como hoy (lunes a viernes, un horario).
--
-- ── Lo que cambia el día que corre (medido contra producción el 18-sep-2026) ──
-- Multifashion pasa a trabajar lunes a SÁBADO. Un sábado sin marca es una
-- ausencia con su descuento de 8 horas; un sábado con marca es un día normal
-- (sin recargo: el quincenal ya lo paga) y desaparece el aviso «trabajó un
-- sábado: esas horas no se pagan aquí». Las otras siete empresas: 0 cambios.
-- ⚠️ El sábado 12-sep-2026 no marcó NADIE en Multifashion (una sola marca
-- suelta de Angel Pizza a las 19:15): huele a tienda cerrada o reloj caído,
-- no a siete faltas. Si ese día la tienda no abrió, va como FERIADO
-- (Asistencia › Configuración › Feriados) o con justificación, ANTES de cerrar
-- la quincena.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_horarios
  ADD COLUMN IF NOT EXISTS dias_laborables smallint[],
  ADD COLUMN IF NOT EXISTS entrada_afuera  time,
  ADD COLUMN IF NOT EXISTS salida_afuera   time;

-- Solo lunes (1) a sábado (6), sin vacíos: una lista vacía sería «no trabaja
-- ningún día» y esa persona no tendría ausencias nunca. NULL sí vale (manda la
-- empresa).
ALTER TABLE asistencia_horarios
  DROP CONSTRAINT IF EXISTS asistencia_horarios_dias_laborables_chk;
ALTER TABLE asistencia_horarios
  ADD CONSTRAINT asistencia_horarios_dias_laborables_chk CHECK (
    dias_laborables IS NULL
    OR (
      cardinality(dias_laborables) BETWEEN 1 AND 6
      AND dias_laborables <@ ARRAY[1, 2, 3, 4, 5, 6]::smallint[]
    )
  );

COMMENT ON COLUMN asistencia_horarios.dias_laborables IS
  'Los días que trabaja esta persona (1 = lunes … 6 = sábado). NULL = manda la empresa de la ficha (Multifashion lunes a sábado; las otras lunes a viernes). El domingo nunca entra: sigue libre, con su recargo. Un día laborable sin marca es ausencia.';
COMMENT ON COLUMN asistencia_horarios.entrada_afuera IS
  'Hora de entrada cuando la PRIMERA marca del día vino del teléfono (trabaja afuera). NULL = la misma `entrada` de siempre.';
COMMENT ON COLUMN asistencia_horarios.salida_afuera IS
  'Hora de salida cuando la PRIMERA marca del día vino del teléfono (trabaja afuera). NULL = la misma `salida` de siempre.';

-- ── Lo que Daniel dictó, persona por persona ─────────────────────────────────
-- Por CÓDIGO y por lista, nunca por nombre ni por empresa. Nadie ha marcado por
-- el teléfono todavía (medido: 0 marcas de Ana, Cindy, Yeisibeth y Rodrigo
-- desde el 1-ago-2026), así que esto no mueve un centavo el día que corre.
-- Solo se llena lo que está vacío: si alguien ya lo escribió desde la
-- pantalla, no se pisa.
UPDATE asistencia_horarios
   SET entrada_afuera = '09:00', salida_afuera = '18:00', updated_at = now()
 WHERE empleado_codigo IN ('2', '3', '306')          -- Ana Trejos · Cindy De Gracia · Yeisibeth Muñoz
   AND entrada_afuera IS NULL AND salida_afuera IS NULL;

UPDATE asistencia_horarios
   SET entrada_afuera = '10:00', salida_afuera = '18:30', updated_at = now()
 WHERE empleado_codigo = '13'                        -- Rodrigo Miranda
   AND entrada_afuera IS NULL AND salida_afuera IS NULL;
