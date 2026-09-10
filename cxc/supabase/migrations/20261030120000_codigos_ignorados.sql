-- ─────────────────────────────────────────────────────────────────────────────
-- IGNORAR UN CÓDIGO — esconder sin borrar.
--
-- 🩸 POR QUÉ. Medido en producción: hay códigos que marcan en el reloj y no son
-- nadie —39, 55 y 9999, todos del «reloj cboston», pruebas y códigos mal
-- tecleados—. La lista los muestra como «Código 39 · Falta» a propósito, para
-- que NADIE QUE TRABAJE quede invisible; el precio es que la basura se cuenta
-- como trabajo pendiente para siempre.
--
-- ⚠️ El reloj NUNCA manda el nombre (0 de 1.000 marcaciones traen
-- `empleado_nombre`): el nombre siempre sale de la ficha. Por eso un código sin
-- ficha no se puede distinguir de una persona nueva mirando el dato — lo tiene
-- que decir una persona, y eso es exactamente lo que esta tabla guarda.
--
-- 🔴 TAMBIÉN PARA QUIEN SÍ TIENE FICHA. Daniel, textual: *«pon la opción de
-- ignorar código así como DANIEL LEVY código 52»* — él tiene ficha y no va en
-- planilla. O sea: ignorar es una decisión sobre el CÓDIGO, tenga ficha o no.
--
-- 🔴 LAS MARCACIONES NO SE TOCAN. `asistencia_marcaciones` es append-only y hay
-- barrido estático que lo exige; la ficha tampoco se borra. Ignorar es una
-- marca APARTE y reversible: se esconde de la lista y de los conteos, y se
-- puede volver a mostrar.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asistencia_codigos_ignorados (
  empleado_codigo text PRIMARY KEY,
  -- 🔴 REVERSIBLE, NUNCA UN DELETE: volver a mostrar apaga la marca y deja la
  -- firma de quién la puso. Un DELETE dejaría el mismo estado que «nadie lo
  -- ignoró nunca», y son dos cosas distintas.
  activo          boolean NOT NULL DEFAULT true,
  motivo          text CHECK (motivo IS NULL OR btrim(motivo) <> ''),
  ignorado_por    text NOT NULL CHECK (btrim(ignorado_por) <> ''),
  ignorado_en     timestamptz NOT NULL DEFAULT now(),
  mostrado_por    text,
  mostrado_en     timestamptz,
  -- Quien vuelve a mostrar deja su firma; los dos campos van juntos o ninguno.
  CONSTRAINT asistencia_codigos_ignorados_mostrar
    CHECK (activo OR (mostrado_por IS NOT NULL AND btrim(mostrado_por) <> '' AND mostrado_en IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS asistencia_codigos_ignorados_activos
  ON asistencia_codigos_ignorados (empleado_codigo) WHERE activo;

COMMENT ON TABLE asistencia_codigos_ignorados IS
  'Códigos del reloj que NO se muestran en Personas ni en la planilla ni en '
  'ningún conteo de pendientes. Esconde, no borra: ni las marcaciones ni la '
  'ficha se tocan, y se puede volver a mostrar.';

ALTER TABLE asistencia_codigos_ignorados ENABLE ROW LEVEL SECURITY;
