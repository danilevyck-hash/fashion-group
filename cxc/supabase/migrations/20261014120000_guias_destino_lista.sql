-- ═════════════════════════════════════════════════════════════════════════════
-- guias_destino_lista — LA LISTA DE DESTINOS QUE OFRECE EL CAMPO DIRECCIÓN,
-- compartida por todo el equipo (7-sep-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- 🩸 Por qué existe. Esa lista vivía en el `localStorage` del navegador
-- (`fg_direcciones`, `loadList`/`saveList`): un destino que agregaba Angela NO
-- lo veía nadie más, y NO se podía quitar desde ninguna pantalla — se podía
-- agregar, nunca borrar. Así quedó vivo para siempre un destino de prueba
-- llamado «hola» en un solo navegador.
--
-- Daniel, textual (7-sep-2026): *«lo de solo ver en mi pantalla no tiene
-- lógica, el sistema debe de trabajar todo igual, que sea para todo»* y
-- *«quítame hola»*.
--
-- 🔴 LA SEMILLA SALE DE LO QUE DE VERDAD SE USA, NUNCA DEL localStorage DE
-- NADIE — por eso «hola» no entra. Medido contra producción el 7-sep-2026
-- sobre los 536 renglones vivos de las 225 guías vivas: 77 grafías distintas
-- que, agrupadas por `claveDestino` (regla exacta, jamás por parecido), son 55
-- destinos. Entran los que se usaron **3 veces o más**: son **17** y cubren
-- **490 de 536 renglones = 91,4%**. Los 38 restantes son de un solo uso
-- («Z15 (ENTREGA EN SPORTCORNER)», «Albrook Pasillo del tigre fenre al
-- costo»…): no son una lista, son lo que se escribió una vez.
--
-- De cada grupo se ofrece la **grafía más usada**, tal cual está escrita —
-- nunca una normalizada: inventar una grafía estrena UNA MÁS de escribir lo
-- mismo, que es justo lo que esto viene a evitar (la lección de
-- `destinosHistoricos`). La única excepción es cuando Daniel YA definió esa
-- grafía en `guias_destino_cliente` (misma clave exacta): ahí manda la suya —
-- «Penonomé» y no «Penonome», «Chorrera» y no «CHORRERA».
--
-- ⚠️ Quedan sembrados «CALLE 19» (13 usos) y «Wesland» (4, el typo de
-- Westland) porque son uso REAL, no invento. La diferencia con antes es que
-- ahora se pueden quitar de un toque en Guías › Configuración.
--
-- 🔴 SOFT DELETE FIRMADO, NUNCA DELETE — el mismo patrón que
-- `guias_destino_cliente` y `comision_exclusion`. Única solo entre ACTIVAS: un
-- destino quitado se puede volver a agregar (dos filas, una activa).
-- RLS: solo service_role; la app entra por el cliente del servidor y la ruta
-- exige rol.
--
-- 🔴 Esta tabla NO toca `guia_items`: cero UPDATE al histórico (es lo que el
-- transportista firmó). Solo alimenta el `<datalist>` del campo Dirección.
--
-- ⚠️ Es OTRA cosa que `guias_destino_cliente`: aquella son los destinos DE UN
-- CLIENTE (botones y autollenado); ésta es la lista general que ofrece el
-- campo a todos. No se fusionan: una tiene dueño, la otra no.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) La tabla ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guias_destino_lista (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- El destino TAL CUAL se ofrece en el campo y se escribe en la guía.
  destino          text NOT NULL,
  -- Soft delete. false = ya no se ofrece; la fila se queda como historial.
  activo           boolean NOT NULL DEFAULT true,
  creado_por       text NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  desactivado_por  text,
  desactivado_en   timestamptz,
  CONSTRAINT guias_destino_lista_no_vacio
    CHECK (destino = BTRIM(destino) AND destino <> ''),
  -- Una desactivación se firma: sin quién ni cuándo, no hay soft delete.
  CONSTRAINT guias_destino_lista_baja_firmada
    CHECK (activo OR (desactivado_por IS NOT NULL AND desactivado_en IS NOT NULL))
);

-- Único entre ACTIVOS: el mismo destino no puede ofrecerse dos veces a la vez,
-- pero sí pudo quitarse y volver a agregarse (dos filas, una activa).
-- ⚠️ Este índice compara el TEXTO EXACTO; que «David» y «DAVID» no convivan lo
-- decide el servidor con `claveDestino` (la misma regla de los botones), antes
-- de insertar. Acá no se puede: la clave exige normalizar acentos y dígitos.
CREATE UNIQUE INDEX IF NOT EXISTS guias_destino_lista_activo_unico
  ON guias_destino_lista (destino)
  WHERE activo;

ALTER TABLE guias_destino_lista ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'guias_destino_lista' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON guias_destino_lista
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Sin DELETE a propósito: quitar = activo = false.
GRANT SELECT, INSERT, UPDATE ON guias_destino_lista TO service_role;

COMMENT ON TABLE guias_destino_lista IS
  'Lista general de destinos que ofrece el campo Dirección de Guías, '
  'compartida por todo el equipo (antes vivía en localStorage: fg_direcciones). '
  'Se administra en Guías › Configuración. Soft delete (activo=false) firmado, '
  'NUNCA DELETE. Es OTRA cosa que guias_destino_cliente (destinos POR cliente).';
COMMENT ON COLUMN guias_destino_lista.destino IS
  'Texto tal cual se ofrece y se escribe en guia_items.direccion.';

-- ─── 2) La semilla: los 17 destinos con 3+ usos (medido el 7-sep-2026) ───────
-- El número entre paréntesis son los renglones vivos agrupados por clave.
INSERT INTO guias_destino_lista (destino, creado_por, creado_en)
VALUES
  ('Paso Canoas',            'sistema', '2026-09-07 12:00:00-05'),  -- 210
  ('David',                  'sistema', '2026-09-07 12:00:00-05'),  -- 112
  ('Santiago',               'sistema', '2026-09-07 12:00:00-05'),  --  29
  ('Changuinola',            'sistema', '2026-09-07 12:00:00-05'),  --  24
  ('Albrook',                'sistema', '2026-09-07 12:00:00-05'),  --  18
  ('Guabito',                'sistema', '2026-09-07 12:00:00-05'),  --  14
  ('Calle 19 Central',       'sistema', '2026-09-07 12:00:00-05'),  --  14
  ('CALLE 19',               'sistema', '2026-09-07 12:00:00-05'),  --  13
  ('Sport Corner Calidonia', 'sistema', '2026-09-07 12:00:00-05'),  --  11
  ('Penonomé',               'sistema', '2026-09-07 12:00:00-05'),  --  10 (grafía de Daniel; el histórico dice «Penonome»)
  ('Las Tablas',             'sistema', '2026-09-07 12:00:00-05'),  --   9
  ('Aguadulce',              'sistema', '2026-09-07 12:00:00-05'),  --   6
  ('Chorrera',               'sistema', '2026-09-07 12:00:00-05'),  --   5 (grafía de Daniel; el histórico dice «CHORRERA»)
  ('Bugaba',                 'sistema', '2026-09-07 12:00:00-05'),  --   4
  ('Wesland',                'sistema', '2026-09-07 12:00:00-05'),  --   4 (typo real de Westland: se puede quitar en Configuración)
  ('Los Andes',              'sistema', '2026-09-07 12:00:00-05'),  --   4
  ('Metromall',              'sistema', '2026-09-07 12:00:00-05')   --   3
ON CONFLICT DO NOTHING;
