-- ─────────────────────────────────────────────────────────────────────────────
-- EL MISMO NÚMERO EN DOS RELOJES ES DOS PERSONAS (11-nov-2026).
--
-- 🩸 POR QUÉ. El número del reloj no es único entre aparatos: el 5 del «reloj
-- cboston» es Jorman (ficha 5) y el 5 del «reloj acs» es Silenys, colaboradora
-- nueva de Multifashion sin ficha. El motor agrupa solo por número, así que
-- 114 marcas de Silenys (1-oct → 2-nov-2026) cayeron en los días de Jorman y
-- la contadora quitó 57 a mano.
--
-- 🔴 QUÉ ES. Un mapeo ESCRITO A MANO: (reloj, número del reloj) → código del
-- colaborador. Se aplica al LEER las marcas, en una copia; la fila de
-- `asistencia_marcaciones` no se edita ni se borra. Sin fila para el par, la
-- marca es del número tal cual, como siempre.
--
-- 🔴 REVERSIBLE, NUNCA UN DELETE: `activo = false` apaga un alias y deja la
-- firma. Un número puede cambiar de dueño (las impulsadoras rotan): por eso la
-- llave es `id` y la unicidad del par es solo entre los ACTIVOS.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asistencia_codigo_por_reloj (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- `asistencia_marcaciones.dispositivo`: 'reloj cboston' | 'reloj acs' | …
  dispositivo      text NOT NULL CHECK (btrim(dispositivo) <> ''),
  -- El número tal como lo manda el reloj (`employeeNoString`).
  codigo_reloj     text NOT NULL CHECK (btrim(codigo_reloj) <> ''),
  -- A quién pertenece: la ficha tiene que existir.
  empleado_codigo  text NOT NULL REFERENCES asistencia_personas(empleado_codigo),
  activo           boolean NOT NULL DEFAULT true,
  nota             text CHECK (nota IS NULL OR btrim(nota) <> ''),
  creado_por       text NOT NULL CHECK (btrim(creado_por) <> ''),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  desactivado_por  text,
  desactivado_en   timestamptz,
  CONSTRAINT asistencia_codigo_por_reloj_desactivar
    CHECK (activo OR (desactivado_por IS NOT NULL AND btrim(desactivado_por) <> '' AND desactivado_en IS NOT NULL))
);

-- Un solo dueño ACTIVO por (reloj, número).
CREATE UNIQUE INDEX IF NOT EXISTS asistencia_codigo_por_reloj_par_activo
  ON asistencia_codigo_por_reloj (dispositivo, codigo_reloj) WHERE activo;

COMMENT ON TABLE asistencia_codigo_por_reloj IS
  'Mapeo escrito a mano (reloj, número) → colaborador. Se aplica al LEER las '
  'marcaciones; la fila del reloj no se toca. Sin fila, el número vale tal cual.';

-- Como todas las tablas de Asistencia: RLS prendido, sin políticas. Solo la
-- lee el servidor con `service_role`, que pasa por encima de RLS.
ALTER TABLE asistencia_codigo_por_reloj ENABLE ROW LEVEL SECURITY;
