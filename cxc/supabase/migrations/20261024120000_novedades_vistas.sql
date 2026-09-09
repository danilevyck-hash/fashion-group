-- ═════════════════════════════════════════════════════════════════════════════
-- «Qué cambió» — quién ya leyó cada novedad (9-sep-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel: *«a cada usuario que entre a cada módulo le salga mensajito de que hay
-- nuevo o qué cambió»* — y, aparte, que él pueda **ver la lista y saber cuántas
-- personas ya la vieron**.
--
-- 🔴 POR QUÉ UNA TABLA Y NO `localStorage`. «Qué leí yo» ES un dato de la
-- persona, no del equipo, así que la regla 2 de la casa (lo que alguien agrega
-- queda para todos) NO lo manda al servidor por sí sola. Lo que lo manda es la
-- otra mitad del encargo: **el conteo**. Un `localStorage` vive dentro de UN
-- navegador y no lo puede leer nadie más — ni Daniel, ni la misma persona desde
-- el iPad. Con eso, «cuántas personas ya la vieron» no se puede contestar nunca.
--
-- ⚠️ `localStorage` NO se va: se queda como respaldo del mismo dato personal, y
-- por dos razones medidas contra cómo se comporta este repo:
--   1. Mientras esta DDL no corra —y en este repo eso puede tardar días— cerrar
--      un aviso tiene que funcionar igual. Sin el respaldo local, la tira
--      volvería a salir en cada carga y sería peor que no tenerla.
--   2. La × tiene que apagar la tira EN EL ACTO, sin esperar a la red.
-- La tabla manda; el navegador acompaña. Se leen los dos y se unen.
--
-- 🔴 NO HAY SOFT DELETE Y ES A PROPÓSITO. Acá no se «borra» nada: una fila dice
-- que alguien leyó algo un día. Lo único que se le hace es nacer.
--
-- ⚠️ Sin fila = no la ha visto. Una novedad que no llega a los 30 días de
-- vigencia deja de mostrarse sola, así que las filas viejas envejecen a
-- propósito y no hay que podarlas.
--
-- La migración es ADITIVA: crea una tabla nueva y no toca ni una fila de nada.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS novedades_vistas (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Quién. El id de `fg_users`, no el nombre: la identidad es el CÓDIGO.
  usuario_id      text NOT NULL,
  -- El nombre AL MOMENTO de leerla, solo para que la pantalla de Daniel pueda
  -- decir quiénes fueron sin tener que cruzar nada. No es la identidad.
  usuario_nombre  text NOT NULL,
  -- El `id` de la novedad en `src/lib/novedades/lista.ts`. Empieza con la key
  -- del módulo, así que dos módulos no pueden chocar.
  novedad_id      text NOT NULL,
  visto_en        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT novedades_vistas_no_vacio
    CHECK (usuario_id <> '' AND novedad_id <> ''),
  -- Cerrar dos veces la misma novedad es la misma lectura, no dos.
  CONSTRAINT novedades_vistas_una_por_persona UNIQUE (usuario_id, novedad_id)
);

-- La pregunta que se hace en cada carga de pantalla: «¿qué cerró esta persona?».
CREATE INDEX IF NOT EXISTS novedades_vistas_por_usuario
  ON novedades_vistas (usuario_id);

-- La pregunta de la pantalla de Daniel: «¿quiénes cerraron esta novedad?».
CREATE INDEX IF NOT EXISTS novedades_vistas_por_novedad
  ON novedades_vistas (novedad_id);

COMMENT ON TABLE novedades_vistas IS
  'Quién ya cerró cada aviso de «qué cambió». Se escribe desde /api/novedades. '
  'Sin fila = no la ha visto. Ver src/lib/novedades/lista.ts.';

-- ─── RLS: solo el servidor (service_role), como el resto de las tablas nuevas ─
ALTER TABLE novedades_vistas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'novedades_vistas' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON novedades_vistas
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
