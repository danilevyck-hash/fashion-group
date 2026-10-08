-- ============================================================================
-- Marketing > PROVEEDORES (6-oct-2026, `MKT_PROVEEDORES_2026_10`)
-- ============================================================================
--
-- 🔴 ESCRITA Y **SIN APLICAR**. Se corrio con `-- --dry-run` y nada mas.
--    Se aplica con el "si" de Daniel:
--      npm run migrar supabase/migrations/20270101120000_mkt_proveedores.sql
--
-- 🔴 TODO ES ADITIVO. No se dropea, no se renombra y no se toca una fila
--    existente: ninguna columna nueva es NOT NULL y ninguna tiene DEFAULT que
--    cambie lo que ya esta guardado. Sin esta migracion el modulo se porta
--    como el 5-oct-2026 (`columnas-opcionales.ts`, falla abierta).
--
-- Lo que Daniel decidio el 6-oct-2026:
--
--   1. Ficha de proveedor, con alias: "Krysthel", "Kristel" y "Changalo" son
--      uno solo.  -> `mk_proveedor_alias`
--   2. La marca deja de ser obligatoria: una factura puede no cobrarsele a
--      ninguna marca.                       -> `mk_facturas.pct_a_la_marca` = 0
--   3. A una factura se le puede cobrar la MITAD a la marca; el resto queda a
--      cargo de la empresa.                 -> la MISMA columna, en 50.
--      Nunca entre varias marcas ni entre empresas.
--   4. Mobiliario NO se conecta: la compra es un gasto mas y el inventario lo
--      escribe Daniel a mano. -> NADA que agregar.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Cuanto se le cobra a la marca
-- ----------------------------------------------------------------------------
-- Daniel, 6-oct-2026, textual: «eso no debe de importar, lo asumo y ya. No
-- debes dividirlo ni nada. Solo que algunas se registran para cobrar la mitad
-- y algunas muy pocas no, como el caso de la barra».
--
-- O sea: una marca y un porcentaje de lista CERRADA.
--   100 = la factura entera se le cobra a la marca (lo mas comun).
--    50 = se le cobra la mitad; el resto queda A CARGO DE LA EMPRESA.
--     0 = no se le cobra a ninguna marca (las 60 barras). Esa factura no lleva
--         fila en `mk_factura_marcas`.
-- NO se elige empresa, NO se escriben montos y NO se parte entre dos marcas.
--
-- NULLABLE a proposito: NULL = la factura es de antes de esta pieza y se lee
-- EXACTAMENTE como hoy, entera para su marca. Es lo que dicen las 107 facturas
-- vivas, y ninguna se reescribe.
--
-- 🩸 POR QUE UNA COLUMNA NUEVA Y NO `mk_factura_marcas.porcentaje`:
--    medido contra produccion el 6-oct-2026, de las 108 filas de esa tabla
--    **58 tienen `porcentaje = 50` y hoy significan el 100 %** — el reporte
--    normaliza por la SUMA de los porcentajes de la factura, y las 107
--    facturas tienen UNA sola marca, asi que 50/50 = el total. Darle otro
--    significado al 50 partiria 58 facturas de plata real a la mitad, en
--    silencio. El porcentaje viejo NO SE TOCA.
ALTER TABLE mk_facturas
  ADD COLUMN IF NOT EXISTS pct_a_la_marca SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mk_facturas_pct_a_la_marca_chk'
  ) THEN
    ALTER TABLE mk_facturas
      ADD CONSTRAINT mk_facturas_pct_a_la_marca_chk
      CHECK (pct_a_la_marca IS NULL OR pct_a_la_marca IN (0, 50, 100));
  END IF;
END $$;

COMMENT ON COLUMN mk_facturas.pct_a_la_marca IS
  'Daniel, 6-oct-2026: que porcentaje de esta factura se le cobra a la marca. '
  '100 = entera · 50 = la mitad (el resto a cargo de la empresa) · 0 = a '
  'ninguna marca. NULL = factura de antes, se lee entera para su marca como '
  'siempre. No se elige empresa y no se reparte entre dos marcas: '
  '`exigirUnaMarca` sigue en pie.';

-- ----------------------------------------------------------------------------
-- 3. El amarre de los alias: quien es quien
-- ----------------------------------------------------------------------------
-- 🔴 UNA LISTA ESCRITA A MANO, igual que `proveedor_amarre` del modulo
--    Proveedores y `guias_destino_cliente` de Guias. Nunca se deriva del
--    parecido: "Changalo" no comparte una letra con "Krysthel" y ninguna
--    normalizacion los junta.
--
-- `alias_normalizado` es la salida de `normalizarProveedor()` (minusculas, sin
-- acentos, sin puntuacion, sin la cola de sociedad). `canonico` es la clave
-- normalizada del proveedor de verdad.
CREATE TABLE IF NOT EXISTS mk_proveedor_alias (
  alias_normalizado TEXT PRIMARY KEY,
  canonico          TEXT NOT NULL,
  -- Quien lo amarro y cuando: el amarre es una decision de una persona.
  creado_por        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Un alias no se borra: se anula, como todo en este repo.
  anulado_en        TIMESTAMPTZ,
  CONSTRAINT mk_proveedor_alias_no_circular CHECK (alias_normalizado <> canonico)
);

CREATE INDEX IF NOT EXISTS idx_mk_proveedor_alias_canonico
  ON mk_proveedor_alias(canonico) WHERE anulado_en IS NULL;

COMMENT ON TABLE mk_proveedor_alias IS
  'Quien es quien entre los proveedores de Marketing (Daniel, 6-oct-2026: '
  '"con alias, para que Krysthel, Kristel y Changalo sean uno solo"). LISTA '
  'ESCRITA A MANO: nunca se amarra por parecido. Fail-open: sin esta tabla el '
  'codigo usa `ALIAS_DE_PROVEEDOR` de proveedores-2026-10.ts.';

ALTER TABLE mk_proveedor_alias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mk_proveedor_alias_service_role ON mk_proveedor_alias;
CREATE POLICY mk_proveedor_alias_service_role ON mk_proveedor_alias
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Los tres alias que Daniel confirmo el 6-oct-2026, mas el de Impreco que ya
-- se usaba en los papeles. `ON CONFLICT DO NOTHING`: repetir no rompe nada.
-- 🔑 El `canonico` es la grafia que REALMENTE esta en las facturas, medida
-- contra produccion el 6-oct-2026: las 17 facturas de Krysthel ($12,535.06)
-- estan guardadas con el nombre completo.
INSERT INTO mk_proveedor_alias (alias_normalizado, canonico, creado_por) VALUES
  ('krysthel', 'krysthel yanneth morales martinez', 'Daniel, 6-oct-2026'),
  ('kristel',  'krysthel yanneth morales martinez', 'Daniel, 6-oct-2026'),
  ('krystel',  'krysthel yanneth morales martinez', 'Daniel, 6-oct-2026'),
  ('changalo', 'krysthel yanneth morales martinez', 'Daniel, 6-oct-2026'),
  -- Los dos que Daniel confirmo el 6-oct-2026 al ver el mockup:
  -- Impreco = Impresora Comercial (47 + 6 = 53 facturas, $22,694.72).
  ('impreco',  'impresora comercial',               'Daniel, 6-oct-2026'),
  -- A.g. Display / Venetto = A.g. Display (1 + 2 = 3 facturas, $6,335.92).
  ('a g display venetto', 'a g display',            'Daniel, 6-oct-2026')
ON CONFLICT (alias_normalizado) DO NOTHING;

COMMIT;

-- ============================================================================
-- Lo que esta migracion NO hace, a proposito
-- ============================================================================
-- · NO crea `mk_proveedores`. La lista de proveedores se DERIVA de las
--   facturas que ya existen (`SELECT DISTINCT proveedor FROM mk_facturas`, lo
--   que ya lee `/api/marketing/facturas/proveedores`). Un catalogo aparte
--   seria una segunda verdad que hay que mantener al dia.
-- · NO toca `mk_factura_marcas` ni sus porcentajes (ver el 🩸 de arriba).
-- · NO toca `mk_inventario_productos` ni `mk_mobiliario_notas_proveedor`.
--   Mobiliario no se conecta con las facturas: Daniel escribe la cantidad.
-- · NO arregla la factura #145. Se paso a «No recuperable» desde la
--   pantalla de Marketing.
-- ============================================================================
