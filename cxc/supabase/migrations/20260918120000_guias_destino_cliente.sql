-- ═════════════════════════════════════════════════════════════════════════════
-- guias_destino_cliente — los destinos definidos de cada cliente, EN LA BASE
-- ═════════════════════════════════════════════════════════════════════════════
-- 🩸 Por qué existe (4-sep-2026): los destinos definidos vivían en una
-- constante de código (`DESTINOS_DEFINIDOS`, src/lib/guias/destinos-clientes.ts),
-- así que cada corrección de Daniel necesitaba un despliegue. Las dos que
-- dispararon esto, textual:
--   «city shoes → Calle 19 Central, al lado de la joyería Super Oro.
--    Y Nine Sport en Calle 19 Central.»
-- Ahora se corrigen desde Guías › Configuración (admin y secretaria — Daniel:
-- «configuraciones también deja a secretaria»), sin tocar código.
--
-- Grano: (cliente_codigo, destino) — un cliente puede tener varios destinos
-- (Sporting Shoes N 4 tiene 8). Las TIENDAS van como COLUMNA de este mismo
-- grano (`tiendas text[]`), no como tabla hermana: solo UN cliente las usa
-- (D-142), una tabla aparte obligaría a un segundo CRUD y a un JOIN por un
-- solo caso, y el soft delete del destino se lleva sus tiendas con él (no
-- pueden quedar tiendas huérfanas de un destino quitado).
--
-- 🔴 SOFT DELETE FIRMADO, NUNCA DELETE — el mismo patrón que comision_exclusion:
-- quitar = `activo = false` + quién y cuándo. Es historial de decisiones sobre
-- a dónde va la mercancía. Única solo entre ACTIVAS: se puede quitar y volver
-- a definir (dos filas, una activa). RLS: solo service_role — la app entra por
-- el cliente del servidor y la ruta exige rol.
--
-- 🔴 Esta tabla NO toca `guia_items`: cero UPDATE al histórico (es lo que el
-- transportista firmó). Solo alimenta los botones y el autollenado del
-- formulario, vía /api/guias/frecuencias → destinos-clientes.ts.
--
-- Precedencia (una sola función: `destinosDefinidosPara`, destinos-clientes.ts):
-- tabla (si hay filas activas para ese cliente) → constante estática (red
-- mientras esta migración no corra) → histórico agrupado de guia_items.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) La tabla ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guias_destino_cliente (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Código del cliente (D-XXX), en mayúsculas y sin bordes: es la identidad.
  cliente_codigo   text NOT NULL,
  -- El destino TAL CUAL se muestra en el botón, se autollena y se imprime.
  destino          text NOT NULL,
  -- Las tiendas de ese destino (solo Sporting Shoes las usa hoy): «5», «6»,
  -- «Mas Flow». Vacío = sin renglón de tienda.
  tiendas          text[] NOT NULL DEFAULT '{}',
  -- Orden de los botones (el más usado primero). Se asigna al crear.
  orden            integer NOT NULL DEFAULT 1,
  -- Soft delete. false = ya no se ofrece; la fila se queda como historial.
  activo           boolean NOT NULL DEFAULT true,
  creado_por       text NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  desactivado_por  text,
  desactivado_en   timestamptz,
  CONSTRAINT guias_destino_cliente_codigo_normalizado
    CHECK (cliente_codigo = UPPER(BTRIM(cliente_codigo)) AND cliente_codigo <> ''),
  CONSTRAINT guias_destino_cliente_destino_no_vacio
    CHECK (destino = BTRIM(destino) AND destino <> ''),
  -- Una desactivación se firma: sin quién ni cuándo, no hay soft delete.
  CONSTRAINT guias_destino_cliente_baja_firmada
    CHECK (activo OR (desactivado_por IS NOT NULL AND desactivado_en IS NOT NULL))
);

-- Única entre ACTIVAS: el mismo (cliente, destino) no puede ofrecerse dos veces
-- a la vez, pero sí pudo quitarse y volver a definirse (dos filas, una activa).
-- Es también el índice de la lectura por cliente.
CREATE UNIQUE INDEX IF NOT EXISTS guias_destino_cliente_activo_unico
  ON guias_destino_cliente (cliente_codigo, destino)
  WHERE activo;

ALTER TABLE guias_destino_cliente ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'guias_destino_cliente' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON guias_destino_cliente
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Sin DELETE a propósito: quitar = activo = false.
GRANT SELECT, INSERT, UPDATE ON guias_destino_cliente TO service_role;

COMMENT ON TABLE guias_destino_cliente IS
  'Destinos definidos por cliente para el formulario de Guías (botones y '
  'autollenado). Se administra en Guías › Configuración (admin y secretaria). '
  'Soft delete (activo=false) firmado, NUNCA DELETE. Precedencia: esta tabla → '
  'constante DESTINOS_DEFINIDOS → histórico de guia_items.';
COMMENT ON COLUMN guias_destino_cliente.destino IS
  'Texto tal cual se muestra en el botón y se escribe en guia_items.direccion.';
COMMENT ON COLUMN guias_destino_cliente.tiendas IS
  'Tiendas del destino (Sporting Shoes: Westland 5/6/14/Mas Flow…). Columna y '
  'no tabla hermana: un solo cliente las usa y el soft delete las arrastra.';

-- ─── 2) La carga inicial: los definidos de HOY ───────────────────────────────
-- Es EXACTAMENTE lo que la constante DESTINOS_DEFINIDOS + TIENDAS_POR_CLIENTE
-- ya hacen en producción (incluidas las dos correcciones de Daniel del
-- 4-sep-2026, que también entraron a la constante como red): encender la
-- pantalla no cambia ni un comportamiento.
INSERT INTO guias_destino_cliente (cliente_codigo, destino, tiendas, orden, creado_por, creado_en)
VALUES
  -- Los definidos por Daniel el 4-sep-2026 (tabla textual en destinos-clientes.ts)
  ('D-81',  'Paso Canoas',              '{}', 1, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-156', 'Changuinola',              '{}', 1, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-117', 'Guabito',                  '{}', 1, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-87',  'Guabito',                  '{}', 1, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-25',  'Paso Canoas',              '{}', 1, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-144', 'Albrook',                  '{}', 1, 'daniel', '2026-09-04 12:00:00-05'),
  -- D-26 quedó con su único destino propio; la familia City Moda entrega en
  -- Sport Corner Calidonia (cada «tienda» de City Moda es OTRO cliente).
  ('D-26',  '5 de Mayo',                '{}', 1, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-27',  'Sport Corner Calidonia',   '{}', 1, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-28',  'Sport Corner Calidonia',   '{}', 1, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-29',  'Sport Corner Calidonia',   '{}', 1, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-31',  'Sport Corner Calidonia',   '{}', 1, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-32',  'Sport Corner Calidonia',   '{}', 1, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-34',  'Sport Corner Calidonia',   '{}', 1, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-42',  'Sport Corner Calidonia',   '{}', 1, 'daniel', '2026-09-04 12:00:00-05'),
  -- Sporting Shoes N 4: 8 destinos, con sus tiendas ya usadas (verificadas
  -- contra el histórico el 4-sep-2026).
  ('D-142', 'Westland',          '{5,6,14,"Mas Flow"}', 1, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-142', 'Albrook',           '{7,8,9}',             2, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-142', 'Los Andes',         '{3,4}',               3, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-142', 'Santiago',          '{}',                  4, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-142', 'Penonomé',          '{}',                  5, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-142', 'Metromall',         '{10}',                6, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-142', 'Megamall',          '{}',                  7, 'daniel', '2026-09-04 12:00:00-05'),
  ('D-142', 'Outlet Vía España', '{}',                  8, 'daniel', '2026-09-04 12:00:00-05'),
  -- Las dos correcciones de Daniel (4-sep-2026), textual: «city shoes → Calle
  -- 19 Central, al lado de la joyería Super Oro. Y Nine Sport en Calle 19
  -- Central.» D-112 (Nine Sports 9, S.A.) hoy autollena «Calle 19» por su
  -- histórico de 2 guías; la definición de Daniel gana.
  ('D-35',  'Calle 19 Central, al lado de la joyería Super Oro', '{}', 1, 'daniel', '2026-09-04 18:00:00-05'),
  ('D-112', 'Calle 19 Central',        '{}', 1, 'daniel', '2026-09-04 18:00:00-05')
ON CONFLICT DO NOTHING;
