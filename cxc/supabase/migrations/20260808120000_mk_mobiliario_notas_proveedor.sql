-- ─────────────────────────────────────────────────────────────────────────────
-- 20260808120000_mk_mobiliario_notas_proveedor.sql
--
-- Marketing > Mobiliario: NOTAS DEL PROVEEDOR.
--
-- Pedido de Daniel, textual:
--   "en marketing, agrega esto en notas de mobiliario. son los datos de los
--    costos del proveedor. que no sume ni nada, solo info personal."
--   "Mobiliario es una sola nota general."
--   "mi excel solo quiero que guardes foto, producto y precio. olvidate de
--    las cantidades."
--
-- Es una LIBRETA de costos del proveedor (Changalo, paneles), no un
-- inventario. NO participa de ningun calculo del modulo: ni de las metricas
-- de /marketing/mobiliario, ni del resumen por tienda, ni del Excel, y los
-- precios NO se totalizan entre si. La regla vive escrita en
-- src/lib/marketing/notas-proveedor.ts y la fija el test
-- src/__tests__/lib/marketing-notas-proveedor.test.ts.
--
-- Es UNA SOLA nota general del modulo (no hay nota por mueble ni por
-- proyecto), por eso la tabla no tiene FK a nada: cada fila es un renglon
-- de esa unica nota.
--
-- MIGRACION ADITIVA (solo objetos nuevos, IF NOT EXISTS). Aplicar a mano en
-- Supabase Dashboard > SQL Editor. El codigo deployado es TOLERANTE mientras
-- no corra: la pantalla de Mobiliario funciona igual y el bloque de notas
-- avisa que falta esta migracion en vez de romperse.
--
-- SEGURIDAD: RLS activo y SOLO service_role. Es informacion personal de
-- Daniel (solo el rol admin la ve) y la app la lee desde el backend con la
-- service role key. Nada de USING true para anon: ese fue el agujero de
-- reebok_orders.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Tabla ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mk_mobiliario_notas_proveedor (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Lo unico obligatorio del renglon.
  producto    text NOT NULL,
  -- Precio OPCIONAL a proposito: NULL significa "todavia no se cuanto
  -- cuesta" y la pantalla lo muestra como un guion largo, nunca como cero.
  -- Hoy los 5 renglones sembrados traen precio, pero el campo sigue
  -- aceptando NULL para el producto que entre manana sin costo conocido.
  precio      numeric(12,2),
  -- Aclaracion corta al lado del precio, para cuando el numero solo se
  -- presta a confusion. Caso real: "el par completo" en el conjunto soporte
  -- tabla; sin eso, 6.75 se lee como precio por lado.
  nota        text,
  -- Rutas dentro del bucket privado "marketing". Es una LISTA porque un
  -- renglon puede llevar varias fotos: "Barra plana + flauta" son dos
  -- productos que el proveedor vende juntos y van en un solo renglon con sus
  -- dos fotos (Daniel: "se venden juntas", "junta barra y flauta").
  foto_paths  text[] NOT NULL DEFAULT '{}',
  -- Orden manual de la lista (menor primero).
  orden       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mk_mob_notas_orden
  ON mk_mobiliario_notas_proveedor (orden, created_at);

-- ── 2. RLS: solo service_role ───────────────────────────────────────────────
ALTER TABLE mk_mobiliario_notas_proveedor ENABLE ROW LEVEL SECURITY;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'mk_mobiliario_notas_proveedor'
      AND policyname = 'mk_mob_notas_service_role'
  ) THEN
    CREATE POLICY mk_mob_notas_service_role
      ON mk_mobiliario_notas_proveedor
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END
$mig$;

-- ── 3. Siembra: los 5 renglones del Excel del proveedor ─────────────────────
-- Fuente: "inventario paneles changalo.xlsx" (proveedor Changalo). Las fotos
-- venian incrustadas como "imagen en celda" (rich values) y ya estan subidas
-- al bucket "marketing" bajo notas-proveedor/changalo/ (verificadas por HTTP:
-- las 6 responden 200, mas de 5 KB y content-type image/jpeg).
--
-- El mapeo foto->producto NO salio del orden de los archivos: se leyo del
-- propio xlsx (xl/richData/richValueRel.xml + el atributo vm de cada celda).
--
-- Los 4 precios que el Excel dejaba ambiguos los confirmo Daniel a mano.
-- Barra plana y flauta se FUSIONAN en un renglon porque se venden juntas;
-- 13.75 es el precio del par (el Excel lo anotaba como "precio con flauta").
--
-- Solo siembra si la tabla esta VACIA: correr esta migracion dos veces no
-- puede duplicar los renglones ni pisar lo que Daniel haya editado despues.
INSERT INTO mk_mobiliario_notas_proveedor (producto, precio, nota, foto_paths, orden)
SELECT * FROM (VALUES
  ('Paneles',                65.00, NULL,
     ARRAY['notas-proveedor/changalo/paneles.jpg'],                0),
  ('Tablas',                 10.50, NULL,
     ARRAY['notas-proveedor/changalo/tablas.jpg'],                 1),
  ('Conjunto soporte tabla',  6.75, 'el par completo',
     ARRAY['notas-proveedor/changalo/conjunto-soporte-tabla.jpg'], 2),
  ('Norte colgador',         33.00, NULL,
     ARRAY['notas-proveedor/changalo/norte-colgador.jpg'],         3),
  ('Barra plana + flauta',   13.75, 'se venden juntas',
     ARRAY['notas-proveedor/changalo/barra-plana.jpg',
           'notas-proveedor/changalo/flauta.jpg'],                 4)
) AS semilla(producto, precio, nota, foto_paths, orden)
WHERE NOT EXISTS (SELECT 1 FROM mk_mobiliario_notas_proveedor);

-- ── 4. Comentarios de catalogo ──────────────────────────────────────────────
COMMENT ON TABLE mk_mobiliario_notas_proveedor IS
  'Marketing > Mobiliario: nota general con los costos del proveedor. Solo informacion de referencia para el rol admin. NO se suma ni entra en ningun calculo del modulo.';
COMMENT ON COLUMN mk_mobiliario_notas_proveedor.precio IS
  'Costo del proveedor. NULL = todavia no se sabe; la pantalla lo muestra como guion, nunca como cero.';
COMMENT ON COLUMN mk_mobiliario_notas_proveedor.foto_paths IS
  'Rutas dentro del bucket privado marketing. Lista porque un renglon puede vender varios productos juntos (barra plana + flauta).';
