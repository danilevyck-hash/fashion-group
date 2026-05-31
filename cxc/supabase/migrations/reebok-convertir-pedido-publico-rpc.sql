-- ─────────────────────────────────────────────────────────────────────────────
-- FASE 2 — RPC atómica de conversión de pedido público → reebok_orders.
--
-- Convierte una fila de reebok_pedidos_publicos (origen 'link') en un pedido
-- reebok_orders + reebok_order_items, en UNA sola transacción. Si cualquier paso
-- falla, RAISE → rollback total (no quedan medias conversiones).
--
-- Decisiones confirmadas:
--   - ORIGEN se conserva: el reebok_orders nuevo lleva origen_original='link'
--     (sigue mostrándose como "Del link") + origen_short_id de traza.
--   - La pública NO se borra: se marca convertida=true + ped_order_number +
--     convertida_at. La vista la excluye para no duplicar.
--   - IDEMPOTENTE: si ya está convertida, NO crea otra; devuelve el PED-XXX
--     existente (already_converted=true).
--   - TOTAL: lo calcula el endpoint con los helpers JS (calculateReebokOrderTotal
--     + fetchReebokCategoryMap, fallback apparel) y lo pasa en p_total. La RPC NO
--     recalcula — evita duplicar la fórmula de bulto/categoría en SQL.
--
-- SECURITY DEFINER: corre con privilegios del owner; search_path fijo por
-- seguridad. EXECUTE concedido sólo a service_role (el endpoint usa esa key).
--
-- Aplicar manual en Supabase Dashboard → SQL Editor (proyecto principal).
-- REQUIERE la migración reebok-pedidos-unificado-fase2-conversion.sql aplicada.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION convert_reebok_pedido_publico(
  p_short_id text,
  p_total    numeric,
  p_items    jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pub          reebok_pedidos_publicos%ROWTYPE;
  v_order_id     uuid;
  v_order_number text;
  v_next         int;
  v_item         jsonb;
BEGIN
  -- Lock de la fila pública para serializar conversiones concurrentes del mismo pedido.
  SELECT * INTO v_pub
    FROM reebok_pedidos_publicos
    WHERE short_id = p_short_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido publico % no existe', p_short_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Idempotencia: ya convertida → devolver el PED existente sin crear otro.
  IF COALESCE(v_pub.convertida, false) THEN
    SELECT id INTO v_order_id
      FROM reebok_orders
      WHERE order_number = v_pub.ped_order_number;
    RETURN jsonb_build_object(
      'order_number',      v_pub.ped_order_number,
      'order_id',          v_order_id,
      'already_converted', true
    );
  END IF;

  -- Siguiente PED-### . Advisory lock para evitar carrera en la numeración.
  PERFORM pg_advisory_xact_lock(hashtext('reebok_order_number'));
  SELECT COALESCE(MAX(substring(order_number FROM '^PED-(\d+)$')::int), 0) + 1
    INTO v_next
    FROM reebok_orders
    WHERE order_number ~ '^PED-\d+$';
  v_order_number := 'PED-' || lpad(v_next::text, 3, '0');

  -- Crear el pedido conservando el origen 'link'.
  INSERT INTO reebok_orders (
    order_number, client_name, vendor_name, total, origen_original, origen_short_id
  ) VALUES (
    v_order_number,
    COALESCE(NULLIF(btrim(v_pub.cliente_nombre), ''), 'Sin nombre'),
    NULL,
    COALESCE(p_total, 0),
    'link',
    p_short_id
  )
  RETURNING id INTO v_order_id;

  -- Copiar items. product_id es UUID NOT NULL: si un item viene sin uuid válido,
  -- el cast falla y toda la conversión hace rollback (garantía atómica).
  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
    )
  LOOP
    INSERT INTO reebok_order_items (
      order_id, product_id, sku, name, image_url, quantity, unit_price, is_preorder
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'sku',
      v_item->>'name',
      v_item->>'image_url',
      COALESCE(NULLIF(v_item->>'quantity', '')::int, 1),
      COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, 0),
      COALESCE((v_item->>'is_preorder')::boolean, false)
    );
  END LOOP;

  -- Marcar la pública como convertida (idempotencia futura + exclusión de la vista).
  UPDATE reebok_pedidos_publicos
    SET convertida       = true,
        ped_order_number = v_order_number,
        convertida_at    = now()
    WHERE short_id = p_short_id;

  RETURN jsonb_build_object(
    'order_number',      v_order_number,
    'order_id',          v_order_id,
    'already_converted', false
  );
END;
$$;

REVOKE ALL ON FUNCTION convert_reebok_pedido_publico(text, numeric, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION convert_reebok_pedido_publico(text, numeric, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
