-- ─────────────────────────────────────────────────────────────────────────────
-- 20260808160000_mk_mobiliario_bultos_y_foto.sql
--
-- Marketing > Mobiliario: BULTOS por renglon de entrega + FOTO del producto.
--
-- Pedido de Daniel, textual:
--   "puedo mandar 30 norte colgador en 1 bulto. o 20 norte colgador en un
--    bulto"
--   "donde pueda agregar o quitar productos y con foto. en la nota de
--    entrega que vaya con foto"
--
-- ── 1. BULTOS ───────────────────────────────────────────────────────────────
-- 🔴 EL INVENTARIO SE DESCUENTA EN **PIEZAS**. Los bultos son SOLO como
--    viajo la mercancia, para la nota de entrega.
--
--    El bulto es VARIABLE: 30 norte colgador pueden ir en 1 bulto y 20 en
--    otro. NO hay conversion fija y no debe existir nunca una tabla de
--    "piezas por bulto". Son dos numeros independientes por renglon.
--
--    Confundirlos descuadra el stock: descontar bultos sacaria 5 unidades
--    del inventario donde salieron 150, y nadie lo notaria hasta el conteo
--    fisico. La regla vive escrita en src/lib/marketing/piezas-bultos.ts y
--    la fija el test src/__tests__/lib/marketing-piezas-bultos.test.ts, que
--    pone el build ROJO si `bultos` entra en la aritmetica de stock.
--
--    POR QUE SOLO SE AGREGA `bultos` Y NO TAMBIEN `piezas`: las piezas YA
--    se guardan, en el jsonb `reparto` de cada renglon, y son las que el
--    codigo descuenta hoy. Agregar una columna `piezas` al lado crearia dos
--    fuentes para el mismo numero y la primera vez que se desincronicen
--    gana la equivocada. Una sola cosa nueva, la que falta.
--
--    NULL a proposito = "no se anoto". Las 21 entregas que ya existen no
--    tienen el dato y no se les inventa uno: la pantalla lo deja en blanco,
--    nunca en cero (un cero diria "viajo en cero bultos", que es falso).
--
-- ── 2. FOTO DEL PRODUCTO ────────────────────────────────────────────────────
-- Ruta dentro del bucket privado "marketing" (se guarda el PATH, no la URL
-- firmada, que caduca). Mismo criterio que mk_mobiliario_notas_proveedor.
--
-- ⚠️ Esta foto es la del INVENTARIO (el mueble que se entrega) y NO tiene
--    nada que ver con las fotos de mk_mobiliario_notas_proveedor, que son la
--    libreta de costos del proveedor. Los dos bloques quedan SEPARADOS a
--    proposito. Daniel: "un precio es lo que reporto en marketing en
--    proyectos y otro lo que me costo". Son los mismos productos fisicos con
--    precios distintos A PROPOSITO. NO FUSIONAR.
--
-- MIGRACION ADITIVA (solo columnas nuevas, IF NOT EXISTS). Aplicar a mano en
-- Supabase Dashboard > SQL Editor. El codigo deployado es TOLERANTE mientras
-- no corra: la pantalla de Mobiliario funciona igual, las entregas se
-- guardan sin bultos y el producto se guarda sin foto, avisando en pantalla
-- que falta esta migracion en vez de romperse.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Bultos por renglon de entrega ───────────────────────────────────────────
ALTER TABLE mk_entrega_items
  ADD COLUMN IF NOT EXISTS bultos integer;

-- Un bulto negativo no existe. NULL sigue siendo valido ("no se anoto").
DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mk_entrega_items_bultos_no_negativo'
  ) THEN
    ALTER TABLE mk_entrega_items
      ADD CONSTRAINT mk_entrega_items_bultos_no_negativo
      CHECK (bultos IS NULL OR bultos >= 0);
  END IF;
END
$mig$;

-- ── Foto del producto de inventario ─────────────────────────────────────────
ALTER TABLE mk_inventario_productos
  ADD COLUMN IF NOT EXISTS foto_path text;

-- ── Comentarios de catalogo ─────────────────────────────────────────────────
COMMENT ON COLUMN mk_entrega_items.bultos IS
  'Cuantos bultos (cajas/atados) usó este renglón. SOLO informativo, para la nota de entrega. EL STOCK SE DESCUENTA EN PIEZAS (jsonb reparto), NUNCA en bultos: el bulto es variable y no hay conversión fija. NULL = no se anotó.';

COMMENT ON COLUMN mk_inventario_productos.foto_path IS
  'Ruta dentro del bucket privado marketing. Foto del mueble que se entrega; sale también en la nota de entrega. Distinta de mk_mobiliario_notas_proveedor.foto_paths (esa es la libreta de costos del proveedor y va separada a propósito).';
