-- Packing Lists: RPC atómica para save-or-replace.
--
-- Reemplaza los 4 pasos no-transaccionales del endpoint /api/packing-lists POST
-- (DELETE items, DELETE header, INSERT header, INSERT items) por una sola
-- transacción plpgsql. Si cualquier paso falla, todo se revierte.
--
-- Uso desde el endpoint:
--   supabase.rpc('save_packing_list', {
--     pl_header: { numero_pl, empresa, fecha_entrega, total_bultos, total_piezas, total_estilos },
--     pl_items_payload: [{ estilo, producto, total_pcs, bultos, bulto_muestra, is_os }, ...]
--   })
-- Retorna el UUID del packing_list recién insertado.

CREATE OR REPLACE FUNCTION save_packing_list(
  pl_header jsonb,
  pl_items_payload jsonb
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
    total_bultos, total_piezas, total_estilos
  ) VALUES (
    pl_header->>'numero_pl',
    pl_header->>'empresa',
    NULLIF(pl_header->>'fecha_entrega', '')::date,
    COALESCE((pl_header->>'total_bultos')::int, 0),
    COALESCE((pl_header->>'total_piezas')::int, 0),
    COALESCE((pl_header->>'total_estilos')::int, 0)
  )
  RETURNING id INTO new_pl_id;

  -- 4. Insertar items
  INSERT INTO pl_items (
    pl_id, estilo, producto, total_pcs,
    bultos, bulto_muestra, is_os
  )
  SELECT
    new_pl_id,
    item->>'estilo',
    item->>'producto',
    COALESCE((item->>'total_pcs')::int, 0),
    item->'bultos',
    item->>'bulto_muestra',
    COALESCE((item->>'is_os')::bool, false)
  FROM jsonb_array_elements(pl_items_payload) AS item;

  RETURN new_pl_id;
END;
$$;

-- Idempotente: correr este script múltiples veces es seguro (CREATE OR REPLACE).
