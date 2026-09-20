-- ═════════════════════════════════════════════════════════════════════════════
-- guias_despachadores — LA LISTA DE «DESPACHADO POR», COMPARTIDA POR TODO EL
-- EQUIPO (19-sep-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel, textual: *«el + para agregar nombre debe de guardarse para todos los
-- navegadores, o más fácil ponlo en configuraciones nada más y quita la opción
-- de que sea en la creación de la guía»*.
--
-- 🩸 Por qué existe. La lista del desplegable «Despachado por» vivía mitad en
-- una constante del código (Julio · Rodrigo · Eloyn · Jorman) y mitad en el
-- `localStorage` del navegador (`fg_entregadores`): un nombre que agregaba
-- Angela con el ＋ NO lo veía Andrea, y no se podía quitar desde ninguna
-- pantalla. Es EXACTAMENTE el mismo cuento que la lista de destinos hasta el
-- 7-sep-2026 (`guias_destino_lista`) y que los transportistas hasta el
-- 9-sep-2026 (`transportistas`).
--
-- 🔴 LA SEMILLA SON LOS CUATRO QUE EL CÓDIGO YA OFRECÍA, ni uno más: Julio y
-- Rodrigo (medidos el 25-ago-2026 sobre las 212 guías vivas: `Julio ×178 ·
-- Rodrigo ×31 · vacío ×3`), Eloyn (pedido por Daniel el 14-sep-2026) y Jorman
-- (el 19-sep-2026, *«agrégame a Eloyn y a Jorman a esa lista»*). Lo que alguien
-- haya agregado en SU navegador no entra: nunca fue una lista del equipo, y
-- copiarla sería sembrar lo que nadie revisó.
--
-- 🔴 ESTA MIGRACIÓN NO TOCA NI UNA GUÍA. `guia_transporte.entregado_por` sigue
-- siendo el TEXTO del nombre, tal cual está escrito en las 212 guías: la lista
-- solo dice qué OFRECE el desplegable. Quitar un nombre de acá no le borra el
-- nombre a ninguna guía vieja.
--
-- 🔴 SOFT DELETE FIRMADO, NUNCA DELETE — el mismo patrón que
-- `guias_destino_lista` y `transportistas`. Única solo entre ACTIVOS: un
-- nombre quitado se puede volver a agregar (se revive la fila).
-- RLS: solo service_role; la app entra por el cliente del servidor y la ruta
-- exige rol.
--
-- 🔴 ADITIVA Y FALLA ABIERTA: mientras no se corra, el desplegable sigue
-- ofreciendo los cuatro de la constante (`DESPACHADORES_BASE`) y la pantalla de
-- Configuración lo dice en palabras. Nada se rompe.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) La tabla ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guias_despachadores (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- El nombre TAL CUAL se ofrece en el desplegable y se imprime en el papel.
  nombre           text NOT NULL,
  -- Soft delete. false = ya no se ofrece; la fila se queda como historial.
  activo           boolean NOT NULL DEFAULT true,
  creado_por       text NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  desactivado_por  text,
  desactivado_en   timestamptz,
  CONSTRAINT guias_despachadores_no_vacio
    CHECK (nombre = BTRIM(nombre) AND nombre <> ''),
  -- Una desactivación se firma: sin quién ni cuándo, no hay soft delete.
  CONSTRAINT guias_despachadores_baja_firmada
    CHECK (activo OR (desactivado_por IS NOT NULL AND desactivado_en IS NOT NULL))
);

-- Único entre ACTIVOS: el mismo nombre no puede ofrecerse dos veces a la vez,
-- pero sí pudo quitarse y volver (se revive la fila, no se crea una segunda).
-- ⚠️ Este índice compara el TEXTO EXACTO; que «Julio» y «JULIO» no convivan lo
-- decide el servidor con la clave normalizada (la MISMA regla de los destinos
-- y los transportistas), antes de insertar. Acá no se puede: la clave exige
-- quitar acentos y separar los dígitos.
CREATE UNIQUE INDEX IF NOT EXISTS guias_despachadores_activo_unico
  ON guias_despachadores (nombre)
  WHERE activo;

ALTER TABLE guias_despachadores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'guias_despachadores' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON guias_despachadores
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Sin DELETE a propósito: quitar = activo = false.
GRANT SELECT, INSERT, UPDATE ON guias_despachadores TO service_role;

COMMENT ON TABLE guias_despachadores IS
  'Los nombres que ofrece el desplegable «Despachado por» de Guías, '
  'compartidos por todo el equipo (antes: mitad constante del código, mitad '
  'localStorage fg_entregadores). Se administran SOLO en Guías › Configuración '
  '(admin y secretaria). Soft delete (activo=false) firmado, NUNCA DELETE: '
  'quitar un nombre no se lo borra a ninguna guía vieja.';
COMMENT ON COLUMN guias_despachadores.nombre IS
  'Texto tal cual se ofrece y se escribe en guia_transporte.entregado_por.';
COMMENT ON COLUMN guias_despachadores.activo IS
  'false = ya no se ofrece en el desplegable. La fila se queda.';

-- ─── 2) La semilla: los CUATRO que el código ya ofrecía ──────────────────────
INSERT INTO guias_despachadores (nombre, creado_por, creado_en)
VALUES
  ('Julio',   'sistema', '2026-09-19 12:00:00-05'),  -- 178 guías (25-ago-2026)
  ('Rodrigo', 'sistema', '2026-09-19 12:00:00-05'),  --  31 guías (25-ago-2026)
  ('Eloyn',   'sistema', '2026-09-19 12:00:00-05'),  -- pedido el 14-sep-2026
  ('Jorman',  'sistema', '2026-09-19 12:00:00-05')   -- pedido el 19-sep-2026
ON CONFLICT DO NOTHING;
