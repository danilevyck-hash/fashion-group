-- ─────────────────────────────────────────────────────────────────────────────
-- save_packing_list: `pl_items.producto` deja de poder tumbar el PL entero.
--
-- QUÉ ARREGLA. `pl_items.estilo` y `pl_items.producto` son NOT NULL sin default
-- (medido contra el OpenAPI de PostgREST el 27-jul-2026), y esta RPC los
-- insertaba CRUDOS:
--
--     item->>'estilo',
--     item->>'producto',
--     COALESCE((item->>'total_pcs')::int, 0),   <-- las vecinas SÍ tienen red
--     COALESCE((item->>'is_os')::bool, false),
--
-- `item->>'x'` devuelve NULL cuando la clave no está en el jsonb, y como toda
-- la RPC es UNA transacción, un solo item incompleto abortaba el INSERT de
-- TODOS los items y del header: el packing list entero se perdía con un 500
-- que no decía qué fila estaba mal.
--
-- POR QUÉ SOLO `producto` LLEVA COALESCE Y `estilo` NO:
--
--   * `producto` es la descripción, y el parser produce vacío A PROPÓSITO
--     cuando ninguna palabra clave calza (`parse-packing-list.ts`:
--     `currentProducto = producto ? normalizeProductName(producto) : ""`).
--     Vacío es un resultado legítimo → se guarda como '', igual que las
--     vecinas guardan 0 y false.
--
--   * `estilo` es el SKU, o sea la identidad de la fila. Guardarlo como ''
--     dejaría un item que no se puede agrupar, ni cruzar contra los bultos, ni
--     buscar después — y encima entraría sin que nadie se entere. Eso se
--     rechaza ARRIBA, en `POST /api/packing-lists`, con un 400 que nombra la
--     fila. Acá abajo la restricción se deja intacta a propósito: es la última
--     red por si algún día alguien llama la RPC desde otro lado.
--
-- EL CÓDIGO YA FUNCIONA SIN ESTA MIGRACIÓN. La ruta normaliza `producto` a ''
-- antes de llamar la RPC, así que el arreglo sale con el deploy. Esto es la
-- segunda capa, para el día que la RPC se llame desde otro caller.
--
-- NO REESCRIBE DATOS: es un CREATE OR REPLACE FUNCTION, idempotente, sin
-- ALTER TABLE y sin tocar ninguna fila existente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION save_packing_list(
  pl_header jsonb,
  pl_items_payload jsonb,
  pl_parser_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  new_pl_id uuid;
BEGIN
  -- 1. Borrar items existentes (si hay) por cascade o lookup explícito
  DELETE FROM pl_items
  WHERE pl_id IN (
    SELECT id FROM packing_lists
    WHERE numero_pl = pl_header->>'numero_pl'
  );

  -- 2. Borrar headers existentes con el mismo numero_pl
  DELETE FROM packing_lists
  WHERE numero_pl = pl_header->>'numero_pl';

  -- 3. Insertar nuevo header
  INSERT INTO packing_lists (
    numero_pl, empresa, fecha_entrega,
    total_bultos, total_piezas, total_estilos,
    parser_metadata
  ) VALUES (
    pl_header->>'numero_pl',
    pl_header->>'empresa',
    NULLIF(pl_header->>'fecha_entrega', '')::date,
    COALESCE((pl_header->>'total_bultos')::int, 0),
    COALESCE((pl_header->>'total_piezas')::int, 0),
    COALESCE((pl_header->>'total_estilos')::int, 0),
    COALESCE(pl_parser_metadata, '{}'::jsonb)
  )
  RETURNING id INTO new_pl_id;

  -- 4. Insertar items.
  --    `producto` gana su COALESCE (vacío es un resultado legítimo del parser).
  --    `estilo` NO lo lleva a propósito: sin SKU la fila no sirve, y quien
  --    llame esta RPC tiene que mandarlo. Ver el encabezado.
  INSERT INTO pl_items (
    pl_id, estilo, producto, total_pcs,
    bultos, bulto_muestra, is_os
  )
  SELECT
    new_pl_id,
    item->>'estilo',
    COALESCE(item->>'producto', ''),
    COALESCE((item->>'total_pcs')::int, 0),
    item->'bultos',
    item->>'bulto_muestra',
    COALESCE((item->>'is_os')::bool, false)
  FROM jsonb_array_elements(pl_items_payload) AS item;

  RETURN new_pl_id;
END;
$$;
