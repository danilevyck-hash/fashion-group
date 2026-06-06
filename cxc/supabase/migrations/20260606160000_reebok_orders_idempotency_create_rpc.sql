-- ─────────────────────────────────────────────────────────────────────────────
-- G5 Sprint B4 — Idempotencia en creación de pedido Reebok + numeración sin race.
--
-- Dos problemas que esta migración resuelve:
--   1. `order_number = MAX+1` se calcula con read-then-write en el route → dos
--      POST concurrentes pueden chocar el número o crear duplicados.
--   2. Un retry del cliente tras una respuesta no-ok (timeout/502 con insert
--      exitoso) crea un SEGUNDO pedido idéntico.
--
-- Solución:
--   - Columna idempotency_key (token generado en el front por intento de "Crear
--     pedido") con índice UNIQUE parcial (NULL permitido para pedidos viejos).
--   - RPC reebok_create_order que, bajo advisory lock, primero busca el token:
--     si existe devuelve el pedido existente (already_created=true) en vez de
--     crear otro; si no, numera PED-### sin carrera e inserta pedido + items.
--
-- TOTAL: calculado en JS y pasado en p_total (igual que las otras RPCs).
-- origen_original queda en su default 'mio' (pedido interno del vendedor).
--
-- SECURITY DEFINER + search_path fijo. EXECUTE sólo a service_role.
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Columna + índice único parcial ──────────────────────────────────────
ALTER TABLE reebok_orders ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS reebok_orders_idempotency_key_uidx
  ON reebok_orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 2. RPC de creación atómica e idempotente ───────────────────────────────
CREATE OR REPLACE FUNCTION reebok_create_order(
  p_client_name     text,
  p_vendor_name     text,
  p_client_email    text,
  p_total           numeric,
  p_idempotency_key text,
  p_items           jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id     uuid;
  v_order_number text;
  v_next         int;
  v_item         jsonb;
BEGIN
  -- Serializa TODAS las creaciones: protege tanto la numeración como el
  -- chequeo de idempotencia contra carreras.
  PERFORM pg_advisory_xact_lock(hashtext('reebok_order_number'));

  -- Idempotencia: si ya existe un pedido con este token, devolverlo sin crear
  -- otro (un retry del front cae aquí y recibe el mismo PED-###).
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, order_number INTO v_order_id, v_order_number
      FROM reebok_orders WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'order_id', v_order_id, 'order_number', v_order_number, 'already_created', true
      );
    END IF;
  END IF;

  -- Siguiente PED-### sin carrera (protegido por el advisory lock).
  SELECT COALESCE(MAX(substring(order_number FROM '^PED-(\d+)$')::int), 0) + 1
    INTO v_next
    FROM reebok_orders
    WHERE order_number ~ '^PED-\d+$';
  v_order_number := 'PED-' || lpad(v_next::text, 3, '0');

  INSERT INTO reebok_orders (
    order_number, client_name, vendor_name, client_email, total, status, idempotency_key
  ) VALUES (
    v_order_number,
    COALESCE(NULLIF(btrim(p_client_name), ''), 'Sin nombre'),
    p_vendor_name,
    p_client_email,
    COALESCE(p_total, 0),
    'borrador',
    p_idempotency_key
  )
  RETURNING id INTO v_order_id;

  -- Items. product_id es UUID NOT NULL: un item sin uuid válido revienta el
  -- cast y hace rollback total (no quedan pedidos a medias).
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(
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

  RETURN jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number, 'already_created', false
  );
END;
$$;

REVOKE ALL ON FUNCTION reebok_create_order(text, text, text, numeric, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION reebok_create_order(text, text, text, numeric, text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
