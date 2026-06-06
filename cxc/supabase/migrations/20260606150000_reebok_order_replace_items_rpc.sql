-- ─────────────────────────────────────────────────────────────────────────────
-- G5 Sprint B3 — RPC atómica de reemplazo de items de un pedido Reebok.
--
-- Hoy el PUT de /api/catalogo/reebok/orders/[id] hace DELETE de todos los items
-- y luego INSERT, SIN transacción: si el INSERT falla tras el DELETE, el pedido
-- queda VACÍO (pérdida de datos con red intermitente). Esta RPC mueve ese
-- reemplazo a UNA sola transacción (delete + insert + update total), igual que
-- el patrón de convert_reebok_pedido_publico.
--
-- Alcance: solo items + total + updated_at. Los campos escalares del pedido
-- (client_name, vendor_name, client_email, comment, status) los sigue
-- actualizando el route con un .update() aparte (operación segura, sin delete).
--
-- TOTAL: lo calcula el endpoint en JS (calculateReebokOrderTotal +
-- fetchReebokCategoryMap, fallback apparel) y lo pasa en p_total. La RPC NO
-- recalcula — evita duplicar la fórmula de bulto/categoría en SQL.
--
-- SECURITY DEFINER + search_path fijo. EXECUTE sólo a service_role (el endpoint
-- usa esa key). Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reebok_order_replace_items(
  p_order_id uuid,
  p_total    numeric,
  p_items    jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item  jsonb;
  v_count int := 0;
BEGIN
  -- Lock de la fila del pedido para serializar PUTs concurrentes del mismo pedido.
  PERFORM 1 FROM reebok_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % no existe', p_order_id USING ERRCODE = 'no_data_found';
  END IF;

  -- Reemplazo atómico. Si un product_id no es uuid válido, el cast revienta y
  -- TODA la transacción hace rollback (incluido el DELETE) → el pedido nunca
  -- queda vacío.
  DELETE FROM reebok_order_items WHERE order_id = p_order_id;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
    )
  LOOP
    INSERT INTO reebok_order_items (
      order_id, product_id, sku, name, image_url, quantity, unit_price, is_preorder
    ) VALUES (
      p_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'sku',
      v_item->>'name',
      v_item->>'image_url',
      COALESCE(NULLIF(v_item->>'quantity', '')::int, 1),
      COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, 0),
      COALESCE((v_item->>'is_preorder')::boolean, false)
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE reebok_orders
    SET total = COALESCE(p_total, 0), updated_at = now()
    WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'item_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION reebok_order_replace_items(uuid, numeric, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION reebok_order_replace_items(uuid, numeric, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
