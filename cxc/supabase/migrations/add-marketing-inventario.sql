-- ============================================================================
-- Marketing — Inventario de muebles + entregas por proyecto
-- ============================================================================
-- Modelo:
--   mk_inventario_productos: catálogo plano (paneles, tablas, etc) con stock_total.
--   mk_entregas_muebles: una entrega por proyecto. Total agregado del proyecto
--     y total_por_marca como jsonb {"<marca_id>": <monto>}.
--   mk_entrega_items: una fila por producto entregado. cantidad_por_marca jsonb
--     {"<marca_id>": <unidades>} permite columnas dinámicas según las marcas
--     que el proyecto tenga asignadas (Tommy/Calvin/Reebok/Joybees combinables).
--
-- Stock: stock_total es lo DISPONIBLE (no lo histórico comprado). Cuando se
-- registra una entrega, restamos cantidades del stock. Daniel sube manualmente
-- el stock cuando llega más mercancía.
--
-- Sin RLS aplicado al backend (service role); las policies dejan abierto solo
-- a service_role para alinear con el resto del módulo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tablas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mk_inventario_productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  precio NUMERIC(12,2) NOT NULL CHECK (precio >= 0),
  stock_total INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mk_entregas_muebles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id UUID NOT NULL REFERENCES mk_proyectos(id) ON DELETE CASCADE,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_por_marca JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mk_entrega_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id UUID NOT NULL REFERENCES mk_entregas_muebles(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES mk_inventario_productos(id),
  cantidad_por_marca JSONB NOT NULL DEFAULT '{}'::jsonb,
  precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_mk_entregas_proyecto
  ON mk_entregas_muebles(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_mk_entrega_items_entrega
  ON mk_entrega_items(entrega_id);
CREATE INDEX IF NOT EXISTS idx_mk_entrega_items_producto
  ON mk_entrega_items(producto_id);

-- updated_at trigger reusando mk_touch_updated_at() de marketing.sql
DROP TRIGGER IF EXISTS trg_mk_touch_inventario ON mk_inventario_productos;
CREATE TRIGGER trg_mk_touch_inventario BEFORE UPDATE ON mk_inventario_productos
FOR EACH ROW EXECUTE FUNCTION mk_touch_updated_at();

DROP TRIGGER IF EXISTS trg_mk_touch_entregas ON mk_entregas_muebles;
CREATE TRIGGER trg_mk_touch_entregas BEFORE UPDATE ON mk_entregas_muebles
FOR EACH ROW EXECUTE FUNCTION mk_touch_updated_at();

-- RLS
ALTER TABLE mk_inventario_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mk_entregas_muebles ENABLE ROW LEVEL SECURITY;
ALTER TABLE mk_entrega_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_inventario ON mk_inventario_productos;
CREATE POLICY service_role_all_inventario ON mk_inventario_productos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_entregas ON mk_entregas_muebles;
CREATE POLICY service_role_all_entregas ON mk_entregas_muebles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_items ON mk_entrega_items;
CREATE POLICY service_role_all_items ON mk_entrega_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 2. Seed de productos (stock_total = total entregado en histórico → disponible
--    inicial = 0; Daniel ajusta cuando llega mercancía).
-- ----------------------------------------------------------------------------
INSERT INTO mk_inventario_productos (nombre, precio, stock_total) VALUES
  ('Paneles',          130, 187),
  ('Tablas',            21, 472),
  ('Conjunto soporte',  14, 472),
  ('Norte colgador',    66, 149),
  ('Barra plana',       28, 447)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Seed de entregas históricas (changalo_muebles.xlsx)
--    Mapeo de columnas: "Cant. Fashion Wear" → marca con empresa_codigo='fashion_wear'
--                       "Cant. Vistana"      → marca con empresa_codigo='vistana'
--    Si el proyecto no tiene esas marcas asignadas, las inserta auto en
--    mk_factura_marcas (a través de las facturas existentes) y mk_proyecto_marcas.
--    Si la tienda no aparece en mk_proyectos, no se crea la entrega — RAISE NOTICE.
--    Después, descuenta cantidades del stock_total (queda disponible = 0).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  -- IDs de productos
  prod_paneles    UUID;
  prod_tablas     UUID;
  prod_conjunto   UUID;
  prod_norte      UUID;
  prod_barra      UUID;

  -- IDs de marcas Tommy (fashion_wear) y Calvin (vistana)
  marca_tommy     UUID;
  marca_calvin    UUID;

  -- Iterador de tiendas
  rec_entrega     RECORD;
  proy_id         UUID;
  proy_estado     TEXT;
  proy_nombre     TEXT;
  entrega_id      UUID;
  total_fw        NUMERIC;
  total_v         NUMERIC;
  total_general   NUMERIC;
  delta_paneles   INTEGER;
  delta_tablas    INTEGER;
  delta_conjunto  INTEGER;
  delta_norte     INTEGER;
  delta_barra     INTEGER;
BEGIN
  SELECT id INTO prod_paneles  FROM mk_inventario_productos WHERE nombre = 'Paneles'         LIMIT 1;
  SELECT id INTO prod_tablas   FROM mk_inventario_productos WHERE nombre = 'Tablas'          LIMIT 1;
  SELECT id INTO prod_conjunto FROM mk_inventario_productos WHERE nombre = 'Conjunto soporte' LIMIT 1;
  SELECT id INTO prod_norte    FROM mk_inventario_productos WHERE nombre = 'Norte colgador'   LIMIT 1;
  SELECT id INTO prod_barra    FROM mk_inventario_productos WHERE nombre = 'Barra plana'      LIMIT 1;

  SELECT id INTO marca_tommy  FROM mk_marcas WHERE empresa_codigo = 'fashion_wear' AND activo = TRUE LIMIT 1;
  SELECT id INTO marca_calvin FROM mk_marcas WHERE empresa_codigo = 'vistana'      AND activo = TRUE LIMIT 1;

  IF marca_tommy IS NULL OR marca_calvin IS NULL THEN
    RAISE NOTICE '[seed entregas] Faltan marcas fashion_wear o vistana — abortando seed de entregas.';
    RETURN;
  END IF;

  FOR rec_entrega IN (
    SELECT * FROM (
      VALUES
        ('wolf mall changinola',   '%wolf%',           5,  4, 16, 13, 16, 13,  5,  4, 15, 12),
        ('hanna 1',                '%hanna 1%',        5,  4, 16, 13, 16, 13,  5,  4, 15, 12),
        ('hanna 2',                '%hanna 2%',        6,  4, 19, 13, 19, 13,  6,  4, 18, 12),
        ('margarita',              '%margarita%',      6,  4, 19, 13, 19, 13,  6,  4, 18, 12),
        ('city mall paso canoas',  '%paso canoas%',    0, 16,  0, 50,  0, 50,  0, 16,  0, 48),
        ('shopping center',        '%shopping center%',15, 13, 47, 41, 47, 41, 15, 13, 45, 39),
        ('jerusalem',              '%jerusalem%',     38, 24,  0, 75,  0, 75,  0, 24,  0, 72),
        ('reina chorrera',         '%reina chorrera%', 5,  3, 16, 10, 16, 10,  5,  3, 15,  9),
        ('ifashion boutique',      '%ifashion%',       6,  5, 19, 16, 19, 16,  6,  5, 18, 15),
        ('outlet n2 guabito',      '%guabito%',       14, 10, 44, 32, 44, 32, 14, 10, 42, 30)
    ) AS t (
      tienda_label, tienda_pat,
      pan_fw, pan_v, tab_fw, tab_v, con_fw, con_v, nor_fw, nor_v, bar_fw, bar_v
    )
  ) LOOP
    -- Buscar proyecto por LIKE en tienda (case-insensitive), no anulado.
    proy_id := NULL;
    SELECT id, estado, COALESCE(nombre, tienda)
      INTO proy_id, proy_estado, proy_nombre
      FROM mk_proyectos
     WHERE LOWER(tienda) LIKE rec_entrega.tienda_pat
       AND anulado_en IS NULL
     ORDER BY created_at DESC
     LIMIT 1;

    IF proy_id IS NULL THEN
      RAISE NOTICE '[seed entregas] Tienda "%" no encontrada en mk_proyectos — skip', rec_entrega.tienda_label;
      CONTINUE;
    END IF;

    -- Asegurar que el proyecto tenga Tommy y Calvin asignados (mk_proyecto_marcas).
    -- Si tiene facturas vigentes, también las asignamos a esas facturas en
    -- mk_factura_marcas para coherencia con el resto del módulo.
    INSERT INTO mk_proyecto_marcas (proyecto_id, marca_id, porcentaje)
      VALUES (proy_id, marca_tommy,  50)
    ON CONFLICT (proyecto_id, marca_id) DO NOTHING;
    INSERT INTO mk_proyecto_marcas (proyecto_id, marca_id, porcentaje)
      VALUES (proy_id, marca_calvin, 50)
    ON CONFLICT (proyecto_id, marca_id) DO NOTHING;

    -- Calcular subtotales
    total_fw :=
      (rec_entrega.pan_fw * 130) +
      (rec_entrega.tab_fw * 21)  +
      (rec_entrega.con_fw * 14)  +
      (rec_entrega.nor_fw * 66)  +
      (rec_entrega.bar_fw * 28);
    total_v :=
      (rec_entrega.pan_v * 130) +
      (rec_entrega.tab_v * 21)  +
      (rec_entrega.con_v * 14)  +
      (rec_entrega.nor_v * 66)  +
      (rec_entrega.bar_v * 28);
    total_general := total_fw + total_v;

    -- Crear entrega
    INSERT INTO mk_entregas_muebles (proyecto_id, total, total_por_marca)
    VALUES (
      proy_id,
      total_general,
      jsonb_build_object(
        marca_tommy::text,  total_fw,
        marca_calvin::text, total_v
      )
    )
    RETURNING id INTO entrega_id;

    -- Items por producto
    IF rec_entrega.pan_fw + rec_entrega.pan_v > 0 THEN
      INSERT INTO mk_entrega_items (entrega_id, producto_id, cantidad_por_marca, precio_unitario)
      VALUES (
        entrega_id, prod_paneles,
        jsonb_build_object(marca_tommy::text, rec_entrega.pan_fw, marca_calvin::text, rec_entrega.pan_v),
        130
      );
    END IF;
    IF rec_entrega.tab_fw + rec_entrega.tab_v > 0 THEN
      INSERT INTO mk_entrega_items (entrega_id, producto_id, cantidad_por_marca, precio_unitario)
      VALUES (
        entrega_id, prod_tablas,
        jsonb_build_object(marca_tommy::text, rec_entrega.tab_fw, marca_calvin::text, rec_entrega.tab_v),
        21
      );
    END IF;
    IF rec_entrega.con_fw + rec_entrega.con_v > 0 THEN
      INSERT INTO mk_entrega_items (entrega_id, producto_id, cantidad_por_marca, precio_unitario)
      VALUES (
        entrega_id, prod_conjunto,
        jsonb_build_object(marca_tommy::text, rec_entrega.con_fw, marca_calvin::text, rec_entrega.con_v),
        14
      );
    END IF;
    IF rec_entrega.nor_fw + rec_entrega.nor_v > 0 THEN
      INSERT INTO mk_entrega_items (entrega_id, producto_id, cantidad_por_marca, precio_unitario)
      VALUES (
        entrega_id, prod_norte,
        jsonb_build_object(marca_tommy::text, rec_entrega.nor_fw, marca_calvin::text, rec_entrega.nor_v),
        66
      );
    END IF;
    IF rec_entrega.bar_fw + rec_entrega.bar_v > 0 THEN
      INSERT INTO mk_entrega_items (entrega_id, producto_id, cantidad_por_marca, precio_unitario)
      VALUES (
        entrega_id, prod_barra,
        jsonb_build_object(marca_tommy::text, rec_entrega.bar_fw, marca_calvin::text, rec_entrega.bar_v),
        28
      );
    END IF;

    -- Descontar stock
    delta_paneles  := rec_entrega.pan_fw + rec_entrega.pan_v;
    delta_tablas   := rec_entrega.tab_fw + rec_entrega.tab_v;
    delta_conjunto := rec_entrega.con_fw + rec_entrega.con_v;
    delta_norte    := rec_entrega.nor_fw + rec_entrega.nor_v;
    delta_barra    := rec_entrega.bar_fw + rec_entrega.bar_v;

    UPDATE mk_inventario_productos SET stock_total = stock_total - delta_paneles  WHERE id = prod_paneles;
    UPDATE mk_inventario_productos SET stock_total = stock_total - delta_tablas   WHERE id = prod_tablas;
    UPDATE mk_inventario_productos SET stock_total = stock_total - delta_conjunto WHERE id = prod_conjunto;
    UPDATE mk_inventario_productos SET stock_total = stock_total - delta_norte    WHERE id = prod_norte;
    UPDATE mk_inventario_productos SET stock_total = stock_total - delta_barra    WHERE id = prod_barra;

    RAISE NOTICE '[seed entregas] OK "%": total=$ %, FW=$ %, V=$ %', proy_nombre, total_general, total_fw, total_v;
  END LOOP;
END $$;
