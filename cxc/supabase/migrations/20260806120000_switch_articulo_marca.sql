-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_articulo_marca — diccionario articulo_id -> MARCA.
--
-- POR QUE HACE FALTA UNA TABLA Y NO UN JOIN:
--   `switch_articulo_diario` (la fuente de "lo mas vendido") trae `codigo` y
--   `descripcion`, pero la `descripcion` de Switch es CATEGORIA+GENERO
--   ("Men-Sneakers", "Women-Panties"), NO la marca. Medido el 6-ago-2026 en
--   american_classic: 4.063 articulos distintos vendidos en 12 meses contra
--   solo 666 descripciones distintas.
--
--   La marca SI existe en Switch, pero solo en el catalogo de articulos:
--     · GET /apiarticulos/lista  -> trae `marcaId` (medido: 9.126 articulos,
--       marcaId poblado en el 100%, 33 marcaId distintos). NO trae el nombre.
--     · GET /apiarticulos/info   -> trae `marcaId` Y `marca` (el nombre), pero
--       va de a UN articulo por `codigoBarra`.
--   Por eso el sync barre la lista (id -> marcaId) y resuelve el NOMBRE con una
--   llamada a /info por cada marcaId NUEVO (33 la primera vez, 0 despues).
--
--   Cruce medido: 4.063 de 4.063 articulo_id vendidos en 12 meses parean contra
--   el catalogo, y los 4.063 traen marcaId. Cobertura 100%.
--
-- LA MARCA NO SE ADIVINA DEL CODIGO. Los codigos son del proveedor
-- ("MW0MW32346ZFB", "76J4883DMA", "004179") y no hay prefijo confiable: el mismo
-- prefijo aparece en marcas distintas. Un articulo sin fila aca se muestra como
-- "Sin marca", nunca con una marca inventada.
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS switch_articulo_marca (
  empresa_key   text NOT NULL,
  articulo_id   int  NOT NULL,
  codigo        text,
  marca_id      int,
  marca_nombre  text,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_key, articulo_id)
);

-- La lectura del modulo pide "todas las marcas de esta empresa" y parea en
-- memoria contra los articulos del periodo: el indice util es por empresa.
CREATE INDEX IF NOT EXISTS idx_sam_empresa ON switch_articulo_marca (empresa_key);

ALTER TABLE switch_articulo_marca ENABLE ROW LEVEL SECURITY;

-- Solo service_role: el modulo lo lee desde el servidor (rutas /api/multifashion),
-- nunca desde el navegador. Sin policy para anon/authenticated a proposito.
DROP POLICY IF EXISTS service_role_all ON switch_articulo_marca;
CREATE POLICY service_role_all ON switch_articulo_marca
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON switch_articulo_marca TO service_role;

NOTIFY pgrst, 'reload schema';
