-- ═════════════════════════════════════════════════════════════════════════════
-- reebok_rubro_categoria — LAS CATEGORÍAS DEL CATÁLOGO REEBOK SE ADMINISTRAN,
-- NO SE PROGRAMAN (17-sep-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- 🩸 Por qué existe. El mapa `rubro → categoría` vivía en el código, y no en un
-- lugar: en DOS listas que había que acordarse de tocar juntas.
--
--   · `CATEGORIA_POR_RUBRO`        (src/lib/reebok-clasificacion.ts) — clasifica
--   · `REEBOK_CATEGORY_ESPERADAS`  (src/lib/depurador/reebok.ts)     — el aviso
--
-- Un candado las comparaba, que es exactamente la confesión de que el espejo
-- estaba mal: el 2-sep-2026 `HEADWEAR` entró en una sola y **cada archivo de
-- Reebok con gorras avisaba «valor inesperado» sobre un dato perfectamente
-- bueno**. Y el 17-sep el despacho de ropa trajo cuatro rubros que el catálogo
-- no conoce —T-SHIRTS, TOPS, BRA, JACKETS, 30 de 75 artículos— sin ninguna
-- pantalla a la que llevar a nadie: el botón del aviso solo podía decir «Copiar
-- las categorías».
--
-- Daniel, preguntado si quería volverlas administrables: **«sí»**.
--
-- 🔴 LO QUE **NO** SE VUELVE EDITABLE. Las categorías son TRES y siguen cerradas
-- en el código (`CategoriaReebok`: footwear · apparel · accessories). Lo que se
-- administra es a cuál de esas tres va cada rubro. Una categoría nueva cambia
-- pantallas, filtros y el BULTO que se le cobra al cliente (calzado 12, todo lo
-- demás 6): eso no sale de una casilla. El CHECK de abajo lo hace cumplir en la
-- base, no solo en la pantalla.
--
-- 🔴 LA MARCA SIGUE MANDANDO PRIMERO. `categoriaReebok` mira el `Department` de
-- Switch (FOOTWEAR / APPAREL / HARDWARE) ANTES que el rubro; el rubro es el plan
-- B de una marca vacía. Ninguna fila de esta tabla mueve ese orden.
--
-- 🔴 FALLA ABIERTA. Sin esta migración —o con la base callada— el código usa las
-- seis reglas de siempre (`CATEGORIA_POR_RUBRO_BASE`) y el catálogo clasifica
-- exactamente igual que ayer. Nada queda sin clasificar por un problema de base.
-- Medido contra producción el 17-sep-2026: los **1.763 artículos** de
-- `active_shoes` en `switch_articulo_info` dan la MISMA categoría con el mapa
-- del código y con esta semilla — **0 diferencias**.
--
-- 🔴 SOFT DELETE FIRMADO, NUNCA DELETE — el mismo patrón que
-- `guias_destino_lista` y `comision_exclusion`. Único solo entre ACTIVAS: un
-- rubro quitado se puede volver a agregar (dos filas, una activa).
-- RLS: solo service_role; la app entra por el cliente del servidor y la ruta
-- exige rol (leer: admin + secretaria; ESCRIBIR: solo admin).
--
-- ⚠️ Esta tabla NO toca `products` ni reclasifica nada por sí sola: el sync del
-- catálogo la lee en su próxima corrida. Y un «no sé» nunca pisa lo que ya está
-- clasificado (`clasificacionDeArticulo`), así que quitar una fila no manda
-- ningún producto vivo al cajón neutro.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) La tabla ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reebok_rubro_categoria (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- El rubro TAL COMO LLEGA DE SWITCH: mayúsculas, sin espacios de más. Es como
  -- lo normaliza `U()` en `reebok-clasificacion.ts`, que es con lo que el mapa
  -- compara. Guardarlo como lo teclearon dejaría filas que nunca hacen match.
  rubro            text NOT NULL,
  -- 🔴 UNA DE LAS TRES, Y NADA MÁS. El CHECK es el que impide inventar una
  -- categoría desde la pantalla: `CategoriaReebok` vive en el código.
  categoria        text NOT NULL,
  -- Soft delete. false = el catálogo ya no traduce ese rubro; la fila se queda
  -- como historial.
  activo           boolean NOT NULL DEFAULT true,
  creado_por       text NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  desactivado_por  text,
  desactivado_en   timestamptz,
  CONSTRAINT reebok_rubro_categoria_rubro_normalizado
    CHECK (rubro = BTRIM(rubro) AND rubro = UPPER(rubro) AND rubro <> ''),
  CONSTRAINT reebok_rubro_categoria_categoria_cerrada
    CHECK (categoria IN ('footwear', 'apparel', 'accessories')),
  -- Una desactivación se firma: sin quién ni cuándo, no hay soft delete.
  CONSTRAINT reebok_rubro_categoria_baja_firmada
    CHECK (activo OR (desactivado_por IS NOT NULL AND desactivado_en IS NOT NULL))
);

-- Único entre ACTIVOS: un rubro no puede apuntar a dos categorías a la vez,
-- pero sí pudo quitarse y volver a agregarse (dos filas, una activa).
-- ⚠️ Compara el TEXTO EXACTO, y alcanza: el CHECK de arriba ya obliga a que el
-- rubro entre en mayúsculas y sin espacios de más.
CREATE UNIQUE INDEX IF NOT EXISTS reebok_rubro_categoria_activo_unico
  ON reebok_rubro_categoria (rubro)
  WHERE activo;

ALTER TABLE reebok_rubro_categoria ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reebok_rubro_categoria' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON reebok_rubro_categoria
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Sin DELETE a propósito: quitar = activo = false.
GRANT SELECT, INSERT, UPDATE ON reebok_rubro_categoria TO service_role;

COMMENT ON TABLE reebok_rubro_categoria IS
  'Mapa rubro de Switch -> categoria del catalogo Reebok (footwear/apparel/'
  'accessories). Antes vivia en el codigo, en DOS listas espejo. Se administra '
  'en Catalogos > Reebok > Categorias del catalogo (solo admin). Soft delete '
  '(activo=false) firmado, NUNCA DELETE. Falla ABIERTA: sin esta tabla el '
  'codigo usa CATEGORIA_POR_RUBRO_BASE y el catalogo clasifica igual que antes.';
COMMENT ON COLUMN reebok_rubro_categoria.rubro IS
  'El rubro como llega de Switch: MAYUSCULAS, sin espacios de mas (U() en '
  'reebok-clasificacion.ts). Comparacion por igualdad exacta, nunca por parecido.';
COMMENT ON COLUMN reebok_rubro_categoria.categoria IS
  'Una de las TRES del codigo. El CHECK impide inventar una cuarta desde la '
  'pantalla: una categoria nueva cambia filtros, pantallas y el bulto.';

-- ─── 2) La semilla: EXACTAMENTE las seis reglas del código ───────────────────
-- 🔑 No es una lista nueva: es `CATEGORIA_POR_RUBRO_BASE` copiada. Si esta
-- semilla no reprodujera el mapa del código, la tabla cambiaría la
-- clasificación el día que corra — y eso está medido en cero.
--
-- El porqué de las dos que no se ven en los datos de hoy:
--   · SHORTS y SOCKS no aparecen ni una vez en el histórico de renglones de
--     factura: son valores que el mapa acepta por adelantado.
--   · HEADWEAR (gorras) entró el 2-sep-2026 y no cambia nada hoy: los 7
--     artículos con existencia traen los 7 `marca = HARDWARE`, así que el camino
--     primario ya los manda a `accessories`. Está por el día que una gorra
--     llegue con la marca vacía.
INSERT INTO reebok_rubro_categoria (rubro, categoria, creado_por, creado_en)
VALUES
  ('SHOES',    'footwear',    'sistema', '2026-09-17 12:00:00-05'),
  ('APPAREL',  'apparel',     'sistema', '2026-09-17 12:00:00-05'),
  ('SHORTS',   'apparel',     'sistema', '2026-09-17 12:00:00-05'),
  -- ⚠️ SOCKS es ROPA, no accesorio. Daniel, textual: «es apparel, o sea ropa,
  -- ¿por qué sería accesorio?».
  ('SOCKS',    'apparel',     'sistema', '2026-09-17 12:00:00-05'),
  ('BAGS',     'accessories', 'sistema', '2026-09-17 12:00:00-05'),
  ('HEADWEAR', 'accessories', 'sistema', '2026-09-17 12:00:00-05')
ON CONFLICT DO NOTHING;
