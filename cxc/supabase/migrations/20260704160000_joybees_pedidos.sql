-- 20260704160000_joybees_pedidos.sql
-- Pedidos Joybees en DB, paridad con el patron Reebok ya aprobado (tablas +
-- estados + RPCs atomicas/idempotentes). Diferencias con Reebok:
--   * Joybees es 100% footwear -> bulto SIEMPRE 12 (getBultoSize()); el total lo
--     calcula el endpoint en JS (calculateJoybeesOrderTotal) y lo pasa en p_total,
--     sin category lookup (Reebok necesitaba category por bulto 12/6).
--   * Sin is_preorder (Joybees no tiene preventa) ni origen/publico/Switch.
--   * order_number = 'JBP-###'.
-- SEGURIDAD: tablas NUEVAS creadas ya con RLS + SOLO service_role (no repetir el
--   USING(true) que causo la fuga de reebok_orders; auditoria 4-jul).

-- ── Tablas ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS joybees_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  vendor_name TEXT,
  client_email TEXT,
  comment TEXT,
  total DECIMAL(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'borrador',  -- 'borrador' | 'enviado' | 'confirmado'
  idempotency_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS joybees_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES joybees_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  sku TEXT,
  name TEXT,
  image_url TEXT,
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS joybees_order_items_unique_item
  ON joybees_order_items (order_id, product_id);

CREATE UNIQUE INDEX IF NOT EXISTS joybees_orders_idempotency_key_uidx
  ON joybees_orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── RLS: SOLO service_role (los endpoints usan esa key) ─────────────────────
ALTER TABLE joybees_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE joybees_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON joybees_orders;
DROP POLICY IF EXISTS service_role_all ON joybees_order_items;
CREATE POLICY service_role_all ON joybees_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all ON joybees_order_items FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── RPC: creacion atomica e idempotente (numera JBP-### sin race) ───────────
CREATE OR REPLACE FUNCTION joybees_create_order(
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
  PERFORM pg_advisory_xact_lock(hashtext('joybees_order_number'));

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, order_number INTO v_order_id, v_order_number
      FROM joybees_orders WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'order_id', v_order_id, 'order_number', v_order_number, 'already_created', true
      );
    END IF;
  END IF;

  SELECT COALESCE(MAX(substring(order_number FROM '^JBP-(\d+)$')::int), 0) + 1
    INTO v_next
    FROM joybees_orders
    WHERE order_number ~ '^JBP-\d+$';
  v_order_number := 'JBP-' || lpad(v_next::text, 3, '0');

  INSERT INTO joybees_orders (
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

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
    )
  LOOP
    INSERT INTO joybees_order_items (
      order_id, product_id, sku, name, image_url, quantity, unit_price
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'sku',
      v_item->>'name',
      v_item->>'image_url',
      COALESCE(NULLIF(v_item->>'quantity', '')::int, 1),
      COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, 0)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number, 'already_created', false
  );
END;
$$;

REVOKE ALL ON FUNCTION joybees_create_order(text, text, text, numeric, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION joybees_create_order(text, text, text, numeric, text, jsonb) TO service_role;

-- ── RPC: reemplazo atomico de items + total (delete+insert+update en 1 tx) ──
CREATE OR REPLACE FUNCTION joybees_order_replace_items(
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
  PERFORM 1 FROM joybees_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % no existe', p_order_id USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM joybees_order_items WHERE order_id = p_order_id;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
    )
  LOOP
    INSERT INTO joybees_order_items (
      order_id, product_id, sku, name, image_url, quantity, unit_price
    ) VALUES (
      p_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'sku',
      v_item->>'name',
      v_item->>'image_url',
      COALESCE(NULLIF(v_item->>'quantity', '')::int, 1),
      COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, 0)
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE joybees_orders
    SET total = COALESCE(p_total, 0), updated_at = now()
    WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'item_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION joybees_order_replace_items(uuid, numeric, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION joybees_order_replace_items(uuid, numeric, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
